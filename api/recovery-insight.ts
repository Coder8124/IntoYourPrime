import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import type { Session, DailyLog } from '../src/types/index.js'

// ── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { sessions, logs } = req.body as {
    sessions: Session[]
    logs:     DailyLog[]
  }

  if (!sessions || !logs) {
    return res.status(400).json({ error: 'Missing required fields: sessions, logs' })
  }

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 10_000)

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const completion = await openai.chat.completions.create(
      {
        model:      'gpt-4o',
        max_tokens: 200,
        messages: [
          {
            role:    'system',
            content: 'You are a sports recovery specialist. Analyze training patterns ' +
                     'and return a 2-3 sentence plain-English insight. No JSON, just plain text.',
          },
          {
            role:    'user',
            content: `Sessions: ${JSON.stringify(sessions)}\nRecovery logs: ${JSON.stringify(logs)}`,
          },
        ],
      },
      { signal: controller.signal },
    )

    clearTimeout(timeout)

    const insight = completion.choices[0]?.message?.content ?? ''
    return res.status(200).json({ insight })

  } catch (err) {
    clearTimeout(timeout)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}
