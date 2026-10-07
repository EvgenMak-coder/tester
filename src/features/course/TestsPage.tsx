import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { coursePath, theoryPath } from '../../app/paths'
import { dateTime, duration, MISTAKES, plural, QUESTIONS, wordFor } from '../../app/text'
import { hueClass, ModuleIcon } from '../../components/ModuleIcon'
import { Page, Segmented, Stat } from '../../components/ui'
import { useData } from '../../data/hooks'
import { REVIEW_NEW_LIMIT } from '../../quiz/session'
import { toDay } from '../../quiz/srs'
import { courseStats, levelCounts, percent } from '../../quiz/stats'
import { LEVEL_TITLES, LEVELS, MODE_TITLES, type Level, type Mode } from '../../quiz/types'
import { startSession, type StartOptions } from '../run/start'

const PRACTICE_COUNTS = [10, 20, 50]
const ALL = 0

type LevelFilter = Level | 'all'

// выбранный уровень запоминается по модулю: после теста страница открывается на той же вкладке
const levelKey = (courseId: string, topicId: string | undefined) => `tester:level:${courseId}:${topicId ?? '*'}`

function savedLevel(courseId: string | undefined, topicId: string | undefined): LevelFilter {
  const saved = courseId ? localStorage.getItem(levelKey(courseId, topicId)) : null
  return LEVELS.includes(saved as Level) ? (saved as Level) : 'all'
}

