import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import { verifyAndGate, trackUsage } from './lib/subscriptionGate'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndGate(req, res, 'gpt-4o')
  if (!gate) return

  const { messages, workoutContext } = req.body as {
    messages: { role: 'user' | 'assistant'; content: string }[]
    workoutContext?: string
  }

  if (!messages?.length) return res.status(400).json({ error: 'messages required' })
  if (messages.length > 40)  return res.status(400).json({ error: 'too many messages' })

  const system = [
    'You are a personal fitness trainer inside the IntoYourPrime app.',
    'Give concise, practical, evidence-based advice.',
    'Keep responses to 1–4 sentences unless the user explicitly asks for more detail.',
    'When referencing exercises use these names: squat, pushup, deadlift, bicepcurl, shoulderpress, lunge, plank, etc.',
    workoutContext ? `\nUser's recent workout history (last 7 days):\n${workoutContext}` : '',
  ].filter(Boolean).join('\n')

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: 400,
    })
    const { prompt_tokens, completion_tokens } = response.usage!
    await trackUsage(gate.uid, 'gpt-4o', prompt_tokens, completion_tokens)
    return res.status(200).json({ reply: response.choices[0].message.content ?? '' })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
