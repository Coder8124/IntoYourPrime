import { onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import { auth } from './firebase'
import { getOrCreateLocalUserId } from './localUserId'

/**
 * Wait until Firebase Auth has emitted the initial session state.
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
let inflight: Promise<string> | null = null

/**
 * Stable user id for this app: Firebase Auth uid (anonymous) when possible,
 * otherwise the browser-local id. Does not throw — needed so logging still works offline.
 */
export function getOrSignInUserId(): Promise<string> {
  if (cachedUid) return Promise.resolve(cachedUid)
  if (!inflight) {
    inflight = (async () => {
      await waitForAuthReady()
      if (auth.currentUser?.uid) return auth.currentUser.uid
      try {
        const { user } = await signInAnonymously(auth)
        return user.uid
      } catch {
        return getOrCreateLocalUserId()
      }
    })()
      .then((uid) => {
        cachedUid = uid
        return uid
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}
