/**
 * formAnalysis.ts — client-side AI calls (all via OpenAI)
 *
 * analyzeForm          → gpt-4o vision (VITE_OPENAI_API_KEY)
 * generateCooldown     → gpt-4o-mini   (VITE_OPENAI_API_KEY)
 * generateRecoveryInsight → gpt-4o-mini (VITE_OPENAI_API_KEY)
 */

import OpenAI from 'openai'
import type { FormAnalysisResult, CooldownExercise, Session, DailyLog, UserProfile } from '../types/index'

// ── SDK instance (lazy) ────────────────────────────────────────────────────

let _openai: OpenAI | null = null

function client(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY ?? '',
      dangerouslyAllowBrowser: true,
    })
  }
  return _openai
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface Landmark {
  x: number
  y: number
  z: number
  visibility?: number
}

export interface AnalyzeParams {
  frames:      string[]    // base64 data URLs (jpeg)
  exercise:    string
  repCount:    number
  userProfile: { age: number; weight: number; fitnessLevel: string }
  phase:       'warmup' | 'main'
  landmarks?:  Landmark[]  // MediaPipe pose landmarks (33 points)
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

// ── Joint angle computation ────────────────────────────────────────────────
// MediaPipe landmark indices
// 11=L shoulder, 12=R shoulder, 13=L elbow, 14=R elbow
// 15=L wrist, 16=R wrist, 23=L hip, 24=R hip
// 25=L knee, 26=R knee, 27=L ankle, 28=R ankle, 0=nose

function angleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const ab = { x: a.x - b.x, y: a.y - b.y }
  const cb = { x: c.x - b.x, y: c.y - b.y }
  const dot = ab.x * cb.x + ab.y * cb.y
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2)
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2)
  if (magAB === 0 || magCB === 0) return 0
  return Math.round(Math.acos(Math.max(-1, Math.min(1, dot / (magAB * magCB)))) * (180 / Math.PI))
}

function visible(lm: Landmark, threshold = 0.5): boolean {
  return (lm.visibility ?? 0) >= threshold
}

