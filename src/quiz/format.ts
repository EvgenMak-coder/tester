import { LEVELS, type CourseFile, type Level, type Question, type Topic } from './types'

export type ParseResult = { ok: true; course: CourseFile } | { ok: false; errors: string[] }

export const FORMAT = 'tester-course'
export const VERSION = 1
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 8

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const MAX_ERRORS = 20

type Report = (path: string, message: string) => void

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isText(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

function readId(v: unknown, path: string, report: Report): string | null {
  if (!isText(v)) {
    report(path, 'нужен непустой id')
    return null
  }
  if (!ID.test(v)) {
    report(path, `id «${v}» может состоять только из латинских букв, цифр, «-» и «_»`)
    return null
  }
  return v
}

function readOptionalText(raw: Record<string, unknown>, key: string, path: string, report: Report): string | undefined {
  const v = raw[key]
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') {
    report(`${path}.${key}`, 'должна быть строка')
    return undefined
  }
  return v.trim() === '' ? undefined : v
}

function readQuestion(raw: unknown, path: string, report: Report, seen: Set<string>): Question | null {
  if (!isObject(raw)) {
    report(path, 'вопрос должен быть объектом')
    return null
  }
  const id = readId(raw.id, `${path}.id`, report)
  if (id) {
    if (seen.has(id)) report(`${path}.id`, `id «${id}» уже встречался в этом курсе`)
    seen.add(id)
  }
  if (raw.type !== 'single') {
    report(`${path}.type`, typeof raw.type === 'string' ? `тип «${raw.type}» пока не поддерживается, нужен "single"` : 'нужен тип "single"')
    return null
  }
  if (!isText(raw.text)) report(`${path}.text`, 'нужен текст вопроса')

  const options = raw.options
  let optionsOk = false
  if (!Array.isArray(options) || options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
    report(`${path}.options`, `нужно от ${MIN_OPTIONS} до ${MAX_OPTIONS} вариантов ответа`)
  } else if (!options.every(isText)) {
    report(`${path}.options`, 'каждый вариант — непустая строка')
  } else if (new Set(options.map((o) => o.trim())).size !== options.length) {
    report(`${path}.options`, 'варианты ответа повторяются')
  } else {
    optionsOk = true
  }

  const answer = raw.answer
  if (typeof answer !== 'number' || !Number.isInteger(answer)) {
    report(`${path}.answer`, 'нужен номер верного варианта (счёт с нуля)')
  } else if (optionsOk && (answer < 0 || answer >= (options as unknown[]).length)) {
    report(`${path}.answer`, `индекс ${answer} вне диапазона: вариантов ${(options as unknown[]).length}, счёт с нуля`)
  }

  if (raw.shuffle !== undefined && typeof raw.shuffle !== 'boolean') report(`${path}.shuffle`, 'должно быть true или false')
  const level = raw.level
  if (level !== undefined && !LEVELS.includes(level as Level)) report(`${path}.level`, `уровень должен быть одним из: ${LEVELS.join(', ')}`)
  const code = readOptionalText(raw, 'code', path, report)
  const explanation = readOptionalText(raw, 'explanation', path, report)

  const question: Question = {
    id: id ?? '',
    type: 'single',
    text: raw.text as string,
    options: options as string[],
    answer: answer as number,
  }
  if (code !== undefined) question.code = code
  if (explanation !== undefined) question.explanation = explanation
  if (raw.shuffle === false) question.shuffle = false
  // базовый уровень — значение по умолчанию, отдельно его не храним
  if (level !== undefined && level !== 'basic') question.level = level as Level
  return question
}

