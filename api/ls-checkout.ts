import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminAuth } from './lib/adminFirestore'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { uid, email } = req.body as { uid?: string; email?: string }
  if (!uid || !email) return res.status(400).json({ error: 'uid and email required' })

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7))
    if (decoded.uid !== uid) return res.status(403).json({ error: 'Forbidden' })
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const appUrl = process.env.APP_URL ?? 'https://intoyourprime.vercel.app'

  const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      Accept:         'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization:  `Bearer ${process.env.LS_API_KEY}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email,
            custom: { uid },
          },
          product_options: {
            redirect_url: `${appUrl}/profile?pro=success`,
          },
        },
        relationships: {
          store:   { data: { type: 'stores',   id: process.env.LS_STORE_ID } },
          variant: { data: { type: 'variants', id: process.env.LS_VARIANT_ID } },
        },
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return res.status(502).json({ error: 'Checkout creation failed', detail: text })
  }

  const json = await response.json() as { data?: { attributes?: { url?: string } } }
  const checkoutUrl = json.data?.attributes?.url
  if (!checkoutUrl) return res.status(502).json({ error: 'No checkout URL returned' })

  return res.status(200).json({ checkoutUrl })
}
