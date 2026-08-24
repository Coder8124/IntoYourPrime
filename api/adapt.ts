import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import { verifyAndGate, trackUsage } from './lib/subscriptionGate'

interface AdaptBody {
  band:            'deload' | 'moderate' | 'push'
  score:           number
  factors:         string[]
  riskyExercises:  string[]
  soreMuscles:     string[]
  freshMuscles:    string[]
  allowedExercises: string[]
  holdExercises:   string[]
  history:         string
  profile:         { age: number; weight: number; fitnessLevel: string }
}

export const ADAPT_SYSTEM =
  'You are a strength coach assembling ONE training session for today. ' +
  'You are given the athlete\'s readiness (a recovery score and band) and guardrails. ' +
  'Honor them strictly:\n' +
  '- band "deload": 3–4 low-intensity, low-skill exercises, lighter reps. Favor recovery/mobility and stable movements.\n' +
  '- band "moderate": 4–5 exercises at sensible volume.\n' +
  '- band "push": 5–6 exercises, full intensity.\n' +
  '- Avoid (or pick an easier substitute for) any exercise in riskyExercises.\n' +
  '- Avoid loading soreMuscles; prioritize freshMuscles.\n' +
  '- Use ONLY exercise ids from allowedExercises. Never invent ids.\n' +
  'Return ONLY JSON, no markdown:\n' +
  '{"name":string,"exercises":string[],"targetReps":number,"targetHoldSecs":number,"rationale":string}\n' +
  'name: short and motivating. targetReps: scale by band (deload ~8, moderate ~10, push ~12). ' +
  'targetHoldSecs: 30. rationale: ONE sentence tying the choice to the readiness signals.'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndGate(req.headers.authorization)
  if (gate.error) return res.status(gate.error.status).json({ error: gate.error.message })

  const b = req.body as AdaptBody
  if (!b?.band || !Array.isArray(b.allowedExercises) || !b.allowedExercises.length) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const model  = 'gpt-4o-mini'

    const userMsg = [
      `READINESS: ${b.score}/100 (band: ${b.band}). Signals: ${b.factors.join('; ') || 'none'}.`,
      `ATHLETE: ${b.profile.age}yo, ${b.profile.weight}kg, ${b.profile.fitnessLevel}.`,
      `RISKY EXERCISES (avoid/regress): ${b.riskyExercises.join(', ') || 'none'}.`,
      `SORE MUSCLES (ease off): ${b.soreMuscles.join(', ') || 'none'}.`,
      `FRESH MUSCLES (prioritize): ${b.freshMuscles.join(', ') || 'none'}.`,
      `HOLD-TYPE exercises (use targetHoldSecs): ${b.holdExercises.join(', ') || 'none'}.`,
      `RECENT HISTORY:\n${b.history || 'none'}`,
      `ALLOWED EXERCISE IDS: ${b.allowedExercises.join(', ')}`,
    ].join('\n')

    const completion = await openai.chat.completions.create({
      model,
      max_tokens: 400,
      messages: [
        { role: 'system', content: ADAPT_SYSTEM },
        { role: 'user',   content: userMsg },
      ],
    })

    const { prompt_tokens = 0, completion_tokens = 0 } = completion.usage ?? {}
    await trackUsage(gate.uid, model, prompt_tokens, completion_tokens)

    const raw     = completion.choices[0]?.message?.content ?? ''
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    return res.status(200).json(JSON.parse(cleaned))
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
