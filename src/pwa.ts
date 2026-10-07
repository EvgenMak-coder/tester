import { registerSW } from 'virtual:pwa-register'

/**
 * Установленное на телефон приложение хранит свою копию сайта и само новую версию не замечает:
 * iPhone не перезагружает страницу, а возвращает её из памяти. Поэтому проверяем обновление сами —
 * при запуске, при каждом возврате в приложение и раз в полчаса. Найдя новую версию, страница перезагружается;
 * незавершённый тест при этом не теряется, он хранится в прогрессе.
 */
export function setupUpdates(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (!document.hidden) void registration.update()
      }
      document.addEventListener('visibilitychange', check)
      window.setInterval(check, 30 * 60 * 1000)
    },
  })
}

/**
 * Ручной сброс: забыть сохранённую копию сайта и загрузить свежую. Курсы и прогресс не затрагивает.
 * На github.io все проекты аккаунта живут на одном адресе, поэтому трогаем только то, что относится к этой папке.
 */
export async function forceRefresh(): Promise<void> {
  const scope = new URL('./', location.href).href
  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? []
    await Promise.all(registrations.filter((r) => r.scope === scope).map((r) => r.unregister()))
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k.endsWith(scope)).map((k) => caches.delete(k)))
  } finally {
    location.reload()
  }
}

/** Когда собрана эта версия — чтобы было видно, обновилось ли приложение. */
export const BUILD_TIME: string = __BUILD_TIME__

/** Номер версии из package.json */
export const APP_VERSION: string = __APP_VERSION__
