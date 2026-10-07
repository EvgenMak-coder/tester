import { parseCourseText } from '../../quiz/format'
import type { Course, CourseFile } from '../../quiz/types'

// каждый файл из courses/ собирается отдельным куском и грузится, только когда каталог открыт
const files = import.meta.glob<string>('../../../courses/*.json', { query: '?raw', import: 'default' })

/** Курсы, которые поставляются вместе с приложением. Файл с ошибками в каталог не попадает. */
export async function loadCatalog(): Promise<CourseFile[]> {
  const texts = await Promise.all(Object.values(files).map((load) => load()))
  return texts.map(parseCourseText).flatMap((result) => (result.ok ? [result.course] : []))
}

/** Отличается ли добавленный курс от версии в каталоге. */
export function isOutdated(installed: Course, fresh: CourseFile): boolean {
  return JSON.stringify({ ...installed, importedAt: undefined }) !== JSON.stringify(fresh)
}
