import { describe, expect, it } from 'vitest'
import { finishSession, importCourse, submitAnswer, wipeAll } from './actions'
import { MemoryStore } from './localStore'
import { isEmpty, type Changes } from './merge'
import { freshState, syncOnce, type Remote, type SyncState } from './sync'
import { createSession, pickQuestions } from '../quiz/session'
import type { Attempt, Clear, Course, CourseFile, QuestionProgress } from '../quiz/types'

/** Облако в памяти с теми же правилами, что и база: более свежая запись побеждает, чтение идёт от отметки. */
class FakeCloud {
  private tick = 0
  private courses = new Map<string, { row: Course; synced: number }>()
  private clears = new Map<string, { row: Clear; synced: number }>()
  private questions = new Map<string, { courseId: string; questionId: string; row: QuestionProgress; synced: number }>()
  private attempts = new Map<string, { row: Attempt; synced: number }>()
  pushes: Changes[] = []

  remote(beforePullReturns?: () => Promise<void>): Remote {
    return {
      pull: async (cursor) => {
        const from = cursor === null ? 0 : Number(cursor)
        const changes: Changes = {
          courses: [...this.courses.values()].filter((x) => x.synced > from).map((x) => x.row),
          clears: Object.fromEntries([...this.clears].filter(([, x]) => x.synced > from).map(([id, x]) => [id, x.row])),
          questions: [...this.questions.values()].filter((x) => x.synced > from).map((x) => ({ courseId: x.courseId, questionId: x.questionId, progress: x.row })),
          attempts: [...this.attempts.values()].filter((x) => x.synced > from).map((x) => x.row),
        }
        await beforePullReturns?.()
        return { changes, cursor: String(this.tick) }
      },
      push: async (changes) => {
        this.pushes.push(changes)
        const synced = ++this.tick
        for (const [id, clear] of Object.entries(changes.clears)) {
          const old = this.clears.get(id)
          if (!old || clear.at > old.row.at) this.clears.set(id, { row: clear, synced })
        }
        for (const course of changes.courses) {
          const old = this.courses.get(course.id)
          if (!old || course.importedAt > old.row.importedAt) this.courses.set(course.id, { row: course, synced })
        }
        for (const { courseId, questionId, progress } of changes.questions) {
          const key = `${courseId}/${questionId}`
          const old = this.questions.get(key)
          if (!old || progress.updatedAt! > old.row.updatedAt!) this.questions.set(key, { courseId, questionId, row: progress, synced })
        }
        for (const attempt of changes.attempts) if (!this.attempts.has(attempt.id)) this.attempts.set(attempt.id, { row: attempt, synced })
        for (const [id, clear] of Object.entries(changes.clears)) {
          for (const [key, x] of this.questions) if (x.courseId === id && x.row.updatedAt! <= clear.at) this.questions.delete(key)
          for (const [key, x] of this.attempts) if (x.row.courseId === id && x.row.finishedAt <= clear.at) this.attempts.delete(key)
          if (clear.deleted && (this.courses.get(id)?.row.importedAt ?? '') <= clear.at) this.courses.delete(id)
        }
      },
    }
  }

  get questionCount(): number {
    return this.questions.size
  }
}

const question = (id: string) => ({ id, type: 'single' as const, text: id, options: ['a', 'b', 'c', 'd', 'e'], answer: 2 })
const COURSE: CourseFile = { id: 'c1', title: 'Курс', topics: [{ id: 't1', title: 'Тема', questions: [question('q1'), question('q2'), question('q3')] }] }
const at = (time: string) => new Date(`2026-10-07T${time}Z`)

class Device {
  store = new MemoryStore()
  state: SyncState = freshState('user')
  constructor(private cloud: FakeCloud) {}

  async sync(time: string, remote: Remote = this.cloud.remote()): Promise<boolean> {
    const result = await syncOnce(this.store, remote, this.state, () => at(time))
    this.state = result.state
    return result.pulled
  }

  /** Отвечает на вопрос в тренировке из одного этого вопроса и завершает её. */
  async answer(questionId: string, correct: boolean, time: string): Promise<void> {
    const { courses } = await this.store.load()
    const picks = pickQuestions(courses[0], {}, 'practice', { today: '2026-10-07' }).filter((p) => p.question.id === questionId)
    await this.store.setSession(createSession('c1', picks, 'practice', { id: `s-${questionId}-${time}`, now: at(time) }))
    await submitAnswer(this.store, await this.store.load(), 0, correct ? 2 : 0, at(time))
    await finishSession(this.store, await this.store.load(), at(time))
  }

  async progress(questionId: string): Promise<QuestionProgress | undefined> {
    return (await this.store.load()).progress.questions.c1?.[questionId]
  }
}

async function pair() {
  const cloud = new FakeCloud()
  const a = new Device(cloud)
  const b = new Device(cloud)
  await importCourse(a.store, COURSE, at('09:00:00'))
  await a.sync('09:00:10')
  await b.sync('09:00:20')
  return { cloud, a, b }
}

