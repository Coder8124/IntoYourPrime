/**
 * Equivalent to the Firebase console “npm / modular” snippet:
 * initializeApp → getAnalytics, plus Auth + Firestore for IntoYourPrime.
 * Values come from `.env` (`VITE_FIREBASE_*`) so nothing secret is committed.
 * @see https://firebase.google.com/docs/web/setup
 */
import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { getAnalytics, type Analytics } from 'firebase/analytics'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
if (measurementId) {
  firebaseConfig.measurementId = measurementId
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

/** Google Analytics (GA4) — only in the browser; requires `measurementId` in config. */
export const analytics: Analytics | null =
  typeof window !== 'undefined' && measurementId ? getAnalytics(app) : null
