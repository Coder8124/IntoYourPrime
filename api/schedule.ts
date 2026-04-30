import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import { verifyAndGate, trackUsage } from './lib/subscriptionGate'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndGate(req.headers.authorization)
  if (gate.error) return res.status(gate.error.status).json({ error: gate.error.message })

  const { recentSessions, fitnessLevel } = req.body as {
    recentSessions: { date: string; exercises: string[]; durationMinutes: number; avgRiskScore: number }[]
    fitnessLevel?: string
  }

  if (!recentSessions) return res.status(400).json({ error: 'recentSessions required' })

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a fitness scheduling assistant. Return valid JSON only, no markdown.' },
        {
          role: 'user',
          content: `Based on this user's recent sessions, suggest what they should train today.\n\nRecent sessions:\n${JSON.stringify(recentSessions)}\n\nFitness level: ${fitnessLevel ?? 'intermediate'}\n\nReturn JSON:\n{"recommendation":"1-2 sentence suggestion","suggestedFocus":"muscle group or workout type","reason":"brief reason based on their history","restDay":boolean}`,
        },
      ],
      max_tokens: 150,
    })

    const { prompt_tokens = 0, completion_tokens = 0 } = response.usage ?? {}
    await trackUsage(gate.uid, 'gpt-4o-mini', prompt_tokens, completion_tokens)

    const content = response.choices[0].message.content ?? '{}'
    return res.status(200).json(JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim()))
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
