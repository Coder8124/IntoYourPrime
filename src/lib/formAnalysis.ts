/**
 * formAnalysis.ts — client-side AI calls via OpenAI SDK
 *
 * Key priority: user-saved key in localStorage > VITE_OPENAI_API_KEY env var
 * SDK runs in-browser with dangerouslyAllowBrowser: true.
 */

import OpenAI from 'openai'
import type { FormAnalysisResult, CooldownExercise, Session, DailyLog, UserProfile } from '../types/index'
import { isProSubscriber } from './subscriptionStatus'
import { auth } from './firebase'

// ── Key resolution ─────────────────────────────────────────────────────────

async function getProToken(): Promise<string> {
  return (await auth.currentUser?.getIdToken()) ?? ''
}

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

// ── Per-exercise coaching rubrics ─────────────────────────────────────────
export const EXERCISE_GUIDES: Record<string, string> = {
  pushup: [
    'IDEAL: one rigid line from ear to ankle, lowering until the chest is within a fist of the floor and pressing back up as a single unit.',
    'BODY ALIGNMENT (weigh most heavily): shoulders, hips and heels should travel together as one plank. Hips sagging toward the floor load the lower spine — a slight dip is a minor cue, a deep sag is a serious fault. Hips piking up (butt raised) means the core has disengaged to dodge the hard range — subtle is minor, a clear inverted-V is significant.',
    'ELBOWS: should track around 45° from the torso. The wider they flare toward shoulder height, the more the shoulder joint is exposed — judge by how far past 45° they drift.',
    'DEPTH: the shallower the rep, the less it counts — a few inches short is minor, stopping near half depth is a clear breakdown.',
    'HEAD: neutral, gaze slightly ahead of the hands — drooping or craning is a minor cue unless pronounced.',
  ].join('\n'),

  squat: [
    'IDEAL: feet flat, knees tracking over the toes, hips sinking to at least parallel with a tall neutral spine and a proud chest.',
    'KNEE TRACKING (weigh most heavily): knees should follow the line of the toes. Inward collapse (valgus) strains the ACL/MCL — a brief flicker inward at the bottom is moderate, knees clearly caving through the rep is serious.',
    'DEPTH: hip crease should reach at or below the top of the knee. Slightly high is a minor deduction; a shallow quarter-squat is a clear miss.',
    'SPINE: hold a neutral curve. A "butt wink" (lower back tucking under at the bottom) matters more the deeper and more pronounced it is.',
    'HEELS: should stay flat — heels lifting signals ankle-mobility limits and a forward shift; minor if slight, more concerning as the weight rolls onto the toes.',
    'TORSO: as upright as the stance allows. Excessive forward folding shifts load to the lower back — grade by how far the chest drops toward the knees.',
  ].join('\n'),

  deadlift: [
    'IDEAL: a flat, braced back from hips to head, hips hinging back, the bar/hands tracking close to the legs, finishing tall and locked out.',
    'SPINE (by far the highest injury risk — weigh above everything else): the back must stay flat and braced. Lower-back (lumbar) rounding under load is the single most dangerous fault here — even slight lumbar flexion is a serious concern, and pronounced rounding is dangerous. Upper-back (thoracic) rounding is less acute but still a real fault. A neutral back with its natural curve is correct.',
    'HIP HINGE: hips push back to load the hamstrings rather than dropping into a squat — the more it resembles a squat or a stiff-legged yank, the further from ideal.',
    'BAR PATH: hands/bar stay close to the legs; drifting out in front swings load onto the lower back — grade by the gap.',
    'LOCKOUT: stand fully tall without leaning back (hyperextension) or leaving the knees soft.',
    'HEAD: neutral and in line with the spine — not craned up or dropped.',
  ].join('\n'),

  lunge: [
    'IDEAL: an upright torso over a stable front foot, front knee stacked over the ankle, both knees bending toward 90°, back knee hovering just off the floor.',
    'FRONT KNEE (weigh most heavily): should stay over the ankle. Caving inward (valgus) risks the ACL and is the most serious fault; the knee drifting well past the toes loads the kneecap — grade each by how pronounced it is.',
    'TORSO: stays tall. Folding forward over the front thigh shifts strain to the hip and low back — minor if slight, a clear fault if the chest collapses toward the knee.',
    'BACK KNEE: lowers under control toward the floor, hovering an inch or two off — not slamming down.',
    'STEP WIDTH: feet roughly hip-width apart for balance; a tightrope stance wobbles the knee.',
    'BACK FOOT: pointing forward or slightly out — a wildly turned foot signals a misaligned hip.',
  ].join('\n'),

  mountainclimber: [
    'IDEAL: a stable plank — shoulders over wrists, hips level with the shoulder–ankle line — while the knees drive toward the chest at a controlled pace.',
    'HIPS (weigh most heavily): stay level with the shoulder–ankle line. Piking up (butt raised) dodges the core work; sagging down compresses the low back. Either is minor when slight, a clear fault when pronounced.',
    'SHOULDERS: stacked directly over the wrists — rocking forward or back destabilizes the plank.',
    'CORE: braced throughout, belly drawn toward the spine.',
    'KNEE DRIVE: the driving knee comes toward the chest, not flaring out to the side.',
    'PACE: fast is fine only as long as the hips stay still — bouncing hips mean it is too fast to control.',
  ].join('\n'),

  benchpress: [
    'IDEAL: shoulder blades retracted and pinned, elbows tucked to roughly 45–75°, bar moving on a slight diagonal from the lower chest to over the shoulders, both arms locking out evenly.',
    'ELBOW PATH (weigh most heavily): elbows track around 45–75° from the torso. The closer they flare to a straight line with the shoulders, the more the shoulder joint is at risk — grade by how wide they go.',
    'BAR PATH: a slight diagonal from the lower chest up to lockout over the shoulders, not a straight vertical line.',
    'ARCH: a slight natural low-back arch is fine; an extreme bridge shortens the range and is a fault that grows with how exaggerated it is.',
    'SYMMETRY: both arms should press and lock out together — a lagging side reveals a weakness; grade by how uneven.',
    'LOCKOUT: full elbow extension at the top, no soft elbows.',
    'SCAPULA: shoulders stay retracted and depressed (back and down) throughout the set.',
  ].join('\n'),

  shoulderpress: [
    'IDEAL: core braced and ribs down, elbows starting near shoulder height, pressing straight overhead to a full tall lockout with both arms even.',
    'LOWER BACK (weigh most heavily): pressing overhead with an arched, ribs-flared lower back loads the lumbar discs. A slight arch is acceptable; the more it bends back into a standing incline press, the more serious.',
    'ELBOW START: elbows around 90°, roughly under or just in front of the wrists — not drifting far forward.',
    'PRESS PATH: wrists/bar travel straight up, tracking over the shoulder joint.',
    'LOCKOUT: full overhead extension, elbows straight, traps shrugging slightly at the top.',
    'SYMMETRY: both arms press evenly — a lagging side reveals weakness; grade by how uneven.',
    'WRIST: stays neutral and stacked over the forearm — not bent back under the load.',
  ].join('\n'),

  curlup: [
    'IDEAL: hands resting lightly behind the head, lower back glued to the floor, shoulder blades curling up and lowering with control.',
    'NECK (weigh most heavily): hands only rest behind the head — they must not haul it forward. The more the chin juts or the neck strains, the more serious.',
    'LOWER BACK: stays pressed into the floor. If it arches up off the floor the hip flexors are taking over — grade by how much it lifts.',
    'RANGE: shoulder blades clear the floor on the way up, then lower under control — not flopping back.',
    'FEET: flat or raised, either is fine, as long as the low back stays down.',
    'SYMMETRY: both shoulders rise together — a one-sided crunch strains the tighter side.',
  ].join('\n'),

  bicepcurl: [
    'IDEAL: elbows pinned to the sides, a still torso, the forearm curling from straight at the bottom to a supinated squeeze at the top.',
    'ELBOWS (weigh most heavily): stay pinned at the sides. The more they swing forward at the top, the more the front delt takes over and the less work stays on the biceps.',
    'BODY SWAY: the torso should not rock. Leaning or swinging back to heave the weight is a momentum cheat that loads the low back — minor if slight, a clear fault if the whole body is heaving.',
    'RANGE: the arm should fully straighten at the bottom; consistently cutting the bottom short is a real deduction.',
    'WRIST: neutral or slightly supinated, not bent back.',
    'SQUEEZE: wrist supinates to a peak contraction at the top.',
  ].join('\n'),

  buttskick: [
    'IDEAL: a tall torso with a slight forward lean, heels flicking straight up to the glutes, arms pumping in opposition at a springy, controlled pace.',
    'TORSO (weigh most heavily): stay tall with a slight forward lean — never leaning back behind the hips, which strains the hip flexors and low back. Grade by how far the torso falls behind.',
    'HEEL HEIGHT: heels kick up toward the glutes, not flicking out to the sides.',
    'ARMS: pump in opposition to the legs — crossing the midline or flailing wastes coordination.',
    'PACE: a controlled, springy rhythm — heavy, jarring landings stress the joints.',
  ].join('\n'),

  calfraise: [
    'IDEAL: rising all the way onto the balls of the feet with straight knees, balanced evenly, then lowering the heels under control.',
    'RANGE (weigh most heavily): rise fully onto the balls of the feet and, if on a step, sink the heels below it. The shorter the range, the less effective — grade accordingly.',
    'BALANCE: weight even on both feet, no swaying side to side.',
    'KNEES: stay straight — bending them shifts work off the calves onto the hamstrings.',
    'DESCENT: lower the heels slowly; bouncing out of the bottom skips the eccentric.',
    'SYMMETRY: both feet at the same angle and height — one turned out or lagging is a minor imbalance.',
  ].join('\n'),

  situp: [
    'IDEAL: hands cradling (not pulling) the head, curling all the way up to an upright torso, then lowering with control.',
    'NECK (weigh most heavily): hands support the head without yanking it. The more the chin juts or the neck strains, the more serious.',
    'RANGE: shoulder blades clear the floor and the torso comes fully upright — stopping short cuts the rep.',
    'DESCENT: lower with control; slamming the back down is a deduction.',
    'FEET: anchored or free are both valid. If anchored and the torso barely moves while reps still "count," the hip flexors are doing all the work — note it.',
    'SYMMETRY: both sides rise evenly — a one-sided pull strains the neck and shoulder.',
  ].join('\n'),

  armcircle: [
    'IDEAL: both arms tracing full, even circles at a steady tempo with relaxed shoulders and a stable torso.',
    'RANGE (weigh most heavily): arms sweep a complete circle overhead, out and around — small partial circles defeat the purpose. Grade by how shrunken they are.',
    'SYMMETRY: both arms match in tempo and size — one lagging is a clear imbalance.',
    'SHOULDER TENSION: arms relatively straight and hands relaxed; traps shrugging up throughout is a minor fault.',
    'TORSO: stable and upright — no swaying or rotating with the arms.',
    'DIRECTION: both arms circle the same way unless deliberately alternating.',
  ].join('\n'),

  hipcircle: [
    'IDEAL: hips tracing a wide, slow circle while the shoulders stay level and still and the feet stay planted.',
    'HIP ISOLATION (weigh most heavily): only the hips move; the shoulders stay level and stationary. The more the shoulders rock or sway along, the more the whole torso is cheating the motion.',
    'CIRCLE SIZE: hips trace a wide, full circle — tiny lazy circles lose the mobility benefit.',
    'PACE: slow and controlled; rushing defeats the purpose.',
    'STANCE: feet planted about shoulder-width throughout.',
    'UPPER BODY: core braced, arms relaxed at the sides or on the hips.',
  ].join('\n'),

  chestpress: [
    'IDEAL: an upright, stable torso, wrists neutral and stacked, both arms pressing out to full extension and returning together at shoulder height.',
    'ELBOW PATH (weigh most heavily): elbows track at about shoulder height — neither drooping low nor riding up. The more off-plane they are, the more the load drifts off the chest.',
    'SYMMETRY: both arms press and return together — one leading reveals a weak side.',
    'WRIST: neutral and stacked over the forearm, not bent back.',
    'TORSO: upright and still — rocking or swaying to drive the weight is a fault.',
    'RANGE: full extension on the press and full retraction on the return; partial range shortchanges the rep.',
  ].join('\n'),

  crossbodystretch: [
    'IDEAL: the stretched arm held horizontally across the chest, drawn gently by the other arm, with a square upright torso and a relaxed neck.',
    'SHOULDER POSITION (weigh most heavily): the stretched arm stays roughly horizontal across the chest — drooping low or riding high misses the target muscle.',
    'NECK: neutral — not tilting the head or shrugging the opposite shoulder toward the ear.',
    'HOLD ARM: steady, gentle pressure at the elbow — no jerking or bouncing.',
    'TORSO: upright and square — rotating toward the stretched arm cheats the stretch.',
    'BREATHING: a slow exhale deepens the stretch; watch for held breath (shoulders rising and staying up).',
  ].join('\n'),

  tricepstretch: [
    'IDEAL: the bent elbow pointing straight up to the ceiling, hand reaching down the spine, torso tall, with a gentle assist from the other hand.',
    'ELBOW POSITION (weigh most heavily): the bent elbow points straight up — the more it drifts forward or out to the side, the less the triceps is stretched.',
    'NECK: neutral — not tilting toward the raised arm.',
    'TORSO: tall — leaning sideways away from the arm to fake more range is a fault.',
    'ASSIST HAND: gentle downward pressure on the elbow, not yanking it sideways.',
    'SHOULDER: the stretching shoulder stays relaxed and down, not shrugged toward the ear.',
  ].join('\n'),

  scapulasqueeze: [
    'IDEAL: both shoulder blades drawing back and together evenly, traps relaxed, chest broadening, held briefly at the peak.',
    'RETRACTION SYMMETRY (weigh most heavily): both shoulder blades pull back equally — one side lagging signals an imbalance; grade by how uneven.',
    'NO SHRUGGING: traps stay relaxed; the blades go BACK, not UP. The more the shoulders hike toward the ears, the more it is a fault.',
    'CHEST OPEN: chest broadens and lifts slightly at the peak — a caving chest means the retraction is incomplete.',
    'ELBOWS: in a "W" position, elbows stay at shoulder height and pull straight back — not drooping down or flaring wide.',
    "HOLD: a controlled 2–3 second squeeze; quick bounces barely fire the rhomboids.",
  ].join('\n'),

  sidelunge: [
    'IDEAL: stepping wide to one side, sitting the hips back into the bending leg with the shin vertical and the torso tall, the other leg straight with the foot flat.',
    'BENDING KNEE (weigh most heavily): tracks directly over its foot — inward collapse (valgus) is the most serious fault here; grade by how far it caves.',
    'STEP WIDTH: wide enough that the shin stays vertical and the knee does not shoot past the toes.',
    'TORSO: upright — folding forward over the bent knee is a fault that grows with the lean.',
    'EXTENDED LEG: stays straight with the foot flat; bending it removes the lateral stretch.',
    'HIPS: sit back into the hip of the bending leg, not just dropping the knee straight down.',
  ].join('\n'),

  chestfly: [
    'IDEAL: a slight fixed elbow bend with both arms arcing wide and even — a chest stretch at the bottom, squeezing together at the top.',
    'ARM SYMMETRY (weigh most heavily): both arms arc through the same range — one lagging reveals a pec imbalance; grade by how uneven.',
    'ELBOW BEND: a soft 15–20° bend held throughout — dead-straight arms stress the elbow, over-bending turns it into a press.',
    'ARC: arms sweep a wide arc; at the bottom the wrists sit roughly level with the shoulders, not drooping below.',
    'RANGE: open wide enough to feel a chest stretch — cutting it short loses the point.',
    'WRIST: neutral, palms facing each other or slightly up at the bottom.',
  ].join('\n'),

  jumpsquat: [
    'IDEAL: a controlled squat to about parallel, an explosive full-foot drive to extension, and a soft bent-knee landing that absorbs the force.',
    'KNEE VALGUS (weigh most heavily, especially on landing): knees must not cave inward on the descent or the landing — landing with knees collapsing inward is the highest injury risk here; grade by how pronounced.',
    'LANDING: land soft with bent knees to absorb force — stiff, straight-leg landings drive impact into the joints and are a serious fault.',
    'DEPTH: descend to at least parallel before jumping — shallow dips lose power.',
    'TORSO: upright on the way down; a slight forward lean on landing is normal for absorption.',
    'JUMP: drive through the full foot and extend fully — half hops do not build power.',
  ].join('\n'),

  burpee: [
    'IDEAL: a controlled squat down, hands planted, a clean jump back to a level plank, then a soft jump forward and stand — repeated at a sustainable pace.',
    'PLANK POSITION (weigh most heavily): in the plank, the hips stay level — piking up or sagging down is a fault that grows with how far off the line they are.',
    'SQUAT DOWN: the back stays neutral as you crouch — aggressive rounding is a clear fault.',
    'LANDING: land soft jumping the feet back or forward — crashing landings drive joint impact.',
    'KNEE VALGUS: knees stay out, not caving, through the squat and the stand-up.',
    'PACE: controlled enough to hit each phase cleanly — rushing wrecks the plank and the landings.',
  ].join('\n'),
}

