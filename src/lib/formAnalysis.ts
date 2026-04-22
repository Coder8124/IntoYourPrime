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

// ── OpenAI TTS ─────────────────────────────────────────────────────────────

let _ttsAudio: HTMLAudioElement | null = null

/** Stop any currently playing TTS audio immediately. */
export function cancelTTS(): void {
  if (_ttsAudio) {
    _ttsAudio.pause()
    _ttsAudio = null
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

/**
 * Speak text using OpenAI TTS (tts-1, alloy voice).
 * Falls back to Web Speech API if no API key is available.
 * Cancels any currently playing audio before starting a new one.
 */
export async function speakWithOpenAI(text: string): Promise<void> {
  const ai = client()
  if (!ai) {
    // Fallback to Web Speech API
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.rate = 0.92
      window.speechSynthesis.speak(utter)
    }
    return
  }

  // Stop any currently playing TTS
  if (_ttsAudio) {
    _ttsAudio.pause()
    _ttsAudio = null
  }

  try {
    const response = await ai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: text,
      response_format: 'mp3',
    })

    const arrayBuffer = await response.arrayBuffer()
    const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' })
    const url = URL.createObjectURL(blob)

    _ttsAudio = new Audio(url)
    _ttsAudio.onended = () => {
      URL.revokeObjectURL(url)
      _ttsAudio = null
    }
    await _ttsAudio.play()
  } catch {
    // Silently fail — TTS is non-critical
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface AnalyzeParams {
  frames:          string[]         // base64 data URLs (jpeg)
  exercise:        string
  repCount?:       number
  userProfile:     { age: number; weight: number; fitnessLevel: string }
  phase:           'warmup' | 'main'
  /** Optional reference photo taken at session start — tells the AI which person to focus on. */
  referenceFrame?: string | null
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
    // If a reference frame exists, prepend it with a label so the model knows who to track
    const imageBlocks: OpenAI.Chat.Completions.ChatCompletionContentPart[] = []

    if (params.referenceFrame) {
      imageBlocks.push({
        type: 'text',
        text: 'REFERENCE PHOTO — this is the athlete you must analyze throughout. If other people appear in later frames, ignore them.',
      })
      imageBlocks.push({
        type:      'image_url' as const,
        image_url: { url: params.referenceFrame, detail: 'auto' as const },
      })
      imageBlocks.push({
        type: 'text',
        text: 'WORKOUT FRAMES — analyze the form of the person above:',
      })
    }

    for (const frame of params.frames) {
      imageBlocks.push({
        type:      'image_url' as const,
        image_url: { url: frame, detail: 'high' as const },
      })
    }

    // Per-exercise coaching rubrics: what to look for, ranked by injury risk
    const exerciseGuides: Record<string, string> = {
      pushup: [
        'BODY ALIGNMENT (highest priority): body must form a straight line ear→shoulder→hip→ankle.',
        '  - Hip sag (hips drop below line) = lower back compression. Score 60+ if sagging.',
        '  - Hip pike (butt in the air) = avoiding the hard part, not engaging core. Score 40+.',
        'ELBOW POSITION: elbows should track at ~45° from torso, NOT flaring out wide (shoulder impingement risk).',
        'DEPTH: chest should nearly touch the floor at the bottom. Partial reps that stop halfway = score 35+.',
        'HEAD: neutral — eyes looking slightly ahead of hands, not drooping or craning up.',
      ].join('\n'),

      squat: [
        'KNEE TRACKING (highest priority): knees must travel in line with toes, NOT caving inward (valgus).',
        '  - Knee valgus = ACL/MCL injury risk. Score 65+ if knees are clearly caving.',
        'DEPTH: hip crease should reach at or below knee level (parallel). Stopping high = score 40+.',
        'SPINE: neutral curve throughout. No butt wink (lower back rounds at the bottom) — score 55+ if present.',
        'HEELS: must stay flat on the floor. Heels rising = ankle mobility issue, forward lean compensation.',
        'TORSO: upright. Excessive forward lean (chest toward knees) shifts load to lower back — score 45+.',
      ].join('\n'),

      deadlift: [
        '⚠️ SPINE (CRITICAL — highest injury risk in all of fitness):',
        '  - ANY lower back rounding (lumbar flexion under load) = score 75+. This causes disc herniation.',
        '  - Upper back rounding (thoracic) = score 55+.',
        '  - Flat/neutral back with natural lumbar curve = correct.',
        'HIP HINGE: hips should push back, not squat down. Bar stays close to legs throughout.',
        'LOCKOUT: at the top, stand fully upright — no hyperextension (leaning back), no soft knees.',
        'HEAD: neutral in line with spine. Do not crane neck up or let head drop.',
      ].join('\n'),

      lunge: [
        'FRONT KNEE: must stay directly over the ankle — not caving inward (valgus) and not shooting past toes.',
        '  - Knee past toes = patellar stress. Score 50+ if excessive.',
        '  - Knee valgus (caving in) = ACL risk. Score 65+ if present.',
        'TORSO: upright, not leaning forward over the front thigh. Lean = hip flexor strain, score 45+.',
        'BACK KNEE: lowers toward (not slamming into) the floor, hovering 1–2 inches off.',
        'STEP WIDTH: feet should be hip-width apart (not a tightrope), for balance and hip alignment.',
        'BACK FOOT: toes pointed forward or slightly out — not turned wildly sideways.',
      ].join('\n'),

      benchpress: [
        'ELBOW PATH (highest priority): elbows should travel at ~45-75° from the torso — not flaring straight out (shoulder impingement) and not tucked too tight.',
        '  - Elbow flare past shoulder width = score 60+. Shoulder joint at serious risk.',
        'BAR PATH: should move in a slight diagonal — from lower chest to lockout above the shoulders, not straight up.',
        'ARCH: a slight natural lower-back arch is fine, but extreme bridge = cheating range. Score 45+ if visible.',
        'WRIST SYMMETRY: both sides should press evenly — lopsided lockout = weak side compensation, score 40+.',
        'LOCKOUT: full elbow extension at the top — no soft elbows.',
        'SCAPULAR POSITION: shoulders should be retracted and depressed (back and down) throughout the set.',
      ].join('\n'),

      shoulderpress: [
        'LOWER BACK (highest priority): pressing overhead with an arched lower back = lumbar disc risk.',
        '  - Excessive arch = score 65+. Core should be braced, slight forward lean is OK.',
        'ELBOW START POSITION: elbows at ~90°, roughly in line with shoulders — not too far forward.',
        'PRESS PATH: bar/wrists move straight up, tracking over the shoulder joint.',
        'LOCKOUT: full extension overhead — elbows straight, shrug traps slightly at the top.',
        'SYMMETRY: both arms pressing equally. Lopsided lockout = weak side compensation, score 40+.',
        'WRIST: neutral — not bent back under the load.',
      ].join('\n'),

      curlup: [
        'NECK (highest priority): hands should REST lightly behind the head — not pull the neck forward.',
        '  - If chin is jutting forward or neck is straining, score 60+.',
        'LOWER BACK: must stay pressed into the floor throughout. If lower back arches up = hip flexors dominating, score 55+.',
        'RANGE OF MOTION: shoulder blades should lift off the floor (concentric), then lower with control.',
        'FEET: can be flat on floor or raised — as long as lower back stays down.',
        'SYMMETRY: both shoulders rise equally. One-sided crunch = neck strain on the tighter side.',
      ].join('\n'),

      bicepcurl: [
        'ELBOW POSITION (highest priority): elbows must stay pinned at the sides of the torso throughout.',
        '  - Elbows swinging forward at the top = front deltoid taking over, reduces bicep stimulus. Score 50+.',
        'BODY SWAY: torso must be still. Leaning/swinging back to help lift = momentum cheat, lower back risk. Score 55+.',
        'FULL RANGE: arm should fully extend at the bottom (no partial reps that stop short). Score 35+ if always partial.',
        'WRIST: neutral or slightly supinated — not bent back under load.',
        'SQUEEZE: wrist should rotate supinated at the top, peak contraction.',
      ].join('\n'),
    }

    const guide = exerciseGuides[params.exercise.toLowerCase()]
      ?? 'Check posture, joint alignment, spine neutrality, and full range of motion. Flag any rounding, collapsing, or compensatory movement patterns.'

    // Which body parts are actually relevant — the AI must not flag others
    const bodyFocus: Record<string, string> = {
      pushup:          'hands, wrists, elbows, shoulders, spine, hips, ankles — full body alignment',
      benchpress:      'wrists, elbows, shoulders, chest — NOT knees or ankles',
      squat:           'feet, ankles, knees, hips, spine, shoulders',
      deadlift:        'feet, hips, spine, shoulders, bar path',
      lunge:           'front knee, back knee, hips, torso, feet',
      shoulderpress:   'wrists, elbows, shoulders, upper back, core — NOT knees or ankles',
      curlup:          'neck, shoulders, lower back, core — NOT knees or ankles',
      bicepcurl:       'wrists, elbows, shoulders, torso — NOT knees or ankles',
      hammercurl:      'wrists, elbows, shoulders, torso — NOT knees or ankles',
      tricepextension: 'elbows, wrists, upper arms, shoulders — NOT knees, ankles, or lower body',
      lateralraise:    'wrists, elbows, shoulders — NOT knees or ankles',
      pullup:          'hands, elbows, shoulders, core — NOT knees or ankles',
      plank:           'shoulders, hips, spine, ankles — full body alignment',
      wallsit:         'knees, hips, back against wall — lower body only',
      jumpingjack:     'arms, shoulders, knees, landing mechanics',
      highnees:        'knees, hips, torso — upright posture',
    }
    const focusNote = bodyFocus[params.exercise.toLowerCase()]
      ?? 'all major joints relevant to this exercise'

    const repInfo = params.repCount != null ? ` (${params.repCount} reps completed so far)` : ''
    const levelMap: Record<string, string> = {
      beginner:     'beginner — be encouraging but very direct about safety issues',
      intermediate: 'intermediate — be direct and technically precise',
      advanced:     'advanced — be concise, assume they know the basics, focus only on what is actually off',
    }
    const levelNote = levelMap[params.userProfile.fitnessLevel] ?? 'intermediate'

    const textBlock: OpenAI.Chat.Completions.ChatCompletionContentPart = {
      type: 'text',
      text: [
        `EXERCISE: ${params.exercise.toUpperCase()} | PHASE: ${params.phase}${repInfo}`,
        `ATHLETE: ${params.userProfile.age} yrs, ${params.userProfile.weight} kg, ${levelNote}`,
        '',
        'FORM RUBRIC:',
        guide,
        '',
        'SCORING:',
        '  0–20 = excellent form, keep going',
        '  21–40 = minor issues, worth correcting',
        '  41–60 = clear form breakdown, injury risk building',
        '  61–80 = significant fault, stop and correct',
        '  81–100 = dangerous, high injury risk right now',
        '',
        `RELEVANT BODY PARTS FOR THIS EXERCISE: ${focusNote}`,
        '- Analyze ONLY the body parts listed above. Do NOT comment on, penalize, or mention body parts not listed.',
        '',
        'IMPORTANT RULES:',
        '- Base riskScore ONLY on what you can clearly see in the images.',
        '- If the camera angle hides a critical checkpoint, note it in suggestions but do not penalize.',
        '- Do NOT default to a low score out of uncertainty — if you see a fault, score it accordingly.',
        '- suggestions must be specific coaching cues in second person present tense, as if speaking to the athlete right now.',
        '  Example: "Your left knee is caving inward — press it out over your pinky toe."',
        '  NOT: "Make sure knees track over toes." (too generic)',
        '- safetyConcerns is only for genuinely dangerous patterns (score 65+). Empty array otherwise.',
        `- warmupQuality: ${params.phase === 'warmup' ? 'rate 0–100 how well warmed up this person looks (range of motion, pace, engagement)' : 'null'}`,
        '',
        'Respond with ONLY this JSON — no markdown, no prose:',
        '{',
        '  "riskScore": number,',
        '  "suggestions": string[],',
        '  "safetyConcerns": string[],',
        '  "dominantIssue": string | null,',
        `  "warmupQuality": ${params.phase === 'warmup' ? 'number' : 'null'}`,
        '}',
      ].join('\n'),
    }

    const completion = await c.chat.completions.create({
      model:      'gpt-4o',
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: [
            'You are an elite personal trainer and movement specialist with 15+ years of experience.',
            'You are watching live workout footage and giving real-time coaching feedback.',
            'Your feedback must be:',
            '  - SPECIFIC: reference exactly what you see (e.g. "your left knee", "the bottom of rep 3")',
            '  - ACTIONABLE: tell them what to DO, not just what is wrong',
            '  - HONEST: if form is dangerous, say so clearly — do not soften safety issues',
            '  - CONCISE: each suggestion is 1 sentence max, spoken naturally as a coach',
            'Respond with valid JSON only. No markdown fences, no explanatory text.',
          ].join('\n'),
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
