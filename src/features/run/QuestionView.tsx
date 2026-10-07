import type { Question } from '../../quiz/types'

interface Props {
  question: Question
  /** исходные индексы вариантов в порядке показа */
  order: number[]
  picked: number | null
  /** показать верный ответ, разбор вариантов и пояснение */
  reveal: boolean
  topic?: string
  level?: string
  onPick?: (original: number) => void
}

export function QuestionView({ question, order, picked, reveal, topic, level, onPick }: Props) {
  const correct = picked === question.answer
  return (
    <div className="question">
      {(topic || level) && (
        <div className="row">
          {topic && <span className="badge">{topic}</span>}
          {level && <span className="badge accent">{level}</span>}
        </div>
      )}
      <p className="question-text">{question.text}</p>
      {question.code && <pre className="code">{question.code}</pre>}
      <ol className="options">
        {order.map((original, i) => {
          const state = reveal ? (original === question.answer ? 'correct' : original === picked ? 'wrong' : 'dim') : original === picked ? 'selected' : ''
          return (
            <li key={original}>
              <button type="button" className={`option ${state}`} disabled={!onPick} aria-pressed={original === picked} onClick={() => onPick?.(original)}>
                <span className="option-key">{state === 'correct' ? '✓' : state === 'wrong' ? '✕' : i + 1}</span>
                <span className="option-body">
                  <span className="option-text">{question.options[original]}</span>
                  {reveal && question.notes?.[original] && <span className="option-note">{question.notes[original]}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {reveal && (
        <div className={`verdict ${picked === null ? '' : correct ? 'ok' : 'bad'}`} role="status">
          <b>{picked === null ? 'Без ответа' : correct ? 'Верно' : 'Неверно'}</b>
          {question.explanation}
        </div>
      )}
    </div>
  )
}
