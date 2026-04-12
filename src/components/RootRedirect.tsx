import { Navigate } from 'react-router-dom'
import { auth } from '../lib/firebase'

export function RootRedirect() {
  const isAuthed   = auth.currentUser !== null
  const hasProfile = Boolean(localStorage.getItem('formAI_profile'))

  if (!isAuthed)   return <Navigate to="/auth"       replace />
  if (!hasProfile) return <Navigate to="/onboarding" replace />
  return                  <Navigate to="/home"       replace />
}
