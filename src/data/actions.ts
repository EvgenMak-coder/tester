import type { DataStore } from './store'
import { questionMap, toAttempt, trimToAnswered, withAnswer } from '../quiz/session'
import { review, toDay } from '../quiz/srs'
import { emptyProgress, type Course, type CourseFile, type Session, type Snapshot } from '../quiz/types'

export function importCourse(store: DataStore, file: CourseFile, now: Date = new Date()): Promise<void> {
  return store.saveCourse({ ...file, importedAt: now.toISOString() })
}

function current(snapshot: Snapshot): { session: Session; course: Course } | null {
  const session = snapshot.progress.session
  const course = session && snapshot.courses.find((c) => c.id === session.courseId)
  return session && course ? { session, course } : null
}

async function recordAnswer(store: DataStore, snapshot: Snapshot, course: Course, questionId: string, picked: number, now: Date): Promise<void> {
  const question = questionMap(course).get(questionId)
  if (!question) return
  const prev = snapshot.progress.questions[course.id]?.[questionId]
  await store.saveQuestionProgress(course.id, questionId, { ...review(prev, picked === question.answer, toDay(now)), updatedAt: now.toISOString() })
}

/**
 * Ответ на вопрос текущего теста. Вне экзамена ответ окончательный и сразу идёт в прогресс;
 * на экзамене его можно менять, а прогресс считается при завершении.
 */
export async function submitAnswer(store: DataStore, snapshot: Snapshot, index: number, picked: number, now: Date = new Date()): Promise<void> {
  const active = current(snapshot)
  const item = active?.session.items[index]
  if (!active || !item) return
  const { session, course } = active
  if (session.mode !== 'exam' && item.picked !== null) return
  await store.setSession(withAnswer(session, index, picked))
  if (session.mode !== 'exam') await recordAnswer(store, snapshot, course, item.questionId, picked, now)
}

export async function goTo(store: DataStore, snapshot: Snapshot, index: number): Promise<void> {
  const session = snapshot.progress.session
  if (!session || index < 0 || index >= session.items.length) return
  await store.setSession({ ...session, current: index })
}

/**
 * Завершает текущий тест. Тренировка, оборванная досрочно, засчитывается по отвеченным вопросам;
 * на экзамене пропущенные считаются ошибками. Возвращает false, если засчитывать нечего.
 */
export async function finishSession(store: DataStore, snapshot: Snapshot, now: Date = new Date()): Promise<boolean> {
  const active = current(snapshot)
  if (!active) {
    await store.setSession(null)
    return false
  }
  const { course } = active
  const session = active.session.mode === 'exam' ? active.session : trimToAnswered(active.session)
  if (session.items.length === 0) {
    await store.setSession(null)
    return false
  }
  if (session.mode === 'exam') {
    for (const item of session.items) {
      if (item.picked !== null) await recordAnswer(store, snapshot, course, item.questionId, item.picked, now)
    }
  }
  await store.addAttempt(toAttempt(course, session, now))
  await store.setLastResult({ ...session, finishedAt: now.toISOString() })
  await store.setSession(null)
  return true
}

/**
 * Стирает все курсы и весь прогресс. Каждый курс помечается удалённым, а не просто исчезает:
 * иначе при синхронизации другое устройство вернуло бы его обратно.
 */
export function wipeAll(store: DataStore, now: Date = new Date()): Promise<void> {
  const at = now.toISOString()
  return store.transform((snapshot) => {
    const ids = new Set([...snapshot.courses.map((c) => c.id), ...Object.keys(snapshot.progress.questions), ...snapshot.progress.attempts.map((a) => a.courseId)])
    const cleared = { ...snapshot.progress.cleared }
    for (const id of ids) cleared[id] = { at, deleted: true }
    return { courses: [], progress: { ...emptyProgress(), cleared } }
  })
}

/** Проверяет файл резервной копии настолько, чтобы приложение не упало на чужом JSON. */
export function readBackup(text: string): Snapshot | null {
  try {
    const raw = JSON.parse(text) as Partial<Snapshot> | null
    if (!raw || !Array.isArray(raw.courses) || typeof raw.progress !== 'object' || raw.progress === null) return null
    if (!raw.courses.every((c) => c && typeof c.id === 'string' && Array.isArray(c.topics))) return null
    return { courses: raw.courses, progress: { ...emptyProgress(), ...raw.progress } }
  } catch {
    return null
  }
}
