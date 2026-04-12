import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'

// ── Types ──────────────────────────────────────────────────────────────────

interface AnalyzeBody {
  frames:      string[]
  exercise:    string
  repCount:    number
  userProfile: { age: number; weight: number; fitnessLevel: string }
  phase:       'warmup' | 'main'
}

// ── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { frames, exercise, repCount, userProfile, phase } = req.body as AnalyzeBody

  // ── Validation ────────────────────────────────────────────────────────
  if (!frames || frames.length === 0) {
    return res.status(400).json({ error: 'frames is required and must not be empty' })
  }
  if (frames.length > 5) {
    return res.status(400).json({ error: 'frames must contain 5 or fewer images' })
  }
  if (!exercise || repCount == null || !userProfile || !phase) {
    return res.status(400).json({ error: 'Missing required fields: exercise, repCount, userProfile, phase' })
  }

  // ── OpenAI request ────────────────────────────────────────────────────
  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 10_000)

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    // Build vision content blocks
    const imageDetail = exercise?.toLowerCase().trim() === 'pushup' ? 'high' : 'low'
    const imageBlocks: OpenAI.Chat.Completions.ChatCompletionContentPart[] = frames.map((frame) => ({
      type:      'image_url',
      image_url: { url: frame, detail: imageDetail },
    }))

    const textBlock: OpenAI.Chat.Completions.ChatCompletionContentPart = {
      type: 'text',
      text: `Exercise: ${exercise}. Phase: ${phase}. Client rep count (from pose tracking): ${repCount}. ` +
            `Treat this count as correct unless the frames clearly show a different number of completed reps.\n` +
            `User: ${userProfile.age}yo, ${userProfile.weight}kg, fitness level: ${userProfile.fitnessLevel}.\n\n` +
            `Analyze the form across these frames and respond with exactly this JSON structure:\n` +
            `{\n` +
            `  "riskScore": number between 0-100 (0=perfect form, 100=immediate injury risk),\n` +
            `  "suggestions": string[] (2-3 specific actionable cues, present tense, coach voice),\n` +
            `  "safetyConcerns": string[] (empty array if none, only list if genuinely dangerous),\n` +
            `  "repCountEstimate": number (your count of visible completed reps),\n` +
            `  "dominantIssue": string | null (single biggest form problem, null if form is good),\n` +
            `  "warmupQuality": number | null (0-100, only populate if phase is warmup, else null)\n` +
            `}`,
    }

    const completion = await openai.chat.completions.create(
      {
        model:    'gpt-4o',
        messages: [
          {
            role:    'system',
            content: 'You are an expert personal trainer and sports physiologist with 20 years of experience. ' +
                     'Analyze exercise form from the provided frames. Be specific, actionable, and safety-focused. ' +
                     'Always respond with valid JSON only — no prose, no markdown.',
          },
          {
            role:    'user',
            content: [...imageBlocks, textBlock],
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
