import { describe, expect, it } from 'vitest'
import demoText from '../../courses/linux-demo.json?raw'
import { assembleCatalog, isOutdated } from '../features/import/builtin'
import { finishSession, importCourse, readBackup, submitAnswer } from '../data/actions'
import { MemoryStore } from '../data/localStore'
import { countQuestions, diffCourse, parseCourse, parseCourseText } from './format'
import { createSession, pickQuestions, questionMap, score, secondsLeft, shuffled, toAttempt, trimToAnswered, withAnswer, type Rng } from './session'
import { addDays, review, toDay } from './srs'
import { courseStats, levelCounts } from './stats'
import { levelOf, type CourseFile, type CourseProgress, type QuestionProgress } from './types'

function seeded(seed: number): Rng {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function question(id: string, extra: object = {}) {
  return { id, type: 'single', text: `Вопрос ${id}`, options: ['a', 'b', 'c', 'd', 'e'], answer: 2, ...extra }
}

function file(topics: object[] = [{ id: 't1', title: 'Тема 1', questions: [question('q1'), question('q2')] }]) {
  return { format: 'tester-course', version: 1, course: { id: 'c1', title: 'Курс' }, topics }
}

function parsed(raw: object = file()): CourseFile {
  const result = parseCourse(raw)
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result.course
}

function errorsOf(raw: unknown): string[] {
  const result = parseCourse(raw)
  return result.ok ? [] : result.errors
}

const TODAY = '2026-10-07'
const seen = (extra: Partial<QuestionProgress> = {}): QuestionProgress => ({ seen: 1, correct: 1, wrong: 0, lastCorrect: true, box: 1, due: TODAY, ...extra })

describe('формат курса', () => {
  it('принимает демо-курс', () => {
    const result = parseCourseText(demoText)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.course.id).toBe('linux-demo')
      expect(result.course.topics).toHaveLength(3)
      expect(countQuestions(result.course)).toBe(31)
    }
  })

  const catalog = assembleCatalog(import.meta.glob<string>(['../../courses/*.json', '../../courses/*/*.json'], { query: '?raw', import: 'default', eager: true }))

  it('все курсы каталога проходят проверку и не делят id', () => {
    const ids = catalog.map(({ source, result }) => {
      expect(result.ok ? null : { source, errors: result.errors }).toBeNull()
      return result.ok ? result.course.id : source
    })
    expect(ids.sort()).toEqual(['linux', 'linux-demo'])
  })

  it('курс Linux собирается из папки: модули идут по порядку файлов, в готовых модулях по 10 вопросов на уровень', () => {
    const linux = catalog.find((entry) => entry.source === 'linux')!.result
    if (!linux.ok) throw new Error(linux.errors.join('; '))
    expect(linux.course.topics.map((t) => t.id)).toEqual(['shell', 'files', 'permissions', 'text', 'processes', 'users', 'packages', 'network'])
    // «Сеть» пока написана только на базовом уровне
    for (const topic of linux.course.topics.filter((t) => t.id !== 'network')) {
      const levels = topic.questions.map(levelOf)
      expect([topic.id, ...['basic', 'intermediate', 'advanced'].map((l) => levels.filter((x) => x === l).length)]).toEqual([topic.id, 10, 10, 10])
      expect(topic.description).toBeTruthy()
      expect(topic.icon).toBeTruthy()
    }
    expect(levelCounts(linux.course)).toEqual({ basic: 95, intermediate: 70, advanced: 70 })
  })

  it('верный ответ в готовых модулях не стоит всё время на одном месте и не выделяется длиной', () => {
    const linux = catalog.find((entry) => entry.source === 'linux')!.result
    if (!linux.ok) throw new Error(linux.errors.join('; '))
    for (const topic of linux.course.topics) {
      const positions = new Set(topic.questions.map((q) => q.answer))
      expect([topic.id, positions.size >= 4]).toEqual([topic.id, true])
      // доля вопросов, где верный вариант — самый длинный и заметно длиннее второго по длине
      const standout = topic.questions.filter((q) => {
        const others = q.options.filter((_, i) => i !== q.answer).map((o) => o.length)
        return q.options[q.answer].length > Math.max(...others) * 1.5 && q.options[q.answer].length > 40
      })
      expect([topic.id, standout.map((q) => q.id)]).toEqual([topic.id, []])
    }
  })

  it('сообщает об ошибках в папке курса', () => {
    const header = JSON.stringify({ format: 'tester-course', version: 1, course: { id: 'c1', title: 'Курс' } })
    const topic = JSON.stringify({ id: 't1', title: 'Тема', questions: [question('q1')] })
    const errors = (texts: Record<string, string>) => {
      const { result } = assembleCatalog(texts)[0]
      return result.ok ? [] : result.errors
    }
    expect(errors({ '../courses/c1/course.json': header, '../courses/c1/01-a.json': topic })).toEqual([])
    expect(errors({ '../courses/c1/01-a.json': topic })).toEqual(['c1: нет файла course.json'])
    expect(errors({ '../courses/c1/course.json': header, '../courses/c1/01-a.json': '{ "id": ' })[0]).toMatch(/^c1\/01-a\.json: это не JSON/)
    expect(errors({ '../courses/c1/course.json': header, '../courses/c1/01-a.json': topic, '../courses/c1/02-b.json': topic })[0]).toMatch(/^topics\[1\]\.id: id темы «t1» повторяется/)
  })

  it('замечает, что курс в каталоге новее добавленного', () => {
    const course = parsed()
    const installed = { ...course, importedAt: '2026-10-07T10:00:00.000Z' }
    expect(isOutdated(installed, parsed())).toBe(false)
    expect(isOutdated(installed, { ...parsed(), title: 'Курс, издание второе' })).toBe(true)
    expect(isOutdated(installed, parsed(file([{ id: 't1', title: 'Тема 1', questions: [question('q1'), question('q2'), question('q3')] }])))).toBe(true)
  })

  it('принимает текст с BOM и обёрткой из чата', () => {
    const text = '﻿```json\n' + JSON.stringify(file()) + '\n```'
    expect(parseCourseText(text).ok).toBe(true)
  })

  it('сообщает, что текст не JSON', () => {
    const result = parseCourseText('{ "format": ')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toMatch(/^Это не JSON/)
  })

  it('называет поле с ошибкой', () => {
    const topic = (q: object) => [{ id: 't1', title: 'Тема', questions: [question('q1'), q] }]
    expect(errorsOf(file(topic(question('q2', { answer: 5 }))))).toEqual(['topics[0].questions[1].answer: индекс 5 вне диапазона: вариантов 5, счёт с нуля'])
    expect(errorsOf(file(topic(question('q1'))))[0]).toMatch(/^topics\[0\]\.questions\[1\]\.id: id «q1» уже встречался/)
    expect(errorsOf(file(topic(question('q2', { id: undefined }))))[0]).toMatch(/^topics\[0\]\.questions\[1\]\.id/)
    expect(errorsOf(file(topic(question('q2', { type: 'multi' }))))[0]).toMatch(/тип «multi» пока не поддерживается/)
    expect(errorsOf(file(topic(question('q2', { options: ['a'] }))))[0]).toMatch(/^topics\[0\]\.questions\[1\]\.options/)
    expect(errorsOf(file(topic(question('q2', { options: ['a', 'a', 'b'] }))))[0]).toMatch(/повторяются/)
    expect(errorsOf(file(topic(question('q2', { text: ' ' }))))[0]).toMatch(/^topics\[0\]\.questions\[1\]\.text/)
  })

  it('проверяет шапку файла', () => {
    expect(errorsOf([])).toHaveLength(1)
    expect(errorsOf({ ...file(), format: 'other' })[0]).toMatch(/^format/)
    expect(errorsOf({ ...file(), version: 2 })[0]).toMatch(/^version/)
    expect(errorsOf({ ...file(), course: { id: 'мой курс', title: 'Курс' } })[0]).toMatch(/^course\.id/)
    expect(errorsOf({ ...file(), topics: [] })[0]).toMatch(/^topics/)
  })

  it('находит одинаковые id вопросов в разных темах', () => {
    const raw = file([
      { id: 't1', title: 'Тема 1', questions: [question('q1')] },
      { id: 't2', title: 'Тема 2', questions: [question('q1')] },
    ])
    expect(errorsOf(raw)[0]).toMatch(/^topics\[1\]\.questions\[0\]\.id/)
  })

  it('читает уровень вопроса и отклоняет неизвестный', () => {
    const topic = (q: object) => [{ id: 't1', title: 'Тема', questions: [q] }]
    const [plain, basic, hard] = parsed(file([{ id: 't1', title: 'Тема', questions: [question('q1'), question('q2', { level: 'basic' }), question('q3', { level: 'advanced' })] }])).topics[0].questions
    // базовый — значение по умолчанию, поэтому явный basic хранится так же, как отсутствие поля
    expect(plain.level).toBeUndefined()
    expect(basic.level).toBeUndefined()
    expect(hard.level).toBe('advanced')
    expect(errorsOf(file(topic(question('q1', { level: 'hard' }))))).toEqual(['topics[0].questions[0].level: уровень должен быть одним из: basic, intermediate, advanced'])
  })

  it('считает разницу при повторном импорте', () => {
    const prev = parsed(file([{ id: 't1', title: 'Тема', questions: [question('q1'), question('q2'), question('q3')] }]))
    const next = parsed(file([{ id: 't1', title: 'Тема', questions: [question('q1'), question('q2', { text: 'Иначе' }), question('q4')] }]))
    expect(diffCourse(prev, next)).toEqual({ added: 1, changed: 1, removed: 1, same: 1 })
  })
})

