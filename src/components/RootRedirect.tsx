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

      const isProfileComplete = (raw: string | null): boolean => {
        try {
          if (!raw) return false
          const p = JSON.parse(raw) as Record<string, unknown>
          return Boolean(p.name) && Boolean(p.age) && Boolean(p.sex)
        } catch { return false }
      }

      // 1. Check uid-specific localStorage key first — persists across sign-out on same device
      const uidKey = `formAI_profile_${user.uid}`
      const uidRaw = localStorage.getItem(uidKey)
      if (isProfileComplete(uidRaw)) {
        localStorage.setItem('formAI_profile', uidRaw!)
        setHasProfile(true)
        setAuthReady(true)
        return
      }

      // 2. Fall back to generic key (same session, not yet signed out)
      if (isProfileComplete(localStorage.getItem('formAI_profile'))) {
        // Back-fill the uid-specific key so future sign-ins skip Firestore
        localStorage.setItem(uidKey, localStorage.getItem('formAI_profile')!)
        setHasProfile(true)
        setAuthReady(true)
        return
      }

      // 3. No local data (new device/browser) — try Firestore
      try {
        const profile = await Promise.race([
          getUserProfile(user.uid),
          new Promise<null>(r => setTimeout(() => r(null), 5000)),
        ])
        if (profile?.displayName && profile.age && profile.biologicalSex) {
          const local = firestoreProfileToLocal(profile)
          const json = JSON.stringify(local)
          localStorage.setItem('formAI_profile', json)
          localStorage.setItem(uidKey, json)
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
