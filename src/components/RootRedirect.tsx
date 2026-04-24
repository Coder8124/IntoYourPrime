import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { getUserProfile, firestoreProfileToLocal } from '../lib/firebaseHelpers'

export function RootRedirect() {
  const [authReady,   setAuthReady]   = useState(false)
  const [isAuthed,    setIsAuthed]    = useState(false)
  const [hasProfile,  setHasProfile]  = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsAuthed(false)
        setAuthReady(true)
        return
      }

      setIsAuthed(true)

      // Check localStorage first (fast path)
      const localComplete = (() => {
        try {
          const raw = localStorage.getItem('formAI_profile')
          if (!raw) return false
          const p = JSON.parse(raw) as Record<string, unknown>
          return Boolean(p.name) && Boolean(p.age) && Boolean(p.sex)
        } catch { return false }
      })()

      if (localComplete) {
        setHasProfile(true)
        setAuthReady(true)
        return
      }

      // localStorage empty (new device/browser) — try Firestore
      try {
        const profile = await Promise.race([
          getUserProfile(user.uid),
          new Promise<null>(r => setTimeout(() => r(null), 5000)),
        ])
        if (profile?.displayName && profile.age && profile.biologicalSex) {
          const local = firestoreProfileToLocal(profile)
          const json = JSON.stringify(local)
          localStorage.setItem('formAI_profile', json)
          localStorage.setItem(`formAI_profile_${user.uid}`, json)
          setHasProfile(true)
        }
      } catch { /* network failure — fall through to onboarding */ }

      setAuthReady(true)
    })
    return unsub
  }, [])

  if (!authReady) return null

  if (!isAuthed)   return <Navigate to="/auth"       replace />
  if (!hasProfile) return <Navigate to="/onboarding" replace />
  return                  <Navigate to="/home"       replace />
}
