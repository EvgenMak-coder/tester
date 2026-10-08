import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Catalog } from './Catalog'
import { plural, QUESTIONS, MODULES } from '../../app/text'
import { Page } from '../../components/ui'
import { importCourse } from '../../data/actions'
import { act, useData } from '../../data/hooks'
import { countQuestions, diffCourse, parseCourseText, type ParseResult } from '../../quiz/format'
import { levelCounts } from '../../quiz/stats'
import { LEVEL_TITLES, LEVELS } from '../../quiz/types'

export function ImportPage() {
  const { courses } = useData()
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [source, setSource] = useState<string | null>(null)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [over, setOver] = useState(false)
  const [copied, setCopied] = useState(false)

  const check = (content: string, from: string | null) => {
    setSource(from)
    setResult(parseCourseText(content))
  }

  const readFile = async (file: File | undefined) => {
    if (!file) return
    const content = await file.text()
    setText(content)
    check(content, file.name)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void readFile(e.dataTransfer.files[0])
  }

  const reset = () => {
    setText('')
    setSource(null)
    setResult(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const course = result?.ok ? result.course : null
  const existing = course ? courses.find((c) => c.id === course.id) : undefined
  const diff = course && existing ? diffCourse(existing, course) : null
  const byLevel = course ? levelCounts(course) : null

  const confirm = async () => {
    if (!course) return
    await act((store) => importCourse(store, course))
    navigate(`/course/${course.id}`)
  }

  const copyFormat = async () => {
    const { default: guide } = await import('../../../docs/COURSE-GUIDE.md?raw')
    await navigator.clipboard.writeText(guide)
    setCopied(true)
  }

  const downloadGuide = async () => {
    const { default: guide } = await import('../../../docs/COURSE-GUIDE.md?raw')
    const url = URL.createObjectURL(new Blob([guide], { type: 'text/markdown;charset=utf-8' }))
    const link = Object.assign(document.createElement('a'), { href: url, download: 'tester-course-guide.md' })
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Page title="Импорт курса" back={{ to: '/', label: 'Курсы' }} lead="Курс — это JSON-файл с темами и вопросами. Файл с тем же id обновляет курс и сохраняет прогресс.">
      {course ? (
        <div className="card stack">
          <div>
            <h2>{course.title}</h2>
            {course.description && <p className="muted small">{course.description}</p>}
          </div>
          <p className="small">
            {plural(countQuestions(course), QUESTIONS)} · {plural(course.topics.length, MODULES)} · id <span className="mono">{course.id}</span>
            {source && ` · ${source}`}
          </p>
          {byLevel && (
            <div className="row">
              {LEVELS.filter((l) => byLevel[l] > 0).map((l) => (
                <span className="badge" key={l}>
                  {LEVEL_TITLES[l]}: {byLevel[l]}
                </span>
              ))}
            </div>
          )}
          {diff ? (
            <p className="notice">
              Такой курс уже есть, он будет обновлён. Новых вопросов: {diff.added}, изменённых: {diff.changed}, удалённых: {diff.removed}, без изменений: {diff.same}. Прогресс по
              оставшимся вопросам сохранится.
            </p>
          ) : (
            <p className="notice">Файл проверен, ошибок нет.</p>
          )}
          <div className="row">
            <button type="button" className="btn primary" onClick={() => void confirm()}>
              {existing ? 'Обновить курс' : 'Добавить курс'}
            </button>
            <button type="button" className="btn" onClick={reset}>
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={over ? 'drop over' : 'drop'} onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={onDrop}>
            <p>Перетащи сюда JSON-файл курса</p>
            <button type="button" className="btn primary" onClick={() => fileInput.current?.click()}>
              Выбрать файл
            </button>
            <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => void readFile(e.target.files?.[0])} />
          </div>

          <div className="stack">
            <h2>Или вставь текст</h2>
            <textarea aria-label="Текст курса в формате JSON" value={text} spellCheck={false} placeholder='{ "format": "tester-course", "version": 1, … }' onChange={(e) => (setText(e.target.value), setResult(null))} />
            <div className="row">
              <button type="button" className="btn" disabled={text.trim() === ''} onClick={() => check(text, null)}>
                Проверить
              </button>
            </div>
          </div>

          {result && !result.ok && (
            <div className="stack" role="alert">
              <b>{source ? `В файле ${source} есть ошибки` : 'В тексте есть ошибки'}</b>
              <ul className="errors mono">
                {result.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <Catalog />

      <div className="card stack">
        <h2>Где взять файл</h2>
        <p className="small">
          Курс составит ИИ-ассистент. Отдай ему инструкцию и назови предмет — он предложит программу, напишет тесты трёх уровней с разбором ответов и теорию, а готовый файл ты импортируешь здесь.
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={() => void copyFormat()}>
            {copied ? 'Скопировано ✓' : 'Скопировать инструкцию'}
          </button>
          <button type="button" className="btn" onClick={() => void downloadGuide()}>
            Скачать файлом
          </button>
        </div>
      </div>
    </Page>
  )
}
