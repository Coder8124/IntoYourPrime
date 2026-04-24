import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { ThemeProvider } from './contexts/ThemeContext'
import { auth } from './lib/firebase'
import { upsertUserDisplayName } from './lib/firebaseHelpers'
import { RootRedirect } from './components/RootRedirect'
import { RouteFade } from './components/RouteFade'
import { LandingPage } from './pages/LandingPage'
import { AuthPage } from './pages/AuthPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { HomePage } from './pages/HomePage'
import { WorkoutPage } from './pages/WorkoutPage'
import { SessionSummaryPage } from './pages/SessionSummaryPage'
import { RecoveryLogPage } from './pages/RecoveryLogPage'
import { ProfilePage } from './pages/ProfilePage'
import { FriendsPage } from './pages/FriendsPage'
import { ProgressPage } from './pages/ProgressPage'
import { ExerciseLibraryPage } from './pages/ExerciseLibraryPage'
import { ProgramsPage } from './pages/ProgramsPage'
import { CustomProgramPage } from './pages/CustomProgramPage'
import { AIWorkoutPage } from './pages/AIWorkoutPage'
import BasketballPage from './pages/BasketballPage'

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
    <ThemeProvider>
      <RouteFade>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/workout" element={<WorkoutPage />} />
          <Route path="/session-summary" element={<SessionSummaryPage />} />
          <Route path="/recovery-log" element={<RecoveryLogPage />} />
          <Route path="/recovery" element={<RecoveryLogPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/basketball" element={<BasketballPage />} />
          <Route path="/library" element={<ExerciseLibraryPage />} />
          <Route path="/programs" element={<ProgramsPage />} />
          <Route path="/programs/builder" element={<CustomProgramPage />} />
          <Route path="/programs/generate" element={<AIWorkoutPage />} />
        </Routes>
      </RouteFade>
    </ThemeProvider>
  )
}
