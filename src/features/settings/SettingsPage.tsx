import { useRef, useState, type FormEvent } from 'react'
import { dateTime, plural, QUESTIONS } from '../../app/text'
import { Page, Segmented } from '../../components/ui'
import { readBackup, wipeAll } from '../../data/actions'
import { act, useData } from '../../data/hooks'
import { requestSync, signIn, signOut, useSyncStatus } from '../../data/syncRunner'
import { countQuestions } from '../../quiz/format'
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
  const sync = useSyncStatus()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const login = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setLoginError(await signIn(email, password))
    setPassword('')
    setBusy(false)
  }

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
    if (!window.confirm(sync.email ? 'Удалить все курсы и весь прогресс на этом устройстве и в облаке? Вернуть их можно будет только из резервной копии.' : 'Удалить все курсы и весь прогресс? Вернуть их можно будет только из резервной копии.')) return
    await act((store) => wipeAll(store))
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

      {sync.enabled && (
        <div className="card stack">
          <h2>Аккаунт</h2>
          {sync.email ? (
            <>
              <p className="small">
                Вход выполнен: <b>{sync.email}</b>. Курсы и прогресс синхронизируются между устройствами, где ты вошёл.
              </p>
              <p className="muted small">Добавленные тобой курсы видит владелец приложения. Прогресс, ошибки и результаты тестов видишь только ты.</p>
              <p className={sync.phase === 'error' ? 'notice bad' : 'muted small'} role="status">
                {sync.phase === 'syncing'
                  ? 'Синхронизация…'
                  : sync.phase === 'error'
                    ? `Не удалось синхронизировать: ${sync.error}`
                    : sync.syncedAt
                      ? `Синхронизировано ${dateTime(sync.syncedAt)}`
                      : 'Ожидает подключения к сети'}
              </p>
              <div className="row">
                <button type="button" className="btn" disabled={sync.phase === 'syncing'} onClick={() => requestSync(0)}>
                  Синхронизировать
                </button>
                <button type="button" className="btn quiet" onClick={() => void signOut()}>
                  Выйти
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="small">
                Войди, чтобы курсы и прогресс были одинаковыми на телефоне и компьютере. Без входа всё работает как раньше, данные остаются на этом устройстве. Курсы, добавленные под аккаунтом, видит владелец приложения; прогресс и ошибки остаются личными.
              </p>
              <form className="login" onSubmit={(e) => void login(e)}>
                <input type="email" placeholder="Почта" aria-label="Почта" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
                <input type="password" placeholder="Пароль" aria-label="Пароль" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="submit" className="btn primary" disabled={busy}>
                  Войти
                </button>
              </form>
              {loginError && (
                <p className="notice bad" role="alert">
                  {loginError}
                </p>
              )}
            </>
          )}
        </div>
      )}

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
