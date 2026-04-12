import { Routes, Route } from 'react-router-dom'
import { RootRedirect } from './components/RootRedirect'
import { OnboardingPage } from './pages/OnboardingPage'
import { WorkoutPage } from './pages/WorkoutPage'
import { SessionSummaryPage } from './pages/SessionSummaryPage'
import { RecoveryLogPage } from './pages/RecoveryLogPage'

export default function App() {
  return (
    <Routes>
      <Route path="/"                element={<RootRedirect />} />
      <Route path="/onboarding"      element={<OnboardingPage />} />
      <Route path="/workout"         element={<WorkoutPage />} />
      <Route path="/session-summary" element={<SessionSummaryPage />} />
      <Route path="/recovery"        element={<RecoveryLogPage />} />
    </Routes>
  )
}
