import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import { verifyAndGate, trackUsage } from './lib/subscriptionGate'

interface AnalyzeBody {
  frames:      string[]
  exercise:    string
  repCount:    number
  userProfile: { age: number; weight: number; fitnessLevel: string }
  phase:       'warmup' | 'main'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndGate(req.headers.authorization)
  if (gate.error) return res.status(gate.error.status).json({ error: gate.error.message })

  const { frames, exercise, repCount, userProfile, phase } = req.body as AnalyzeBody

  if (!frames?.length) return res.status(400).json({ error: 'frames required' })
  if (frames.length > 5) return res.status(400).json({ error: 'max 5 frames' })
  if (!exercise || repCount == null || !userProfile || !phase) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 10_000)

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const model  = 'gpt-4o'

    const imageDetail = exercise.toLowerCase().trim() === 'pushup' ? 'high' : 'low'
    const imageBlocks: OpenAI.Chat.Completions.ChatCompletionContentPart[] = frames.map(frame => ({
      type:      'image_url',
      image_url: { url: frame, detail: imageDetail },
    }))
    const textBlock: OpenAI.Chat.Completions.ChatCompletionContentPart = {
      type: 'text',
      text: `Exercise: ${exercise}. Phase: ${phase}. Client rep count: ${repCount}.\n` +
            `User: ${userProfile.age}yo, ${userProfile.weight}kg, fitness level: ${userProfile.fitnessLevel}.\n\n` +
            `Analyze form and respond with exactly this JSON:\n` +
            `{"riskScore":number,"suggestions":string[],"safetyConcerns":string[],"repCountEstimate":number,"dominantIssue":string|null,"warmupQuality":number|null}`,
    }

    const completion = await openai.chat.completions.create(
      { model, messages: [{ role: 'user', content: [...imageBlocks, textBlock] }] },
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
