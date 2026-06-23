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

/** Normalize an exercise name or id to its rubric key: lowercase, alphanumerics only. */
function rubricKey(exercise: string): string {
  return exercise.toLowerCase().replace(/[^a-z0-9]/g, '')
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

  // ── Shoulders / triceps (isolation) ────────────────────────────────────────
  lateralraise: [
    'IDEAL: standing tall with a soft elbow bend, raising both arms out to the sides to about shoulder height, then lowering under control.',
    'SHOULDER HEIGHT (weigh most heavily): arms rise to roughly shoulder level — swinging higher shrugs the traps in and risks impingement; grade by how far past shoulder height they go.',
    'MOMENTUM: the torso stays still — leaning back and heaving the weight up turns it into a swing; minor if slight, a clear fault if the whole body rocks.',
    'ELBOW BEND: a soft fixed bend held throughout, elbows leading slightly ahead of the wrists — not locked straight or flapping.',
    'SYMMETRY: both arms rise together to the same height — a lagging side reveals a weakness.',
    'TRAPS: shoulders stay down, not shrugging toward the ears as the arms lift.',
  ].join('\n'),

  frontraise: [
    'IDEAL: standing tall, raising the weight straight in front to about shoulder height with a soft elbow bend, then lowering under control.',
    'HEIGHT (weigh most heavily): raise to roughly shoulder height — going higher shifts the work onto the traps; grade by the overshoot.',
    'MOMENTUM: no swinging or leaning back to throw the weight up — the torso stays still.',
    'ELBOW: a soft fixed bend, not locked out or collapsing.',
    'SYMMETRY: both arms match in height and tempo.',
    'WRIST: neutral, not dropping under the load.',
  ].join('\n'),

  arnoldpress: [
    'IDEAL: starting with palms facing you at shoulder height, rotating them to face forward as you press overhead to a tall lockout, then reversing under control.',
    'LOWER BACK (weigh most heavily): brace the core and keep the ribs down — arching the lower back to press is a lumbar risk that grows with the arch.',
    'ROTATION: a smooth palm rotation from facing-in to facing-forward through the press, not a jerk at the top.',
    'PRESS PATH: wrists track up over the shoulders to a full overhead lockout.',
    'SYMMETRY: both arms press and rotate evenly.',
    'WRIST: stacked over the forearm, not bent back under the load.',
  ].join('\n'),

  tricepextension: [
    'IDEAL: elbows pointing up and pinned in close, lowering the weight behind the head and extending fully without the elbows drifting.',
    'ELBOWS (weigh most heavily): stay pinned in and pointing up — the more they flare out to the sides, the less the triceps works and the more the shoulder takes over.',
    'LOWER BACK: ribs down, no arching to lever the weight up.',
    'RANGE: a full stretch at the bottom and full lockout at the top.',
    'WRIST: neutral, not bent back.',
    'SYMMETRY: both arms extend together.',
  ].join('\n'),

  skullcrusher: [
    'IDEAL: upper arms vertical and still, lowering the weight toward the forehead and extending without moving the elbows.',
    'ELBOWS (weigh most heavily): the upper arms stay vertical and fixed — drifting the elbows back toward the shoulders turns it into a press and offloads the triceps.',
    'ELBOW FLARE: elbows stay in line, not flaring wide.',
    'RANGE: a full bend at the bottom and full lockout at the top, controlled — no bouncing off the forehead.',
    'WRIST: neutral and stable.',
    'SYMMETRY: both arms move together.',
  ].join('\n'),

  // ── Curl variants ──────────────────────────────────────────────────────────
  hammercurl: [
    'IDEAL: elbows pinned to the sides, a neutral (palms-facing-in) grip throughout, curling from a full stretch to a controlled squeeze.',
    'ELBOWS (weigh most heavily): stay pinned at the sides — swinging them forward at the top recruits the front delt and steals from the target muscle.',
    'BODY SWAY: the torso stays still; leaning back to heave is a momentum cheat that loads the low back.',
    'GRIP: palms stay facing each other — no rotating mid-rep.',
    'RANGE: the arm fully straightens at the bottom — no partial reps.',
    'SYMMETRY: both arms even (if alternating, each side matches the other).',
  ].join('\n'),

  concentrationcurl: [
    'IDEAL: seated with the working elbow braced against the inner thigh, curling the weight up to a supinated squeeze and lowering slowly.',
    'ELBOW BRACE (weigh most heavily): the elbow stays planted against the thigh the whole rep — lifting it off lets the shoulder swing in and cheats the curl.',
    'BODY: the torso stays still, not rocking back to assist.',
    'RANGE: a full stretch at the bottom and a peak supinated squeeze at the top.',
    'WRIST: neutral to supinated, not bent back.',
  ].join('\n'),

  zottmancurl: [
    'IDEAL: curling up with palms up, rotating to palms down at the top, lowering under control, then rotating back at the bottom.',
    'ELBOWS (weigh most heavily): pinned at the sides through both the curl and the lower — swinging forward steals the work.',
    'ROTATION: a deliberate supinate-up, pronate-down switch at the top and bottom — not skipped.',
    'BODY SWAY: the torso stays still, no heaving.',
    'RANGE: a full extension at the bottom and full curl at the top.',
    'WRIST: firm, not collapsing under the palms-down lower.',
  ].join('\n'),

  wristcurl: [
    'IDEAL: forearms braced on the thighs or a bench, only the wrists moving through a full curl and extend.',
    'FOREARM ISOLATION (weigh most heavily): the forearms stay planted and still — only the wrists flex and extend; lifting the forearms means bigger muscles are taking over.',
    'RANGE: a full curl up and a full controlled lower for a complete stretch.',
    'PACE: controlled — no bouncing at the bottom.',
    'SYMMETRY: both wrists move evenly.',
  ].join('\n'),

  // ── Pull / back ────────────────────────────────────────────────────────────
  pullup: [
    'IDEAL: from a full dead hang, pulling the chest toward the bar by driving the elbows down until the chin clears it, then lowering to full extension.',
    'RANGE (weigh most heavily): start from a full dead hang and pull until the chin clears the bar — half reps from a bent-arm start do not count; grade by how short.',
    'SWING / KIP: the body stays controlled — swinging or kipping the chin up is a fault unless deliberately training kipping.',
    'SCAPULA: the shoulders pull down and back to start the rep, not shrugging up toward the ears.',
    'SYMMETRY: both sides pull evenly — leading with one shoulder reveals an imbalance.',
    'LOWER: a controlled descent to a full hang, not dropping.',
  ].join('\n'),

  chinup: [
    'IDEAL: a supinated (palms-toward-you) grip, pulling from a full hang until the chin clears the bar, lowering under control.',
    'RANGE (weigh most heavily): a full dead hang to chin-over-bar — partial reps do not count; grade by how short.',
    'SWING: minimal body sway; no kipping to cheat the pull.',
    'SCAPULA: the shoulders depress and retract to initiate — not shrugging up.',
    'ELBOWS: drive down and slightly in as the biceps assist the supinated grip.',
    'LOWER: controlled to a full hang.',
  ].join('\n'),

  dumbbellrow: [
    'IDEAL: one hand and knee braced on a bench, a flat back roughly parallel to the floor, rowing the weight to the hip by driving the elbow back.',
    'SPINE (weigh most heavily): the back stays flat and braced — rounding the lower back under load is the serious fault here; grade by how much it rounds.',
    'ELBOW PATH: drive the elbow back along the body toward the hip, not flaring it wide.',
    'TORSO ROTATION: the torso stays square — twisting to heave the weight up is a momentum cheat.',
    'SCAPULA: squeeze the shoulder blade back at the top, not just bending the arm.',
    'RANGE: a full stretch at the bottom and a full pull to the hip.',
  ].join('\n'),

  invertedrow: [
    'IDEAL: a straight rigid body hanging under a bar, pulling the chest to the bar by driving the elbows back, lowering under control.',
    'BODY LINE (weigh most heavily): hold one straight line head-to-heels — hips sagging or piking breaks the plank; grade by how far off the line.',
    'RANGE: pull until the chest nears the bar and lower to full arm extension — partial pulls do not count.',
    'SCAPULA: retract the shoulder blades at the top, not just bending the arms.',
    'ELBOWS: track back along the body, not flaring wide.',
    'PACE: controlled both up and down — no jerking.',
  ].join('\n'),

  superman: [
    'IDEAL: lying face down, lifting the chest, arms and legs off the floor together by squeezing the glutes and back, holding briefly.',
    'CONTROL (weigh most heavily): a smooth, simultaneous lift of arms and legs — jerking or bouncing up risks the low back; grade by how ballistic it is.',
    'NECK: stays neutral with the gaze down — not craning the head up.',
    'RANGE: lift to a comfortable extension and hold — not cranking the low back into a hard hyperextension.',
    'SYMMETRY: both arms and both legs rise evenly.',
  ].join('\n'),

  hyperextension: [
    'IDEAL: hips on the pad, hinging at the hips to lower the torso, then raising to a straight body line — not past it.',
    'SPINE (weigh most heavily): the movement comes from the hips with a neutral spine — rounding on the way down or cranking past straight into a backbend stresses the lumbar; grade by how much.',
    'RANGE: rise to a straight body line and stop — hyperextending hard at the top is the main fault.',
    'NECK: neutral and in line with the spine.',
    'PACE: controlled, no swinging.',
  ].join('\n'),

  reversefly: [
    'IDEAL: hinged forward with a flat back, a soft fixed elbow bend, raising both arms out to the sides to squeeze the shoulder blades, then lowering under control.',
    'SPINE (weigh most heavily): the back stays flat and braced in the hinge — rounding the lower back under the bent-over load is the main injury risk; grade by how much it rounds.',
    'SHOULDER BLADES: the movement squeezes the blades together — if the arms just swing up with no retraction, the rear delts and rhomboids are not working.',
    'MOMENTUM: a controlled raise, not heaving the torso up to fling the weights — jerking robs the target muscle.',
    'ELBOWS: hold a soft fixed bend, not locking straight or bending more into a row.',
    'SYMMETRY: both arms rise to the same height together — a lagging side reveals an imbalance.',
  ].join('\n'),

  // ── Hip hinge / lower body ─────────────────────────────────────────────────
  romaniandeadlift: [
    'IDEAL: a soft-knee hip hinge pushing the hips back, a flat braced back, the weight sliding down the thighs to a hamstring stretch, then driving the hips forward to stand tall.',
    'SPINE (weigh most heavily): the back stays flat and braced — any lower-back rounding as you hinge is the dangerous fault here; even slight lumbar flexion is serious.',
    'HIP HINGE: the hips push back rather than squatting down; the knees stay softly bent and fairly fixed.',
    'BAR PATH: the weight stays close, sliding down the legs — drifting out front loads the low back.',
    'DEPTH: lower until the hamstrings tension or the back is about to round — going deeper by rounding is a fault, not more range.',
    'LOCKOUT: stand tall by squeezing the glutes, no leaning back.',
  ].join('\n'),

  goodmorning: [
    'IDEAL: bar on the upper back, soft knees, hinging the hips back with a flat braced spine until the torso is near parallel, then standing.',
    'SPINE (weigh most heavily): flat and braced throughout — rounding under the bar is the dangerous fault; grade by any lumbar flexion.',
    'HIP HINGE: the motion is hips back, not a squat and not a low-back bend.',
    'DEPTH: lower to about parallel or to where the back would start to round — not beyond.',
    'KNEES: a soft fixed bend, not bending more to turn it into a squat.',
    'NECK: neutral with the spine.',
  ].join('\n'),

  glutebridge: [
    'IDEAL: lying on the back with feet flat, driving through the heels to lift the hips to a straight knee-hip-shoulder line, squeezing the glutes, then lowering.',
    'HIP HEIGHT (weigh most heavily): rise to a straight shoulder-to-knee line — stopping short under-works the glutes, and pushing past into a low-back arch shifts strain to the lumbar.',
    'GLUTE DRIVE: the lift comes from squeezing the glutes, not arching the lower back.',
    'KNEES: track in line with the feet, not caving inward.',
    'FEET: stay flat, driving through the heels.',
    'PACE: a controlled lift and lower with a brief squeeze at the top.',
  ].join('\n'),

  hipthrust: [
    'IDEAL: upper back on a bench, feet flat, driving the hips up to a straight line with the shins vertical, glutes squeezed and ribs down.',
    'LUMBAR vs GLUTE (weigh most heavily): the lift is glute-driven to a flat tabletop — overarching the low back at the top (ribs flaring) shifts the work to the lumbar; grade by the arch.',
    'SHIN ANGLE: at the top the shins are vertical — feet too close or too far changes the loading.',
    'KNEES: track over the feet, not caving inward.',
    'CHIN / RIBS: chin tucked and ribs down at lockout — not throwing the head back.',
    'RANGE: full hip extension to a straight line, then a controlled lower.',
  ].join('\n'),

  bulgariansplitsquat: [
    'IDEAL: rear foot elevated, weight on the front leg, lowering straight down until the front thigh is near parallel with the torso upright, then driving up.',
    'FRONT KNEE (weigh most heavily): tracks over the foot — caving inward (valgus) is the serious fault; the knee may travel a little past the toes but must not collapse in.',
    'TORSO: upright (a slight forward lean is fine) — folding hard over the front thigh shifts load to the low back.',
    'DEPTH: lower until the front thigh is about parallel — shallow reps cut the work.',
    'BALANCE: the hips stay square and steady, not tipping to one side.',
    'REAR LEG: provides balance only; the front leg does the work.',
  ].join('\n'),

  curtsylunge: [
    'IDEAL: stepping one leg diagonally behind the other and lowering into a curtsy with the front knee tracking over the foot and the torso tall.',
    'FRONT KNEE (weigh most heavily): tracks over the foot and does not cave inward — the crossed stance tempts valgus, the main ACL risk here.',
    'HIPS: stay relatively square; excessive twisting of the pelvis strains the knee and low back.',
    'TORSO: upright, not folding forward.',
    'DEPTH: lower under control until the front thigh nears parallel.',
    'BALANCE: steady, not wobbling through the cross-step.',
  ].join('\n'),

  stepup: [
    'IDEAL: planting the whole front foot on the box, driving through that heel to stand tall, then lowering under control.',
    'FRONT KNEE (weigh most heavily): tracks over the foot — caving inward is the main fault; grade by how much.',
    'DRIVE: the power comes from the top leg pressing through the heel, not pushing off the back foot.',
    'TORSO: upright with only a slight hip-hinge lean — not hunching forward.',
    'CONTROL: lower with control rather than dropping or falling off the box.',
    'FULL FOOT: the whole front foot is on the box, not just the toes.',
  ].join('\n'),

  donkeykick: [
    'IDEAL: on all fours with a flat back, driving one heel toward the ceiling with the knee bent 90°, squeezing the glute without arching the low back.',
    'LOW BACK (weigh most heavily): the spine stays neutral — arching the lower back to fling the leg higher is the fault; the height comes from the hip, not the spine.',
    'HIP ISOLATION: only the working leg moves; the hips stay square, not rotating open.',
    'RANGE: lift to where the thigh lines up with the torso, squeezing the glute — not cranking past with the back.',
    'CORE: braced to keep the torso still.',
    'NECK: neutral, gaze down.',
  ].join('\n'),

  firehydrant: [
    'IDEAL: on all fours with a flat back, lifting one bent knee out to the side toward hip height while keeping the torso still.',
    'TORSO STABILITY (weigh most heavily): the upper body stays square and level — leaning away to lift the leg higher is the cheat; the lift comes from the hip abductors.',
    'LOW BACK: the spine stays neutral, no rounding or arching.',
    'RANGE: open the hip to about thigh-parallel — small lifts under-work the glute medius.',
    'SUPPORT: shoulders and hips stay stacked, not collapsing to one side.',
    'PACE: controlled out and back, no swinging.',
  ].join('\n'),

  reverselunge: [
    'IDEAL: stepping straight back to a soft landing, both knees bending toward 90° with the front shin vertical and the torso tall, then driving through the front heel to stand.',
    'FRONT KNEE (weigh most heavily): stays stacked over the front ankle and tracking over the toes — caving inward (valgus) is the most serious fault here; the knee drifting well past the toes loads the kneecap. Grade each by how pronounced.',
    'TORSO: stays upright — folding forward over the front thigh shifts strain to the hip and low back; minor if slight, a clear fault if the chest collapses toward the knee.',
    'BACK KNEE: lowers under control toward the floor, not slamming down.',
    'BALANCE: the step lands in a stable hip-width line, not crossing onto a tightrope that wobbles the knee.',
    'DRIVE: stand by pushing through the front heel, not shoving off the back toes.',
  ].join('\n'),

  sumosquat: [
    'IDEAL: a wide stance with toes turned out ~45°, knees tracking out over the toes, hips sinking to about parallel with a tall chest.',
    'KNEE TRACKING (weigh most heavily): the knees track out in line with the angled toes — inward collapse (valgus) is the serious fault and is tempting in the wide stance; grade by how far they cave in.',
    'DEPTH: the hips sink to about parallel — a shallow quarter-squat cuts the adductor and glute work.',
    'TORSO: stays upright; folding forward shifts load to the lower back.',
    'SPINE: a neutral curve held throughout — watch for the low back tucking under (butt wink) at the bottom.',
    'HEELS: stay flat with the weight mid-foot — heels lifting or knees shooting past the toes signals the stance is off.',
  ].join('\n'),

  gobletsquat: [
    'IDEAL: a weight held at the chest, feet about shoulder-width with toes slightly out, sinking to at least parallel with an upright chest and the elbows tracking inside the knees.',
    'KNEE TRACKING (weigh most heavily): the knees follow the toes — a brief flicker inward at the bottom is moderate, knees clearly caving (valgus) through the rep is serious.',
    'TORSO: the held weight should keep the chest tall — folding forward and letting the weight pull you down loads the lower back; grade by how far the chest drops.',
    'DEPTH: the hip crease reaches at or below the top of the knee — a shallow squat cuts the work.',
    'SPINE: a neutral curve held throughout — watch for the low back tucking under (butt wink) at the bottom.',
    'HEELS: stay flat with the weight mid-foot, not rolling onto the toes.',
  ].join('\n'),

  nordiccurl: [
    'IDEAL: a rigid body from knees to head, lowering slowly forward under hamstring control, catching softly with the hands, then pulling back up.',
    'BODY LINE (weigh most heavily): the body stays one straight line from knees to shoulders — bending at the hips to "fake" the descent is the main cheat and it strips the hamstring load. A slight break is minor; folding at the hips is a clear fault.',
    'CONTROL: the descent is slow and resisted over several seconds — dropping fast and catching late is the main hamstring-strain risk; grade by how uncontrolled.',
    'LOWER BACK: stays neutral, not arching to lever back up.',
    'CATCH: the hands catch softly near the bottom — crashing chest-first is a fault.',
    'RANGE: lower as far as control allows and return — tiny partials barely train the eccentric.',
  ].join('\n'),

  // ── Core ───────────────────────────────────────────────────────────────────
  plank: [
    'IDEAL: forearms or hands under the shoulders, a straight rigid line from ear to ankle, braced and held still.',
    'HIP LINE (weigh most heavily): the hips stay level with the shoulder–ankle line — sagging drops the low back into compression, piking up offloads the core; grade by how far off the line.',
    'SHOULDERS: stacked over the elbows or wrists, not drifting forward or back.',
    'CORE / GLUTES: braced and squeezed to hold the line, not relaxed.',
    'NECK: neutral with the gaze at the floor — not craning up or dropping the head.',
    'HOLD: a steady held position — shaking and sagging as it fails signals the limit.',
  ].join('\n'),

  sideplank: [
    'IDEAL: stacked on one forearm with the body in a straight line, hips lifted, holding steady.',
    'HIP HEIGHT (weigh most heavily): the hips stay lifted in a straight head-to-feet line — sagging toward the floor is the main fault; grade by the sag.',
    'SHOULDER: stacked directly over the supporting elbow, not collapsing into the shoulder.',
    'ALIGNMENT: hips, shoulders and feet stay stacked in one plane — not rotating forward or back.',
    'NECK: neutral and in line with the spine.',
    'HOLD: steady — dropping the hips as it fatigues marks the limit.',
  ].join('\n'),

  deadbug: [
    'IDEAL: on the back with the low back pressed flat, lowering opposite arm and leg slowly while the core holds the spine still.',
    'LOW BACK (weigh most heavily): the lumbar spine stays pressed to the floor the whole time — if it arches up as the limbs extend, the core has lost the brace; that is the key fault.',
    'CONTROL: slow, deliberate limb movement — fast flailing means the core is not controlling it.',
    'COORDINATION: opposite arm and leg move together, then switch cleanly.',
    'RANGE: extend the limbs only as far as the back can stay flat — not further.',
    'NECK: relaxed on the floor, not tucking the chin hard.',
  ].join('\n'),

  birddog: [
    'IDEAL: on all fours, extending opposite arm and leg to a straight line with a flat still torso, then switching.',
    'TORSO STABILITY (weigh most heavily): the spine and hips stay level and still — rotating the hips open or arching the back as the limbs extend is the main fault.',
    'EXTENSION: the arm and leg reach to about parallel with the floor — going higher arches the low back.',
    'BALANCE: a controlled reach and return, not wobbling or rushing.',
    'NECK: neutral with the gaze down.',
    'COORDINATION: opposite arm and leg, switching cleanly.',
  ].join('\n'),

  russiantwist: [
    'IDEAL: seated leaning back to engage the core, rotating the torso side to side under control with a flat back.',
    'SPINE (weigh most heavily): the back stays flat, not rounding into a C — rounding under the twist loads the discs.',
    'ROTATION: the twist comes from the torso, not just swinging the arms across.',
    'LEAN: a steady lean-back maintaining core tension throughout, not collapsing.',
    'PACE: controlled rotation — fast flinging loses tension and control.',
    'NECK: neutral, following the torso, not whipping side to side.',
  ].join('\n'),

  hollowbody: [
    'IDEAL: on the back with the low back pressed flat, arms and legs extended and lifted into a shallow banana shape, held still.',
    'LOW BACK (weigh most heavily): the lumbar stays glued to the floor — any gap or arch under the low back means the position has broken; raise the limbs higher to keep it flat if needed.',
    'SHOULDER BLADES: lifted off the floor along with the legs — not just the legs.',
    'SHAKE: a steady hold; trembling with the low back lifting marks the limit.',
    'NECK: relaxed with the chin slightly tucked, not straining.',
    'LEGS: straight and together, lifted only as low as the back stays flat.',
  ].join('\n'),

  wallsit: [
    'IDEAL: back flat against the wall, thighs parallel to the floor, knees stacked over the ankles at 90°, held still.',
    'KNEE ANGLE (weigh most heavily): the thighs sink to about parallel with the knees over the ankles — sitting higher than 90° cheats the hold; grade by how high.',
    'KNEE TRACKING: the knees stay over the feet, not caving inward.',
    'BACK: stays flat against the wall, not sliding down or arching off it.',
    'WEIGHT: even on both feet with the heels down.',
    'HOLD: steady — shaking and rising up the wall signals fatigue.',
  ].join('\n'),

  bicyclecrunch: [
    'IDEAL: lower back pressed flat, shoulder blades off the floor, rotating one elbow toward the opposite knee while the other leg extends long, alternating smoothly.',
    'NECK (weigh most heavily): hands rest lightly behind the head and never haul it across — yanking the head toward the knee strains the cervical spine; grade by how hard the head is pulled.',
    'ROTATION: the twist comes from the torso turning, not just the elbow swinging across or the head turning side to side.',
    'LOWER BACK: stays pressed toward the floor — if it arches up as the leg extends, the extended leg is too low; raise it.',
    'LEG EXTENSION: the non-working leg straightens fully rather than both knees staying bent.',
    'PACE: slow and controlled — fast flailing loses the rotation and the tension.',
  ].join('\n'),

  legraise: [
    'IDEAL: legs straight, lower back pressed flat to the floor, raising the legs toward vertical and lowering under control without the back arching.',
    'LOWER BACK (weigh most heavily): the lumbar stays pressed to the floor the whole time — if it arches up as the legs lower, the hip flexors are pulling on the spine; that is the key fault and the main injury risk. Bending the knees slightly is better than letting the back arch.',
    'CONTROL: the legs lower slowly — dropping them fast yanks the lumbar into extension.',
    'RANGE: raise toward vertical and lower close to the floor without resting, as far as the back stays flat.',
    'LEGS: stay relatively straight; collapsing them defeats the lower-ab work.',
    'NECK: relaxed on the floor, not straining up.',
  ].join('\n'),

  flutterkick: [
    'IDEAL: legs straight and lifted just off the floor, lower back pressed flat, alternating small quick up-and-down kicks.',
    'LOWER BACK (weigh most heavily): the lumbar stays pressed to the floor throughout — if it arches up, the legs are too low or the core has lost the brace; that is the key fault and injury risk. Lift the legs higher to keep the back flat.',
    'LEGS: stay relatively straight with small controlled kicks — large wild kicks lose the lower-ab tension.',
    'PACE: quick but controlled, not frantic thrashing.',
    'HEAD / SHOULDERS: if the head and shoulders strain up, support them rather than craning the neck.',
  ].join('\n'),

  vsit: [
    'IDEAL: balanced on the tailbone with legs and torso lifted into a V, the spine tall, arms reaching forward, held steady.',
    'SPINE (weigh most heavily): the chest stays tall and the back long — collapsing and rounding into a C-shape under the compression loads the lumbar discs and is the main fault; grade by how rounded.',
    'LEG ANGLE: the legs hold around 45° and steady — sagging toward the floor or bending the knees (unless regressing) reduces the hold.',
    'BALANCE: a still, controlled balance on the tailbone — propping up with the hands on the floor means it is too hard; regress by tucking the knees.',
    'SHAKE: a steady hold; trembling and collapsing the chest marks the limit.',
    'NECK: neutral, not jutting forward to counterbalance.',
  ].join('\n'),

  abwheel: [
    'IDEAL: from the knees, rolling the wheel forward under control to full extension while the core holds a flat or slightly rounded-down spine, then pulling back without the hips dropping.',
    'LOWER BACK (weigh most heavily): the lumbar must NOT arch and sag toward the floor as the wheel rolls out — losing the brace dumps the load onto the lower back and is the serious injury risk here; even a slight sag is a real fault and a deep arch is dangerous. Roll out only as far as the back stays neutral.',
    'RANGE: extend as far as control allows and return — going past the point where the back caves is not more range, it is a failed rep.',
    'HIPS: travel with the shoulders as one unit — piking the hips up to cheat the return offloads the core.',
    'CONTROL: a slow resisted roll both directions — collapsing forward at the bottom is a fault and a strain risk.',
    'NECK: neutral, gaze down, not craning up.',
  ].join('\n'),

  // ── Push-up variations ─────────────────────────────────────────────────────
  diamondpushup: [
    'IDEAL: hands close together forming a diamond under the chest, a rigid plank, lowering the chest to the hands with the elbows tucked.',
    'ELBOWS (weigh most heavily): stay tucked close to the body — the close hand position makes flaring especially hard on the shoulders and elbows; grade by the flare.',
    'BODY LINE: one straight line ear-to-ankle — hips sagging or piking is the same fault as a standard push-up.',
    'DEPTH: the chest lowers to the hands; partial reps cut the triceps work.',
    'WRISTS: stacked and neutral — the close grip loads them more.',
  ].join('\n'),

  widegripushup: [
    'IDEAL: hands wider than the shoulders, a rigid plank, lowering the chest between the hands.',
    'BODY LINE (weigh most heavily): hold one straight plank ear-to-ankle — hips sagging or piking is the primary fault.',
    'ELBOWS: the wide grip naturally flares the elbows more, so watch they do not splay to a hard straight line with the shoulders, which strains the joint.',
    'DEPTH: the chest descends toward the floor; shallow reps cut the range.',
    'SHOULDERS: stay set, not collapsing forward.',
  ].join('\n'),

  declinepushup: [
    'IDEAL: feet elevated, a rigid plank on a downward slope, lowering the chest to the floor with the elbows around 45°.',
    'BODY LINE (weigh most heavily): the straight ear-to-ankle line is harder to hold with the feet up — hips sagging is the main fault; grade by the sag.',
    'ELBOWS: track around 45°, not flaring wide.',
    'SHOULDERS: the decline loads them more — keep them set and do not let the head drop toward the floor.',
    'DEPTH: the chest nears the floor; partial reps cut the range.',
  ].join('\n'),

  inclinepushup: [
    'IDEAL: hands elevated on a bench or bar, a rigid plank on an upward slope, lowering the chest to the surface.',
    'BODY LINE (weigh most heavily): one straight plank ear-to-ankle — even though it is easier, hips sagging or piking is still the main fault.',
    'ELBOWS: track around 45°, not flaring wide.',
    'DEPTH: the chest lowers to the surface; bouncing off cuts the range.',
    'WRISTS: stacked over the elevated surface.',
  ].join('\n'),

  pikeupshup: [
    'IDEAL: hips piked high into an inverted V, lowering the crown of the head toward the floor between the hands and pressing back up — a shoulder-press pattern.',
    'HEAD PATH (weigh most heavily): the head lowers toward a point between or just ahead of the hands to load the shoulders — staying too horizontal turns it back into a regular push-up.',
    'HIPS: stay piked high throughout — unlike a normal push-up, hips high is correct here; letting them drop loses the overhead angle.',
    'ELBOWS: track forward and slightly out, not flaring straight to the sides.',
    'NECK: controlled near the bottom — do not crash the head into the floor.',
    'DEPTH: lower until the head nears the floor, then press to a full lockout.',
  ].join('\n'),

  // ── Plyometrics ────────────────────────────────────────────────────────────
  boxjump: [
    'IDEAL: a quick athletic dip, an explosive two-foot jump, and a soft quiet landing on the box with bent knees, then standing tall.',
    'LANDING (weigh most heavily): land soft and balanced on the box with bent knees absorbing the force — stiff or off-balance landings are the main injury risk; grade by how hard or uncontrolled.',
    'KNEE VALGUS: the knees stay out on both takeoff and landing — caving in is high knee risk.',
    'LANDING DEPTH: land in a partial squat, not crashing into a deep collapse.',
    'STAND TALL: fully extend the hips on top before stepping (not jumping) down.',
    'TAKEOFF: drive through the full foot with both feet, not stumbling up.',
  ].join('\n'),

  broadjump: [
    'IDEAL: a powerful two-foot horizontal jump with a big arm swing, landing soft with bent knees and the hips back to absorb force.',
    'LANDING (weigh most heavily): land soft with bent knees and the hips back — stiff, straight-leg or off-balance landings are the main risk; grade by how jarring.',
    'KNEE VALGUS: the knees stay out on takeoff and landing — caving is high ACL risk.',
    'HIP HINGE: load by sitting the hips back before exploding forward, not just bending the knees.',
    'ARMS: a full backswing then drive forward for momentum.',
    'BALANCE: stick the landing without stumbling forward.',
  ].join('\n'),

  tuckjump: [
    'IDEAL: an explosive vertical jump driving the knees up toward the chest, landing soft with bent knees.',
    'LANDING (weigh most heavily): land soft and balanced with bent knees absorbing each rep — repeated stiff landings stress the joints; grade by how hard.',
    'KNEE VALGUS: the knees track straight on takeoff and landing, not caving.',
    'KNEE DRIVE: the knees come up toward the chest at the top, not a flat hop.',
    'TORSO: stays fairly upright — not folding forward to meet the knees.',
    'RHYTHM: controlled, resetting between reps rather than frantic bouncing.',
  ].join('\n'),

  starjump: [
    'IDEAL: from a small crouch, exploding up and spreading the arms and legs into a star, landing soft with bent knees.',
    'LANDING (weigh most heavily): land soft with bent knees — stiff landings are the main joint risk; grade by how jarring.',
    'KNEE VALGUS: the knees stay out on landing, not caving.',
    'EXTENSION: the arms and legs reach a full star at the peak — small movements lose the point.',
    'TORSO: stays controlled, not flailing.',
    'RHYTHM: land, absorb, then reset — not crashing into the next rep.',
  ].join('\n'),

  skaterjump: [
    'IDEAL: bounding laterally from one leg to the other, landing soft on the outside leg with the knee tracking over the foot, the other leg sweeping behind.',
    'LANDING KNEE (weigh most heavily): the landing knee tracks over the foot and does not cave inward — lateral landing valgus is the key ACL risk here; grade by how much it caves.',
    'SOFT LANDING: absorb each bound with a bent knee and hip — stiff lateral landings stress the knee and ankle.',
    'BALANCE: stick each landing under control before pushing off — wobbling means too much speed.',
    'HIP HINGE: sit the hips back slightly to absorb and reload, not landing stiff-legged.',
    'PACE: rhythmic and controlled, not frantic.',
  ].join('\n'),

  jumpingjack: [
    'IDEAL: jumping the feet out while sweeping the arms overhead, then back together, at a steady controlled rhythm.',
    'LANDING (weigh most heavily): land softly on the balls of the feet with slightly bent knees — stiff, heavy landings stress the ankles and knees; grade by how jarring.',
    'KNEES: track over the feet on landing, not caving in.',
    'COORDINATION: the arms and legs move in sync — flailing or half-raised arms lose the range.',
    'ARM RANGE: the arms reach fully overhead, not stopping at shoulder height.',
    'PACE: brisk but controlled, keeping the landings soft.',
  ].join('\n'),

  highnees: [
    'IDEAL: running in place driving the knees up to hip height with a tall torso and quick light foot contacts.',
    'TORSO (weigh most heavily): stay tall — leaning back to swing the knees up strains the low back; the height comes from the hip flexors, not a backward lean.',
    'KNEE HEIGHT: the knees drive to about hip height — low, shuffling knees lose the point.',
    'FOOT CONTACT: land light on the balls of the feet, not slamming flat.',
    'ARMS: pump in opposition to the legs for rhythm.',
    'PACE: quick but controlled, keeping the knees high rather than just fast and low.',
  ].join('\n'),

  // ── Conditioning ───────────────────────────────────────────────────────────
  shadowboxing: [
    'IDEAL: a light athletic stance, hands up guarding the chin, throwing controlled punches with rotation through the hips and shoulders, returning the hands to guard.',
    'GUARD (weigh most heavily): the non-punching hand stays up by the chin and the hands return to guard after each punch — dropping the hands is the main fault to flag.',
    'ROTATION: power comes from rotating the hips and shoulders, not just the arm.',
    'ELBOWS: punches extend without locking or snapping the elbow hard.',
    'STANCE: knees soft, weight balanced, light on the feet — not flat-footed or over-reaching.',
    'PACE: controlled combinations staying balanced, rather than wild flailing.',
  ].join('\n'),

  // ── Mobility (circles / rolls) ─────────────────────────────────────────────
  anklecircle: [
    'IDEAL: one foot lifted, slowly tracing full circles with the ankle while the leg stays still.',
    'ISOLATION (weigh most heavily): only the ankle moves — the whole leg swinging around means the hip is doing the work, not the ankle.',
    'RANGE: trace as wide a circle as the ankle allows — tiny circles lose the mobility benefit.',
    'PACE: slow and controlled, not whipping around.',
    'DIRECTION: circle each way evenly.',
  ].join('\n'),

  wristcircle: [
    'IDEAL: arms steady, slowly rotating the wrists through full circles.',
    'ISOLATION (weigh most heavily): only the wrists move — swinging the forearms means the wrist is not being mobilized.',
    'RANGE: full circles for the mobility benefit, not tiny twitches.',
    'PACE: slow and controlled.',
    'SYMMETRY: both wrists circling evenly, both directions.',
  ].join('\n'),

  shoulderroll: [
    'IDEAL: arms relaxed at the sides, rolling the shoulders in big slow circles up, back and down.',
    'RANGE (weigh most heavily): roll through the full circle — up toward the ears, back squeezing the blades, then down — small partial rolls lose the benefit.',
    'ISOLATION: the shoulders do the work; the torso stays still, not bobbing.',
    'PACE: slow and deliberate.',
    'NECK: stays relaxed and neutral, not jutting forward.',
  ].join('\n'),

  neckroll: [
    'IDEAL: gentle slow half-circles rolling the chin from shoulder to chest to shoulder.',
    'CONTROL (weigh most heavily): slow and gentle — fast or forceful rolling, especially cranking the head all the way back, risks the cervical spine; keep it easy.',
    'RANGE: a comfortable arc (ear toward shoulder, chin toward chest) — avoid forcing into pain or a full backward roll.',
    'SHOULDERS: stay relaxed and down, not rising toward the ears.',
    'PACE: slow throughout, both directions.',
  ].join('\n'),

  // ── Stretching / static mobility ───────────────────────────────────────────
  catcow: [
    'IDEAL: on all fours, slowly alternating between a full arch (cow — belly drops, chest and tailbone lift) and a full round (cat — spine domes up, chin and tailbone tuck), moving through every segment of the spine.',
    'RANGE (weigh most heavily): each phase reaches its full end range — the more complete the arch and the round, the more of the spine is mobilized; a small wobble in only the mid-back is most of the value lost.',
    'SEGMENTATION: the spine moves segment by segment, not just hinging at one spot like the low back.',
    'PACE: slow and breath-paced — rushing skips range and the warm-up effect.',
    'NECK: follows the spine naturally (lifting in cow, tucking in cat), not cranked hard at either end.',
    'BASE: wrists under shoulders and knees under hips stay planted as the spine moves.',
  ].join('\n'),

  childpose: [
    'IDEAL: kneeling with the hips sinking back toward the heels, arms reaching long forward, chest and forehead settling toward the floor, breathing into the back.',
    'HIP DEPTH (weigh most heavily): the hips sink back toward the heels — staying propped high off the heels means little stretch reaches the lower back and lats; the closer to the heels (within comfort), the deeper the release.',
    'ARM REACH: the arms extend long forward to lengthen the lats — tucked-in arms lose the upper-body stretch.',
    'SPINE: long and relaxed, letting the back round gently — not held rigid.',
    'NECK: relaxed with the forehead toward the floor, not craned up.',
    'BREATHING: slow exhales soften the position deeper; the thing to flag is held breath with the shoulders hiked up.',
  ].join('\n'),

  worldsgreateststretch: [
    'IDEAL: a deep lunge with the front foot flat, the same-side hand on the floor inside it, then the opposite arm rotating open to the sky with the gaze following the hand.',
    'THORACIC ROTATION (weigh most heavily): the top arm opens toward the sky with the chest rotating to follow — the more the upper back opens, the better; a small half-turn is most of the value lost.',
    'LUNGE DEPTH: the front knee bends into a deep lunge so the trailing-leg hip flexor gets a real stretch — a shallow stance shortchanges it.',
    'TRAILING LEG: the back leg extends long with the hip sinking, rather than staying high, to load the hip flexor and groin.',
    'SPINE: stays long as it rotates — collapsing or rounding loses the thoracic opening.',
    'CONTROL: a smooth reach and brief hold at the top, not a quick uncontrolled twist.',
  ].join('\n'),

  hipflexorstretch: [
    'IDEAL: a half-kneeling lunge, torso tall, gently shifting the hips forward and squeezing the rear glute to stretch the front of the rear hip.',
    'PELVIC TILT / GLUTE (weigh most heavily): tucking the pelvis under by squeezing the rear glute is what actually lengthens the hip flexor — lunging deeper with an arched low back fakes the range and shifts strain to the lumbar; that arch is the main fault to flag.',
    'TORSO: stays upright over the hips — leaning forward releases the very muscle being stretched.',
    'FRONT KNEE: stays stacked over the front ankle, not collapsing inward or shooting far past the toes.',
    'DEPTH: shift forward only until a real stretch is felt in the front of the rear hip — not forcing into pain.',
    'BALANCE: a stable half-kneel, not wobbling side to side.',
  ].join('\n'),

  hamstringstretch: [
    'IDEAL: hinging from the hips with a soft knee bend, letting the torso hang toward the floor so the stretch is felt behind the thighs.',
    'HINGE vs ROUND (weigh most heavily): the fold comes from the hips with a long spine — rounding hard from the waist shifts the pull into the lower back instead of the hamstrings; a gently long back is correct, a deep lumbar round under the hang is a real concern.',
    'KNEES: a soft bend rather than locked rigid — locking out to chase range strains the hamstring attachment and the back.',
    'DEPTH: fold to where the hamstrings tension, not bouncing or forcing past it.',
    'WEIGHT: stays balanced with the hips roughly over the heels, not toppling forward.',
    'NECK: relaxed and hanging, not held up.',
  ].join('\n'),

  quadstretch: [
    'IDEAL: balanced on one leg, the other heel drawn toward the glute with the knees together and the torso tall.',
    'KNEE ALIGNMENT (weigh most heavily): the bent knee points down with both knees close together — letting it splay out to the side reduces the quad stretch and twists the knee; grade by how far it drifts.',
    'PELVIS / LOW BACK: a slight glute squeeze keeps the pelvis tucked — arching the low back to pull the heel higher fakes range and stresses the lumbar.',
    'TORSO: stays tall, not folding forward to compensate.',
    'GRIP: hold the ankle (not the toes) and draw gently — no hard yanking on the knee.',
    'BALANCE: steady on the standing leg (a wall or chair is fine) rather than wobbling.',
  ].join('\n'),

  pigeonpose: [
    'IDEAL: the front shin angled across the body with the hips square to the floor, the back leg extended straight behind, settling the torso down over the front leg.',
    'HIPS SQUARE (weigh most heavily): both hips stay level and square to the floor — letting the back-leg hip rotate open and dumping the weight to one side both reduces the glute stretch and torques the front knee.',
    'FRONT KNEE: protected — the stretch belongs in the glute and hip, NOT inside the knee. Pain or strain at the front knee means the shin angle is too aggressive; that is a real concern to flag, not more depth.',
    'BACK LEG: extends straight back with the kneecap and top of the foot down, not flared out.',
    'TORSO: lowers gradually over the front leg as the hip opens — forcing it down ahead of the hip is the wrong order.',
    'BREATHING: slow exhales ease the hip open; forcing or bouncing is the fault.',
  ].join('\n'),

  downdogstretch: [
    'IDEAL: an inverted V — hands and feet planted, hips pushed high and back, the spine long, heels reaching toward the floor and the head hanging between the arms.',
    'SPINE LENGTH (weigh most heavily): the priority is a long straight spine from hands to hips — rounding the upper back to force the heels down defeats the pose; bend the knees if needed to keep the back long. A rounded back is the main fault.',
    'HIPS: pushed high and back into the peak of the V — sagging them toward a plank loses the stretch.',
    'SHOULDERS: rotate outward and stay away from the ears with straight arms — shrugging into the neck is a fault.',
    'HEELS: reach toward the floor for the calf and hamstring stretch, but not at the cost of spine length.',
    'NECK: relaxed, the head hanging freely between the arms, not held up.',
  ].join('\n'),

  cobrapose: [
    'IDEAL: lying face down, hands under the shoulders, pressing the chest up into a gentle back arch while the hips stay on the floor and the shoulders stay down.',
    'HIPS DOWN (weigh most heavily): the hips and pelvis stay grounded — pushing them off the floor turns it into an upward dog or push-up and removes the targeted spinal extension.',
    'SPINE: a gentle even arch through the whole back — cranking hard into a deep lumbar-only hinge is a strain risk; lift only as high as is comfortable.',
    'SHOULDERS: pulled down and back, away from the ears — shrugging up toward the ears is the common fault.',
    'NECK: a natural continuation of the spine with the gaze slightly up — not flinging the head all the way back.',
    'ELBOWS: stay slightly bent and close rather than locking out and over-arching.',
  ].join('\n'),

  seatedspinaltwist: [
    'IDEAL: seated tall, one knee crossed over the extended leg, twisting toward the bent knee with the opposite elbow bracing it and the gaze over the shoulder.',
    'SPINE TALL (weigh most heavily): the back stays long and upright as it rotates — slumping or rounding into the twist compresses the discs and loses the mobility benefit; lengthen up first, then rotate.',
    'ROTATION: the twist comes from the torso turning segment by segment, not just cranking the head around or levering hard with the arm.',
    'HIPS: stay grounded and square with both sitting bones down — lifting one hip cheats the rotation.',
    'NECK: turns with the spine to look over the shoulder, not forced past comfort.',
    'BREATHING: slow exhales deepen the twist gently; yanking with the elbow is the fault.',
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
  frontraise:        'wrists, elbows, shoulders, torso — NOT knees or ankles',
  arnoldpress:       'wrists, elbows, shoulders, upper back, core — NOT knees or ankles',
  skullcrusher:      'elbows, wrists, upper arms, shoulders — NOT knees, ankles, or lower body',
  concentrationcurl: 'wrist, elbow, shoulder, torso — NOT lower body movement',
  zottmancurl:       'wrists, elbows, shoulders, torso — NOT knees or ankles',
  wristcurl:         'wrists, forearms — NOT shoulders, elbows, or lower body',
  chinup:            'hands, elbows, shoulders, core — NOT knees or ankles',
  dumbbellrow:       'spine, shoulder blade, elbow, supporting hip — flat back and elbow path',
  invertedrow:       'shoulders, shoulder blades, elbows, hips, core — full body line',
  superman:          'lower back, glutes, shoulders, neck — spinal extension control',
  hyperextension:    'hips, lower back, spine, neck — hip hinge and neutral spine',
  romaniandeadlift:  'feet, hips, spine, hamstrings, bar path',
  goodmorning:       'hips, spine, knees, neck — hip hinge and neutral spine',
  glutebridge:       'hips, glutes, knees, feet, lower back',
  hipthrust:         'hips, glutes, knees, ribs and lower back, shins',
  bulgariansplitsquat: 'front knee, hip, torso, balance — knee tracking and upright posture',
  curtsylunge:       'front knee, hips, torso, balance — lateral knee tracking',
  stepup:            'front knee, hip, torso, supporting foot — knee tracking and drive',
  donkeykick:        'hips, glutes, lower back, core — hip extension without spinal arch',
  firehydrant:       'hips, glutes, lower back, core — hip abduction with a stable torso',
  sideplank:         'supporting shoulder, hips, spine, feet — straight side line',
  deadbug:           'lower back, core, opposite arm and leg — lumbar stays flat',
  birddog:           'spine, hips, opposite arm and leg, neck — stable torso',
  russiantwist:      'spine, core, torso rotation — flat back',
  hollowbody:        'lower back, core, shoulder blades, legs — lumbar stays flat',
  diamondpushup:     'hands, wrists, elbows, shoulders, spine, hips — full body alignment',
  widegripushup:     'hands, wrists, elbows, shoulders, spine, hips — full body alignment',
  declinepushup:     'hands, wrists, elbows, shoulders, spine, hips, elevated feet — full body alignment',
  inclinepushup:     'hands, wrists, elbows, shoulders, spine, hips — full body alignment',
  pikeupshup:        'wrists, shoulders, elbows, hips, neck — overhead press pattern',
  boxjump:           'feet, ankles, knees, hips — takeoff and landing mechanics, knee valgus',
  broadjump:         'feet, ankles, knees, hips, spine — landing mechanics and knee valgus',
  tuckjump:          'feet, ankles, knees, hips, torso — landing mechanics and knee drive',
  starjump:          'feet, ankles, knees, hips, arms — landing mechanics',
  skaterjump:        'landing knee, ankle, hip, balance — lateral knee tracking',
  shadowboxing:      'guard and hands, shoulders, hips, stance — rotation and balance',
  anklecircle:       'ankle, foot — isolated, NOT the whole leg or hip',
  wristcircle:       'wrists, forearms — isolated, NOT shoulders',
  shoulderroll:      'shoulders, shoulder blades, neck — NOT torso or lower body',
  neckroll:          'neck, cervical spine, shoulders — gentle controlled range',
  reverselunge:      'front knee, back knee, hips, torso, balance — knee tracking and upright posture',
  sumosquat:         'feet, ankles, knees, hips, spine, torso — wide-stance knee tracking and depth',
  gobletsquat:       'feet, ankles, knees, hips, spine, torso',
  nordiccurl:        'hamstrings, hips, lower back, body line — eccentric control',
  bicyclecrunch:     'neck, core, obliques, torso rotation, legs — NOT knees or ankles loading',
  legraise:          'lower back, core, hip flexors, legs — lumbar stays flat',
  flutterkick:       'lower back, core, hip flexors, legs — lumbar stays flat',
  vsit:              'spine, core, hip flexors, legs — tall spine and balance',
  abwheel:           'lower back, core, hips, shoulders — lumbar brace through the rollout',
  reversefly:        'spine, shoulder blades, rear shoulders, elbows — flat back and retraction',
  catcow:            'spine, lower back, neck — full flexion and extension range',
  childpose:         'hips, lower back, lats, shoulders — hip depth and arm reach',
  worldsgreateststretch: 'thoracic spine, hips, hip flexors, hamstrings — rotation and lunge depth',
  hipflexorstretch:  'hips, hip flexors, pelvis, torso, front knee — pelvic tilt and upright posture',
  hamstringstretch:  'hips, hamstrings, lower back, knees — hip hinge vs spinal rounding',
  quadstretch:       'quads, bent knee, pelvis, standing-leg balance — knee alignment',
  pigeonpose:        'hips, glutes, front knee, back leg, torso — square hips and knee safety',
  downdogstretch:    'spine, hips, shoulders, hamstrings, calves, neck — spine length',
  cobrapose:         'spine, lower back, hips, shoulders, neck — gentle extension with hips down',
  seatedspinaltwist: 'spine, obliques, hips, neck — tall upright rotation',
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

    const guide = EXERCISE_GUIDES[rubricKey(params.exercise)]
      ?? 'Check posture, joint alignment, spine neutrality, and full range of motion. Flag any rounding, collapsing, or compensatory movement patterns.'

    const focusNote = BODY_FOCUS[rubricKey(params.exercise)]
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
        '  Calibrate to the movement: for low-risk mobility, stretch and light-isolation work, reserve the top bands (61+) for genuine joint strain — forcing a stretch, cranking the neck or low back, collapsing under load — otherwise the score reflects movement QUALITY (range, symmetry, control), not danger. For heavy, loaded or high-impact moves, weight injury risk more aggressively.',
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

  const guide = EXERCISE_GUIDES[rubricKey(params.exercise)]
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
      '  Calibrate to the movement: for low-risk mobility, stretch and light-isolation work, reserve the top bands (61+) for genuine joint strain — forcing a stretch, cranking the neck or low back, collapsing under load — otherwise the score reflects movement QUALITY (range, symmetry, control), not danger. For heavy, loaded or high-impact moves, weight injury risk more aggressively.',
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
      `RELEVANT BODY PARTS FOR THIS EXERCISE: ${BODY_FOCUS[rubricKey(params.exercise)] ?? 'all major joints relevant to this exercise'}`,
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
