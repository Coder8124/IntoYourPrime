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

/** Sign out and clear the uid cache. */
export async function signOutUser(): Promise<void> {
  const { signOut } = await import('firebase/auth')
  await signOut(auth)
  cachedUid = null
}
