import { useEffect, useState } from 'react'
import { dateTime, MODULES, plural, QUESTIONS } from '../../app/text'
import { loadSharedCourse, loadSharedCourses, type SharedCourse } from '../../data/cloud'
import { useData } from '../../data/hooks'
import { useSyncStatus } from '../../data/syncRunner'

interface Props {
  /** курс загружен и ждёт проверки и подтверждения на странице импорта */
  onOpen: (file: unknown, from: string) => void
}

/**
 * Курсы, которые добавили другие пользователи. Блок виден только владельцу приложения:
 * остальным база отвечает пусто, и он не рисуется. Прогресс других людей сюда не попадает.
 */
export function SharedCourses({ onOpen }: Props) {
  const { courses } = useData()
  const { email, syncedAt } = useSyncStatus()
  const [shared, setShared] = useState<SharedCourse[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // список перечитывается после входа и после каждого обмена с облаком
  useEffect(() => {
    let alive = true
    if (!email) {
      setShared(null)
      return
    }
    loadSharedCourses()
      .then((list) => alive && setShared(list))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [email, syncedAt])

  if (!shared) return null

  const key = (c: SharedCourse) => `${c.ownerId}/${c.courseId}`

  const load = async (c: SharedCourse, then: (file: unknown) => void) => {
    setBusy(key(c))
    setError(null)
    try {
      then(await loadSharedCourse(c.ownerId, c.courseId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const download = (c: SharedCourse, file: unknown) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }))
    Object.assign(document.createElement('a'), { href: url, download: `${c.courseId}.json` }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="stack">
      <h2>Курсы пользователей</h2>
      <p className="muted small">Курсы, которые добавили другие люди под своими аккаунтами. Их прогресс и ошибки здесь не видны — только сами курсы.</p>
      {error && (
        <p className="notice bad" role="alert">
          {error}
        </p>
      )}
      {shared.length === 0 ? (
        <p className="small">Пока никто, кроме тебя, курсов не добавлял.</p>
      ) : (
        <div className="list">
          {shared.map((c) => (
            <div className="list-row" key={key(c)}>
              <div>
                <b>{c.title}</b>
                <p className="muted small">
                  {c.ownerEmail} · {plural(c.modules, MODULES)} · {plural(c.questions, QUESTIONS)} · обновлён {dateTime(c.updatedAt)}
                </p>
                {courses.some((own) => own.id === c.courseId) && <p className="small">Курс с таким id у тебя уже есть: при добавлении он обновится, прогресс сохранится.</p>}
              </div>
              <div className="row">
                <button type="button" className="btn primary" disabled={busy !== null} onClick={() => void load(c, (file) => onOpen(file, `от ${c.ownerEmail}`))}>
                  {busy === key(c) ? 'Загрузка…' : 'Посмотреть'}
                </button>
                <button type="button" className="btn" disabled={busy !== null} onClick={() => void load(c, (file) => download(c, file))}>
                  Скачать
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
