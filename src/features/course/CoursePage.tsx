import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { testsPath } from '../../app/paths'
import { MISTAKES, MODULES, plural, QUESTIONS, wordFor } from '../../app/text'
import { hueClass, ModuleIcon } from '../../components/ModuleIcon'
import { Meter, Page, Stat } from '../../components/ui'
import { act, useData } from '../../data/hooks'
import { REVIEW_NEW_LIMIT } from '../../quiz/session'
import { toDay } from '../../quiz/srs'
import { courseStats, percent } from '../../quiz/stats'
import { LEVEL_TITLES, LEVELS } from '../../quiz/types'
import { startSession } from '../run/start'

/** Курс: модули лежат папками, тесты и уровни — внутри каждого модуля. */
export function CoursePage() {
  const { id } = useParams()
  const snapshot = useData()
  const navigate = useNavigate()

  const course = snapshot.courses.find((c) => c.id === id)
  if (!course) return <Navigate to="/" replace />

  const progress = snapshot.progress.questions[course.id] ?? {}
  const today = toDay(new Date())
  const stats = courseStats(course, progress, today)
  const byLevel = LEVELS.map((level) => ({ level, topics: courseStats(course, progress, today, level).topics }))
  const fresh = Math.min(stats.all.total - stats.all.seen, REVIEW_NEW_LIMIT)

  const review = async () => {
    if (await startSession(snapshot, course, 'review')) navigate('/run')
  }

  const resetProgress = () => {
    if (window.confirm(`Стереть прогресс и историю попыток по курсу «${course.title}»? Вопросы останутся.`)) void act((store) => store.resetProgress(course.id, new Date().toISOString()))
  }

  const remove = async () => {
    if (!window.confirm(`Удалить курс «${course.title}» вместе с прогрессом?`)) return
    await act((store) => store.deleteCourse(course.id, new Date().toISOString()))
    navigate('/', { replace: true })
  }

  return (
    <Page title={course.title} back={{ to: '/', label: 'Курсы' }} lead={course.description}>
      <div className="stats">
        <Stat value={stats.all.total} label={wordFor(stats.all.total, QUESTIONS)} />
        <Stat value={`${stats.all.seen} из ${stats.all.total}`} label="пройдено" />
        <Stat value={percent(stats.all.accuracy)} label="верных ответов" />
        <Stat value={stats.all.due} label="к повторению" />
        <Stat value={stats.all.mistakes} label={wordFor(stats.all.mistakes, MISTAKES)} />
      </div>

      <div className="banner whole">
        <div className="whole-about">
          <ModuleIcon name="layers" />
          <div>
            <b>Весь курс</b>
            <p className="small">{stats.all.due + fresh > 0 ? `Сегодня: ${stats.all.due} к повторению · ${fresh} новых` : 'На сегодня всё повторено'}</p>
          </div>
        </div>
        <div className="row">
          <button type="button" className="btn primary" disabled={stats.all.due + fresh === 0} onClick={() => void review()}>
            Повторение
          </button>
          <Link className="btn" to={testsPath(course.id)}>
            Тесты по всему курсу
          </Link>
        </div>
      </div>

      <div className="row between">
        <h2>Модули</h2>
        <span className="muted small">{plural(course.topics.length, MODULES)}</span>
      </div>
      <div className="folders">
        {course.topics.map((topic, i) => {
          const all = stats.topics[i]
          return (
            <Link className={`folder ${hueClass(i)}`} to={testsPath(course.id, topic.id)} key={topic.id}>
              <div className="folder-head">
                <ModuleIcon name={topic.icon} />
                <div>
                  <h3>{topic.title}</h3>
                  <span className="muted small">
                    {plural(all.total, QUESTIONS)}
                    {all.accuracy !== null && ` · верных ${percent(all.accuracy)}`}
                  </span>
                </div>
              </div>
              {topic.description && <p className="muted small">{topic.description}</p>}
              <div className="level-rows">
                {byLevel.map(({ level, topics }) => {
                  const s = topics[i]
                  if (s.total === 0) return null
                  return (
                    <div className="level-row" key={level}>
                      <span>{LEVEL_TITLES[level]}</span>
                      <Meter share={s.seen / s.total} label={`${topic.title}, ${LEVEL_TITLES[level]}: пройдено`} />
                      <span className="muted">
                        {s.seen}/{s.total}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="row folder-foot">
                {all.seen === 0 && <span className="muted small">Ещё не начат</span>}
                {all.due > 0 && <span className="badge accent">Повторить: {all.due}</span>}
                {all.mistakes > 0 && <span className="badge bad">Ошибки: {all.mistakes}</span>}
                {all.seen > 0 && all.due === 0 && all.mistakes === 0 && <span className="muted small">Всё повторено, ошибок нет</span>}
              </div>
            </Link>
          )
        })}
      </div>

      <div className="row">
        <Link className="btn quiet" to="/import">
          Обновить из файла
        </Link>
        <button type="button" className="btn quiet" onClick={resetProgress}>
          Сбросить прогресс
        </button>
        <button type="button" className="btn quiet danger" onClick={() => void remove()}>
          Удалить курс
        </button>
      </div>
    </Page>
  )
}