describe('интервальное повторение', () => {
  it('складывает даты через границу месяца', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02')
    expect(toDay(new Date(2026, 9, 7, 23, 59))).toBe('2026-10-07')
  })

  it('новый вопрос после верного ответа попадает в первую коробку', () => {
    expect(review(undefined, true, TODAY)).toEqual({ seen: 1, correct: 1, wrong: 0, lastCorrect: true, box: 1, due: '2026-10-08' })
  })

  it('продвигает коробки по интервалам 1, 3, 7, 16, 35 и не выходит за пятую', () => {
    let state: QuestionProgress | undefined
    let day = TODAY
    const gaps: number[] = []
    for (let i = 0; i < 6; i++) {
      state = review(state, true, day)
      gaps.push((new Date(state.due).getTime() - new Date(day).getTime()) / 86_400_000)
      day = state.due
    }
    expect(gaps).toEqual([1, 3, 7, 16, 35, 35])
    expect(state?.box).toBe(5)
  })

  it('неверный ответ возвращает в первую коробку', () => {
    const state = review(seen({ box: 4, due: '2026-10-20' }), false, TODAY)
    expect(state).toMatchObject({ box: 1, due: '2026-10-08', wrong: 1, lastCorrect: false })
  })

  it('верный ответ раньше срока коробку не двигает', () => {
    const state = review(seen({ box: 2, due: '2026-10-09' }), true, TODAY)
    expect(state).toMatchObject({ box: 2, due: '2026-10-09', seen: 2, correct: 2 })
  })
})

