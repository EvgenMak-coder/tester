import { Link } from 'react-router-dom'
import { plural, QUESTIONS, MODULES } from '../../app/text'
import { Meter, Page } from '../../components/ui'
import { useData } from '../../data/hooks'
import { toDay } from '../../quiz/srs'
import { courseStats, percent } from '../../quiz/stats'
import { MODE_TITLES } from '../../quiz/types'
import { Catalog } from '../import/Catalog'

export function HomePage() {
  const { courses, progress } = useData()
  const today = toDay(new Date())
  const cards = courses.map((course) => ({ course, stats: courseStats(course, progress.questions[course.id] ?? {}, today).all }))
  const due = cards.reduce((n, c) => n + c.stats.due, 0)

  const session = progress.session
  const sessionCourse = session ? courses.find((c) => c.id === session.courseId) : undefined

  if (courses.length === 0) {
    return (
      <Page title="Курсы">
        <div className="card empty">
          <h2>Курсов пока нет</h2>
          <p className="muted">Добавь курс из каталога ниже или импортируй свой JSON-файл.</p>
          <Link className="btn" to="/import">
            Импортировать файл
          </Link>
        </div>
        <Catalog />
      </Page>
    )
  }

  return (
    <Page title="Курсы" lead={due > 0 ? `К повторению сегодня: ${plural(due, QUESTIONS)}` : 'На сегодня всё повторено'}>
      {session && sessionCourse && (
        <div className="banner">
          <div>
            <b>Незавершённый тест</b>
            <p className="small">
              {sessionCourse.title} · {MODE_TITLES[session.mode]} · вопрос {session.current + 1} из {session.items.length}
            </p>
          </div>
          <Link className="btn primary" to="/run">
            Продолжить
          </Link>
        </div>
      )}

      <div className="grid">
        {cards.map(({ course, stats }) => (
          <Link className="card" to={`/course/${course.id}`} key={course.id}>
            <div>
              <h2>{course.title}</h2>
              {course.description && <p className="muted small">{course.description}</p>}
            </div>
            <p className="muted small">
              {plural(stats.total, QUESTIONS)} · {plural(course.topics.length, MODULES)}
            </p>
            <Meter share={stats.total > 0 ? stats.seen / stats.total : 0} label="Пройдено вопросов" />
            <div className="row">
              <span className="badge">
                Пройдено {stats.seen} из {stats.total}
              </span>
              {stats.accuracy !== null && <span className="badge">Верных {percent(stats.accuracy)}</span>}
              {stats.due > 0 && <span className="badge accent">Повторить: {stats.due}</span>}
              {stats.mistakes > 0 && <span className="badge bad">Ошибки: {stats.mistakes}</span>}
            </div>
          </Link>
        ))}
      </div>

      <Catalog pendingOnly />

      <div className="row">
        <Link className="btn" to="/import">
          Импортировать курс
        </Link>
      </div>
    </Page>
  )
}
