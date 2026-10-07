import { useSyncExternalStore } from 'react'
import { store } from './index'
import { COURSES_KEY, PROGRESS_KEY } from './localStore'
import type { DataStore } from './store'
import type { Snapshot } from '../quiz/types'

let snapshot: Snapshot | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function refresh(): Promise<void> {
  snapshot = await store.load()
  listeners.forEach((l) => l())
}

/** Все данные приложения; null, пока идёт первая загрузка. */
export function useSnapshot(): Snapshot | null {
  return useSyncExternalStore(subscribe, () => snapshot)
}

/** То же для страниц: App не рисует их, пока данные не загружены. */
export function useData(): Snapshot {
  const data = useSnapshot()
  if (!data) throw new Error('данные ещё не загружены')
  return data
}

const changeListeners = new Set<() => void>()

/** Подписка на изменения, сделанные пользователем; ею пользуется синхронизация. */
export function onLocalChange(listener: () => void): void {
  changeListeners.add(listener)
}

/** Выполняет действие над хранилищем и обновляет экран. */
export async function act<T>(fn: (store: DataStore) => Promise<T>): Promise<T> {
  try {
    return await fn(store)
  } finally {
    await refresh()
    changeListeners.forEach((l) => l())
  }
}

// данные изменили в соседней вкладке
window.addEventListener('storage', (e) => {
  if (e.key === COURSES_KEY || e.key === PROGRESS_KEY || e.key === null) void refresh()
})
