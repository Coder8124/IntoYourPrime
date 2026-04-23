import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { Shot } from '../types/basketball'

/**
 * Persist a single scored shot to Firestore under users/{uid}/basketballShots.
 * Fire-and-forget: swallows errors so the UI stays responsive offline.
 */
export async function saveBasketballShot(uid: string, shot: Omit<Shot, 'id'>): Promise<void> {
  try {
    await addDoc(collection(db, 'users', uid, 'basketballShots'), {
      ...shot,
      createdAt: serverTimestamp(),
    })
  } catch (e) {
    console.warn('[basketballShots] save failed:', e)
  }
}