function readTopic(raw: unknown, path: string, report: Report, topicIds: Set<string>, questionIds: Set<string>): Topic | null {
  if (!isObject(raw)) {
    report(path, 'тема должна быть объектом')
    return null
  }
  const id = readId(raw.id, `${path}.id`, report)
  if (id) {
    if (topicIds.has(id)) report(`${path}.id`, `id темы «${id}» повторяется`)
    topicIds.add(id)
  }
  if (!isText(raw.title)) report(`${path}.title`, 'нужно название темы')
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    report(`${path}.questions`, 'в теме должен быть хотя бы один вопрос')
    return null
  }
  const questions: Question[] = []
  raw.questions.forEach((q, i) => {
    const question = readQuestion(q, `${path}.questions[${i}]`, report, questionIds)
    if (question) questions.push(question)
  })
  const topic: Topic = { id: id ?? '', title: raw.title as string, questions }
  const description = readOptionalText(raw, 'description', path, report)
  if (description !== undefined) topic.description = description
  const icon = readOptionalText(raw, 'icon', path, report)
  if (icon !== undefined) topic.icon = icon
  return topic
}

/** Проверяет разобранный JSON курса. Ошибки называют путь до поля. */
export function parseCourse(raw: unknown): ParseResult {
  const errors: string[] = []
  const report: Report = (path, message) => errors.push(`${path}: ${message}`)

  if (!isObject(raw)) return { ok: false, errors: ['Файл должен содержать JSON-объект курса'] }
  if (raw.format !== FORMAT) report('format', `ожидается "${FORMAT}"`)
  if (raw.version !== VERSION) report('version', `поддерживается только версия ${VERSION}`)

  const meta = raw.course
  let id: string | null = null
  if (!isObject(meta)) {
    report('course', 'нужен объект с id и title')
  } else {
    id = readId(meta.id, 'course.id', report)
    if (!isText(meta.title)) report('course.title', 'нужно название курса')
  }

  const topics: Topic[] = []
  if (!Array.isArray(raw.topics) || raw.topics.length === 0) {
    report('topics', 'в курсе должна быть хотя бы одна тема')
  } else {
    const topicIds = new Set<string>()
    const questionIds = new Set<string>()
    raw.topics.forEach((t, i) => {
      const topic = readTopic(t, `topics[${i}]`, report, topicIds, questionIds)
      if (topic) topics.push(topic)
    })
  }

  if (errors.length > 0) {
    const shown = errors.slice(0, MAX_ERRORS)
    if (errors.length > MAX_ERRORS) shown.push(`…и ещё ошибок: ${errors.length - MAX_ERRORS}`)
    return { ok: false, errors: shown }
  }

  const info = meta as Record<string, unknown>
  const course: CourseFile = { id: id as string, title: (info.title as string).trim(), topics }
  if (isText(info.description)) course.description = info.description.trim()
  return { ok: true, course }
}

/** Разбирает текст файла. Терпит BOM и обёртку ```json из чата. */
export function parseCourseText(text: string): ParseResult {
  const cleaned = text
    .replace(/^﻿/, '')
    .trim()
    .replace(/^```[a-zA-Z]*\s*\n/, '')
    .replace(/\n```$/, '')
  if (cleaned === '') return { ok: false, errors: ['Файл пуст'] }
  let raw: unknown
  try {
    raw = JSON.parse(cleaned)
  } catch (e) {
    return { ok: false, errors: [`Это не JSON: ${e instanceof Error ? e.message : String(e)}`] }
  }
  return parseCourse(raw)
}

export interface CourseDiff {
  added: number
  changed: number
  removed: number
  same: number
}

/** Что изменится в вопросах при замене курса. Прогресс сохраняется у всех, кроме удалённых. */
export function diffCourse(prev: CourseFile, next: CourseFile): CourseDiff {
  const before = new Map(prev.topics.flatMap((t) => t.questions).map((q) => [q.id, JSON.stringify(q)]))
  const diff: CourseDiff = { added: 0, changed: 0, removed: 0, same: 0 }
  for (const q of next.topics.flatMap((t) => t.questions)) {
    const old = before.get(q.id)
    if (old === undefined) diff.added++
    else if (old === JSON.stringify(q)) diff.same++
    else diff.changed++
    before.delete(q.id)
  }
  diff.removed = before.size
  return diff
}

export function countQuestions(course: CourseFile): number {
  return course.topics.reduce((n, t) => n + t.questions.length, 0)
}
