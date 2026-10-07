import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './Layout'
import { useSnapshot } from '../data/hooks'
import { CoursePage } from '../features/course/CoursePage'
import { TestsPage } from '../features/course/TestsPage'
import { HomePage } from '../features/home/HomePage'
import { ImportPage } from '../features/import/ImportPage'
import { ResultPage } from '../features/run/ResultPage'
import { RunPage } from '../features/run/RunPage'
import { SettingsPage } from '../features/settings/SettingsPage'

export function App() {
  // страницы читают данные через useData и рассчитывают, что они уже загружены
  if (!useSnapshot()) return null
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/course/:id" element={<CoursePage />} />
        <Route path="/course/:id/all" element={<TestsPage />} />
        <Route path="/course/:id/module/:topicId" element={<TestsPage />} />
        <Route path="/run" element={<RunPage />} />
        <Route path="/result" element={<ResultPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
