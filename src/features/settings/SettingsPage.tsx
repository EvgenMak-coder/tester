import { useRef, useState } from 'react'
import { dateTime, plural, QUESTIONS } from '../../app/text'
import { Page, Segmented } from '../../components/ui'
import { readBackup } from '../../data/actions'
import { act, useData } from '../../data/hooks'
import { countQuestions } from '../../quiz/format'
import { emptySnapshot } from '../../quiz/types'
import { APP_VERSION, BUILD_TIME, forceRefresh } from '../../pwa'
import { loadTheme, saveTheme, type Theme } from '../../theme/appearance'

function download(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export function SettingsPage() {
  const snapshot = useData()
  const fileInput = useRef<HTMLInputElement>(null)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const questions = snapshot.courses.reduce((n, c) => n + countQuestions(c), 0)
  const sizeKb = Math.ceil(JSON.stringify(snapshot).length / 1024)

  const changeTheme = (next: Theme) => {
    saveTheme(next)
    setTheme(next)
  }

  const exportAll = () => {
    download(`tester-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(snapshot, null, 2))
  }

  const restore = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = ''
    if (!file) return
    const backup = readBackup(await file.text())
    if (!backup) return setMessage({ ok: false, text: `Файл ${file.name} не похож на резервную копию Tester.` })
    if (!window.confirm(`Заменить все текущие данные содержимым файла ${file.name}?`)) return
    await act((store) => store.replaceAll(backup))
    setMessage({ ok: true, text: `Данные восстановлены: курсов — ${backup.courses.length}.` })
  }

  const wipe = async () => {
    if (!window.confirm('Удалить все курсы и весь прогресс? Вернуть их можно будет только из резервной копии.')) return
    await act((store) => store.replaceAll(emptySnapshot()))
    setMessage({ ok: true, text: 'Все данные удалены.' })
  }

  return (
    <Page title="Настройки">
      <div className="card stack">
        <h2>Оформление</h2>
        <Segmented
          label="Тема оформления"
          value={theme}
          onChange={changeTheme}
          options={[
            { value: 'auto', label: 'Как в системе' },
            { value: 'light', label: 'Светлая' },
            { value: 'dark', label: 'Тёмная' },
          ]}
        />
      </div>

      <div className="card stack">
        <h2>Данные</h2>
        <p className="small">
          Курсы и прогресс хранятся в этом браузере: курсов — {snapshot.courses.length}, {plural(questions, QUESTIONS)}, около {sizeKb} КБ из доступных 5 МБ. Резервная копия переносит
          всё на другое устройство или в другой браузер.
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={exportAll}>
            Скачать резервную копию
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            Восстановить из файла
          </button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => void restore(e.target.files?.[0])} />
          <button type="button" className="btn danger" onClick={() => void wipe()}>
            Удалить все данные
          </button>
        </div>
        {message && (
          <p className={message.ok ? 'notice' : 'notice bad'} role="status">
            {message.text}
          </p>
        )}
      </div>

      <div className="card stack">
        <h2>Приложение</h2>
        <p className="small">
          Версия {APP_VERSION}, собрана {dateTime(BUILD_TIME)}. Новая версия подхватывается сама при следующем открытии; если этого не произошло, обнови вручную — курсы и
          прогресс останутся на месте.
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={() => void forceRefresh()}>
            Обновить приложение
          </button>
        </div>
      </div>
    </Page>
  )
}
