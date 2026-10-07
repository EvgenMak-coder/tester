import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { QuestionView } from './QuestionView'
import { startSession } from './start'
import { coursePath, testsPath } from '../../app/paths'
import { duration } from '../../app/text'
import { Page, Segmented } from '../../components/ui'
import { useData } from '../../data/hooks'
import { questionMap, toAttempt } from '../../quiz/session'
import { toDay } from '../../quiz/srs'
import { courseStats, percent } from '../../quiz/stats'
import { LEVEL_TITLES, MODE_TITLES } from '../../quiz/types'

export function ResultPage() {
  const snapshot = useData()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | 'wrong'>('all')

  const result = snapshot.progress.lastResult
  const course = result ? snapshot.courses.find((c) => c.id === result.courseId) : undefined
  if (!result || !course) return <Navigate to="/" replace />

  const questions = questionMap(course)
  const { total, correct, durationSec } = toAttempt(course, result, new Date(result.finishedAt ?? result.startedAt))
  // тест шёл внутри модуля — возврат и работа над ошибками остаются в нём же
  const topic = course.topics.find((t) => t.id === result.topicId)
  const stats = courseStats(course, snapshot.progress.questions[course.id] ?? {}, toDay(new Date()))
  const mistakes = (topic ? stats.topics.find((t) => t.topicId === topic.id) : undefined)?.mistakes ?? stats.all.mistakes
  const origin = topic ? { to: testsPath(course.id, topic.id), label: topic.title } : { to: coursePath(course.id), label: course.title }
  const share = total > 0 ? correct / total : null

  const items = result.items
    .map((item, i) => ({ item, number: i + 1, question: questions.get(item.questionId) }))
    .filter(({ item, question }) => question && (filter === 'all' || item.picked !== question.answer))

  const fixMistakes = async () => {
    if (await startSession(snapshot, course, 'mistakes', { topicIds: topic && [topic.id] })) navigate('/run')
  }

  return (
    <Page title="Результат" back={origin}>
      <div className="card stack">
        <div className="row">
          <span className="result-score">
            {correct} из {total}
          </span>
          <span className={`badge ${share !== null && share >= 0.8 ? 'ok' : share !== null && share < 0.5 ? 'bad' : 'accent'}`}>{percent(share)}</span>
        </div>
        <p className="muted">
          {MODE_TITLES[result.mode]}
          {result.level && ` · ${LEVEL_TITLES[result.level]}`} · {duration(durationSec)}
        </p>
        <div className="row">
          {mistakes > 0 && (
            <button type="button" className="btn primary" onClick={() => void fixMistakes()}>
              Работа над ошибками ({mistakes})
            </button>
          )}
          <Link className={mistakes > 0 ? 'btn' : 'btn primary'} to={origin.to}>
            {topic ? 'К модулю' : 'К курсу'}
          </Link>
        </div>
      </div>

      <div className="row between">
        <h2>Разбор</h2>
        {correct < total && (
          <Segmented
            label="Какие вопросы показывать"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Все' },
              { value: 'wrong', label: 'Только ошибки' },
            ]}
          />
        )}
      </div>

      {items.map(({ item, number, question }) => (
        <div className="card review-item" key={item.questionId}>
          <span className="muted small">Вопрос {number}</span>
          <QuestionView question={question!} order={item.order} picked={item.picked} reveal />
        </div>
      ))}
    </Page>
  )
}
