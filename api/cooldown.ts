import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import type { Session, UserProfile } from '../src/types/index.js'
import { verifyAndGate, trackUsage } from './lib/subscriptionGate'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndGate(req.headers.authorization)
  if (gate.error) return res.status(gate.error.status).json({ error: gate.error.message })

  const { session, userProfile } = req.body as { session: Partial<Session>; userProfile: UserProfile }
  if (!session || !userProfile) return res.status(400).json({ error: 'Missing required fields' })

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 10_000)

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const model  = 'gpt-4o-mini'

    const completion = await openai.chat.completions.create(
      {
        model,
        max_tokens: 600,
        messages: [
          { role: 'system', content: 'You are an expert personal trainer. Generate targeted cooldown exercises. Respond with valid JSON only.' },
          { role: 'user',   content: `Session: ${JSON.stringify(session)}\nUser: ${JSON.stringify(userProfile)}\n\nReturn JSON array of 4-6 cooldown exercises:\n[{"name":string,"durationSeconds":number,"targetMuscles":string[],"instruction":string}]` },
        ],
      },
      { signal: controller.signal },
    )
    clearTimeout(timeout)

    const { prompt_tokens = 0, completion_tokens = 0 } = completion.usage ?? {}
    await trackUsage(gate.uid, model, prompt_tokens, completion_tokens)

    const raw     = completion.choices[0]?.message?.content ?? ''
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    return res.status(200).json(JSON.parse(cleaned))
  } catch (err) {
    clearTimeout(timeout)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
