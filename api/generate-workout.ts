import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import { verifyAndGate, trackUsage } from './lib/subscriptionGate'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndGate(req.headers.authorization)
  if (gate.error) return res.status(gate.error.status).json({ error: gate.error.message })

  const { goals, daysPerWeek, userProfile } = req.body as {
    goals:       string
    daysPerWeek: number
    userProfile: { age: number; weight: number; fitnessLevel: string }
  }

  if (!goals || !daysPerWeek || !userProfile) {
    return res.status(400).json({ error: 'goals, daysPerWeek, and userProfile are required' })
  }

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 20_000)

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const model  = 'gpt-4o-mini'

    const completion = await openai.chat.completions.create(
      {
        model,
        max_tokens: 1200,
        messages: [
          {
            role:    'system',
            content: 'You are an expert strength and conditioning coach. Generate structured workout programs. Respond with valid JSON only, no markdown.',
          },
          {
            role:    'user',
            content: [
              `Goals: ${goals}`,
              `Days per week: ${daysPerWeek}`,
              `Athlete: ${userProfile.age}yo, ${userProfile.weight}kg, ${userProfile.fitnessLevel}`,
              '',
              'Return a single JSON object:',
              '{',
              '  "id": "prog_<random 8 hex chars>",',
              '  "name": "string (short program name)",',
              '  "description": "string (1-2 sentence overview)",',
              `  "days": [ /* exactly ${daysPerWeek} day objects */`,
              '    {',
              '      "id": "day_<random 8 hex chars>",',
              '      "dayNumber": number,',
              '      "exercises": [',
              '        { "id": "ex_<random 8 hex chars>", "name": "string", "sets": number, "reps": number, "notes": "string" }',
              '      ]',
              '    }',
              '  ]',
              '}',
              '',
              'Each day should have 4-6 exercises. Keep exercise names simple (e.g. "Squat", "Push-up", "Deadlift"). Notes should be a 1-sentence coaching cue.',
            ].join('\n'),
          },
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
