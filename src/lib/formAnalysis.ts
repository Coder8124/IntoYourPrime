/**
 * formAnalysis.ts — client-side AI calls
 *
 * analyzeForm        → OpenAI gpt-4o  (vision, needs VITE_OPENAI_API_KEY)
 * generateCooldown   → Anthropic Claude (needs VITE_ANTHROPIC_API_KEY)
 * generateRecoveryInsight → Anthropic Claude (needs VITE_ANTHROPIC_API_KEY)
 *
 * Both SDKs run in-browser with dangerouslyAllowBrowser: true.
 * Keys live in .env as VITE_* so Vite inlines them at build time.
 */

import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import type { FormAnalysisResult, CooldownExercise, Session, DailyLog, UserProfile } from '../types/index'

// ── SDK instances (lazy so missing keys don't crash on import) ─────────────

let _openai: OpenAI | null = null
let _anthropic: Anthropic | null = null

function openaiClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY ?? '',
      dangerouslyAllowBrowser: true,
    })
  }
  return _openai
}

function anthropicClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY ?? '',
      dangerouslyAllowBrowser: true,
    })
  }
  return _anthropic
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface AnalyzeParams {
  frames:      string[]    // base64 data URLs (jpeg)
  exercise:    string
  repCount:    number
  userProfile: { age: number; weight: number; fitnessLevel: string }
  phase:       'warmup' | 'main'
}

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_FORM_RESULT: FormAnalysisResult = {
  riskScore:        0,
  suggestions:      [],
  safetyConcerns:   [],
  repCountEstimate: 0,
  dominantIssue:    null,
  warmupQuality:    null,
}

// ── Helpers ────────────────────────────────────────────────────────────────

function stripJsonFences(raw: string): string {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── analyzeForm — OpenAI gpt-4o vision ────────────────────────────────────

export async function analyzeForm(params: AnalyzeParams): Promise<FormAnalysisResult> {
  const attempt = async (): Promise<FormAnalysisResult> => {
    const imageBlocks: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
      params.frames.map(frame => ({
        type:      'image_url' as const,
        image_url: { url: frame, detail: 'low' as const },
      }))

    const textBlock: OpenAI.Chat.Completions.ChatCompletionContentPart = {
      type: 'text',
      text:
        `Exercise: ${params.exercise}. Phase: ${params.phase}. ` +
        `Rep count so far: ${params.repCount}. ` +
        `User: ${params.userProfile.age}yo, ${params.userProfile.weight}kg, ` +
        `fitness level: ${params.userProfile.fitnessLevel}.\n\n` +
        `Analyze the form across these frames and respond with exactly this JSON:\n` +
        `{\n` +
        `  "riskScore": number 0-100,\n` +
        `  "suggestions": string[] (2-3 actionable cues, present tense),\n` +
        `  "safetyConcerns": string[] (empty if none),\n` +
        `  "repCountEstimate": number,\n` +
        `  "dominantIssue": string | null,\n` +
        `  "warmupQuality": number | null (0-100 if warmup phase, else null)\n` +
        `}`,
    }

    const completion = await openaiClient().chat.completions.create({
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
    })

    const raw  = completion.choices[0]?.message?.content ?? ''
    return JSON.parse(stripJsonFences(raw)) as FormAnalysisResult
  }

  // First attempt
  try {
    return await attempt()
  } catch {
    await sleep(500)
  }

  // One retry
  try {
    return await attempt()
  } catch {
    return { ...DEFAULT_FORM_RESULT, repCountEstimate: params.repCount }
  }
}

// ── generateCooldown — Anthropic Claude ───────────────────────────────────

export async function generateCooldown(
  session:     Partial<Session>,
  userProfile: UserProfile,
): Promise<CooldownExercise[]> {
  try {
    const response = await anthropicClient().messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system:
        'You are an expert personal trainer. Generate targeted cooldown exercises ' +
        'based on the workout session. Always respond with valid JSON only — no prose, no markdown.',
      messages: [
        {
          role:    'user',
          content:
            `Session: ${JSON.stringify(session)}\n` +
            `User: ${JSON.stringify(userProfile)}\n\n` +
            `Return a JSON array of 4-6 cooldown exercises:\n` +
            `[{\n` +
            `  "name": string,\n` +
            `  "durationSeconds": number,\n` +
            `  "targetMuscles": string[],\n` +
            `  "instruction": string\n` +
            `}]`,
        },
      ],
    })

    const block = response.content[0]
    if (block.type !== 'text') return []
    return JSON.parse(stripJsonFences(block.text)) as CooldownExercise[]
  } catch {
    return []
  }
}

// ── generateRecoveryInsight — Anthropic Claude ────────────────────────────

export async function generateRecoveryInsight(context: {
  sessions: Session[]
  logs:     DailyLog[]
}): Promise<string> {
  try {
    const response = await anthropicClient().messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system:
        'You are a sports recovery specialist. Analyze training patterns ' +
        'and return a 2-3 sentence plain-English insight. No JSON, just plain text.',
      messages: [
        {
          role:    'user',
          content:
            `Sessions: ${JSON.stringify(context.sessions)}\n` +
            `Recovery logs: ${JSON.stringify(context.logs)}`,
        },
      ],
    })

    const block = response.content[0]
    return block.type === 'text' ? block.text : ''
  } catch {
    return ''
  }
}
