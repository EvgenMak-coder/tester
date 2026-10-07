import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isOutdated, loadCatalog } from './builtin'
import { plural, QUESTIONS } from '../../app/text'
import { importCourse } from '../../data/actions'
import { act, useData } from '../../data/hooks'
import { countQuestions, diffCourse } from '../../quiz/format'
import type { CourseFile } from '../../quiz/types'

/**
 * Курсы, встроенные в приложение: добавить или обновить одной кнопкой.
 * pendingOnly — показывать только то, что требует действия; если такого нет, блок не рисуется.
 */
export function Catalog({ pendingOnly = false }: { pendingOnly?: boolean }) {
  const { courses } = useData()
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState<CourseFile[] | null>(null)

  useEffect(() => {
    let alive = true
    void loadCatalog().then((loaded) => {
      if (alive) setCatalog(loaded)
    })
    return () => {
      alive = false
    }
  }, [])

  const rows = (catalog ?? [])
    .map((course) => {
      const installed = courses.find((c) => c.id === course.id)
      return { course, installed, outdated: installed ? isOutdated(installed, course) : false }
    })
    .filter((row) => !pendingOnly || !row.installed || row.outdated)
  if (rows.length === 0) return null

  const add = async (course: CourseFile, open: boolean) => {
    await act((store) => importCourse(store, course))
    if (open) navigate(`/course/${course.id}`)
  }

  return (
    <div className="stack">
      <h2>{pendingOnly ? 'Из каталога' : 'Каталог'}</h2>
      <div className="list">
        {rows.map(({ course, installed, outdated }) => {
          const diff = installed && outdated ? diffCourse(installed, course) : null
          return (
            <div className="list-row" key={course.id}>
              <div>
                <b>{course.title}</b>
                <p className="muted small">
                  {course.description ? `${course.description} · ` : ''}
                  {plural(countQuestions(course), QUESTIONS)}
                </p>
                {diff && (
                  <p className="small">
                    Есть обновление: новых вопросов — {diff.added}, изменённых — {diff.changed}, удалённых — {diff.removed}. Прогресс сохранится.
                  </p>
                )}
              </div>
              {!installed ? (
                <button type="button" className="btn primary" onClick={() => void add(course, true)}>
                  Добавить
                </button>
              ) : outdated ? (
                <button type="button" className="btn primary" onClick={() => void add(course, false)}>
                  Обновить
                </button>
              ) : (
                <Link className="btn quiet" to={`/course/${course.id}`}>
                  Добавлен ✓
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