function computeJointAngles(lms: Landmark[], exercise: string): string {
  if (lms.length < 29) return ''

  const lines: string[] = []

  // Always compute if visible
  const lShoulder = lms[11], rShoulder = lms[12]
  const lElbow    = lms[13], rElbow    = lms[14]
  const lWrist    = lms[15], rWrist    = lms[16]
  const lHip      = lms[23], rHip      = lms[24]
  const lKnee     = lms[25], rKnee     = lms[26]
  const lAnkle    = lms[27], rAnkle    = lms[28]

  const ex = exercise.toLowerCase()

  if (ex === 'pushup') {
    if (visible(lShoulder) && visible(lElbow) && visible(lWrist))
      lines.push(`Left elbow angle: ${angleDeg(lShoulder, lElbow, lWrist)}° (ideal ~90° at bottom)`)
    if (visible(rShoulder) && visible(rElbow) && visible(rWrist))
      lines.push(`Right elbow angle: ${angleDeg(rShoulder, rElbow, rWrist)}° (ideal ~90° at bottom)`)
    if (visible(lShoulder) && visible(lHip) && visible(lKnee))
      lines.push(`Left body line (shoulder-hip-knee): ${angleDeg(lShoulder, lHip, lKnee)}° (ideal ~180° = straight back)`)
    if (visible(rShoulder) && visible(rHip) && visible(rKnee))
      lines.push(`Right body line: ${angleDeg(rShoulder, rHip, rKnee)}° (ideal ~180° = straight back)`)
    // Hip height relative to shoulder — detect sag/pike
    const hipY = (lHip.y + rHip.y) / 2
    const shoulderY = (lShoulder.y + rShoulder.y) / 2
    const diff = Math.round((hipY - shoulderY) * 100)
    lines.push(`Hip-to-shoulder offset (positive = hips low/sagging, negative = hips high/piked): ${diff}`)
  }

  else if (ex === 'squat') {
    if (visible(lHip) && visible(lKnee) && visible(lAnkle))
      lines.push(`Left knee angle: ${angleDeg(lHip, lKnee, lAnkle)}° (ideal ~90° at bottom)`)
    if (visible(rHip) && visible(rKnee) && visible(rAnkle))
      lines.push(`Right knee angle: ${angleDeg(rHip, rKnee, rAnkle)}° (ideal ~90° at bottom)`)
    if (visible(lShoulder) && visible(lHip) && visible(lKnee))
      lines.push(`Left torso angle (shoulder-hip-knee): ${angleDeg(lShoulder, lHip, lKnee)}° (ideal ~90–100° at bottom)`)
    // Knee tracking: compare knee x vs ankle x
    if (visible(lKnee) && visible(lAnkle))
      lines.push(`Left knee-over-ankle offset: ${Math.round((lKnee.x - lAnkle.x) * 100)} (should be near 0, large = knee caving/flaring)`)
    if (visible(rKnee) && visible(rAnkle))
      lines.push(`Right knee-over-ankle offset: ${Math.round((rKnee.x - rAnkle.x) * 100)}`)
  }

  else if (ex === 'deadlift') {
    if (visible(lShoulder) && visible(lHip) && visible(lKnee))
      lines.push(`Left hip hinge (shoulder-hip-knee): ${angleDeg(lShoulder, lHip, lKnee)}°`)
    if (visible(lHip) && visible(lKnee) && visible(lAnkle))
      lines.push(`Left knee bend: ${angleDeg(lHip, lKnee, lAnkle)}°`)
    // Back roundness: vertical alignment of shoulders and hips
    const backAngle = Math.round(Math.atan2(
      (rShoulder.y - rHip.y), (rShoulder.x - rHip.x)
    ) * (180 / Math.PI))
    if (visible(rShoulder) && visible(rHip))
      lines.push(`Back angle from horizontal: ${backAngle}° (near 0° = flat back, large = rounded)`)
  }

  else if (ex === 'lunge') {
    if (visible(lHip) && visible(lKnee) && visible(lAnkle))
      lines.push(`Front leg knee angle: ${angleDeg(lHip, lKnee, lAnkle)}° (ideal ~90°)`)
    if (visible(rHip) && visible(rKnee) && visible(rAnkle))
      lines.push(`Back leg knee angle: ${angleDeg(rHip, rKnee, rAnkle)}° (back knee near floor = ~90°)`)
    if (visible(lShoulder) && visible(lHip) && visible(lKnee))
      lines.push(`Torso upright angle: ${angleDeg(lShoulder, lHip, lKnee)}°`)
  }

  else if (ex === 'shoulderpress') {
    if (visible(lShoulder) && visible(lElbow) && visible(lWrist))
      lines.push(`Left elbow angle: ${angleDeg(lShoulder, lElbow, lWrist)}°`)
    if (visible(rShoulder) && visible(rElbow) && visible(rWrist))
      lines.push(`Right elbow angle: ${angleDeg(rShoulder, rElbow, rWrist)}°`)
    if (visible(lShoulder) && visible(lHip) && visible(lKnee))
      lines.push(`Core stability (shoulder-hip-knee): ${angleDeg(lShoulder, lHip, lKnee)}° (ideal ~180° = no lean-back)`)
  }

  return lines.length ? `\nComputed joint angles from pose data:\n${lines.map(l => `  • ${l}`).join('\n')}` : ''
}

// ── Exercise-specific form rubrics ────────────────────────────────────────

const FORM_RUBRICS: Record<string, string> = {
  pushup: `
PUSHUP form criteria to evaluate:
1. Elbow angle: should reach ~90° at the bottom (elbows close to body, not flared wide)
2. Body alignment: straight line from head to heels — penalize sagging hips (lower back drops) or piked hips (raised)
3. Depth: chest should nearly touch the floor at the bottom
4. Head position: neutral, not dropping or craning up
5. Wrist alignment: directly under shoulders
Risk triggers: elbows > 120° at bottom (not going deep enough), hip sag, head dropping, elbows flaring past 45° from torso`,

  squat: `
SQUAT form criteria to evaluate:
1. Depth: thighs should reach parallel or below (knee angle ~90° at bottom)
2. Knee tracking: knees should follow toes, not cave inward (valgus)
3. Back angle: neutral spine, chest up — penalize forward lean or rounding
4. Heel contact: heels must stay flat on floor
5. Hip crease below knee depth at bottom
Risk triggers: knee valgus, heels lifting, severe forward lean, only quarter-squatting`,

  deadlift: `
DEADLIFT form criteria to evaluate:
1. Back: neutral/flat spine throughout — NO rounding of lower back
2. Hip hinge: hinge from hips not waist; bar stays close to legs
3. Knees: slight bend at start, not excessive
4. Head: neutral, eyes forward, not looking up or down
5. Shoulder position: directly over or slightly in front of bar at start
Risk triggers: any lower back rounding (HIGH risk), bar drifting away from legs, hyperextending at lockout`,

  lunge: `
LUNGE form criteria to evaluate:
1. Front knee angle: ~90° at bottom, knee directly over ankle (not past toes)
2. Back knee: should lower toward but not slam the floor
3. Torso: upright, not leaning forward
4. Front knee: tracks over toes, not caving inward
5. Step width: wide enough for balance
Risk triggers: front knee past toes, knee valgus, excessive forward lean, wobbly balance`,

  shoulderpress: `
SHOULDER PRESS form criteria to evaluate:
1. Elbow start position: ~90°, upper arms parallel to floor at start
2. Lock-out: arms fully extended overhead without hyperextending elbows
3. Core bracing: no excessive lean-back (arching lower back to press)
4. Wrist: neutral, not bent back
5. Bar path: straight vertical line
Risk triggers: severe lower back arch (very common and dangerous), elbows too far forward at start`,
}

