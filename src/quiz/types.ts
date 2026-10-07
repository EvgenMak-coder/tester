export type Level = 'basic' | 'intermediate' | 'advanced'

export const LEVELS: Level[] = ['basic', 'intermediate', 'advanced']

export const LEVEL_TITLES: Record<Level, string> = {
  basic: 'Базовый',
  intermediate: 'Средний',
  advanced: 'Продвинутый',
}

/** Вопрос с одним правильным ответом. `answer` — индекс в исходном порядке `options`. */
export interface SingleQuestion {
  id: string
  type: 'single'
  text: string
  code?: string
  options: string[]
  answer: number
  explanation?: string
  /** разбор каждого варианта, по строке на вариант в порядке `options`; пустая строка — без разбора */
  notes?: string[]
  /** false — варианты показываются в порядке файла */
  shuffle?: boolean
  /** нет поля — базовый уровень */
  level?: Level
}

/** Новые типы (multi, input, card) добавляются сюда отдельными интерфейсами. */
export type Question = SingleQuestion

export function levelOf(question: Question): Level {
  return question.level ?? 'basic'
}

/** Теория одного уровня модуля: план раздела и, когда он написан, сам текст. */
export interface Lesson {
  /** о чём раздел, по пункту на строку */
  plan?: string[]
  /** текст раздела в Markdown */
  text?: string
}

export type Theory = Partial<Record<Level, Lesson>>

/** Тема курса; в приложении называется модулем. */
export interface Topic {
  id: string
  title: string
  description?: string
  /** имя значка модуля, список — в components/ModuleIcon.tsx */
  icon?: string
  theory?: Theory
  questions: Question[]
}

/** Содержимое файла курса после проверки. */
export interface CourseFile {
  id: string
  title: string
  description?: string
  topics: Topic[]
}

export interface Course extends CourseFile {
  importedAt: string
}

/** Дата без времени в местном поясе: YYYY-MM-DD. */
export type Day = string

export interface QuestionProgress {
  seen: number
  correct: number
  wrong: number
  lastCorrect: boolean
  /** коробка Лейтнера, 1..5 */
  box: number
  due: Day
  /** когда запись изменили; по этой отметке синхронизация выбирает более свежую */
  updatedAt?: string
}

export type Mode = 'practice' | 'mistakes' | 'review' | 'exam'

export interface SessionItem {
  topicId: string
  questionId: string
  /** исходные индексы вариантов в том порядке, в котором они показаны */
  order: number[]
  /** исходный индекс выбранного варианта */
  picked: number | null
}

export interface Session {
  id: string
  courseId: string
  mode: Mode
  startedAt: string
  finishedAt?: string
  items: SessionItem[]
  current: number
  /** только для экзамена */
  timeLimitSec?: number
  /** уровень, выбранный при запуске; нет поля — все уровни */
  level?: Level
  /** модуль, внутри которого запущен тест; нет поля — тест по всему курсу */
  topicId?: string
}

export interface Attempt {
  id: string
  courseId: string
  mode: Mode
  finishedAt: string
  total: number
  correct: number
  durationSec: number
  level?: Level
  topicId?: string
}

export type CourseProgress = Record<string, QuestionProgress>

/** Сброс прогресса или удаление курса: всё, что сделано по курсу до at, стёрто. */
export interface Clear {
  at: string
  deleted: boolean
}

export interface Progress {
  /** courseId → questionId → прогресс */
  questions: Record<string, CourseProgress>
  attempts: Attempt[]
  session: Session | null
  lastResult: Session | null
  /** courseId → последний сброс; нужно, чтобы стирание дошло до других устройств */
  cleared: Record<string, Clear>
}

export interface Snapshot {
  courses: Course[]
  progress: Progress
}

export function emptyProgress(): Progress {
  return { questions: {}, attempts: [], session: null, lastResult: null, cleared: {} }
}

export function emptySnapshot(): Snapshot {
  return { courses: [], progress: emptyProgress() }
}

export const MODE_TITLES: Record<Mode, string> = {
  practice: 'Тренировка',
  mistakes: 'Работа над ошибками',
  review: 'Повторение',
  exam: 'Экзамен',
}
