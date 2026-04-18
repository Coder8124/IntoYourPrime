import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './lib/firebase'
import { upsertUserDisplayName } from './lib/firebaseHelpers'
import { RootRedirect } from './components/RootRedirect'
import { LandingPage } from './pages/LandingPage'
import { AuthPage } from './pages/AuthPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { HomePage } from './pages/HomePage'
import { WorkoutPage } from './pages/WorkoutPage'
import { PipelineTestPage } from './pages/PipelineTestPage'
import { SessionSummaryPage } from './pages/SessionSummaryPage'
import { CooldownPage } from './pages/CooldownPage'
import { RecoveryLogPage } from './pages/RecoveryLogPage'
import { ProfilePage } from './pages/ProfilePage'
import { FriendsPage } from './pages/FriendsPage'
import { ProgressPage } from './pages/ProgressPage'

export default function App() {
  // Sync displayName to Firestore for any signed-in user (including existing accounts)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) return
      const profile = JSON.parse(localStorage.getItem('formAI_profile') ?? '{}') as Record<string, unknown>
      const name = (typeof profile.name === 'string' && profile.name.trim())
        ? profile.name.trim()
        : user.displayName ?? user.email ?? ''
      if (name) {
        upsertUserDisplayName(user.uid, name, user.email ?? '').catch(() => {})
      }
    })
    return unsub
  }, [])

  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/workout" element={<WorkoutPage />} />
      <Route path="/pipeline-test" element={<PipelineTestPage />} />
      <Route path="/session-summary" element={<SessionSummaryPage />} />
      <Route path="/cooldown" element={<CooldownPage />} />
      <Route path="/recovery-log" element={<RecoveryLogPage />} />
      <Route path="/recovery" element={<RecoveryLogPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/friends" element={<FriendsPage />} />
      <Route path="/progress" element={<ProgressPage />} />
    </Routes>
  )
}
