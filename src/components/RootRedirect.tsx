import { Navigate } from 'react-router-dom'

export function RootRedirect() {
  const hasProfile = Boolean(localStorage.getItem('formAI_profile'))
  return <Navigate to={hasProfile ? '/workout' : '/onboarding'} replace />
}
