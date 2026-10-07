import { finishSession } from '../../data/actions'
import { act } from '../../data/hooks'
import { createSession, EXAM_SECONDS_PER_QUESTION, pickQuestions } from '../../quiz/session'
import { toDay } from '../../quiz/srs'
import type { Course, Level, Mode, Snapshot } from '../../quiz/types'

export interface StartOptions {
  topicIds?: string[]
  /** нет поля — вопросы всех уровней */
  level?: Level
  count?: number
  /** только для экзамена; по умолчанию минута на вопрос */
  timeLimitSec?: number
}

/** Собирает тест и делает его текущим. false — вопросов под режим нет или пользователь передумал. */
export async function startSession(snapshot: Snapshot, course: Course, mode: Mode, opts: StartOptions = {}): Promise<boolean> {
  const now = new Date()
  const progress = snapshot.progress.questions[course.id] ?? {}
  const picks = pickQuestions(course, progress, mode, { today: toDay(now), topicIds: opts.topicIds, level: opts.level, count: opts.count })
  if (picks.length === 0) return false

  const unfinished = snapshot.progress.session !== null
  if (unfinished && !window.confirm('Есть незавершённый тест. Завершить его и начать новый?')) return false

  const session = createSession(course.id, picks, mode, {
    id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    now,
    timeLimitSec: mode === 'exam' ? (opts.timeLimitSec ?? picks.length * EXAM_SECONDS_PER_QUESTION) : undefined,
    level: opts.level,
    // тест по одному модулю помнит его: туда ведёт возврат и там показывается история
    topicId: opts.topicIds?.length === 1 ? opts.topicIds[0] : undefined,
  })
  await act(async (store) => {
    if (unfinished) await finishSession(store, snapshot, now)
    await store.setSession(session)
  })
  return true
}
