import { useSyncExternalStore } from 'react'
import { supabase, SupabaseRemote } from './cloud'
import { onLocalChange, refresh } from './hooks'
import { store } from './index'
import { freshState, syncOnce, type SyncState } from './sync'

const STATE_KEY = 'tester:sync:v1'
const DEBOUNCE_MS = 2500

export interface SyncStatus {
  /** заданы ли ключи Supabase при сборке */
  enabled: boolean
  email: string | null
  phase: 'idle' | 'syncing' | 'error'
  syncedAt: string | null
  error: string | null
}

let status: SyncStatus = { enabled: supabase !== null, email: null, phase: 'idle', syncedAt: null, error: null }
const listeners = new Set<() => void>()

function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => status,
  )
}

function loadState(userId: string): SyncState {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') as SyncState | null
    // под другим аккаунтом обмен начинается заново: данные устройства вольются в его облако
    if (saved && saved.userId === userId) return saved
  } catch {
    // повреждённая отметка — синхронизируемся с нуля, слияние это переживёт
  }
  return freshState(userId)
}

let userId: string | null = null
let running = false
let again = false
let timer: number | undefined

async function run(): Promise<void> {
  if (!supabase || !userId) return
  if (running) {
    again = true
    return
  }
  running = true
  setStatus({ phase: 'syncing' })
  try {
    const result = await syncOnce(store, new SupabaseRemote(supabase), loadState(userId))
    localStorage.setItem(STATE_KEY, JSON.stringify(result.state))
    if (result.pulled) await refresh()
    setStatus({ phase: 'idle', syncedAt: new Date().toISOString(), error: null })
  } catch (e) {
    // без сети это не ошибка: данные на устройстве целы и уйдут в облако при подключении
    if (navigator.onLine) setStatus({ phase: 'error', error: e instanceof Error ? e.message : String(e) })
    else setStatus({ phase: 'idle', error: null })
  } finally {
    running = false
    if (again) {
      again = false
      requestSync()
    }
  }
}

/** Синхронизировать вскоре: частые изменения (ответы подряд) склеиваются в один обмен. */
export function requestSync(delay: number = DEBOUNCE_MS): void {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void run(), delay)
}

/** Подключает синхронизацию: при входе, после каждого изменения, при возврате в приложение и появлении сети. */
export function startSync(): void {
  if (!supabase) return
  supabase.auth.onAuthStateChange((_event, session) => {
    userId = session?.user.id ?? null
    setStatus({ email: session?.user.email ?? null, ...(session ? {} : { phase: 'idle', error: null }) })
    // запросы к Supabase прямо из этого обработчика зависают, поэтому обмен запускаем отложенно
    if (session) requestSync(0)
  })
  onLocalChange(() => requestSync())
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestSync(0)
  })
  window.addEventListener('online', () => requestSync(0))
}

/** null — вход удался, иначе текст ошибки. */
export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Синхронизация не настроена'
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? 'Не удалось войти: проверь почту и пароль.' : null
}

/** Выход отключает обмен с облаком; курсы и прогресс на устройстве остаются. */
export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
}