/** Тесты одного модуля или, если модуль в адресе не указан, всего курса: уровни, режимы, история. */
export function TestsPage() {
  const { id, topicId } = useParams()
  const snapshot = useData()
  const navigate = useNavigate()
  const [practiceCount, setPracticeCount] = useState(PRACTICE_COUNTS[0])
  const [examCount, setExamCount] = useState(20)
  const [examMinutes, setExamMinutes] = useState<number | null>(null)
  const [level, setLevel] = useState<LevelFilter>(() => savedLevel(id, topicId))

  const course = snapshot.courses.find((c) => c.id === id)
  if (!course) return <Navigate to="/" replace />
  const topicIndex = topicId ? course.topics.findIndex((t) => t.id === topicId) : -1
  const topic = topicIndex >= 0 ? course.topics[topicIndex] : undefined
  // модуль исчез из курса после обновления
  if (topicId && !topic) return <Navigate to={coursePath(course.id)} replace />

  const byLevel = levelCounts(course, topic?.id)
  const total = LEVELS.reduce((n, l) => n + byLevel[l], 0)
  // сохранённый уровень мог опустеть после обновления курса
  const active = level !== 'all' && byLevel[level] === 0 ? 'all' : level
  const only = active === 'all' ? undefined : active
  const stats = courseStats(course, snapshot.progress.questions[course.id] ?? {}, toDay(new Date()), only)
  const scope = topic ? stats.topics[topicIndex] : stats.all
  const fresh = Math.min(scope.total - scope.seen, REVIEW_NEW_LIMIT)
  const attempts = snapshot.progress.attempts
    .filter((a) => a.courseId === course.id && (!topic || a.topicId === topic.id))
    .slice(-10)
    .reverse()

  const examQuestions = Math.min(Math.max(examCount, 1), Math.max(scope.total, 1))
  const minutes = examMinutes ?? examQuestions

  const start = async (mode: Mode, opts: StartOptions = {}) => {
    if (await startSession(snapshot, course, mode, { topicIds: topic && [topic.id], level: only, ...opts })) navigate('/run')
  }

  const changeLevel = (next: LevelFilter) => {
    if (next === 'all') localStorage.removeItem(levelKey(course.id, topic?.id))
    else localStorage.setItem(levelKey(course.id, topic?.id), next)
    setLevel(next)
  }

  const lessons = LEVELS.filter((l) => (active === 'all' || active === l) && topic?.theory?.[l]).map((l) => ({ level: l, lesson: topic!.theory![l]! }))

  const counts = [...PRACTICE_COUNTS.filter((n) => n < scope.total).map((n) => ({ value: n, label: String(n) })), { value: ALL, label: `Все ${scope.total}` }]
  const count = counts.some((c) => c.value === practiceCount) ? practiceCount : ALL

  return (
    <Page
      title={topic ? topic.title : 'Весь курс'}
      back={{ to: coursePath(course.id), label: course.title }}
      lead={topic ? topic.description : 'Вопросы из всех модулей курса сразу'}
      icon={
        <span className={topic ? hueClass(topicIndex) : undefined}>
          <ModuleIcon name={topic ? topic.icon : 'layers'} size={26} />
        </span>
      }
    >
      <div className="tabs" role="group" aria-label="Уровень сложности">
        <button type="button" className="tab" aria-pressed={active === 'all'} onClick={() => changeLevel('all')}>
          Все уровни <span className="tab-count">{total}</span>
        </button>
        {LEVELS.map((l) => (
          <button key={l} type="button" className="tab" aria-pressed={active === l} disabled={byLevel[l] === 0} onClick={() => changeLevel(l)}>
            {LEVEL_TITLES[l]} <span className="tab-count">{byLevel[l]}</span>
          </button>
        ))}
      </div>

      <div className="stats">
        <Stat value={scope.total} label={wordFor(scope.total, QUESTIONS)} />
        <Stat value={`${scope.seen} из ${scope.total}`} label="пройдено" />
        <Stat value={percent(scope.accuracy)} label="верных ответов" />
        <Stat value={scope.due} label="к повторению" />
        <Stat value={scope.mistakes} label={wordFor(scope.mistakes, MISTAKES)} />
      </div>

      {lessons.length > 0 && (
        <>
          <h2>Теория</h2>
          <div className="lessons">
            {lessons.map(({ level: l, lesson }) => (
              <div className="card lesson" key={l}>
                <div className="row between">
                  <span className="badge accent">{LEVEL_TITLES[l]}</span>
                  {!lesson.text && <span className="badge">готовится</span>}
                </div>
                {lesson.plan && <ul className="plan">{lesson.plan.map((point) => <li key={point}>{point}</li>)}</ul>}
                {lesson.text && (
                  <Link className="btn" to={theoryPath(course.id, topic!.id, l)}>
                    Читать
                  </Link>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Тесты</h2>
      <div className="modes">
        <div className="card mode">
          <h2>{MODE_TITLES.practice}</h2>
          <p className="muted small">Случайные вопросы. Верный ответ и пояснение — сразу после каждого.</p>
          <Segmented label="Сколько вопросов" value={count} onChange={setPracticeCount} options={counts} />
          <button type="button" className="btn primary" disabled={scope.total === 0} onClick={() => void start('practice', { count: count === ALL ? undefined : count })}>
            Начать тренировку
          </button>
        </div>

        <div className="card mode">
          <h2>{MODE_TITLES.review}</h2>
          <p className="muted small">Вопросы, срок которых подошёл, и немного новых. Интервалы растут с каждым верным ответом.</p>
          <p className="small">{scope.due + fresh > 0 ? `${scope.due} к повторению · ${fresh} новых` : 'На сегодня всё повторено'}</p>
          <button type="button" className="btn primary" disabled={scope.due + fresh === 0} onClick={() => void start('review')}>
            Начать повторение
          </button>
        </div>

        <div className="card mode">
          <h2>{MODE_TITLES.mistakes}</h2>
          <p className="muted small">Только вопросы, на которые последний ответ был неверным.</p>
          <p className="small">{scope.mistakes > 0 ? plural(scope.mistakes, QUESTIONS) : 'Ошибок нет'}</p>
          <button type="button" className="btn primary" disabled={scope.mistakes === 0} onClick={() => void start('mistakes')}>
            Разобрать ошибки
          </button>
        </div>

        <div className="card mode">
          <h2>{MODE_TITLES.exam}</h2>
          <p className="muted small">На время. Ответы можно менять, результат и разбор — в конце.</p>
          <div className="row">
            <label className="field">
              Вопросов
              <input type="number" min={1} max={Math.max(scope.total, 1)} value={examQuestions} onChange={(e) => setExamCount(Number(e.target.value) || 1)} />
            </label>
            <label className="field">
              Минут
              <input type="number" min={1} max={600} value={minutes} onChange={(e) => setExamMinutes(Math.max(Number(e.target.value) || 1, 1))} />
            </label>
          </div>
          <button type="button" className="btn primary" disabled={scope.total === 0} onClick={() => void start('exam', { count: examQuestions, timeLimitSec: minutes * 60 })}>
            Начать экзамен
          </button>
        </div>
      </div>

      {attempts.length > 0 && (
        <>
          <h2>Последние попытки</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Когда</th>
                  <th>Тест</th>
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
                      {!topic && a.topicId && ` · ${course.topics.find((t) => t.id === a.topicId)?.title ?? a.topicId}`}
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
    </Page>
  )
}
