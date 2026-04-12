/**
 * formAnalysis.ts — client-side AI calls via OpenAI SDK
 *
 * Key priority: user-saved key in localStorage > VITE_OPENAI_API_KEY env var
 * SDK runs in-browser with dangerouslyAllowBrowser: true.
 */

import OpenAI from 'openai'
import type { FormAnalysisResult, CooldownExercise, Session, DailyLog, UserProfile } from '../types/index'

// ── Key resolution ─────────────────────────────────────────────────────────

function getApiKey(): string {
  try {
    const stored = localStorage.getItem('formAI_openai_key')?.trim()
    if (stored) return stored
  } catch { /* localStorage unavailable */ }
  return import.meta.env.VITE_OPENAI_API_KEY ?? ''
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0
}

// ── SDK instance (lazy, invalidated when key changes) ─────────────────────

let _openai:    OpenAI | null = null
let _activeKey: string        = ''

function client(): OpenAI | null {
  const key = getApiKey()
  if (!key) return null
  if (!_openai || _activeKey !== key) {
    _activeKey = key
    _openai = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true })
  }
  return _openai
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface AnalyzeParams {
  frames:      string[]
  exercise:    string
  repCount?:   number
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

// ── analyzeForm ────────────────────────────────────────────────────────────

export async function analyzeForm(params: AnalyzeParams): Promise<FormAnalysisResult> {
  const c = client()
  if (!c) return { ...DEFAULT_FORM_RESULT }

  const attempt = async (): Promise<FormAnalysisResult> => {
    const imageBlocks: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
      params.frames.map(frame => ({
        type:      'image_url' as const,
        image_url: { url: frame, detail: 'auto' as const },
      }))

    const exerciseGuides: Record<string, string> = {
      pushup:        'Check: elbows near body (not flared wide), body straight head-to-heel (no hip sag or pike), chest nearly touching floor at bottom, head neutral.',
      squat:         'Check: knees tracking over toes (not caving in), thighs reach parallel or below, heels flat on floor, chest up with neutral spine.',
      deadlift:      'Check: flat/neutral back throughout (NO rounding — highest risk), bar close to legs, hips hinge properly, head neutral.',
      lunge:         'Check: front knee stays over ankle (not past toes), torso upright, back knee lowers toward floor, knee not caving inward.',
      shoulderpress: 'Check: no excessive lower back arch, elbows at ~90° at start, full lockout overhead, core braced.',
      curlup:        'Check: chin tucked (not yanked forward), hands behind head (not pulling neck), lower back stays flat on floor, core doing the work not hip flexors.',
      bicepcurl:     'Check: elbows pinned at sides (not swinging forward), full extension at bottom, squeeze at top, no body sway or momentum.',
    }
    const guide = exerciseGuides[params.exercise.toLowerCase()] ?? 'Check overall posture, alignment, and safe range of motion.'

    const repInfo = params.repCount != null ? ` Rep count so far: ${params.repCount}.` : ''

    const textBlock: OpenAI.Chat.Completions.ChatCompletionContentPart = {
      type: 'text',
      text:
        `Exercise: ${params.exercise.toUpperCase()}. Phase: ${params.phase}.${repInfo} ` +
        `Athlete: ${params.userProfile.age}yo, ${params.userProfile.weight}kg, level: ${params.userProfile.fitnessLevel}.\n\n` +
        `${guide}\n\n` +
        `Look at the images and judge the form visually. ` +
        `riskScore should reflect real risk: good form = 0-25, minor issues = 26-55, bad form = 56-79, dangerous = 80-100. ` +
        `Do NOT default to low scores — if form is off, say so.\n\n` +
        `Respond with exactly this JSON (no markdown, no prose):\n` +
        `{\n` +
        `  "riskScore": number 0-100,\n` +
        `  "suggestions": string[] (2-3 specific cues about what you actually see, present tense),\n` +
        `  "safetyConcerns": string[] (empty array if none),\n` +
        `  "dominantIssue": string | null,\n` +
        `  "warmupQuality": number | null (0-100 if warmup phase, else null)\n` +
        `}`,
    }

    const completion = await c.chat.completions.create({
      model:      'gpt-4o-mini',
      max_tokens: 400,
      messages: [
        {
          role:    'system',
          content:
            'You are an expert personal trainer. You are shown frames from a live workout. ' +
            'Judge exercise form purely from what you see in the images. ' +
            'Give honest, specific feedback — reference what you actually observe. ' +
            'Never give vague generic advice. Respond with valid JSON only.',
        },
        {
          role:    'user',
          content: [...imageBlocks, textBlock],
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content ?? ''
    return JSON.parse(stripJsonFences(raw)) as FormAnalysisResult
  }

  try { return await attempt() } catch { await sleep(500) }
  try { return await attempt() } catch { return { ...DEFAULT_FORM_RESULT } }
}

// ── generateCooldown ───────────────────────────────────────────────────────

export async function generateCooldown(
  session:     Partial<Session>,
  userProfile: UserProfile,
): Promise<CooldownExercise[]> {
  const c = client()
  if (!c) return []
  try {
    const completion = await c.chat.completions.create({
      model:      'gpt-4o-mini',
      max_tokens: 600,
      messages: [
        {
          role:    'system',
          content: 'You are an expert personal trainer. Generate targeted cooldown exercises ' +
                   'based on the workout session. Always respond with valid JSON only — no prose, no markdown.',
        },
        {
          role:    'user',
          content:
            `Session: ${JSON.stringify(session)}\nUser: ${JSON.stringify(userProfile)}\n\n` +
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
    const raw = completion.choices[0]?.message?.content ?? ''
    return JSON.parse(stripJsonFences(raw)) as CooldownExercise[]
  } catch {
    return []
  }
}

// ── generateRecoveryInsight ────────────────────────────────────────────────

export async function generateRecoveryInsight(context: {
  sessions: Session[]
  logs:     DailyLog[]
}): Promise<string> {
  const c = client()
  if (!c) return ''
  try {
    const completion = await c.chat.completions.create({
      model:      'gpt-4o-mini',
      max_tokens: 200,
      messages: [
        {
          role:    'system',
          content: 'You are a sports recovery specialist. Analyze training patterns ' +
                   'and return a 2-3 sentence plain-English insight. No JSON, just plain text.',
        },
        {
          role:    'user',
          content: `Sessions: ${JSON.stringify(context.sessions)}\nRecovery logs: ${JSON.stringify(context.logs)}`,
        },
      ],
    })
    return completion.choices[0]?.message?.content ?? ''
  } catch {
    return ''
  }
}