describe('синхронизация двух устройств', () => {
  it('курс и ответы с одного устройства появляются на другом', async () => {
    const { a, b } = await pair()
    expect((await b.store.load()).courses.map((c) => c.title)).toEqual(['Курс'])

    await a.answer('q1', true, '10:00:00')
    await a.sync('10:00:10')
    expect(await b.sync('10:00:20')).toBe(true)
    expect(await b.progress('q1')).toMatchObject({ seen: 1, correct: 1, updatedAt: at('10:00:00').toISOString() })
    expect((await b.store.load()).progress.attempts).toHaveLength(1)

    await b.answer('q2', false, '10:05:00')
    await b.sync('10:05:10')
    await a.sync('10:05:20')
    expect(await a.progress('q2')).toMatchObject({ wrong: 1, lastCorrect: false })
    expect((await a.store.load()).progress.attempts.map((x) => x.id)).toEqual(['s-q1-10:00:00', 's-q2-10:05:00'])
  })

  it('когда на вопрос ответили на обоих устройствах, остаётся более поздний ответ', async () => {
    const { a, b } = await pair()
    await a.answer('q1', true, '10:00:00')
    await b.answer('q1', false, '10:03:00')
    await a.sync('10:10:00')
    await b.sync('10:10:10')
    await a.sync('10:10:20')
    expect(await a.progress('q1')).toMatchObject({ lastCorrect: false, updatedAt: at('10:03:00').toISOString() })
    expect(await b.progress('q1')).toEqual(await a.progress('q1'))
    // попытки не спорят между собой: остаются обе
    expect((await a.store.load()).progress.attempts).toHaveLength(2)
  })

  it('без изменений ничего не отправляет и не забирает', async () => {
    const { cloud, a } = await pair()
    await a.answer('q1', true, '10:00:00')
    await a.sync('10:00:10')
    const pushes = cloud.pushes.length
    // первый обмен после отправки забирает собственные строки обратно, дальше — тишина
    await a.sync('10:00:20')
    expect(await a.sync('10:00:30')).toBe(false)
    expect(cloud.pushes).toHaveLength(pushes)
  })

  it('сброс прогресса стирает старые ответы на другом устройстве, но не новые', async () => {
    const { cloud, a, b } = await pair()
    await a.answer('q1', true, '10:00:00')
    await a.sync('10:00:10')
    await b.sync('10:00:20')
    await b.answer('q2', true, '10:01:00')

    await a.store.resetProgress('c1', at('10:02:00').toISOString())
    await a.sync('10:02:10')
    await b.answer('q3', true, '10:03:00')
    await b.sync('10:03:10')

    const { progress } = await b.store.load()
    expect(Object.keys(progress.questions.c1)).toEqual(['q3'])
    expect(progress.attempts.map((x) => x.id)).toEqual(['s-q3-10:03:00'])
    expect((await b.store.load()).courses).toHaveLength(1)
    await a.sync('10:03:20')
    expect(Object.keys((await a.store.load()).progress.questions.c1)).toEqual(['q3'])
    expect(cloud.questionCount).toBe(1)
  })

  it('удаление курса доходит до другого устройства вместе с незавершённым тестом', async () => {
    const { a, b } = await pair()
    await b.answer('q1', true, '10:00:00')
    const { courses } = await b.store.load()
    await b.store.setSession(createSession('c1', pickQuestions(courses[0], {}, 'practice', { today: '2026-10-07' }), 'practice', { id: 'open', now: at('10:01:00') }))
    await b.sync('10:01:10')
    expect((await b.store.load()).progress.session?.id).toBe('open')

    await a.store.deleteCourse('c1', at('10:02:00').toISOString())
    await a.sync('10:02:10')
    await b.sync('10:02:20')
    const snapshot = await b.store.load()
    expect(snapshot.courses).toHaveLength(0)
    expect(snapshot.progress.questions.c1).toBeUndefined()
    expect(snapshot.progress.session).toBeNull()

    // курс, добавленный заново после удаления, снова расходится по устройствам
    await importCourse(b.store, COURSE, at('10:05:00'))
    await b.sync('10:05:10')
    await a.sync('10:05:20')
    expect((await a.store.load()).courses).toHaveLength(1)
  })

  it('полное удаление данных не возвращается обратно с другого устройства', async () => {
    const { a, b } = await pair()
    await a.answer('q1', true, '10:00:00')
    await a.sync('10:00:10')
    await wipeAll(b.store, at('10:01:00'))
    await b.sync('10:01:10')
    await a.sync('10:01:20')
    expect((await a.store.load()).courses).toHaveLength(0)
    await b.sync('10:01:30')
    expect((await b.store.load()).courses).toHaveLength(0)
  })

  it('отправляет прогресс, накопленный до появления синхронизации', async () => {
    const cloud = new FakeCloud()
    const a = new Device(cloud)
    await importCourse(a.store, COURSE, at('09:00:00'))
    await a.store.saveQuestionProgress('c1', 'q1', { seen: 4, correct: 3, wrong: 1, lastCorrect: true, box: 3, due: '2026-10-09' })
    await a.sync('10:00:00')
    const b = new Device(cloud)
    await b.sync('10:00:10')
    expect(await b.progress('q1')).toMatchObject({ seen: 4, box: 3 })
  })

  it('не теряет ответ, данный, пока шла загрузка из облака', async () => {
    const { cloud, a, b } = await pair()
    await b.answer('q1', true, '10:00:00')
    await b.sync('10:00:10')
    await a.sync('10:00:20', cloud.remote(() => a.answer('q2', true, '10:00:15')))
    expect(Object.keys((await a.store.load()).progress.questions.c1).sort()).toEqual(['q1', 'q2'])
    await b.sync('10:00:30')
    expect(await b.progress('q2')).toMatchObject({ correct: 1 })
  })

  it('пустой набор изменений распознаётся', () => {
    expect(isEmpty({ courses: [], clears: {}, questions: [], attempts: [] })).toBe(true)
    expect(isEmpty({ courses: [], clears: { c1: { at: 'x', deleted: false } }, questions: [], attempts: [] })).toBe(false)
  })
})
