import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { dateTime, duration, MISTAKES, plural, QUESTIONS, TOPICS, wordFor } from '../../app/text'
import { Meter, Page, Segmented, Stat } from '../../components/ui'
import { act, useData } from '../../data/hooks'
import { REVIEW_NEW_LIMIT } from '../../quiz/session'
import { toDay } from '../../quiz/srs'
import { courseStats, levelCounts, percent } from '../../quiz/stats'
import { LEVEL_TITLES, LEVELS, MODE_TITLES, type Level, type Mode } from '../../quiz/types'
import { startSession, type StartOptions } from '../run/start'

const PRACTICE_COUNTS = [10, 20, 50]
const ALL = 0

type LevelFilter = Level | 'all'

// выбранный уровень запоминается по курсу: после теста страница открывается на той же вкладке
const levelKey = (courseId: string) => `tester:level:${courseId}`

function savedLevel(courseId: string | undefined): LevelFilter {
  const saved = courseId ? localStorage.getItem(levelKey(courseId)) : null
  return LEVELS.includes(saved as Level) ? (saved as Level) : 'all'
}

export function CoursePage() {
  const { id } = useParams()
  const snapshot = useData()
  const navigate = useNavigate()
  // храним исключённые темы, а не выбранные: новые темы после обновления курса сразу участвуют
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())
  const [practiceCount, setPracticeCount] = useState(PRACTICE_COUNTS[0])
  const [examCount, setExamCount] = useState(20)
  const [examMinutes, setExamMinutes] = useState<number | null>(null)
  const [level, setLevel] = useState<LevelFilter>(() => savedLevel(id))

  const course = snapshot.courses.find((c) => c.id === id)
  if (!course) return <Navigate to="/" replace />

  const byLevel = levelCounts(course)
  // сохранённый уровень мог опустеть после обновления курса
  const active = level !== 'all' && byLevel[level] === 0 ? 'all' : level
  const only = active === 'all' ? undefined : active
  const stats = courseStats(course, snapshot.progress.questions[course.id] ?? {}, toDay(new Date()), only)
  const topics = stats.topics.filter((t) => t.total > 0)
  const chosen = topics.filter((t) => !excluded.has(t.topicId))
  const topicIds = chosen.map((t) => t.topicId)
  const pool = chosen.reduce((n, t) => n + t.total, 0)
  const due = chosen.reduce((n, t) => n + t.due, 0)
  const mistakes = chosen.reduce((n, t) => n + t.mistakes, 0)
  const fresh = Math.min(chosen.reduce((n, t) => n + t.total - t.seen, 0), REVIEW_NEW_LIMIT)
  const attempts = snapshot.progress.attempts.filter((a) => a.courseId === course.id).slice(-10).reverse()

  const examQuestions = Math.min(Math.max(examCount, 1), Math.max(pool, 1))
  const minutes = examMinutes ?? examQuestions

  const start = async (mode: Mode, opts: StartOptions = {}) => {
    if (await startSession(snapshot, course, mode, { topicIds, level: only, ...opts })) navigate('/run')
  }

  const changeLevel = (next: LevelFilter) => {
    if (next === 'all') localStorage.removeItem(levelKey(course.id))
    else localStorage.setItem(levelKey(course.id), next)
    setLevel(next)
  }

  const toggle = (topicId: string) => {
    const next = new Set(excluded)
    if (!next.delete(topicId)) next.add(topicId)
    setExcluded(next)
  }

  const resetProgress = () => {
    if (window.confirm(`Стереть прогресс и историю попыток по курсу «${course.title}»? Вопросы останутся.`)) void act((store) => store.resetProgress(course.id, new Date().toISOString()))
  }

  const remove = async () => {
    if (!window.confirm(`Удалить курс «${course.title}» вместе с прогрессом?`)) return
    await act((store) => store.deleteCourse(course.id, new Date().toISOString()))
    navigate('/', { replace: true })
  }

  const counts = [...PRACTICE_COUNTS.filter((n) => n < pool).map((n) => ({ value: n, label: String(n) })), { value: ALL, label: `Все ${pool}` }]
  const count = counts.some((c) => c.value === practiceCount) ? practiceCount : ALL

  return (
    <Page title={course.title} back={{ to: '/', label: 'Курсы' }} lead={course.description}>
      <div className="tabs" role="group" aria-label="Уровень сложности">
        <button type="button" className="tab" aria-pressed={active === 'all'} onClick={() => changeLevel('all')}>
          Все уровни <span className="tab-count">{course.topics.reduce((n, t) => n + t.questions.length, 0)}</span>
        </button>
        {LEVELS.map((l) => (
          <button key={l} type="button" className="tab" aria-pressed={active === l} disabled={byLevel[l] === 0} onClick={() => changeLevel(l)}>
            {LEVEL_TITLES[l]} <span className="tab-count">{byLevel[l]}</span>
          </button>
        ))}
      </div>

      <div className="stats">
        <Stat value={stats.all.total} label={wordFor(stats.all.total, QUESTIONS)} />
        <Stat value={`${stats.all.seen} из ${stats.all.total}`} label="пройдено" />
        <Stat value={percent(stats.all.accuracy)} label="верных ответов" />
        <Stat value={stats.all.due} label="к повторению" />
        <Stat value={stats.all.mistakes} label={wordFor(stats.all.mistakes, MISTAKES)} />
      </div>

      <div className="row between">
        <h2>Режимы</h2>
        <span className="muted small">{chosen.length === topics.length ? 'Все темы' : `Выбрано: ${plural(chosen.length, TOPICS)} из ${topics.length}`}</span>
      </div>
      <div className="modes">
        <div className="card mode">
          <h2>{MODE_TITLES.review}</h2>
          <p className="muted small">Вопросы, срок которых подошёл, и немного новых. Интервалы растут с каждым верным ответом.</p>
          <p className="small">{due + fresh > 0 ? `${due} к повторению · ${fresh} новых` : 'На сегодня всё повторено'}</p>
          <button type="button" className="btn primary" disabled={due + fresh === 0} onClick={() => void start('review')}>
            Начать повторение
          </button>
        </div>

        <div className="card mode">
          <h2>{MODE_TITLES.practice}</h2>
          <p className="muted small">Случайные вопросы. Верный ответ и пояснение — сразу после каждого.</p>
          <Segmented label="Сколько вопросов" value={count} onChange={setPracticeCount} options={counts} />
          <button type="button" className="btn primary" disabled={pool === 0} onClick={() => void start('practice', { count: count === ALL ? undefined : count })}>
            Начать тренировку
          </button>
        </div>

        <div className="card mode">
          <h2>{MODE_TITLES.mistakes}</h2>
          <p className="muted small">Только вопросы, на которые последний ответ был неверным.</p>
          <p className="small">{mistakes > 0 ? plural(mistakes, QUESTIONS) : 'Ошибок нет'}</p>
          <button type="button" className="btn primary" disabled={mistakes === 0} onClick={() => void start('mistakes')}>
            Разобрать ошибки
          </button>
        </div>

        <div className="card mode">
          <h2>{MODE_TITLES.exam}</h2>
          <p className="muted small">На время. Ответы можно менять, результат и разбор — в конце.</p>
          <div className="row">
            <label className="field">
              Вопросов
              <input type="number" min={1} max={Math.max(pool, 1)} value={examQuestions} onChange={(e) => setExamCount(Number(e.target.value) || 1)} />
            </label>
            <label className="field">
              Минут
              <input type="number" min={1} max={600} value={minutes} onChange={(e) => setExamMinutes(Math.max(Number(e.target.value) || 1, 1))} />
            </label>
          </div>
          <button type="button" className="btn primary" disabled={pool === 0} onClick={() => void start('exam', { count: examQuestions, timeLimitSec: minutes * 60 })}>
            Начать экзамен
          </button>
        </div>
      </div>

      <div className="row between">
        <h2>Темы</h2>
        <button type="button" className="btn quiet" onClick={() => setExcluded(excluded.size === 0 ? new Set(topics.map((t) => t.topicId)) : new Set())}>
          {excluded.size === 0 ? 'Снять все' : 'Выбрать все'}
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Тема</th>
              <th className="num">Вопросов</th>
              <th>Пройдено</th>
              <th className="num">Верных</th>
              <th className="num">Повторить</th>
              <th className="num">Ошибки</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t) => (
              <tr key={t.topicId}>
                <td className="wide">
                  <label className="check">
                    <input type="checkbox" checked={!excluded.has(t.topicId)} onChange={() => toggle(t.topicId)} />
                    {t.title}
                  </label>
                </td>
                <td className="num">{t.total}</td>
                <td>
                  <div className="coverage">
                    <Meter share={t.seen / t.total} label={`Пройдено по теме «${t.title}»`} />
                    <span className="muted small">
                      {t.seen}/{t.total}
                    </span>
                  </div>
                </td>
                <td className="num">{percent(t.accuracy)}</td>
                <td className="num">{t.due || '—'}</td>
                <td className="num">{t.mistakes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {attempts.length > 0 && (
        <>
          <h2>Последние попытки</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Когда</th>
                  <th>Режим</th>
                  <th className="num">Результат</th>
                  <th className="num">Верных</th>
                  <th className="num">Время</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id}>
                    <td>{dateTime(a.finishedAt)}</td>
                    <td className="wide">
                      {MODE_TITLES[a.mode]}
                      {a.level && ` · ${LEVEL_TITLES[a.level]}`}
                    </td>
                    <td className="num">
                      {a.correct} из {a.total}
                    </td>
                    <td className="num">{percent(a.total > 0 ? a.correct / a.total : null)}</td>
                    <td className="num">{duration(a.durationSec)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

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
