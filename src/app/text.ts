type Forms = [string, string, string]

/** Форма слова под число: wordFor(21, ['вопрос', 'вопроса', 'вопросов']) → «вопрос». */
export function wordFor(n: number, forms: Forms): string {
  const tens = Math.abs(n) % 100
  const ones = tens % 10
  return tens > 10 && tens < 20 ? forms[2] : ones === 1 ? forms[0] : ones >= 2 && ones <= 4 ? forms[1] : forms[2]
}

/** Число со словом: plural(21, QUESTIONS) → «21 вопрос». */
export function plural(n: number, forms: Forms): string {
  return `${n} ${wordFor(n, forms)}`
}

export const QUESTIONS: Forms = ['вопрос', 'вопроса', 'вопросов']
export const TOPICS: Forms = ['тема', 'темы', 'тем']
export const MISTAKES: Forms = ['ошибка', 'ошибки', 'ошибок']

/** 75 → «1:15». */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** 75 → «1 мин 15 с». */
export function duration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s} с`
  return s === 0 ? `${m} мин` : `${m} мин ${s} с`
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
