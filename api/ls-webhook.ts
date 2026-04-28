import { createHmac, timingSafeEqual } from 'crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { FieldValue, adminDb } from './lib/adminFirestore'

export const config = { api: { bodyParser: false } }

async function readRawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf-8')
}

function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.LS_WEBHOOK_SECRET!
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
  } catch {
    return false
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody   = await readRawBody(req)
  const signature = req.headers['x-signature'] as string | undefined

  if (!signature || !verifySignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const eventName = (event.meta as Record<string, unknown>)?.event_name as string
  const uid = (
    (event.meta as Record<string, unknown>)?.custom_data as Record<string, unknown>
  )?.uid as string | undefined

  if (!uid) return res.status(400).json({ error: 'Missing uid in custom_data' })

  const attrs = (
    (event.data as Record<string, unknown>)?.attributes as Record<string, unknown>
  ) ?? {}

  const lsSubscriptionId = String((event.data as Record<string, unknown>)?.id ?? '')
  const lsCustomerId     = String(attrs.customer_id ?? '')
  const renewsAt         = attrs.renews_at as string | null

  const statusMap: Record<string, string> = {
    subscription_created:   'active',
    subscription_updated:   'active',
    subscription_cancelled: 'cancelled',
    subscription_expired:   'expired',
  }

  const status = statusMap[eventName]
  if (!status) return res.status(200).json({ ignored: true })

  await adminDb.doc(`users/${uid}/subscription`).set(
    {
      status,
      lsSubscriptionId,
      lsCustomerId,
      currentPeriodEnd: renewsAt ? new Date(renewsAt) : FieldValue.delete(),
      updatedAt:        FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  return res.status(200).json({ ok: true })
}