describe('набор вопросов', () => {
  const course = parsed(
    file([
      { id: 't1', title: 'Тема 1', questions: ['q1', 'q2', 'q3', 'q4'].map((id) => question(id)) },
      { id: 't2', title: 'Тема 2', questions: ['q5', 'q6', 'q7', 'q8'].map((id) => question(id)) },
    ]),
  )
  const ids = (picks: { question: { id: string } }[]) => picks.map((p) => p.question.id).sort()

  it('перемешивание сохраняет состав', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    const mixed = shuffled(items, seeded(1))
    expect(mixed).not.toEqual(items)
    expect([...mixed].sort()).toEqual(items)
  })

  it('тренировка берёт выбранные темы и нужное число вопросов', () => {
    expect(ids(pickQuestions(course, {}, 'practice', { today: TODAY, topicIds: ['t2'] }))).toEqual(['q5', 'q6', 'q7', 'q8'])
    expect(pickQuestions(course, {}, 'practice', { today: TODAY, count: 3 })).toHaveLength(3)
  })

  it('берёт вопросы только выбранного уровня', () => {
    const mixed = parsed(file([{ id: 't1', title: 'Тема', questions: [question('q1'), question('q2', { level: 'intermediate' }), question('q3', { level: 'intermediate' }), question('q4', { level: 'advanced' })] }]))
    expect(ids(pickQuestions(mixed, {}, 'practice', { today: TODAY, level: 'intermediate' }))).toEqual(['q2', 'q3'])
    expect(ids(pickQuestions(mixed, {}, 'practice', { today: TODAY, level: 'basic' }))).toEqual(['q1'])
    expect(pickQuestions(mixed, {}, 'practice', { today: TODAY })).toHaveLength(4)
    expect(levelCounts(mixed)).toEqual({ basic: 1, intermediate: 2, advanced: 1 })
    const progress: CourseProgress = { q1: seen({ lastCorrect: false }), q2: seen({ lastCorrect: false }) }
    expect(courseStats(mixed, progress, TODAY, 'intermediate').all).toMatchObject({ total: 2, seen: 1, mistakes: 1 })
    const session = createSession(mixed.id, pickQuestions(mixed, {}, 'exam', { today: TODAY, level: 'advanced' }), 'exam', { id: 's', now: new Date('2026-10-07T10:00:00'), level: 'advanced' })
    expect(session.level).toBe('advanced')
    expect(session.items.map((i) => i.questionId)).toEqual(['q4'])
    expect(levelCounts(mixed, 't1')).toEqual({ basic: 1, intermediate: 2, advanced: 1 })
    expect(levelCounts(mixed, 'other')).toEqual({ basic: 0, intermediate: 0, advanced: 0 })
  })

  it('работа над ошибками берёт вопросы с неверным последним ответом', () => {
    const progress: CourseProgress = { q1: seen({ lastCorrect: false }), q2: seen(), q6: seen({ lastCorrect: false }) }
    expect(ids(pickQuestions(course, progress, 'mistakes', { today: TODAY }))).toEqual(['q1', 'q6'])
  })

  it('повторение берёт вопросы с наступившим сроком и новые до лимита', () => {
    const progress: CourseProgress = { q1: seen({ due: '2026-10-01' }), q2: seen({ due: TODAY }), q3: seen({ due: '2026-10-08' }) }
    expect(ids(pickQuestions(course, progress, 'review', { today: TODAY, newLimit: 2 }))).toEqual(['q1', 'q2', 'q4', 'q5'])
    // при нехватке места новые уступают тем, чей срок подошёл
    expect(ids(pickQuestions(course, progress, 'review', { today: TODAY, newLimit: 2, count: 2 }, seeded(3)))).toEqual(['q1', 'q2'])
  })
})

