import type { Attempt, Clear, Course, CourseProgress, QuestionProgress, Snapshot } from '../quiz/types'

/** Отметка для записей прогресса, сделанных до появления синхронизации. */
export const EPOCH = '1970-01-01T00:00:00.000Z'

export interface QuestionRecord {
  courseId: string
  questionId: string
  progress: QuestionProgress
}

/** Набор изменений: то, что пришло из облака, или то, что пора туда отправить. */
export interface Changes {
  courses: Course[]
  clears: Record<string, Clear>
  questions: QuestionRecord[]
  attempts: Attempt[]
}

export function isEmpty(changes: Changes): boolean {
  return changes.courses.length === 0 && changes.questions.length === 0 && changes.attempts.length === 0 && Object.keys(changes.clears).length === 0
}

const stamp = (progress: QuestionProgress): string => progress.updatedAt ?? EPOCH

/**
 * Вливает изменения из облака в данные устройства. Правила:
 * курс и прогресс вопроса — побеждает более поздняя запись, при равенстве остаётся своя;
 * попытки объединяются; сброс или удаление курса стирает всё, что было сделано до него.
 * Незавершённый тест остаётся как есть: он живёт только на устройстве.
 */
export function mergeChanges(local: Snapshot, remote: Changes): Snapshot {
  if (isEmpty(remote)) return local

  const cleared = { ...local.progress.cleared }
  for (const [courseId, clear] of Object.entries(remote.clears)) {
    if (!cleared[courseId] || clear.at > cleared[courseId].at) cleared[courseId] = clear
  }
  const clearedAt = (courseId: string): string => cleared[courseId]?.at ?? ''

  const courses = new Map(local.courses.map((c) => [c.id, c]))
  for (const course of remote.courses) {
    const mine = courses.get(course.id)
    if (!mine || course.importedAt > mine.importedAt) courses.set(course.id, course)
  }
  for (const [id, course] of courses) {
    if (cleared[id]?.deleted && course.importedAt <= cleared[id].at) courses.delete(id)
  }

  const questions: Record<string, CourseProgress> = {}
  const put = (courseId: string, questionId: string, progress: QuestionProgress) => {
    if (stamp(progress) <= clearedAt(courseId)) return
    const mine = questions[courseId]?.[questionId]
    if (!mine || stamp(progress) > stamp(mine)) (questions[courseId] ??= {})[questionId] = progress
  }
  for (const [courseId, byQuestion] of Object.entries(local.progress.questions)) {
    for (const [questionId, progress] of Object.entries(byQuestion)) put(courseId, questionId, progress)
  }
  for (const record of remote.questions) put(record.courseId, record.questionId, record.progress)

  const attempts = new Map<string, Attempt>()
  for (const attempt of [...local.progress.attempts, ...remote.attempts]) {
    if (!attempts.has(attempt.id) && attempt.finishedAt > clearedAt(attempt.courseId)) attempts.set(attempt.id, attempt)
  }

  const alive = <T extends { courseId: string }>(item: T | null): T | null => (item && courses.has(item.courseId) ? item : null)
  return {
    courses: [...courses.values()],
    progress: {
      questions,
      attempts: [...attempts.values()].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt)),
      session: alive(local.progress.session),
      lastResult: alive(local.progress.lastResult),
      cleared,
    },
  }
}

/** Что изменилось на устройстве после отметки since; null — отправить всё. */
export function changedSince(snapshot: Snapshot, since: string | null): Changes {
  const after = (at: string) => since === null || at > since
  const questions: QuestionRecord[] = []
  for (const [courseId, byQuestion] of Object.entries(snapshot.progress.questions)) {
    for (const [questionId, progress] of Object.entries(byQuestion)) {
      if (after(stamp(progress))) questions.push({ courseId, questionId, progress: { ...progress, updatedAt: stamp(progress) } })
    }
  }
  return {
    courses: snapshot.courses.filter((c) => after(c.importedAt)),
    clears: Object.fromEntries(Object.entries(snapshot.progress.cleared).filter(([, clear]) => after(clear.at))),
    questions,
    attempts: snapshot.progress.attempts.filter((a) => after(a.finishedAt)),
  }
}
