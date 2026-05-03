import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import { getOrCreateLocalUserId } from './localUserId'

/**
 * Wait until Firebase Auth has emitted the initial session state.
 * Resolves quickly from cache — does NOT attempt any sign-in.
 */
export function waitForAuthReady(): Promise<void> {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, () => {
      unsub()
      resolve()
    })
  })
}

let cachedUid: string | null = null

/**
 * Returns the current user's Firebase uid, or a local fallback if offline / not signed in.
 * Does NOT sign in — the user must authenticate via AuthPage first.
 */
export function getOrSignInUserId(): Promise<string> {
  if (cachedUid) return Promise.resolve(cachedUid)
  return waitForAuthReady().then(() => {
    const uid = auth.currentUser?.uid ?? getOrCreateLocalUserId()
    cachedUid = uid
    return uid
  })
}

/** True when a real Firebase user is authenticated. */
export function isFirebaseAuthed(): boolean {
  return auth.currentUser !== null
}

/** Sign out and clear session localStorage (generic keys only, not uid-keyed profile cache). */
export async function signOutUser(): Promise<void> {
  const { signOut } = await import('firebase/auth')

  // Back up current profile to uid-specific key BEFORE signing out (uid becomes null after signOut)
  const uid = auth.currentUser?.uid
  const profile = localStorage.getItem('formAI_profile')
  if (uid && profile) {
    localStorage.setItem(`formAI_profile_${uid}`, profile)
  }

  await signOut(auth)
  cachedUid = null
  // Clear generic session data — uid-keyed profiles (formAI_profile_<uid>) are kept
  const keysToRemove = [
    'formAI_profile',
    'formAI_streak',
    'formAI_lastSession',
    'formAI_lastSession_savedId',
  ]
  keysToRemove.forEach(k => localStorage.removeItem(k))
}
