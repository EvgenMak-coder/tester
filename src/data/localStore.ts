import type { DataStore } from './store'
import { emptyProgress, type Attempt, type Clear, type Course, type Progress, type QuestionProgress, type Session, type Snapshot } from '../quiz/types'

// курсы и прогресс лежат отдельно: прогресс пишется на каждый ответ, а курсы большие и меняются редко
export const COURSES_KEY = 'tester:courses:v1'
export const PROGRESS_KEY = 'tester:progress:v1'

export class LocalStore implements DataStore {
  protected readCourses(): Course[] {
    try {
      const raw = localStorage.getItem(COURSES_KEY)
      if (raw) return JSON.parse(raw) as Course[]
    } catch {
      // повреждённые данные — начинаем с чистого листа
    }
    return []
  }

  protected writeCourses(courses: Course[]): void {
    localStorage.setItem(COURSES_KEY, JSON.stringify(courses))
  }

  protected readProgress(): Progress {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY)
      if (raw) return { ...emptyProgress(), ...(JSON.parse(raw) as Progress) }
    } catch {
      // повреждённые данные — начинаем с чистого листа
    }
    return emptyProgress()
  }

  protected writeProgress(progress: Progress): void {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
  }

  private mutateProgress(fn: (p: Progress) => void): Promise<void> {
    const progress = this.readProgress()
    fn(progress)
    this.writeProgress(progress)
    return Promise.resolve()
  }

  load(): Promise<Snapshot> {
    return Promise.resolve({ courses: this.readCourses(), progress: this.readProgress() })
  }

  saveCourse(course: Course): Promise<void> {
    const courses = this.readCourses()
    const i = courses.findIndex((c) => c.id === course.id)
    if (i >= 0) courses[i] = course
    else courses.push(course)
    this.writeCourses(courses)
    return Promise.resolve()
  }

  deleteCourse(id: string, at: string): Promise<void> {
    this.writeCourses(this.readCourses().filter((c) => c.id !== id))
    return this.mutateProgress((p) => clearCourse(p, id, { at, deleted: true }))
  }

  saveQuestionProgress(courseId: string, questionId: string, progress: QuestionProgress): Promise<void> {
    return this.mutateProgress((p) => {
      p.questions[courseId] = { ...p.questions[courseId], [questionId]: progress }
    })
  }

  addAttempt(attempt: Attempt): Promise<void> {
    return this.mutateProgress((p) => void p.attempts.push(attempt))
  }

  setSession(session: Session | null): Promise<void> {
    return this.mutateProgress((p) => {
      p.session = session
    })
  }

  setLastResult(session: Session | null): Promise<void> {
    return this.mutateProgress((p) => {
      p.lastResult = session
    })
  }

  resetProgress(courseId: string, at: string): Promise<void> {
    return this.mutateProgress((p) => clearCourse(p, courseId, { at, deleted: false }))
  }

  transform(fn: (snapshot: Snapshot) => Snapshot): Promise<void> {
    // чтение и запись идут подряд без await, поэтому в браузере это одна неделимая операция
    const next = fn({ courses: this.readCourses(), progress: this.readProgress() })
    this.writeCourses(next.courses)
    this.writeProgress(next.progress)
    return Promise.resolve()
  }

  replaceAll(snapshot: Snapshot): Promise<void> {
    this.writeCourses(snapshot.courses)
    this.writeProgress(snapshot.progress)
    return Promise.resolve()
  }
}

function clearCourse(p: Progress, courseId: string, clear: Clear): void {
  p.cleared[courseId] = clear
  delete p.questions[courseId]
  p.attempts = p.attempts.filter((a) => a.courseId !== courseId)
  if (p.session?.courseId === courseId) p.session = null
  if (p.lastResult?.courseId === courseId) p.lastResult = null
}

/** Хранилище в памяти — для тестов сценариев. */
export class MemoryStore extends LocalStore {
  private courses: Course[] = []
  private progress: Progress = emptyProgress()

  protected readCourses(): Course[] {
    return this.courses
  }

  protected writeCourses(courses: Course[]): void {
    this.courses = courses
  }

  protected readProgress(): Progress {
    return this.progress
  }

  protected writeProgress(progress: Progress): void {
    this.progress = progress
  }
}
