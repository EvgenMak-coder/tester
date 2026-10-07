import type { Attempt, Course, QuestionProgress, Session, Snapshot } from '../quiz/types'

/** Примитивы хранения. Правила тестов живут в src/quiz, сценарии — в actions.ts. */
export interface DataStore {
  load(): Promise<Snapshot>
  /** Добавляет курс или заменяет курс с тем же id. Прогресс не трогает. */
  saveCourse(course: Course): Promise<void>
  /** Удаляет курс вместе с его прогрессом, попытками и незавершённым тестом. */
  deleteCourse(id: string): Promise<void>
  saveQuestionProgress(courseId: string, questionId: string, progress: QuestionProgress): Promise<void>
  addAttempt(attempt: Attempt): Promise<void>
  setSession(session: Session | null): Promise<void>
  setLastResult(session: Session | null): Promise<void>
  /** Стирает прогресс и попытки курса, сам курс остаётся. */
  resetProgress(courseId: string): Promise<void>
  /** Полностью заменяет все данные. */
  replaceAll(snapshot: Snapshot): Promise<void>
}
