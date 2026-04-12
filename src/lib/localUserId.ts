const STORAGE_KEY = 'formAI_localUid'

/** Stable id for Firestore paths when Firebase Auth is not wired up yet. */
export function getOrCreateLocalUserId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY)
    if (!id?.trim()) {
      id = crypto.randomUUID()
      localStorage.setItem(STORAGE_KEY, id)
    }
    return id
  } catch {
    return 'local-anonymous'
  }
}
