import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminAuth, adminDb } from './lib/adminFirestore'
import { CAP_USD } from './lib/subscriptionGate'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const uid = req.query.uid as string | undefined
  if (!uid) return res.status(400).json({ error: 'uid required' })

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7))
    if (decoded.uid !== uid) return res.status(403).json({ error: 'Forbidden' })
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const month = new Date().toISOString().slice(0, 7)

  const [subSnap, usageSnap] = await Promise.all([
    adminDb.doc(`users/${uid}/subscription`).get(),
    adminDb.doc(`users/${uid}/usage/${month}`).get(),
  ])

  const sub      = subSnap.data()
  const usage    = usageSnap.data()
  const spendUsd = (usage?.spendUsd as number) ?? 0
  const usagePct = Math.min(100, Math.round((spendUsd / CAP_USD) * 100))

  const periodEnd = sub?.currentPeriodEnd
  const currentPeriodEnd: string | null =
    periodEnd && typeof periodEnd.toDate === 'function'
      ? (periodEnd.toDate() as Date).toISOString()
      : typeof periodEnd === 'string'
      ? periodEnd
      : null

  return res.status(200).json({
    status:           (sub?.status as string) ?? 'none',
    currentPeriodEnd,
    usagePct,
  })
}
