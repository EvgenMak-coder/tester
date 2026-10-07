import { parseCourse, parseCourseText, type ParseResult } from '../../quiz/format'
import { LEVELS, type Course, type CourseFile, type Level } from '../../quiz/types'

// каждый файл из courses/ собирается отдельным куском и грузится, только когда каталог открыт
const files = import.meta.glob<string>(['../../../courses/*.json', '../../../courses/*/*.json', '../../../courses/*/theory/*.md'], { query: '?raw', import: 'default' })

export interface CatalogEntry {
  /** файл курса или его папка, для сообщений об ошибках */
  source: string
  result: ParseResult
}

/**
 * Собирает курсы из текстов файлов. Курс — это либо один файл courses/имя.json,
 * либо папка: шапка course.json и по файлу на модуль, модули идут в порядке имён файлов.
 * Тексты теории лежат рядом, в theory/имя-модуля.уровень.md, и подставляются в свой модуль.
 */
export function assembleCatalog(texts: Record<string, string>): CatalogEntry[] {
  const entries: CatalogEntry[] = []
  const folders = new Map<string, { header?: string; topics: [string, string][]; lessons: [string, string][] }>()

  for (const path of Object.keys(texts).sort()) {
    const [, lessonFolder, lessonName] = /courses\/([^/]+)\/theory\/([^/]+)\.md$/.exec(path) ?? []
    if (lessonFolder) {
      const parts = folders.get(lessonFolder) ?? { topics: [], lessons: [] }
      parts.lessons.push([lessonName, texts[path]])
      folders.set(lessonFolder, parts)
      continue
    }
    const [, folder, name] = /courses\/(?:([^/]+)\/)?([^/]+)\.json$/.exec(path) ?? []
    if (!name) continue
    if (!folder) {
      entries.push({ source: `${name}.json`, result: parseCourseText(texts[path]) })
      continue
    }
    const parts = folders.get(folder) ?? { topics: [], lessons: [] }
    if (name === 'course') parts.header = texts[path]
    else parts.topics.push([`${folder}/${name}.json`, texts[path]])
    folders.set(folder, parts)
  }

  for (const [folder, parts] of folders) {
    const errors: string[] = []
    const read = (source: string, text: string): unknown => {
      try {
        return JSON.parse(text)
      } catch (e) {
        errors.push(`${source}: это не JSON: ${e instanceof Error ? e.message : String(e)}`)
        return null
      }
    }
    const header = parts.header === undefined ? (errors.push(`${folder}: нет файла course.json`), null) : read(`${folder}/course.json`, parts.header)
    const topics = parts.topics.map(([source, text]) => read(source, text))
    for (const [name, text] of parts.lessons) {
      const dot = name.lastIndexOf('.')
      const level = name.slice(dot + 1) as Level
      const index = parts.topics.findIndex(([source]) => source === `${folder}/${name.slice(0, dot)}.json`)
      const topic = topics[index] as { theory?: Record<string, object> } | null | undefined
      if (dot < 0 || !LEVELS.includes(level) || index < 0) errors.push(`${folder}/theory/${name}.md: имя файла должно быть вида имя-модуля.уровень.md`)
      else if (topic) topic.theory = { ...topic.theory, [level]: { ...topic.theory?.[level], text } }
    }
    const result: ParseResult = errors.length > 0 ? { ok: false, errors } : parseCourse({ ...(header as object), topics })
    entries.push({ source: folder, result })
  }
  return entries
}

/** Курсы, которые поставляются вместе с приложением. Курс с ошибками в каталог не попадает. */
export async function loadCatalog(): Promise<CourseFile[]> {
  const paths = Object.keys(files)
  const texts = await Promise.all(paths.map((path) => files[path]()))
  const entries = assembleCatalog(Object.fromEntries(paths.map((path, i) => [path, texts[i]])))
  return entries.flatMap(({ result }) => (result.ok ? [result.course] : []))
}

/** Отличается ли добавленный курс от версии в каталоге. */
export function isOutdated(installed: Course, fresh: CourseFile): boolean {
  return JSON.stringify({ ...installed, importedAt: undefined }) !== JSON.stringify(fresh)
}
