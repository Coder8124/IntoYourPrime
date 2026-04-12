import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import type { Session, UserProfile } from '../src/types/index.js'

// ── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { session, userProfile } = req.body as {
    session:     Partial<Session>
    userProfile: UserProfile
  }

  if (!session || !userProfile) {
    return res.status(400).json({ error: 'Missing required fields: session, userProfile' })
  }

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 10_000)

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const completion = await openai.chat.completions.create(
      {
        model:      'gpt-4o',
        max_tokens: 600,
        messages: [
          {
            role:    'system',
            content: 'You are an expert personal trainer. Generate targeted cooldown exercises ' +
                     'based on the workout session. Always respond with valid JSON only — no prose, no markdown.',
          },
          {
            role:    'user',
            content: `Session summary: ${JSON.stringify(session)}\n` +
                     `User profile: ${JSON.stringify(userProfile)}\n\n` +
                     `Return a JSON array of 4-6 cooldown exercises targeting the muscles used:\n` +
                     `[{\n` +
                     `  "name": string,\n` +
                     `  "duration": number (seconds),\n` +
                     `  "targetMuscles": string[],\n` +
                     `  "instructions": string (1-2 sentences),\n` +
                     `  "priority": "high" | "medium" | "low"\n` +
                     `}]`,
          },
        ],
      },
      { signal: controller.signal },
    )

    clearTimeout(timeout)

    const raw     = completion.choices[0]?.message?.content ?? ''
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed  = JSON.parse(cleaned)

    return res.status(200).json(parsed)

  } catch (err) {
    clearTimeout(timeout)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}
