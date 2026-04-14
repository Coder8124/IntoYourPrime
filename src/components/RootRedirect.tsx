import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'

export function RootRedirect() {
  const [authReady, setAuthReady] = useState(false)
  const [isAuthed,  setIsAuthed]  = useState(false)

  useEffect(() => {
    // Wait for Firebase to restore the session before deciding where to redirect.
    // Without this, auth.currentUser is null on first render even if the user is signed in.
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsAuthed(user !== null)
      setAuthReady(true)
      unsub()
    })
    return unsub
  }, [])

  if (!authReady) {
    // Show nothing while Firebase restores the session (usually <300ms)
    return null
  }

  const hasProfile = Boolean(localStorage.getItem('formAI_profile'))

  if (!isAuthed)   return <Navigate to="/auth"       replace />
  if (!hasProfile) return <Navigate to="/onboarding" replace />
  return                  <Navigate to="/home"       replace />
}
