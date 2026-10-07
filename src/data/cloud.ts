import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Changes } from './merge'
import type { Remote } from './sync'
import type { Attempt, Course, Level, Mode } from '../quiz/types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** null — ключи не заданы, приложение работает только с данными устройства. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

const PAGE = 1000
const CHUNK = 500
// строка, записанная параллельно с прошлым чтением, могла получить отметку чуть раньше курсора
const OVERLAP_MS = 30_000

interface Failure {
  message: string
  code?: string
}

function fail(error: Failure): Error {
  // таблиц ещё нет: приложение обновилось раньше, чем в Supabase выполнили миграцию
  if (error.code === 'PGRST205' || error.code === '42P01') return new Error('В облаке ещё нет таблиц: нужно выполнить supabase/migrations/0001_init.sql')
  return new Error(error.message)
}

interface Synced {
  synced_at: string
}
interface CourseRow extends Synced {
  course_id: string
  content: Course
  updated_at: string
}
interface ClearRow extends Synced {
  course_id: string
  deleted: boolean
  updated_at: string
}
interface QuestionRow extends Synced {
  course_id: string
  question_id: string
  seen: number
  correct: number
  wrong: number
  last_correct: boolean
  box: number
  due: string
  updated_at: string
}
interface AttemptRow extends Synced {
  id: string
  course_id: string
  mode: Mode
  level: Level | null
  topic_id: string | null
  finished_at: string
  total: number
  correct: number
  duration_sec: number
}

// база отдаёт время в своём формате; приводим к тому же виду, что и на устройстве, чтобы строки можно было сравнивать
const iso = (time: string): string => new Date(time).toISOString()

// user_id в строках не передаём — в базе стоит default auth.uid(), а RLS не пускает к чужим данным
export class SupabaseRemote implements Remote {
  constructor(private db: SupabaseClient) {}

  private async since<T extends Synced>(table: string, columns: string, keys: string[], cursor: string | null): Promise<T[]> {
    const from = cursor && new Date(Date.parse(cursor) - OVERLAP_MS).toISOString()
    const out: T[] = []
    for (let offset = 0; ; offset += PAGE) {
      let query = this.db.from(table).select(`${columns},synced_at`)
      if (from) query = query.gt('synced_at', from)
      for (const column of ['synced_at', ...keys]) query = query.order(column)
      const { data, error } = await query.range(offset, offset + PAGE - 1)
      if (error) throw fail(error)
      const rows = (data ?? []) as unknown as T[]
      out.push(...rows)
      if (rows.length < PAGE) return out
    }
  }

  async pull(cursor: string | null): Promise<{ changes: Changes; cursor: string | null }> {
    const [courses, clears, questions, attempts] = await Promise.all([
      this.since<CourseRow>('courses', 'course_id,content,updated_at', ['course_id'], cursor),
      this.since<ClearRow>('course_clears', 'course_id,deleted,updated_at', ['course_id'], cursor),
      this.since<QuestionRow>('question_progress', 'course_id,question_id,seen,correct,wrong,last_correct,box,due,updated_at', ['course_id', 'question_id'], cursor),
      this.since<AttemptRow>('attempts', 'id,course_id,mode,level,topic_id,finished_at,total,correct,duration_sec', ['id'], cursor),
    ])

    const latest = [...courses, ...clears, ...questions, ...attempts].reduce<string | null>((max, row) => (max === null || Date.parse(row.synced_at) > Date.parse(max) ? row.synced_at : max), cursor)

    return {
      cursor: latest,
      changes: {
        courses: courses.map((r) => ({ ...r.content, id: r.course_id, importedAt: iso(r.updated_at) })),
        clears: Object.fromEntries(clears.map((r) => [r.course_id, { at: iso(r.updated_at), deleted: r.deleted }])),
        questions: questions.map((r) => ({
          courseId: r.course_id,
          questionId: r.question_id,
          progress: { seen: r.seen, correct: r.correct, wrong: r.wrong, lastCorrect: r.last_correct, box: r.box, due: r.due, updatedAt: iso(r.updated_at) },
        })),
        attempts: attempts.map((r) => {
          const attempt: Attempt = { id: r.id, courseId: r.course_id, mode: r.mode, finishedAt: iso(r.finished_at), total: r.total, correct: r.correct, durationSec: r.duration_sec }
          if (r.level) attempt.level = r.level
          if (r.topic_id) attempt.topicId = r.topic_id
          return attempt
        }),
      },
    }
  }

  private async upsert(table: string, rows: object[], onConflict: string): Promise<void> {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await this.db.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict })
      if (error) throw fail(error)
    }
  }

  async push(changes: Changes): Promise<void> {
    const clears = Object.entries(changes.clears)
    await this.upsert(
      'course_clears',
      clears.map(([course_id, clear]) => ({ course_id, deleted: clear.deleted, updated_at: clear.at })),
      'user_id,course_id',
    )
    await this.upsert(
      'courses',
      changes.courses.map((course) => ({ course_id: course.id, content: course, updated_at: course.importedAt })),
      'user_id,course_id',
    )
    await this.upsert(
      'question_progress',
      changes.questions.map(({ courseId, questionId, progress: p }) => ({
        course_id: courseId,
        question_id: questionId,
        seen: p.seen,
        correct: p.correct,
        wrong: p.wrong,
        last_correct: p.lastCorrect,
        box: p.box,
        due: p.due,
        updated_at: p.updatedAt,
      })),
      'user_id,course_id,question_id',
    )
    await this.upsert(
      'attempts',
      changes.attempts.map((a) => ({ id: a.id, course_id: a.courseId, mode: a.mode, level: a.level ?? null, topic_id: a.topicId ?? null, finished_at: a.finishedAt, total: a.total, correct: a.correct, duration_sec: a.durationSec })),
      'user_id,id',
    )

    // после сброса или удаления старые строки в облаке больше никому не нужны
    for (const [courseId, clear] of clears) {
      const stale = await Promise.all([
        this.db.from('question_progress').delete().eq('course_id', courseId).lte('updated_at', clear.at),
        this.db.from('attempts').delete().eq('course_id', courseId).lte('finished_at', clear.at),
        ...(clear.deleted ? [this.db.from('courses').delete().eq('course_id', courseId).lte('updated_at', clear.at)] : []),
      ])
      for (const { error } of stale) if (error) throw fail(error)
    }
  }
}
