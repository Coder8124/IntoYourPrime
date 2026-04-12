import { Navigate } from 'react-router-dom'

/** Onboarding stores `formAI_profile` in localStorage; then workout unlocks. */
export function RootRedirect() {
  const hasProfile = Boolean(localStorage.getItem('formAI_profile'))
  return <Navigate to={hasProfile ? '/home' : '/onboarding'} replace />
}
