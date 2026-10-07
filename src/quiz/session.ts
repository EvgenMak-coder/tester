import { isDue } from './srs'
import { levelOf, type Attempt, type CourseFile, type CourseProgress, type Day, type Level, type Mode, type Question, type Session, type SessionItem } from './types'

export type Rng = () => number

/** Сколько новых вопросов добавляется в одно повторение. */
export const REVIEW_NEW_LIMIT = 10
export const EXAM_SECONDS_PER_QUESTION = 60

export function shuffled<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export interface Pick {
  topicId: string
  question: Question
}

export function allQuestions(course: CourseFile, topicIds?: string[], level?: Level): Pick[] {
  return course.topics
    .filter((t) => !topicIds || topicIds.includes(t.id))
    .flatMap((t) => t.questions.filter((q) => !level || levelOf(q) === level).map((question) => ({ topicId: t.id, question })))
}

export function questionMap(course: CourseFile): Map<string, Question> {
  return new Map(course.topics.flatMap((t) => t.questions).map((q) => [q.id, q]))
}

export interface PickOptions {
  today: Day
  topicIds?: string[]
  level?: Level
  count?: number
  newLimit?: number
}

/** Набор вопросов под режим, уже перемешанный. */
export function pickQuestions(course: CourseFile, progress: CourseProgress, mode: Mode, opts: PickOptions, rng: Rng = Math.random): Pick[] {
  const pool = allQuestions(course, opts.topicIds, opts.level)
  const cut = (picks: Pick[]) => (opts.count ? picks.slice(0, opts.count) : picks)

  switch (mode) {
    case 'practice':
    case 'exam':
      return cut(shuffled(pool, rng))
    case 'mistakes':
      return cut(shuffled(pool.filter((p) => progress[p.question.id]?.lastCorrect === false), rng))
    case 'review': {
      const due = pool.filter((p) => {
        const state = progress[p.question.id]
        return state !== undefined && isDue(state, opts.today)
      })
      // новые идут в порядке курса, а при нехватке места уступают тем, чей срок подошёл
      const fresh = pool.filter((p) => !progress[p.question.id]).slice(0, opts.newLimit ?? REVIEW_NEW_LIMIT)
      return shuffled(cut([...shuffled(due, rng), ...fresh]), rng)
    }
  }
}

export interface SessionOptions {
  id: string
  now: Date
  timeLimitSec?: number
  level?: Level
  topicId?: string
}

/** Порядок вопросов и вариантов фиксируется здесь и дальше не меняется. */
export function createSession(courseId: string, picks: Pick[], mode: Mode, opts: SessionOptions, rng: Rng = Math.random): Session {
  const items: SessionItem[] = picks.map(({ topicId, question }) => {
    const indexes = question.options.map((_, i) => i)
    return {
      topicId,
      questionId: question.id,
      order: question.shuffle === false ? indexes : shuffled(indexes, rng),
      picked: null,
    }
  })
  const session: Session = { id: opts.id, courseId, mode, startedAt: opts.now.toISOString(), items, current: 0 }
  if (opts.timeLimitSec !== undefined) session.timeLimitSec = opts.timeLimitSec
  if (opts.level !== undefined) session.level = opts.level
  if (opts.topicId !== undefined) session.topicId = opts.topicId
  return session
}

export function withAnswer(session: Session, index: number, picked: number): Session {
  return { ...session, items: session.items.map((item, i) => (i === index ? { ...item, picked } : item)) }
}

/** Оставляет только отвеченные вопросы — для досрочного завершения тренировки. */
export function trimToAnswered(session: Session): Session {
  const items = session.items.filter((item) => item.picked !== null)
  return { ...session, items, current: Math.min(session.current, Math.max(items.length - 1, 0)) }
}

export interface Score {
  total: number
  answered: number
  correct: number
}

/** Вопросы, исчезнувшие из курса после повторного импорта, в счёт не идут. */
export function score(course: CourseFile, session: Session): Score {
  const questions = questionMap(course)
  const result: Score = { total: 0, answered: 0, correct: 0 }
  for (const item of session.items) {
    const question = questions.get(item.questionId)
    if (!question) continue
    result.total++
    if (item.picked !== null) result.answered++
    if (item.picked === question.answer) result.correct++
  }
  return result
}

export function secondsLeft(session: Session, now: Date): number | null {
  if (session.timeLimitSec === undefined) return null
  const elapsed = (now.getTime() - new Date(session.startedAt).getTime()) / 1000
  return Math.max(0, Math.ceil(session.timeLimitSec - elapsed))
}

export function toAttempt(course: CourseFile, session: Session, finishedAt: Date): Attempt {
  const { total, correct } = score(course, session)
  const elapsed = Math.round((finishedAt.getTime() - new Date(session.startedAt).getTime()) / 1000)
  const attempt: Attempt = {
    id: session.id,
    courseId: session.courseId,
    mode: session.mode,
    finishedAt: finishedAt.toISOString(),
    total,
    correct,
    durationSec: session.timeLimitSec === undefined ? elapsed : Math.min(elapsed, session.timeLimitSec),
  }
  if (session.level !== undefined) attempt.level = session.level
  if (session.topicId !== undefined) attempt.topicId = session.topicId
  return attempt
}
