import { isDue } from './srs'
import { levelOf, type CourseFile, type CourseProgress, type Day, type Level, type Question } from './types'

export interface Stats {
  /** вопросов всего */
  total: number
  /** вопросов, которые уже встречались */
  seen: number
  /** ответов дано / из них верных */
  answers: number
  correct: number
  /** доля верных ответов, null — пока не отвечал */
  accuracy: number | null
  /** встречавшиеся вопросы, чей срок повторения подошёл */
  due: number
  /** вопросы, на которые последний ответ был неверным */
  mistakes: number
}

export interface TopicStats extends Stats {
  topicId: string
  title: string
  description?: string
}

function collect(questions: Question[], progress: CourseProgress, today: Day): Stats {
  const stats: Stats = { total: questions.length, seen: 0, answers: 0, correct: 0, accuracy: null, due: 0, mistakes: 0 }
  for (const q of questions) {
    const state = progress[q.id]
    if (!state) continue
    stats.seen++
    stats.answers += state.correct + state.wrong
    stats.correct += state.correct
    if (isDue(state, today)) stats.due++
    if (!state.lastCorrect) stats.mistakes++
  }
  if (stats.answers > 0) stats.accuracy = stats.correct / stats.answers
  return stats
}

/** Статистика курса; с level — только по вопросам этого уровня. Темы без таких вопросов остаются с total = 0. */
export function courseStats(course: CourseFile, progress: CourseProgress, today: Day, level?: Level): { all: Stats; topics: TopicStats[] } {
  const of = (questions: Question[]) => (level ? questions.filter((q) => levelOf(q) === level) : questions)
  return {
    all: collect(of(course.topics.flatMap((t) => t.questions)), progress, today),
    topics: course.topics.map((t) => ({ topicId: t.id, title: t.title, description: t.description, ...collect(of(t.questions), progress, today) })),
  }
}

export function levelCounts(course: CourseFile): Record<Level, number> {
  const counts: Record<Level, number> = { basic: 0, intermediate: 0, advanced: 0 }
  for (const topic of course.topics) for (const q of topic.questions) counts[levelOf(q)]++
  return counts
}

export function percent(share: number | null): string {
  return share === null ? '—' : `${Math.round(share * 100)}%`
}
