import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { ThemeProvider } from './contexts/ThemeContext'
import { auth } from './lib/firebase'
import { upsertUserDisplayName } from './lib/firebaseHelpers'
import { RootRedirect } from './components/RootRedirect'
import { RouteFade } from './components/RouteFade'

const LandingPage        = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })))
const AuthPage           = lazy(() => import('./pages/AuthPage').then(m => ({ default: m.AuthPage })))
const OnboardingPage     = lazy(() => import('./pages/OnboardingPage').then(m => ({ default: m.OnboardingPage })))
const HomePage           = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })))
const WorkoutPage        = lazy(() => import('./pages/WorkoutPage').then(m => ({ default: m.WorkoutPage })))
const SessionSummaryPage = lazy(() => import('./pages/SessionSummaryPage').then(m => ({ default: m.SessionSummaryPage })))
const RecoveryLogPage    = lazy(() => import('./pages/RecoveryLogPage').then(m => ({ default: m.RecoveryLogPage })))
const ProfilePage        = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })))
const FriendsPage        = lazy(() => import('./pages/FriendsPage').then(m => ({ default: m.FriendsPage })))
const ProgressPage       = lazy(() => import('./pages/ProgressPage').then(m => ({ default: m.ProgressPage })))
const BasketballPage     = lazy(() => import('./pages/BasketballPage'))
const ExerciseLibraryPage = lazy(() => import('./pages/ExerciseLibraryPage').then(m => ({ default: m.ExerciseLibraryPage })))
const ProgramsPage       = lazy(() => import('./pages/ProgramsPage').then(m => ({ default: m.ProgramsPage })))
const CustomProgramPage  = lazy(() => import('./pages/CustomProgramPage').then(m => ({ default: m.CustomProgramPage })))
const AIWorkoutPage      = lazy(() => import('./pages/AIWorkoutPage').then(m => ({ default: m.AIWorkoutPage })))

function PageLoader() {
  return (
    <div className="min-h-screen bg-page flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
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
      <Suspense fallback={<PageLoader />}>
        <RouteFade>
          <Routes>
            <Route path="/"                  element={<RootRedirect />} />
            <Route path="/landing"           element={<LandingPage />} />
            <Route path="/auth"              element={<AuthPage />} />
            <Route path="/onboarding"        element={<OnboardingPage />} />
            <Route path="/home"              element={<HomePage />} />
            <Route path="/workout"           element={<WorkoutPage />} />
            <Route path="/session-summary"   element={<SessionSummaryPage />} />
            <Route path="/recovery-log"      element={<RecoveryLogPage />} />
            <Route path="/recovery"          element={<RecoveryLogPage />} />
            <Route path="/profile"           element={<ProfilePage />} />
            <Route path="/friends"           element={<FriendsPage />} />
            <Route path="/progress"          element={<ProgressPage />} />
            <Route path="/basketball"        element={<BasketballPage />} />
            <Route path="/library"           element={<ExerciseLibraryPage />} />
            <Route path="/programs"          element={<ProgramsPage />} />
            <Route path="/programs/builder"  element={<CustomProgramPage />} />
            <Route path="/programs/generate" element={<AIWorkoutPage />} />
          </Routes>
        </RouteFade>
      </Suspense>
    </ThemeProvider>
  )
}
