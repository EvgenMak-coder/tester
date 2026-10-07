import type { Day, QuestionProgress } from './types'

/** Интервалы коробок Лейтнера в днях: коробка 1 → завтра, коробка 5 → через 35 дней. */
export const INTERVALS = [1, 3, 7, 16, 35]

export function toDay(date: Date): Day {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(day: Day, n: number): Day {
  const [y, m, d] = day.split('-').map(Number)
  return toDay(new Date(y, m - 1, d + n))
}

export function isDue(p: QuestionProgress, today: Day): boolean {
  return p.due <= today
}

/**
 * Прогресс вопроса после ответа.
 * Неверный ответ всегда возвращает вопрос в первую коробку.
 * Верный продвигает коробку, только если вопрос новый или его срок подошёл:
 * иначе несколько тренировок за день отодвинули бы повторение на месяц.
 */
export function review(prev: QuestionProgress | undefined, correct: boolean, today: Day): QuestionProgress {
  const base = prev ?? { seen: 0, correct: 0, wrong: 0, lastCorrect: false, box: 0, due: today }
  const counted = {
    ...base,
    seen: base.seen + 1,
    correct: base.correct + (correct ? 1 : 0),
    wrong: base.wrong + (correct ? 0 : 1),
    lastCorrect: correct,
  }
  if (!correct) return { ...counted, box: 1, due: addDays(today, INTERVALS[0]) }
  if (prev && !isDue(prev, today)) return counted
  const box = Math.min(base.box + 1, INTERVALS.length)
  return { ...counted, box, due: addDays(today, INTERVALS[box - 1]) }
}
