import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { QuestionView } from './QuestionView'
import { clock } from '../../app/text'
import { Meter } from '../../components/ui'
import { finishSession, goTo, submitAnswer } from '../../data/actions'
import { act, useData } from '../../data/hooks'
import { questionMap, secondsLeft } from '../../quiz/session'
import { LEVEL_TITLES, levelOf, MODE_TITLES } from '../../quiz/types'

/** Текущее время, пока идёт отсчёт. */
function useNow(ticking: boolean): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(() => setNow(new Date()), 500)
    return () => clearInterval(timer)
  }, [ticking])
  return now
}

export function RunPage() {
  const snapshot = useData()
  const navigate = useNavigate()
  const session = snapshot.progress.session
  const course = session ? snapshot.courses.find((c) => c.id === session.courseId) : undefined
  const exam = session?.mode === 'exam'
  const now = useNow(exam)
  const finishing = useRef(false)

  const index = session?.current ?? 0
  const item = session?.items[index]
  const last = session ? index === session.items.length - 1 : false
  const question = course && item ? questionMap(course).get(item.questionId) : undefined
  // вне экзамена ответ окончательный; вопрос, исчезнувший из курса, просто пропускается
  const settled = !exam && (item?.picked !== null || !question)
  const left = session ? secondsLeft(session, now) : null

  const finish = async () => {
    if (finishing.current) return
    finishing.current = true
    const recorded = await act((store) => finishSession(store, snapshot))
    navigate(recorded ? '/result' : course ? `/course/${course.id}` : '/', { replace: true })
  }

  const pick = (original: number) => {
    if (!settled) void act((store) => submitAnswer(store, snapshot, index, original))
  }

  const move = (to: number) => void act((store) => goTo(store, snapshot, to))

  const next = () => {
    if (!exam && !settled) return
    if (!last) move(index + 1)
    else if (!exam) void finish()
  }

  const confirmFinish = () => {
    if (!exam || !session) return void finish()
    const blank = session.items.filter((i) => i.picked === null).length
    const message = blank > 0 ? `Без ответа осталось вопросов: ${blank}. Они будут засчитаны как ошибки. Завершить экзамен?` : 'Завершить экзамен?'
    if (window.confirm(message)) void finish()
  }

  useEffect(() => {
    if (left === 0) void finish()
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!item || e.ctrlKey || e.metaKey || e.altKey) return
      const digit = Number(e.key)
      if (Number.isInteger(digit) && digit >= 1 && digit <= item.order.length) {
        pick(item.order[digit - 1])
      } else if (e.key === 'Enter') {
        // Enter на «Завершить» и других кнопках управления остаётся за ними
        if (e.target instanceof HTMLElement && e.target.closest('button:not(.option), a')) return
        e.preventDefault()
        next()
      } else if (exam && e.key === 'ArrowLeft') {
        move(index - 1)
      } else if (exam && e.key === 'ArrowRight') {
        move(index + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // после завершения сессия уже пуста, а переход на результат ещё не случился
  if (!session || !course || !item) return finishing.current ? null : <Navigate to="/" replace />

  const answered = session.items.filter((i) => i.picked !== null).length
  const topic = course.topics.find((t) => t.id === item.topicId)?.title

  return (
    <main className="page">
      <div className="run-head">
        <div className="row between">
          <div>
            <p className="muted small">
              {course.title} · {MODE_TITLES[session.mode]}
              {session.level && ` · ${LEVEL_TITLES[session.level]}`}
            </p>
            <h1>
              Вопрос {index + 1} из {session.items.length}
            </h1>
          </div>
          <div className="row">
            {left !== null && (
              <span className={left <= 60 ? 'timer low' : 'timer'} role="timer" aria-label="Осталось времени">
                {clock(left)}
              </span>
            )}
            <button type="button" className="btn quiet" onClick={confirmFinish}>
              {exam ? 'Завершить экзамен' : 'Завершить'}
            </button>
          </div>
        </div>
        <Meter share={answered / session.items.length} label="Отвечено вопросов" />
      </div>

      <div className="card">
        {question ? (
          <QuestionView key={item.questionId} question={question} order={item.order} picked={item.picked} reveal={settled} topic={topic} level={LEVEL_TITLES[levelOf(question)]} onPick={settled ? undefined : pick} />
        ) : (
          <p className="muted">Этот вопрос удалён из курса при обновлении.</p>
        )}
      </div>

      <div className="row between run-nav">
        {exam ? (
          <button type="button" className="btn" disabled={index === 0} onClick={() => move(index - 1)}>
            ← Назад
          </button>
        ) : (
          <span className="muted small hint">Клавиши 1–{item.order.length} — ответ, Enter — дальше</span>
        )}
        {exam && last ? (
          <button type="button" className="btn primary" onClick={confirmFinish}>
            Завершить экзамен
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={!exam && !settled} onClick={next}>
            {last ? 'Показать результат' : 'Дальше →'}
          </button>
        )}
      </div>

      {exam && (
        <nav className="dots" aria-label="Вопросы экзамена">
          {session.items.map((it, i) => (
            <button
              key={it.questionId}
              type="button"
              className={`dot${it.picked !== null ? ' answered' : ''}${i === index ? ' current' : ''}`}
              aria-current={i === index ? 'step' : undefined}
              aria-label={`Вопрос ${i + 1}${it.picked !== null ? ', отвечен' : ''}`}
              onClick={() => move(i)}
            >
              {i + 1}
            </button>
          ))}
        </nav>
      )}
    </main>
  )
}
