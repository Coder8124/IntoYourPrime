import { adminAuth, adminDb, FieldValue } from './adminFirestore'

export const CAP_USD = 8.50

const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'gpt-4o':      { input: 5.00 / 1_000_000, output: 15.00 / 1_000_000 },
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? PRICING['gpt-4o-mini']
  return p.input * inputTokens + p.output * outputTokens
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7) // YYYY-MM
}

export type GateResult =
  | { uid: string; error: null }
  | { uid: null; error: { status: number; message: string } }

export async function verifyAndGate(authHeader: string | undefined): Promise<GateResult> {
  if (!authHeader?.startsWith('Bearer ')) {
    return { uid: null, error: { status: 401, message: 'Missing Authorization header' } }
  }

  let uid: string
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7))
    uid = decoded.uid
  } catch {
    return { uid: null, error: { status: 401, message: 'Invalid ID token' } }
  }

  const subSnap = await adminDb.doc(`users/${uid}/subscription`).get()
  if (subSnap.data()?.status !== 'active') {
    return { uid: null, error: { status: 403, message: 'No active subscription' } }
  }

  const month     = currentMonth()
  const usageSnap = await adminDb.doc(`users/${uid}/usage/${month}`).get()
  const spendUsd  = (usageSnap.data()?.spendUsd as number) ?? 0
  if (spendUsd >= CAP_USD) {
    return { uid: null, error: { status: 429, message: 'monthly_limit_reached' } }
  }

  return { uid, error: null }
}

export async function trackUsage(
  uid: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const cost  = calcCost(model, inputTokens, outputTokens)
  const month = currentMonth()
  await adminDb.doc(`users/${uid}/usage/${month}`).set(
    {
      spendUsd:   FieldValue.increment(cost),
      callCount:  FieldValue.increment(1),
      updatedAt:  FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}