// ── analyzeForm — gpt-4o vision ───────────────────────────────────────────

export async function analyzeForm(params: AnalyzeParams): Promise<FormAnalysisResult> {
  const rubric = FORM_RUBRICS[params.exercise.toLowerCase()] ?? ''
  const jointData = params.landmarks ? computeJointAngles(params.landmarks, params.exercise) : ''

  const attempt = async (): Promise<FormAnalysisResult> => {
    const imageBlocks: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
      params.frames.map(frame => ({
        type:      'image_url' as const,
        image_url: { url: frame, detail: 'auto' as const },
      }))

    const textBlock: OpenAI.Chat.Completions.ChatCompletionContentPart = {
      type: 'text',
      text:
        `Exercise: ${params.exercise.toUpperCase()}. Phase: ${params.phase}. ` +
        `Reps completed so far: ${params.repCount}. ` +
        `Athlete: ${params.userProfile.age}yo, ${params.userProfile.weight}kg, ` +
        `level: ${params.userProfile.fitnessLevel}.\n` +
        rubric +
        jointData +
        `\n\nUsing the visual frames AND the joint angle data above, ` +
        `give a precise form assessment. The joint angles are computed from MediaPipe pose tracking — ` +
        `trust them alongside what you see visually.\n\n` +
        `Respond with exactly this JSON (no markdown, no prose):\n` +
        `{\n` +
        `  "riskScore": number 0-100 (0=perfect form/no risk, 100=immediate injury risk — be accurate, not always low),\n` +
        `  "suggestions": string[] (2-3 specific actionable cues referencing actual angles/positions you observed),\n` +
        `  "safetyConcerns": string[] (only real dangers, empty array if none — e.g. "Lower back is rounding under load"),\n` +
        `  "repCountEstimate": number,\n` +
        `  "dominantIssue": string | null (the single most important thing to fix right now, null if form is good),\n` +
        `  "warmupQuality": number | null (0-100 only if phase=warmup, else null)\n` +
        `}`,
    }

    const completion = await client().chat.completions.create({
      model:       'gpt-4o',
      max_tokens:  400,
      messages: [
        {
          role:    'system',
          content:
            'You are an elite personal trainer and sports physiologist. ' +
            'You receive video frames of someone exercising plus computed joint angles from pose tracking. ' +
            'Your job is to give accurate, exercise-specific form feedback. ' +
            'Be honest about risk — do not default to low scores if form is genuinely off. ' +
            'Reference specific body parts and angles in your suggestions. ' +
            'Respond with valid JSON only.',
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

  try {
    return await attempt()
  } catch {
    await sleep(500)
  }

  try {
    return await attempt()
  } catch {
    return { ...DEFAULT_FORM_RESULT, repCountEstimate: params.repCount }
  }
}

// ── generateCooldown — gpt-4o-mini ────────────────────────────────────────

export async function generateCooldown(
  session:     Partial<Session>,
  userProfile: UserProfile,
): Promise<CooldownExercise[]> {
  try {
    const completion = await client().chat.completions.create({
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

    const raw = completion.choices[0]?.message?.content ?? ''
    return JSON.parse(stripJsonFences(raw)) as CooldownExercise[]
  } catch {
    return []
  }
}

// ── generateRecoveryInsight — gpt-4o-mini ─────────────────────────────────

export async function generateRecoveryInsight(context: {
  sessions: Session[]
  logs:     DailyLog[]
}): Promise<string> {
  try {
    const completion = await client().chat.completions.create({
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
          content:
            `Sessions: ${JSON.stringify(context.sessions)}\n` +
            `Recovery logs: ${JSON.stringify(context.logs)}`,
        },
      ],
    })

    return completion.choices[0]?.message?.content ?? ''
  } catch {
    return ''
  }
}