describe('тест', () => {
  const course = parsed(
    file([{ id: 't1', title: 'Тема', questions: [question('q1'), question('q2', { answer: 0 }), question('q3', { shuffle: false })] }]),
  )
  const start = new Date('2026-10-07T10:00:00')
  const make = (seed = 7) => createSession(course.id, pickQuestions(course, {}, 'practice', { today: TODAY }, seeded(seed)), 'practice', { id: 's1', now: start }, seeded(seed))

  it('перемешивает варианты, не теряя верный ответ', () => {
    const session = make()
    const questions = questionMap(course)
    for (const item of session.items) {
      const q = questions.get(item.questionId)!
      expect([...item.order].sort()).toEqual([0, 1, 2, 3, 4])
      expect(item.order).toContain(q.answer)
      if (q.shuffle === false) expect(item.order).toEqual([0, 1, 2, 3, 4])
    }
    expect(session.items.some((item) => item.order.join() !== '0,1,2,3,4')).toBe(true)
  })

  it('даёт разный порядок при разных запусках', () => {
    const order = (seed: number) => make(seed).items.map((i) => `${i.questionId}:${i.order.join('')}`).join('|')
    expect(new Set([1, 2, 3, 4, 5].map(order)).size).toBeGreaterThan(1)
  })

  it('считает результат по исходному индексу варианта', () => {
    let session = make()
    const questions = questionMap(course)
    session = withAnswer(session, 0, questions.get(session.items[0].questionId)!.answer)
    session = withAnswer(session, 1, (questions.get(session.items[1].questionId)!.answer + 1) % 5)
    expect(score(course, session)).toEqual({ total: 3, answered: 2, correct: 1 })
    expect(trimToAnswered(session).items).toHaveLength(2)
  })

  it('тест, запущенный в модуле, помнит его, и попытка тоже', () => {
    const picks = pickQuestions(course, {}, 'practice', { today: TODAY, topicIds: ['t1'] })
    const inModule = createSession(course.id, picks, 'practice', { id: 's3', now: start, topicId: 't1' })
    expect(toAttempt(course, inModule, start).topicId).toBe('t1')
    expect(toAttempt(course, make(), start).topicId).toBeUndefined()
  })

  it('отсчитывает время экзамена от начала теста', () => {
    const exam = createSession(course.id, pickQuestions(course, {}, 'exam', { today: TODAY }), 'exam', { id: 's2', now: start, timeLimitSec: 120 })
    expect(secondsLeft(exam, new Date('2026-10-07T10:00:30'))).toBe(90)
    expect(secondsLeft(exam, new Date('2026-10-07T10:05:00'))).toBe(0)
    expect(secondsLeft(make(), start)).toBeNull()
  })
})

