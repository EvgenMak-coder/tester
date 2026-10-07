import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './app/App'
import { refresh } from './data/hooks'
import { startSync } from './data/syncRunner'
import { setupUpdates } from './pwa'
import { applyTheme, loadTheme } from './theme/appearance'
import './theme/tokens.css'
import './theme/global.css'

applyTheme(loadTheme())
void refresh()
startSync()
setupUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* HashRouter: сайт работает из подпапки GitHub Pages без настройки сервера */}
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </HashRouter>
  </StrictMode>,
)
