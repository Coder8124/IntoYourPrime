import type { DailyLog } from '../types'

const PREFIX = 'formIQ_recovery_v1_'

function key(userKey: string, date: string): string {
  return `${PREFIX}${userKey}_${date}`
}

/** Persist a copy on device when Firestore is unavailable or fails. */
export function saveRecoveryLogLocal(userKey: string, log: DailyLog): void {
  try {
    localStorage.setItem(key(userKey, log.date), JSON.stringify(log))
  } catch {
    /* quota / private mode */
  }
}

export function loadRecoveryLogLocal(userKey: string, date: string): DailyLog | null {
  try {
    const raw = localStorage.getItem(key(userKey, date))
    if (!raw) return null
    const p = JSON.parse(raw) as DailyLog
    if (typeof p.date !== 'string' || typeof p.userId !== 'string') return null
    return p
  } catch {
    return null
  }
}
