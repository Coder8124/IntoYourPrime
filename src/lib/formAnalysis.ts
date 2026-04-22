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

      mountainclimber: [
        'HIPS (highest priority): hips must stay level with the shoulder–ankle line — no piking up or sagging down.',
        '  - Hip pike (butt in the air) = avoiding core work. Score 55+ if clearly piked.',
        '  - Hip sag (hips dropping below line) = lower back compression. Score 60+.',
        'SHOULDERS: must stay directly over the wrists — no rocking forward or backward.',
        'CORE: should be braced throughout — belly button pulled toward spine.',
        'KNEE DRIVE: the driving knee should come toward the chest, not flare out to the side.',
        'PACE: controlled enough to maintain form — if hips are bouncing, they are moving too fast.',
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

      buttskick: [
        'TORSO (highest priority): stay upright with a slight forward lean — do NOT lean back as you kick.',
        '  - Leaning back = hip flexor strain, lower back stress. Score 50+ if torso falls behind hips.',
        'HEEL HEIGHT: heels should kick up toward the glutes, not flicking sideways. Score 40+ if kicks are lateral.',
        'ARMS: pump arms in opposition to legs — crossing midline or flailing arms = loss of coordination. Score 30+.',
        'PACE: controlled rhythm. Bouncing or slamming landings = joint stress. Score 35+ if very jarring.',
      ].join('\n'),

      calfraise: [
        'RANGE OF MOTION (highest priority): rise all the way onto the balls of your feet — partial range = score 40+.',
        'BALANCE: avoid swaying side to side. Equal weight on both feet. Score 45+ if clearly uneven loading.',
        'KNEE LOCK: legs should be straight (not bent) — bending knees shifts work to hamstrings, not calves.',
        'CONTROLLED DESCENT: lower heels below the step (if on a step) slowly — bounce-back = no eccentric benefit.',
        'FOOT SYMMETRY: both feet at the same angle — one toe more turned out than the other = score 35+.',
      ].join('\n'),

      situp: [
        'NECK (highest priority): hands behind head should not pull the neck forward.',
        '  - Chin jutting forward or neck straining = score 60+.',
        'FULL RANGE: shoulder blades should leave the floor (concentric) and torso comes upright. Stopping short = score 40+.',
        'LOWER BACK: controlled descent — slamming back down = score 35+.',
        'FEET: anchored or free — either is valid. If anchored, hip flexors assist — note if the person is only using hip flexors (watch if torso barely moves but they still "count" a rep).',
        'SYMMETRY: both sides rise equally. One-sided crunch = neck and shoulder strain.',
      ].join('\n'),

      armcircle: [
        'FULL RANGE (highest priority): arms should make a complete circle from overhead to the side and back — partial circles = score 35+.',
        'SYMMETRY: both arms should circle at the same tempo and size. One arm lagging = score 40+.',
        'SHOULDER TENSION: arms should be straight (or slightly bent) with relaxed hands — shrugging traps throughout = score 35+.',
        'TORSO: stable and upright throughout — do not sway or rotate the torso with the arm movement.',
        'DIRECTION: confirm both arms are circling the same direction unless explicitly doing alternating circles.',
      ].join('\n'),

      hipcircle: [
        'HIP ISOLATION (highest priority): only the hips should be moving — shoulders must stay level and stationary.',
        '  - Shoulders rocking or swaying with the hips = using the whole torso, not isolating. Score 50+.',
        'CIRCLE SIZE: hips should trace a wide, full circle — small lazy circles reduce mobility benefit. Score 35+ if visibly tiny.',
        'PACE: slow and controlled — rushing defeats the mobility purpose. Score 30+ if clearly rushing.',
        'STANCE: feet should stay planted shoulder-width apart throughout.',
        'UPPER BODY: core braced, arms relaxed at sides or on hips.',
      ].join('\n'),

      chestpress: [
        'ELBOW PATH (highest priority): elbows should track at shoulder height, not drooping below or flaring up. Score 50+ if elbows are clearly off-plane.',
        'SYMMETRY: both arms must press and return at the same time — one arm leading = compensation. Score 45+.',
        'WRIST: neutral — not bent back. Wrists stacked over forearms throughout.',
        'TORSO: upright and stable — no rocking forward or swaying. Score 40+ if torso moves.',
        'RANGE: full extension at the press-out and full retraction at the pull-back — partial range = score 35+.',
      ].join('\n'),

      crossbodystretch: [
        'SHOULDER POSITION (highest priority): the stretched arm should be held horizontally across the chest — not drooping low or raised too high.',
        'NECK: neutral — do not tilt your head or shrug the opposite shoulder up toward the ear. Score 45+ if visible neck tension.',
        'HOLD ARM: the arm pulling/holding at the elbow should not jerk or bounce — steady, gentle pressure only.',
        'TORSO: upright and square — do not rotate the torso toward the stretched arm. Score 35+ if the torso is turning.',
        'BREATHING: slow exhale helps deepen the stretch — watch for breath-holding (shoulders raise on inhale and stay up).',
      ].join('\n'),

      tricepstretch: [
        'ELBOW POSITION (highest priority): the bent elbow must point straight up toward the ceiling — not drifting forward or out to the side. Score 50+ if elbow is clearly off-axis.',
        'NECK: neutral — do not let the head tilt sideways toward the raised arm. Score 45+ if neck is visibly strained.',
        'TORSO: straight and upright — do not lean sideways away from the raised arm to compensate. Score 40+ if leaning.',
        'ASSIST HAND: if using the other hand to press on the elbow, pressure should be gentle and downward — not pushing sideways.',
        'SHOULDER: the stretching shoulder should stay relaxed and depressed — not shrugged up toward the ear.',
      ].join('\n'),

      scapulasqueeze: [
        'RETRACTION SYMMETRY (highest priority): both shoulder blades must pull back equally — one-sided retraction = neck and shoulder muscle imbalance. Score 55+ if clearly asymmetric.',
        'NO SHRUGGING: traps should stay relaxed and depressed throughout — shoulder blades pull BACK, not UP. Score 50+ if shoulders are visibly hiking.',
        'CHEST OPEN: chest should broaden and lift slightly at the peak squeeze — caving chest = not achieving full retraction. Score 40+.',
        'ELBOW POSITION: if arms are in "W" position, elbows should stay at shoulder height and pull straight back — not drooping down or flaring wide.',
        "HOLD DURATION: a controlled 2–3 second squeeze is ideal — quick bounces without a hold don't fully activate the rhomboids.",
      ].join('\n'),

      sidelunge: [
        'BENDING KNEE (highest priority): must track directly over the foot — no valgus (caving inward). Score 60+ if knee is collapsing.',
        'STEP WIDTH: foot steps far enough to the side that the shin stays vertical — knee not shooting forward past toes. Score 50+.',
        'TORSO: upright throughout — do not lean forward over the bent knee. Score 45+ if leaning.',
        'EXTENDED LEG: keep it straight and foot flat on the floor — bending it removes the lateral stretch benefit.',
        'HIPS: push back and sit into the hip of the bending leg — not just bending the knee straight down.',
      ].join('\n'),

      chestfly: [
        'ARM SYMMETRY (highest priority): both arms must arc through the same range — one arm lagging = pec imbalance. Score 50+ if clearly asymmetric.',
        'ELBOW BEND: slight bend (15-20°) throughout — arms should not be dead straight (elbow stress) or excessively bent (reduces pec stretch). Score 40+ if elbows are locked straight.',
        'ARC: arms should move in a wide arc, not just horizontally. At the bottom, wrists should be roughly in line with shoulders — not drooping below.',
        'RANGE: arms should open wide enough to feel a stretch across the chest. Stopping early = score 35+.',
        'WRIST: neutral — not bent. Palms facing each other or slightly upward at the bottom.',
      ].join('\n'),

      jumpsquat: [
        'SQUAT DEPTH (highest priority): hips should descend to at least parallel before the jump — shallow squats lose power and reduce training effect. Score 45+.',
        'KNEE VALGUS: knees must not cave inward on the way down OR on landing — landing valgus is high ACL injury risk. Score 70+ if landing with knees caving.',
        'LANDING MECHANICS: land softly with bent knees, absorbing force — hard straight-leg landings = joint impact. Score 60+ if landing stiff.',
        'TORSO: upright on the squat down, slight forward lean on landing is normal for force absorption.',
        'JUMP: drive through the full foot and extend fully at the top — partial hops do not develop power.',
      ].join('\n'),

      burpee: [
        'PLANK POSITION (highest priority): when jumping or stepping back, hips must stay level — no piking up or sagging down. Score 60+ if hips are clearly off the line.',
        'SQUAT DOWN: back stays neutral as you crouch — do not round aggressively. Score 55+ if back rounds sharply.',
        'LANDING: when jumping feet forward or back, land softly — crashing landings = high joint impact. Score 45+.',
        'KNEE VALGUS: knees must not cave during the squat-down or stand-up phase. Score 65+ if present.',
        'PACE: controlled enough to hit each phase — rushing through results in poor plank position and sloppy landings.',
      ].join('\n'),
    }

    const guide = exerciseGuides[params.exercise.toLowerCase()]
      ?? 'Check posture, joint alignment, spine neutrality, and full range of motion. Flag any rounding, collapsing, or compensatory movement patterns.'

    // Which body parts are actually relevant — the AI must not flag others
    const bodyFocus: Record<string, string> = {
      pushup:          'hands, wrists, elbows, shoulders, spine, hips, ankles — full body alignment',
      benchpress:      'wrists, elbows, shoulders, chest — NOT knees or ankles',
      mountainclimber: 'shoulders, hips, core, driving knee — spine and hip alignment',
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
      buttskick:       'heels, glutes, torso posture, arm swing — NOT upper body isolation',
      calfraise:       'feet, ankles, calves, knees — NOT upper body or hips',
      situp:           'neck, shoulders, lower back, core, torso — NOT knees or ankles',
      armcircle:       'wrists, elbows, shoulders, upper back — NOT knees, ankles, or hips',
      scapulasqueeze:   'shoulders, upper back, shoulder blades, chest — NOT knees, ankles, or lower body',
      hipcircle:        'hips, lower back, core — shoulders should stay still, NOT upper body movement',
      chestpress:       'wrists, elbows, shoulders, chest, torso — NOT knees or ankles',
      crossbodystretch: 'shoulders, neck, upper back, stretched arm — NOT knees, ankles, or lower body',
      tricepstretch:    'elbow, shoulder, neck, torso alignment — NOT knees, ankles, or lower body',
      sidelunge:        'bending knee, ankle, hip, torso — lateral knee tracking and upright posture',
      chestfly:         'wrists, elbows, shoulders, chest — NOT knees, ankles, or lower body',
      jumpsquat:        'feet, ankles, knees, hips, spine — especially landing mechanics and knee valgus',
      burpee:           'full body: knees, hips, spine, shoulders — plank alignment and landing mechanics',
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