describe('статистика', () => {
  it('считает по темам и по курсу', () => {
    const course = parsed(
      file([
        { id: 't1', title: 'Тема 1', questions: [question('q1'), question('q2')] },
        { id: 't2', title: 'Тема 2', questions: [question('q3')] },
      ]),
    )
    const progress: CourseProgress = {
      q1: seen({ correct: 3, wrong: 1, due: '2026-10-01' }),
      q2: seen({ correct: 0, wrong: 2, lastCorrect: false, due: '2026-10-08' }),
      gone: seen(),
    }
    const { all, topics } = courseStats(course, progress, TODAY)
    expect(topics[0]).toMatchObject({ topicId: 't1', total: 2, seen: 2, answers: 6, correct: 3, accuracy: 0.5, due: 1, mistakes: 1 })
    expect(topics[1]).toMatchObject({ total: 1, seen: 0, accuracy: null })
    expect(all).toMatchObject({ total: 3, seen: 2, due: 1, mistakes: 1 })
  })
})

describe('сценарии', () => {
  const course = parsed(file([{ id: 't1', title: 'Тема', questions: [question('q1'), question('q2'), question('q3')] }]))
  const now = new Date('2026-10-07T10:00:00')

  async function started(mode: 'practice' | 'exam') {
    const store = new MemoryStore()
    await importCourse(store, course, now)
    const picks = pickQuestions(course, {}, mode, { today: TODAY }, seeded(5))
    await store.setSession(createSession(course.id, picks, mode, { id: 's1', now, timeLimitSec: mode === 'exam' ? 180 : undefined }, seeded(5)))
    return store
  }

  it('в тренировке ответ сразу идёт в прогресс и не меняется', async () => {
    const store = await started('practice')
    await submitAnswer(store, await store.load(), 0, 2, now)
    await submitAnswer(store, await store.load(), 0, 1, now)
    const { progress } = await store.load()
    const first = progress.session!.items[0]
    expect(first.picked).toBe(2)
    expect(progress.questions.c1[first.questionId]).toMatchObject({ seen: 1, correct: 1, box: 1 })
  })

  it('досрочно завершённая тренировка засчитывается по отвеченным', async () => {
    const store = await started('practice')
    await submitAnswer(store, await store.load(), 0, 2, now)
    await submitAnswer(store, await store.load(), 1, 0, now)
    expect(await finishSession(store, await store.load(), new Date('2026-10-07T10:01:00'))).toBe(true)
    const { progress } = await store.load()
    expect(progress.session).toBeNull()
    expect(progress.lastResult?.items).toHaveLength(2)
    expect(progress.attempts).toEqual([{ id: 's1', courseId: 'c1', mode: 'practice', finishedAt: new Date('2026-10-07T10:01:00').toISOString(), total: 2, correct: 1, durationSec: 60 }])
  })

  it('тренировка без ответов не засчитывается', async () => {
    const store = await started('practice')
    expect(await finishSession(store, await store.load(), now)).toBe(false)
    const { progress } = await store.load()
    expect(progress.session).toBeNull()
    expect(progress.attempts).toHaveLength(0)
  })

  it('на экзамене ответ можно менять, а прогресс считается в конце', async () => {
    const store = await started('exam')
    await submitAnswer(store, await store.load(), 0, 1, now)
    await submitAnswer(store, await store.load(), 0, 2, now)
    expect((await store.load()).progress.questions.c1).toBeUndefined()
    await finishSession(store, await store.load(), new Date('2026-10-07T10:10:00'))
    const { progress } = await store.load()
    expect(Object.keys(progress.questions.c1)).toHaveLength(1)
    expect(progress.attempts[0]).toMatchObject({ mode: 'exam', total: 3, correct: 1, durationSec: 180 })
  })

  it('повторный импорт сохраняет прогресс, удаление курса его стирает', async () => {
    const store = await started('practice')
    await submitAnswer(store, await store.load(), 0, 2, now)
    const answered = (await store.load()).progress.session!.items[0].questionId
    await importCourse(store, { ...course, title: 'Курс, версия 2' }, now)
    let snapshot = await store.load()
    expect(snapshot.courses).toHaveLength(1)
    expect(snapshot.courses[0].title).toBe('Курс, версия 2')
    expect(snapshot.progress.questions.c1[answered].seen).toBe(1)
    await store.deleteCourse('c1', now.toISOString())
    snapshot = await store.load()
    expect(snapshot.courses).toHaveLength(0)
    expect(snapshot.progress.questions.c1).toBeUndefined()
    expect(snapshot.progress.session).toBeNull()
  })

  it('резервная копия отклоняет посторонний JSON', async () => {
    const store = await started('practice')
    expect(readBackup(JSON.stringify(await store.load()))?.courses).toHaveLength(1)
    expect(readBackup('{"courses": 5}')).toBeNull()
    expect(readBackup('не json')).toBeNull()
  })
})