// ── Body-part focus per exercise ───────────────────────────────────────────
export const BODY_FOCUS: Record<string, string> = {
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

// ── analyzeForm ────────────────────────────────────────────────────────────

export async function analyzeForm(params: AnalyzeParams): Promise<FormAnalysisResult> {
  if (isProSubscriber()) {
    try {
      const token = await getProToken()
      const res   = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          frames:      params.frames,
          exercise:    params.exercise,
          repCount:    params.repCount ?? 0,
          userProfile: params.userProfile,
          phase:       params.phase,
        }),
      })
      if (res.status === 429) return { ...DEFAULT_FORM_RESULT, dominantIssue: '__monthly_limit__' }
      if (!res.ok) return { ...DEFAULT_FORM_RESULT }
      return (await res.json()) as FormAnalysisResult
    } catch {
      return { ...DEFAULT_FORM_RESULT }
    }
  }
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

    const guide = EXERCISE_GUIDES[params.exercise.toLowerCase()]
      ?? 'Check posture, joint alignment, spine neutrality, and full range of motion. Flag any rounding, collapsing, or compensatory movement patterns.'

    const focusNote = BODY_FOCUS[params.exercise.toLowerCase()]
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
        '  Place the score by SEVERITY, not by counting faults: weigh how pronounced each fault is and how much injury risk it carries. A slight, occasional deviation sits low in a band; a pronounced or repeated one sits high or in the next band. Prioritize the checkpoints flagged "weigh most heavily".',
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
  if (isProSubscriber()) {
    try {
      const token = await getProToken()
      const res   = await fetch('/api/cooldown', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ session, userProfile }),
      })
      if (!res.ok) return []
      return (await res.json()) as CooldownExercise[]
    } catch {
      return []
    }
  }
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
  if (isProSubscriber()) {
    try {
      const token = await getProToken()
      const res   = await fetch('/api/recovery-insight', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ sessions: context.sessions, logs: context.logs }),
      })
      if (!res.ok) return ''
      const json = (await res.json()) as { insight: string }
      return json.insight ?? ''
    } catch {
      return ''
    }
  }
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

