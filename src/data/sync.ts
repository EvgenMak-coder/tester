import { changedSince, isEmpty, mergeChanges, type Changes } from './merge'
import type { DataStore } from './store'

/** Облако глазами синхронизации. Настоящая реализация — в cloud.ts, в тестах её заменяет память. */
export interface Remote {
  /** Всё, что появилось в облаке после отметки cursor (null — с самого начала), и отметка для следующего раза. */
  pull(cursor: string | null): Promise<{ changes: Changes; cursor: string | null }>
  push(changes: Changes): Promise<void>
}

export interface SyncState {
  userId: string
  /** до какого места облако уже прочитано */
  cursor: string | null
  /** время устройства, по которое изменения уже отправлены */
  pushedAt: string | null
}

export function freshState(userId: string): SyncState {
  return { userId, cursor: null, pushedAt: null }
}

/**
 * Один обмен с облаком: забрать новое, влить в данные устройства, отправить своё.
 * Слияние идёт одной операцией хранилища, поэтому ответы, данные во время загрузки, не теряются.
 */
export async function syncOnce(store: DataStore, remote: Remote, state: SyncState, clock: () => Date = () => new Date()): Promise<{ state: SyncState; pulled: boolean }> {
  const { changes, cursor } = await remote.pull(state.cursor)
  const pulled = !isEmpty(changes)
  if (pulled) await store.transform((local) => mergeChanges(local, changes))

  // отметка берётся до чтения: то, что изменится во время отправки, уйдёт в следующий раз
  const pushedAt = clock().toISOString()
  const outgoing = changedSince(await store.load(), state.pushedAt)
  if (!isEmpty(outgoing)) await remote.push(outgoing)

  return { state: { userId: state.userId, cursor, pushedAt }, pulled }
}
