import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import type { Session, DailyLog } from '../src/types/index.js'
import { verifyAndGate, trackUsage } from './lib/subscriptionGate'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndGate(req.headers.authorization)
  if (gate.error) return res.status(gate.error.status).json({ error: gate.error.message })

  const { sessions, logs } = req.body as { sessions: Session[]; logs: DailyLog[] }
  if (!sessions || !logs) return res.status(400).json({ error: 'Missing required fields' })

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 10_000)

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const model  = 'gpt-4o-mini'

    const completion = await openai.chat.completions.create(
      {
        model,
        max_tokens: 200,
        messages: [
          { role: 'system', content: 'You are a sports recovery specialist. Return a 2-3 sentence plain-English insight. No JSON, just plain text.' },
          { role: 'user',   content: `Sessions: ${JSON.stringify(sessions)}\nLogs: ${JSON.stringify(logs)}` },
        ],
      },
      { signal: controller.signal },
    )
    clearTimeout(timeout)

    const { prompt_tokens = 0, completion_tokens = 0 } = completion.usage ?? {}
    await trackUsage(gate.uid, model, prompt_tokens, completion_tokens)

    return res.status(200).json({ insight: completion.choices[0]?.message?.content ?? '' })
  } catch (err) {
    clearTimeout(timeout)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
