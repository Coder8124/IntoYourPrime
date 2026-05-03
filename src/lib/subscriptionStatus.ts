import { auth } from './firebase'

export type SubscriptionStatus = {
  status:           'active' | 'cancelled' | 'expired' | 'none'
  currentPeriodEnd: string | null
  usagePct:         number
}

let _cache: SubscriptionStatus | null = null

export async function loadSubscriptionStatus(): Promise<void> {
  const user = auth.currentUser
  if (!user) {
    _cache = { status: 'none', currentPeriodEnd: null, usagePct: 0 }
    return
  }
  try {
    const idToken = await user.getIdToken()
    const res     = await fetch(`/api/subscription-status?uid=${user.uid}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    if (res.ok) {
      _cache = (await res.json()) as SubscriptionStatus
    } else {
      _cache = { status: 'none', currentPeriodEnd: null, usagePct: 0 }
    }
  } catch {
    _cache = { status: 'none', currentPeriodEnd: null, usagePct: 0 }
  }
}

export function isProSubscriber(): boolean {
  return _cache?.status === 'active'
}

export function getSubscriptionCache(): SubscriptionStatus | null {
  return _cache
}

export function clearSubscriptionCache(): void {
  _cache = null
}
