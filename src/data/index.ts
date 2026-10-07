import { LocalStore } from './localStore'
import type { DataStore } from './store'

export const store: DataStore = new LocalStore()