// ── analyzeClip ────────────────────────────────────────────────────────────

export async function analyzeClip(params: {
  frames:      string[]
  exercise:    string
  userProfile: { age: number; weight: number; fitnessLevel: string }
}): Promise<FormAnalysisResult> {
  if (isProSubscriber()) {
    try {
      const token = await getProToken()
      const res   = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          frames:      params.frames,
          exercise:    params.exercise,
          repCount:    0,
          userProfile: params.userProfile,
          phase:       'main' as const,
        }),
      })
      if (res.status === 429) return { ...DEFAULT_FORM_RESULT, dominantIssue: '__monthly_limit__' }
      if (!res.ok) return { ...DEFAULT_FORM_RESULT }
      const parsed = (await res.json()) as FormAnalysisResult & { notFitness?: boolean }
      if (parsed.notFitness) return { ...DEFAULT_FORM_RESULT, dominantIssue: '__not_fitness__' }
      return parsed
    } catch {
      return { ...DEFAULT_FORM_RESULT }
    }
  }
  const c = client()
  if (!c) return { ...DEFAULT_FORM_RESULT }

  const guide = EXERCISE_GUIDES[params.exercise.toLowerCase()]
    ?? 'Check posture, joint alignment, spine neutrality, and full range of motion. Flag any rounding, collapsing, or compensatory movement patterns.'

  const levelMap: Record<string, string> = {
    beginner:     'beginner — be encouraging but very direct about safety issues',
    intermediate: 'intermediate — be direct and technically precise',
    advanced:     'advanced — be concise, assume they know the basics, focus only on what is actually off',
  }
  const levelNote = levelMap[params.userProfile.fitnessLevel] ?? 'intermediate'

  const imageBlocks: OpenAI.Chat.Completions.ChatCompletionContentPart[] = params.frames.map(f => ({
    type:      'image_url' as const,
    image_url: { url: f, detail: 'low' as const },
  }))

  const textBlock: OpenAI.Chat.Completions.ChatCompletionContentPart = {
    type: 'text',
    text: [
      `EXERCISE: ${params.exercise.toUpperCase()} (recorded clip review)`,
      `ATHLETE: ${params.userProfile.age} yrs, ${params.userProfile.weight} kg, ${levelNote}`,
      '',
      'FORM RUBRIC:',
      guide,
      '',
      'SCORING:',
      '  0–20 = excellent form',
      '  21–40 = minor issues',
      '  41–60 = clear form breakdown',
      '  61–80 = significant fault, needs correction',
      '  81–100 = dangerous, high injury risk',
      '  Place the score by SEVERITY, not by counting faults: weigh how pronounced each fault is and how much injury risk it carries. A slight, occasional deviation sits low in a band; a pronounced or repeated one sits high or in the next band. Prioritize the checkpoints flagged "weigh most heavily".',
      '',
      'IMPORTANT RULES:',
      '- These are evenly-spaced frames from a recorded clip, not live footage.',
      '- FIRST: check whether a human is visibly performing physical exercise in these frames.',
      '  If NO human is doing exercise (e.g. a board game, screen recording, animals, scenery,',
      '  sitting at a desk, etc.), set notFitness: true and leave all other fields at defaults.',
      '- Identify the most common or most dangerous fault visible across the frames.',
      '- suggestions must be coaching cues in second person: "Your left knee is caving — press it out."',
      '- safetyConcerns only for genuinely dangerous patterns (score 65+). Empty array otherwise.',
      '- repCountEstimate: count visible reps across all frames. 0 if unclear.',
      '',
      `RELEVANT BODY PARTS FOR THIS EXERCISE: ${BODY_FOCUS[params.exercise.toLowerCase()] ?? 'all major joints relevant to this exercise'}`,
      '- Analyze ONLY the body parts listed above. Do NOT comment on, penalize, or mention body parts not listed.',
      '',
      'Respond with ONLY this JSON — no markdown, no prose:',
      '{',
      '  "notFitness": boolean,',
      '  "riskScore": number,',
      '  "suggestions": string[],',
      '  "safetyConcerns": string[],',
      '  "dominantIssue": string | null,',
      '  "warmupQuality": null,',
      '  "repCountEstimate": number',
      '}',
    ].join('\n'),
  }

  try {
    const completion = await c.chat.completions.create({
      model:      'gpt-4o-mini',
      max_tokens: 500,
      messages: [
        {
          role:    'system',
          content: 'You are an elite strength coach reviewing recorded workout footage. Analyze form quality across all frames and return JSON only.',
        },
        {
          role:    'user',
          content: [...imageBlocks, textBlock],
        },
      ],
    })
    const raw = completion.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(stripJsonFences(raw)) as FormAnalysisResult & { notFitness?: boolean }
    if (parsed.notFitness) {
      return { ...DEFAULT_FORM_RESULT, dominantIssue: '__not_fitness__' }
    }
    return parsed
  } catch {
    return { ...DEFAULT_FORM_RESULT }
  }
}
