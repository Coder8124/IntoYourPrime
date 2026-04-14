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

  // A profile stub with just { name } (saved during signup) is not complete —
  // require at least name + age + sex before skipping onboarding
  const hasProfile = (() => {
    try {
      const raw = localStorage.getItem('formAI_profile')
      if (!raw) return false
      const p = JSON.parse(raw) as Record<string, unknown>
      return Boolean(p.name) && Boolean(p.age) && Boolean(p.sex)
    } catch { return false }
  })()

  if (!isAuthed)   return <Navigate to="/auth"       replace />
  if (!hasProfile) return <Navigate to="/onboarding" replace />
  return                  <Navigate to="/home"       replace />
}
