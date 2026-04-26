import { useRef, useState, useCallback, useEffect } from 'react'
import type { NormalizedLandmark } from '@mediapipe/pose'

// ── MediaPipe landmark indices ─────────────────────────────────────────────

const LM = {
  LEFT_SHOULDER:  11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW:     13,
  RIGHT_ELBOW:    14,
  LEFT_WRIST:     15,
  RIGHT_WRIST:    16,
  LEFT_HIP:       23,
  RIGHT_HIP:      24,
  LEFT_KNEE:      25,
  RIGHT_KNEE:     26,
  LEFT_ANKLE:     27,
  RIGHT_ANKLE:    28,
  LEFT_HEEL:      29,
  RIGHT_HEEL:     30,
} as const

// ── Types ──────────────────────────────────────────────────────────────────

export type SupportedExercise =
  | 'squat'
  | 'pushup'
  | 'lunge'
  | 'deadlift'
  | 'shoulderpress'
  | 'curlup'
  | 'bicepcurl'
  | 'jumpingjack'
  | 'highnees'
  | 'plank'
  | 'wallsit'
  | 'tricepextension'
  | 'lateralraise'
  | 'hammercurl'
  | 'pullup'
  | 'benchpress'
  | 'mountainclimber'
  | 'buttskick'
  | 'calfraise'
  | 'situp'
  | 'armcircle'
  | 'scapulasqueeze'
  | 'crossbodystretch'
  | 'tricepstretch'
  | 'hipcircle'
  | 'chestpress'
  | 'sidelunge'
  | 'chestfly'
  | 'jumpsquat'
  | 'burpee'
  | 'legRaise'
  | 'firehydrant'
  | 'glutebridge'
  | 'hipthrust'
  | 'donkeykick'
  | 'russiantwist'

export type MovementPhase = 'up' | 'down' | 'unknown'

export interface RepLogEntry {
  exercise:  string
  timestamp: number
  phase:     string
}

export interface UseRepCounterReturn {
  repCount:          number
  phase:             MovementPhase
  lastRepTimestamp:  number | null
  repLog:            RepLogEntry[]
  isCalibrating:     boolean
  reset:             () => void
  /** Per-arm rep counts — only populated for bicepcurl / hammercurl, otherwise both 0. */
  armReps:           { left: number; right: number }
}

// ── Exercise config ────────────────────────────────────────────────────────

interface ExerciseConfig {
  joints: [number, number]
  /**
   * Which phase transition completes a rep.
   * 'down_to_up' — squat/pushup/deadlift/lunge: bottom → top = rep done
   * 'up_to_down' — shoulderpress: overhead (up) → back down = rep done
   */
  repOn: 'down_to_up' | 'up_to_down'
  /** Override the global DEBOUNCE_MS for fast exercises like high knees or jumping jacks */
  debounceMs?: number
}

const EXERCISE_CONFIG: Record<SupportedExercise, ExerciseConfig> = {
  squat:         { joints: [LM.LEFT_HIP,       LM.RIGHT_HIP],      repOn: 'down_to_up' },
  pushup:        { joints: [LM.LEFT_SHOULDER,   LM.RIGHT_SHOULDER], repOn: 'down_to_up' },
  lunge:         { joints: [LM.LEFT_KNEE,       LM.RIGHT_KNEE],     repOn: 'down_to_up' },
  deadlift:      { joints: [LM.LEFT_HIP,        LM.RIGHT_HIP],      repOn: 'down_to_up' },
  shoulderpress: { joints: [LM.LEFT_WRIST,      LM.RIGHT_WRIST],    repOn: 'up_to_down' },
  // Curl-up: track shoulders — they rise (low Y) at top, rep counted on down→up
  curlup:        { joints: [LM.LEFT_SHOULDER,   LM.RIGHT_SHOULDER], repOn: 'down_to_up' },
  // Bicep curl: track wrists — they rise toward shoulder at top, rep counted on down→up
  bicepcurl:     { joints: [LM.LEFT_WRIST,      LM.RIGHT_WRIST],    repOn: 'down_to_up' },
  // Jumping jack: track wrists — arms go overhead (low Y) then back to sides (high Y)
  // Rep counted on up_to_down: when arms come back down = one full jack completed
  jumpingjack:     { joints: [LM.LEFT_WRIST,      LM.RIGHT_WRIST],    repOn: 'up_to_down',  debounceMs: 700 },
  // High knees: use absolute knee-Y difference. Both level = diff≈0 = "up"; one raised = diff large = "down".
  // Rep counted on up_to_down: when diff grows (knee rising) = 1 rep per raise.
  highnees:        { joints: [LM.LEFT_KNEE,        LM.RIGHT_KNEE],     repOn: 'up_to_down',  debounceMs: 500 },
  // Hold exercises — no reps counted; useHoldTimer handles timing
  plank:           { joints: [LM.LEFT_HIP,         LM.RIGHT_HIP],      repOn: 'down_to_up' },
  wallsit:         { joints: [LM.LEFT_HIP,         LM.RIGHT_HIP],      repOn: 'down_to_up' },
  // Tricep extension: elbow angle (shoulder→elbow→wrist). Extended (~160°) = up; bent (~40°) = down.
  tricepextension: { joints: [LM.LEFT_ELBOW,       LM.RIGHT_ELBOW],    repOn: 'down_to_up' },
  // Lateral raise: wrist Y. Arms at sides (high Y) = "down"; arms at shoulder height (low Y) = "up".
  lateralraise:    { joints: [LM.LEFT_WRIST,       LM.RIGHT_WRIST],    repOn: 'up_to_down',  debounceMs: 900 },
  // Hammer curl: same elbow-angle signal as bicep curl, neutral grip (indistinguishable by pose).
  hammercurl:      { joints: [LM.LEFT_WRIST,       LM.RIGHT_WRIST],    repOn: 'down_to_up' },
  // Pull-up: elbow angle. Arms fully extended (hanging) = large angle = "down"; chin-over-bar = small angle = "up".
  pullup:          { joints: [LM.LEFT_WRIST,       LM.RIGHT_WRIST],    repOn: 'down_to_up' },
  // Bench press: elbow angle. Bar on chest (elbows bent ~70-80°) = "down". Arms extended (~160°) = "up".
  benchpress:      { joints: [LM.LEFT_WRIST,       LM.RIGHT_WRIST],    repOn: 'down_to_up' },
  // Mountain climber: absolute knee-Y difference. Both legs extended = diff≈0 = "up".
  // One knee drives to chest = diff grows = "down". Rep on up_to_down (each knee drive).
  mountainclimber: { joints: [LM.LEFT_KNEE,         LM.RIGHT_KNEE],     repOn: 'up_to_down', debounceMs: 350 },
  // Butt kick: absolute ankle-Y difference. Both level = diff≈0 = "up"; one heel kicked up = diff large = "down".
  buttskick:       { joints: [LM.LEFT_ANKLE,        LM.RIGHT_ANKLE],    repOn: 'up_to_down', debounceMs: 300 },
  // Calf raise: average heel Y. Heels on floor (high Y) = "down"; raised on toes (low Y) = "up".
  calfraise:       { joints: [LM.LEFT_HEEL,         LM.RIGHT_HEEL],     repOn: 'down_to_up', debounceMs: 1000 },
  // Sit-up: same hipY−shoulderY signal as curl-up, full range.
  situp:           { joints: [LM.LEFT_SHOULDER,     LM.RIGHT_SHOULDER], repOn: 'down_to_up' },
  // Arm circle: average wrist Y. Arms overhead (low Y) = "up". Rep on up_to_down (arms return down).
  armcircle:       { joints: [LM.LEFT_WRIST,        LM.RIGHT_WRIST],    repOn: 'up_to_down', debounceMs: 700 },
  // Scapula squeeze: shoulder width (|lSh.x - rSh.x|). Wide/relaxed = "down". Squeezed/narrow = "up".
  // Rep counted on squeeze (down→up). Slow debounce — squeeze for 2–3 s, then release.
  scapulasqueeze:  { joints: [LM.LEFT_SHOULDER,     LM.RIGHT_SHOULDER], repOn: 'down_to_up', debounceMs: 1500 },
  // Hold exercises — timer-only, no reps (useHoldTimer handles them)
  crossbodystretch: { joints: [LM.LEFT_WRIST,       LM.RIGHT_WRIST],    repOn: 'down_to_up' },
  tricepstretch:    { joints: [LM.LEFT_ELBOW,        LM.RIGHT_ELBOW],    repOn: 'down_to_up' },
  // Hip circles: hip center X oscillates left/right as hips rotate. Count each pass through one extreme.
  hipcircle:        { joints: [LM.LEFT_HIP,          LM.RIGHT_HIP],      repOn: 'up_to_down', debounceMs: 1200 },
  // Chest press: elbow angle, same signal as pushup/benchpress (standing press forward).
  chestpress:       { joints: [LM.LEFT_WRIST,        LM.RIGHT_WRIST],    repOn: 'down_to_up' },
  // Side lunge: min knee angle (same as lunge). Large = standing = "up"; small = lunged = "down".
  sidelunge:        { joints: [LM.LEFT_KNEE,         LM.RIGHT_KNEE],     repOn: 'down_to_up', debounceMs: 1200 },
  // Chest fly: wrist spread |lWr.x - rWr.x|. Wide (large) = "down"; together (small) = "up". Rep on squeeze.
  chestfly:         { joints: [LM.LEFT_WRIST,        LM.RIGHT_WRIST],    repOn: 'down_to_up', debounceMs: 1000 },
  // Jump squat: same knee-angle signal as squat, faster debounce for explosive movement.
  jumpsquat:        { joints: [LM.LEFT_HIP,          LM.RIGHT_HIP],      repOn: 'down_to_up', debounceMs: 800 },
  // Burpee (3-phase): average body height via shoulder+hip Y. Standing = low Y = "up". Crouching/plank = high Y = "down".
  // Rep counted when returning to standing. Long debounce — full burpee cycle takes 2-3 s.
  burpee:           { joints: [LM.LEFT_SHOULDER,     LM.RIGHT_SHOULDER], repOn: 'down_to_up', debounceMs: 2500 },
  // Leg raise: average ankle Y. Legs flat = ankles on floor = high Y = "down". Legs raised = low Y = "up".
  // Rep counted on down→up (legs reach the raised position).
  legRaise:         { joints: [LM.LEFT_ANKLE,        LM.RIGHT_ANKLE],    repOn: 'down_to_up', debounceMs: 1500 },
  // Fire hydrant: min knee Y. Lifting knee rises (lower Y) = "up". Neutral = higher Y = "down".
  // Rep counted on down→up (knee fully lifted).
  firehydrant:      { joints: [LM.LEFT_KNEE,         LM.RIGHT_KNEE],     repOn: 'down_to_up', debounceMs: 1200 },
  // Glute bridge / hip thrust: hip Y rises as hips extend from floor. Uses hip Y signal same as squat fallback.
  glutebridge:      { joints: [LM.LEFT_HIP,          LM.RIGHT_HIP],      repOn: 'down_to_up', debounceMs: 1500 },
  hipthrust:        { joints: [LM.LEFT_HIP,          LM.RIGHT_HIP],      repOn: 'down_to_up', debounceMs: 1500 },
  // Donkey kick: on all fours, ankle kicks UP toward/above hip level. hip-ankle Y diff = glute signal.
  donkeykick:       { joints: [LM.LEFT_ANKLE,         LM.RIGHT_ANKLE],    repOn: 'down_to_up', debounceMs: 1200 },
  // Russian twist: seated, torso rotates left-right. Wrists sweep side to side — track wrist center X.
  russiantwist:     { joints: [LM.LEFT_WRIST,          LM.RIGHT_WRIST],    repOn: 'up_to_down', debounceMs: 700 },
}

// ── Constants ──────────────────────────────────────────────────────────────

const EMA_ALPHA         = 0.2    // more smoothing = less twitchy
const CALIBRATION_MS    = 800   // first 0.8 s used to calibrate range
const DOWN_THRESHOLD    = 0.65  // slightly more permissive (was 0.70)
const UP_THRESHOLD      = 0.35  // slightly more permissive (was 0.30)
const DEBOUNCE_MS       = 1200  // min ms between reps
const MIN_RANGE         = 0.04  // lower = catches smaller movements (was 0.06)
const CONFIDENCE_THRESH = 0.6
const PAUSE_AFTER_MS    = 1000  // null-landmark gap before pausing
const RECAL_AFTER_MS    = 2500  // if range still too small after this long, recalibrate

// ── Helpers ────────────────────────────────────────────────────────────────

/** Angle in degrees at landmark b, given three landmarks a-b-c. */
function calcAngle(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  c: NormalizedLandmark,
): number {
  const ax = a.x - b.x, ay = a.y - b.y
  const cx = c.x - b.x, cy = c.y - b.y
  const dot = ax * cx + ay * cy
  const mag = Math.sqrt((ax * ax + ay * ay) * (cx * cx + cy * cy))
  if (mag === 0) return 180
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI
}


function getJointY(
  landmarks: NormalizedLandmark[],
  idxA: number,
  idxB: number,
): { y: number; confidence: number } | null {
  const a = landmarks[idxA]
  const b = landmarks[idxB]
  if (!a || !b) return null
  const confA = a.visibility ?? 0
  const confB = b.visibility ?? 0
  return { y: (a.y + b.y) / 2, confidence: (confA + confB) / 2 }
}

/**
 * Average elbow angle (shoulder→elbow→wrist) across visible arms.
 * Extended arm ≈ 160–170°, fully curled ≈ 40–60°.
 */
function getElbowAngle(
  landmarks: NormalizedLandmark[],
): { value: number; confidence: number } | null {
  const lSh = landmarks[LM.LEFT_SHOULDER],  lEl = landmarks[LM.LEFT_ELBOW],  lWr = landmarks[LM.LEFT_WRIST]
  const rSh = landmarks[LM.RIGHT_SHOULDER], rEl = landmarks[LM.RIGHT_ELBOW], rWr = landmarks[LM.RIGHT_WRIST]

  const lConf = Math.min(lSh?.visibility ?? 0, lEl?.visibility ?? 0, lWr?.visibility ?? 0)
  const rConf = Math.min(rSh?.visibility ?? 0, rEl?.visibility ?? 0, rWr?.visibility ?? 0)

  const angles: number[] = []
  const confs:  number[] = []
  if (lConf >= CONFIDENCE_THRESH) { angles.push(calcAngle(lSh, lEl, lWr)); confs.push(lConf) }
  if (rConf >= CONFIDENCE_THRESH) { angles.push(calcAngle(rSh, rEl, rWr)); confs.push(rConf) }
  if (angles.length === 0) return null

  const n = angles.length
  return {
    value:      angles.reduce((s, v) => s + v, 0) / n,
    confidence: confs.reduce((s, v) => s + v, 0) / n,
  }
}

/**
 * Average knee angle (hip→knee→ankle) across visible legs.
 * Standing: ~160–170°. Bottom of squat: ~80–100°.
 * Large angle = standing (up), small angle = squatting (down).
 * Uses a lower per-landmark threshold so a partially-visible ankle doesn't
 * kill the whole signal (ankle can have reduced confidence indoors / close camera).
 */
function getKneeAngle(
  landmarks: NormalizedLandmark[],
  confThresh = CONFIDENCE_THRESH,
): { value: number; confidence: number } | null {
  const lHip = landmarks[LM.LEFT_HIP],  lKn = landmarks[LM.LEFT_KNEE],  lAn = landmarks[LM.LEFT_ANKLE]
  const rHip = landmarks[LM.RIGHT_HIP], rKn = landmarks[LM.RIGHT_KNEE], rAn = landmarks[LM.RIGHT_ANKLE]

  const lConf = Math.min(lHip?.visibility ?? 0, lKn?.visibility ?? 0, lAn?.visibility ?? 0)
  const rConf = Math.min(rHip?.visibility ?? 0, rKn?.visibility ?? 0, rAn?.visibility ?? 0)

  const angles: number[] = []
  const confs:  number[] = []
  if (lConf >= confThresh) { angles.push(calcAngle(lHip, lKn, lAn)); confs.push(lConf) }
  if (rConf >= confThresh) { angles.push(calcAngle(rHip, rKn, rAn)); confs.push(rConf) }
  if (angles.length === 0) return null

  const n = angles.length
  return {
    value:      angles.reduce((s, v) => s + v, 0) / n,
    confidence: confs.reduce((s, v) => s + v, 0) / n,
  }
}

/**
 * Curl-up signal: average of (hipY - shoulderY) across visible sides.
 * When flat on the floor: ~0. When curled up: positive (shoulder rises above hip).
 * Camera-position independent — no absolute Y needed.
 */
function getCurlupSignal(
  landmarks: NormalizedLandmark[],
): { value: number; confidence: number } | null {
  const lSh  = landmarks[LM.LEFT_SHOULDER],  lHip = landmarks[LM.LEFT_HIP]
  const rSh  = landmarks[LM.RIGHT_SHOULDER], rHip = landmarks[LM.RIGHT_HIP]

  const lConf = Math.min(lSh?.visibility ?? 0, lHip?.visibility ?? 0)
  const rConf = Math.min(rSh?.visibility ?? 0, rHip?.visibility ?? 0)

  const diffs: number[] = []
  const confs: number[] = []
  if (lConf >= CONFIDENCE_THRESH) { diffs.push(lHip.y - lSh.y); confs.push(lConf) }
  if (rConf >= CONFIDENCE_THRESH) { diffs.push(rHip.y - rSh.y); confs.push(rConf) }
  if (diffs.length === 0) return null

  const n = diffs.length
  return {
    value:      diffs.reduce((s, v) => s + v, 0) / n,
    confidence: confs.reduce((s, v) => s + v, 0) / n,
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Maps new exercises to the existing signal that best approximates their movement.
 * Mobility / isometric exercises map to 'plank' so no reps are counted
 * (useHoldTimer handles them).
 */
const SIGNAL_ALIAS: Record<string, SupportedExercise> = {
  // ── Lower body — knee angle like lunge/squat ──────────────────────────
  bulgariansplitsquat: 'lunge',
  reverseLunge:        'lunge',
  curtsylunge:         'lunge',
  stepup:              'lunge',
  sumoSquat:           'squat',
  gobletSquat:         'squat',
  // ── Posterior chain — hip hinge like deadlift ─────────────────────────
  romaniandeadlift:    'deadlift',
  goodmorning:         'deadlift',
  hyperextension:      'situp',     // hips anchored on pad — shoulderY rises as torso lifts, same as superman
  nordicCurl:          'situp',    // shoulder Y change tracks torso fall better than hip Y
  superman:            'situp',    // prone chest lift: shoulderY drops as chest rises, same hipY-shoulderY signal
  // ── Glute / hip — dedicated signals ─────────────────────────────────
  // glutebridge, hipthrust, firehydrant are now proper SupportedExercises
  // donkeykick is now a dedicated SupportedExercise
  // ── Push — elbow angle like pushup ───────────────────────────────────
  diamondpushup:       'pushup',
  widegripushup:       'pushup',
  declinepushup:       'pushup',
  inclinepushup:       'pushup',
  pikeupshup:          'pushup',
  // ── Pull — elbow angle like pullup ───────────────────────────────────
  chinup:              'pullup',
  invertedrow:         'pullup',
  dumbbellrow:         'pullup',
  // ── Shoulder — wrist Y like shoulderpress / lateralraise ─────────────
  arnoldpress:         'shoulderpress',
  frontraise:          'lateralraise',
  reverseFly:          'lateralraise',
  // ── Arms — elbow angle like bicepcurl / tricepextension ───────────────
  concentrationcurl:   'bicepcurl',
  zottmancurl:         'bicepcurl',
  skullcrusher:        'tricepextension',
  wristcurl:           'plank',     // wrist joint flexion — elbow angle never changes; untrackable via pose
  // ── Core — torso signal ───────────────────────────────────────────────
  // russiantwist is now a dedicated SupportedExercise (wrist X oscillation)
  bicycleCrunch:       'mountainclimber',
  // legRaise is now a proper SupportedExercise (dedicated ankle-Y signal)
  flutterKick:         'highnees',
  abWheel:             'curlup',
  // ── Cardio / plyometric — jump signal ────────────────────────────────
  boxjump:             'jumpsquat',
  skaterjump:          'jumpsquat',
  tuckjump:            'jumpsquat',
  starjump:            'jumpsquat',
  broadjump:           'jumpsquat',
  shadowboxing:        'chestpress',  // punches extend the elbow — chestpress elbow-angle signal works
  // ── Isometric / mobility — map to plank (hold timer handles them) ─────
  sideplank:           'plank',
  deadbug:             'plank',
  birddog:             'plank',
  hollowbody:          'plank',
  vSit:                'plank',
  catcow:              'plank',
  childpose:           'plank',
  worldsgreateststretch: 'plank',
  hipflexorstretch:    'plank',
  hamstringstretch:    'plank',
  quadstretch:         'plank',
  pigeonpose:          'plank',
  downdogstretch:      'plank',
  cobrapose:           'plank',
  seatedspinaltwist:   'plank',
  // ── Circles / rotations ───────────────────────────────────────────────
  anklecircle:         'plank',     // ankle rotation — hold timer handles, wrist Y irrelevant
  neckroll:            'plank',     // neck rotation — hold timer handles, wrist Y irrelevant
  shoulderroll:        'armcircle', // shoulder rolls move wrists up/down — armcircle signal works
  wristcircle:         'plank',     // arms held horizontal during wrist rotation — Y barely changes
}

export function useRepCounter(
  landmarks: NormalizedLandmark[] | null,
  exercise:  string,
): UseRepCounterReturn {

  const raw = exercise.toLowerCase().trim()
  const exerciseKey: SupportedExercise =
    (raw as SupportedExercise) in EXERCISE_CONFIG
      ? (raw as SupportedExercise)
      : (exercise as SupportedExercise) in EXERCISE_CONFIG  // catch mixed-case IDs like 'legRaise'
        ? (exercise as SupportedExercise)
        : SIGNAL_ALIAS[raw] ?? SIGNAL_ALIAS[exercise] ?? 'squat'

  const config = EXERCISE_CONFIG[exerciseKey]

  const smoothedY       = useRef<number | null>(null)
  const calibratedMin   = useRef<number>(Infinity)
  const calibratedMax   = useRef<number>(-Infinity)
  const calibrationEnd  = useRef<number>(0)
  const phaseRef        = useRef<MovementPhase>('unknown')
  const lastRepTime     = useRef<number | null>(null)
  const lastLandmarkTs  = useRef<number | null>(null)
  const isPaused        = useRef(false)

  const [repCount,         setRepCount]         = useState(0)
  const [phase,            setPhase]            = useState<MovementPhase>('unknown')
  const [lastRepTimestamp, setLastRepTimestamp] = useState<number | null>(null)
  const [repLog,           setRepLog]           = useState<RepLogEntry[]>([])
  const [isCalibrating,    setIsCalibrating]    = useState(true)
  const [armReps,          setArmReps]          = useState({ left: 0, right: 0 })

  const repCountRef     = useRef(0)
  const calibrateTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Per-arm refs for bicep/hammer curl tracking
  const leftSmoothed  = useRef<number | null>(null)
  const rightSmoothed = useRef<number | null>(null)
  const leftMin       = useRef(Infinity)
  const leftMax       = useRef(-Infinity)
  const rightMin      = useRef(Infinity)
  const rightMax      = useRef(-Infinity)
  const leftPhaseRef  = useRef<'down' | 'up'>('down')
  const rightPhaseRef = useRef<'down' | 'up'>('down')
  const leftLastRep   = useRef(0)
  const rightLastRep  = useRef(0)
  const leftCountRef  = useRef(0)
  const rightCountRef = useRef(0)

  const reset = useCallback(() => {
    smoothedY.current      = null
    calibratedMin.current  = Infinity
    calibratedMax.current  = -Infinity
    calibrationEnd.current = 0
    phaseRef.current       = 'unknown'
    lastRepTime.current    = null
    lastLandmarkTs.current = Date.now()
    isPaused.current       = false
    repCountRef.current    = 0
    setRepCount(0)
    setPhase('unknown')
    setLastRepTimestamp(null)
    setRepLog([])
    setIsCalibrating(true)
    // Reset per-arm state
    leftSmoothed.current  = null
    rightSmoothed.current = null
    leftMin.current       = Infinity
    leftMax.current       = -Infinity
    rightMin.current      = Infinity
    rightMax.current      = -Infinity
    leftPhaseRef.current  = 'down'
    rightPhaseRef.current = 'down'
    leftLastRep.current   = 0
    rightLastRep.current  = 0
    leftCountRef.current  = 0
    rightCountRef.current = 0
    setArmReps({ left: 0, right: 0 })
    // Fallback: force calibration off after 2 s regardless of landmark confidence
    if (calibrateTimer.current) clearTimeout(calibrateTimer.current)
    calibrateTimer.current = setTimeout(() => setIsCalibrating(false), 2000)
  }, [])

  // Start the fallback timer on mount
  useEffect(() => {
    calibrateTimer.current = setTimeout(() => setIsCalibrating(false), 2000)
    return () => { if (calibrateTimer.current) clearTimeout(calibrateTimer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset when exercise changes
  const prevExercise = useRef(exerciseKey)
  useEffect(() => {
    if (prevExercise.current !== exerciseKey) {
      prevExercise.current = exerciseKey
      reset()
    }
  }, [exerciseKey, reset])

  useEffect(() => {
    // Hold exercises don't count reps — useHoldTimer handles them
    if (exerciseKey === 'plank' || exerciseKey === 'wallsit' ||
        exerciseKey === 'crossbodystretch' || exerciseKey === 'tricepstretch') return

    if (!landmarks) {
      if (lastLandmarkTs.current != null) {
        const gap = Date.now() - lastLandmarkTs.current
        if (gap > PAUSE_AFTER_MS) isPaused.current = true
      }
      return
    }

    const now = Date.now()
    lastLandmarkTs.current = now
    isPaused.current = false

    // ── Per-exercise signal selection ─────────────────────────────────────
    let rawSignal: number
    let invertSignal = false

    if (exerciseKey === 'squat') {
      // Both signals pre-normalized to 0-1, same direction (HIGH = squatting = "down"),
      // so they're compatible in the EMA/calibration space even when the source switches.
      // No invertSignal, no calibration reset needed on source switch — eliminates the
      // perpetual-calibrating bug caused by knee confidence flickering around the threshold.
      const kneeResult = getKneeAngle(landmarks, 0.35)
      if (kneeResult && kneeResult.confidence >= 0.3) {
        // Knee angle: flip so squatting (low °) → HIGH → "down".
        // 60° = deep squat, 175° = fully standing.
        const KNEE_MIN = 60, KNEE_MAX = 175
        rawSignal = 1 - Math.max(0, Math.min(1, (kneeResult.value - KNEE_MIN) / (KNEE_MAX - KNEE_MIN)))
      } else {
        // Hip-Y fallback: squatting drops hips → higher y → HIGH → "down". Same direction.
        const hip = getJointY(landmarks, LM.LEFT_HIP, LM.RIGHT_HIP)
        if (!hip || hip.confidence < 0.5) return
        rawSignal = hip.y
      }
    } else if (exerciseKey === 'pushup') {
      // Elbow angle (shoulder→elbow→wrist). Extended arms (top): ~160-170°. Chest down (bottom): ~70-90°.
      // Only needs upper-body landmarks — much more reliable than hip-dependent signal in prone position.
      // Invert: large angle (extended/top) → low normalised → "up" phase.
      const result = getElbowAngle(landmarks)
      if (!result || result.confidence < 0.4) return   // lower threshold — prone reduces confidence
      rawSignal    = result.value
      invertSignal = true
    } else if (exerciseKey === 'mountainclimber') {
      // Absolute knee-Y difference. Both legs extended in plank: diff≈0 → "up".
      // One knee drives to chest: that knee rises → diff grows → "down".
      // Rep counted on up_to_down (each knee drive). Fast debounce for rapid pace.
      // Lower confidence threshold (0.2) — MediaPipe has reduced landmark confidence
      // in plank position because the model is optimised for upright poses.
      const lKn = landmarks[LM.LEFT_KNEE], rKn = landmarks[LM.RIGHT_KNEE]
      const lKnConf = lKn?.visibility ?? 0, rKnConf = rKn?.visibility ?? 0
      if (lKnConf < 0.2 || rKnConf < 0.2) return
      rawSignal    = Math.abs(lKn.y - rKn.y)
      invertSignal = false
    } else if (exerciseKey === 'benchpress') {
      // Elbow angle (shoulder→elbow→wrist). Bar on chest (~70-80°) = "down". Arms extended (~160°) = "up".
      // Same signal as push-up — invert so large angle (extended) → low normalised → "up".
      const result = getElbowAngle(landmarks)
      if (!result || result.confidence < 0.4) return
      rawSignal    = result.value
      invertSignal = true
    } else if (exerciseKey === 'bicepcurl' || exerciseKey === 'hammercurl' || exerciseKey === 'pullup') {
      // Elbow angle: extended (~160°) = bottom/hanging, contracted (~40°) = top/curled.
      // No inversion: large angle → high normalised → "down"; small angle → "up".
      // Rep counted on down→up (completing the curl / reaching chin-over-bar).
      const result = getElbowAngle(landmarks)
      if (!result || result.confidence < CONFIDENCE_THRESH) return
      rawSignal    = result.value
      invertSignal = false
    } else if (exerciseKey === 'tricepextension') {
      // Elbow angle (shoulder→elbow→wrist).
      // Arm extended overhead: ~160-170° = "up". Forearm bent behind head: ~40-60° = "down".
      // invertSignal: large angle (extended) → low normalised → "up" phase.
      // Rep counted on down→up (arm returns to full extension).
      // More reliable than wrist-Y diff because the elbow stays visible even when
      // the wrist disappears behind the head at the bottom of the movement.
      const result = getElbowAngle(landmarks)
      if (!result || result.confidence < 0.35) return
      rawSignal    = result.value
      invertSignal = true
    } else if (exerciseKey === 'curlup') {
      // hipY − shoulderY. Near-zero when flat, positive when curled up.
      // No inversion: high value = curled up = "up" phase naturally maps to low normalised.
      // Actually: high diff = "up" position, so we invert so that "up" → low normalised.
      const result = getCurlupSignal(landmarks)
      if (!result || result.confidence < CONFIDENCE_THRESH) return
      rawSignal    = result.value
      invertSignal = true   // large diff (curled) → low normalised → "up" phase
    } else if (exerciseKey === 'jumpingjack') {
      // Average wrist Y position. Arms at sides: wrists low (high Y). Arms overhead: wrists high (low Y).
      // Lower confidence threshold (0.35) — wrists can lose confidence when fully overhead.
      // No inversion: high Y (arms down) → "down" phase; low Y (arms up) → "up" phase.
      // Rep counted on up_to_down: arms come back down = one full jack done.
      const joint = getJointY(landmarks, config.joints[0], config.joints[1])
      if (!joint || joint.confidence < 0.35) return
      rawSignal = joint.y
    } else if (exerciseKey === 'highnees') {
      // Absolute knee-Y difference. Both at rest: diff≈0 → "up" phase (below threshold).
      // One knee raised: diff grows → "down" phase. Alternating knees create two diff peaks
      // per L-R cycle → each raise counted as a rep on the rising edge (up_to_down).
      const lKn = landmarks[LM.LEFT_KNEE], rKn = landmarks[LM.RIGHT_KNEE]
      const lConf = lKn?.visibility ?? 0
      const rConf = rKn?.visibility ?? 0
      if (lConf < 0.3 || rConf < 0.3) return  // need both visible to compute a meaningful diff
      rawSignal    = Math.abs(lKn.y - rKn.y)
      invertSignal = false  // large diff (one knee up) → high normalised → "down" phase
    } else if (exerciseKey === 'shoulderpress') {
      // Use elbow angle (shoulder→elbow→wrist).
      // Rack position (~90°) = "down". Fully pressed overhead (~165°) = "up".
      // invertSignal: large angle (overhead) → low normalised → "up" phase.
      // Rep counted on up_to_down: returning to rack from overhead = one rep.
      const result = getElbowAngle(landmarks)
      if (!result || result.confidence < 0.4) return
      rawSignal    = result.value
      invertSignal = true
    } else if (exerciseKey === 'lunge') {
      // Use the MINIMUM knee angle (whichever knee is more bent = the front knee).
      // Standing: front knee ~160°. Bottom of lunge: front knee ~80-90°.
      // Large angle = standing (up), small angle = lunging (down).
      // Works for both stationary and alternating lunges.
      const lHip = landmarks[LM.LEFT_HIP],  lKn = landmarks[LM.LEFT_KNEE],  lAn = landmarks[LM.LEFT_ANKLE]
      const rHip = landmarks[LM.RIGHT_HIP], rKn = landmarks[LM.RIGHT_KNEE], rAn = landmarks[LM.RIGHT_ANKLE]
      const lConf = Math.min(lHip?.visibility ?? 0, lKn?.visibility ?? 0, lAn?.visibility ?? 0)
      const rConf = Math.min(rHip?.visibility ?? 0, rKn?.visibility ?? 0, rAn?.visibility ?? 0)
      const angles: number[] = []
      if (lConf >= 0.4) angles.push(calcAngle(lHip, lKn, lAn))
      if (rConf >= 0.4) angles.push(calcAngle(rHip, rKn, rAn))
      if (angles.length === 0) return
      // Min angle = the bent (front) knee — this is the meaningful signal for lunges
      rawSignal    = Math.min(...angles)
      invertSignal = true  // large angle (standing) → low normalised → "up" phase
    } else if (exerciseKey === 'lateralraise') {
      // Average wrist Y. Arms at sides (high Y) = "down"; raised to shoulder height (low Y) = "up".
      // Lower confidence threshold — arms don't go fully overhead so wrists stay visible.
      const joint = getJointY(landmarks, config.joints[0], config.joints[1])
      if (!joint || joint.confidence < 0.5) return
      rawSignal    = joint.y
      invertSignal = false
    } else if (exerciseKey === 'buttskick') {
      // Knee angle (hip→knee→ankle). Neutral running: ~140-170°. Heel kicked to butt: ~40-70°.
      // Min across both legs catches whichever leg is currently kicking.
      // No invert: low angle (kick) → low normalised → "up"; high angle (straight) → "down".
      // Rep on up_to_down: counts when kicked leg straightens back (kick → neutral).
      //
      // Ankle confidence is intentionally lower (0.15) — during the kick the heel travels
      // behind the body and becomes partially occluded from a front-facing camera.
      // Hip and knee stay visible and anchor the angle calculation.
      const lHip = landmarks[LM.LEFT_HIP],  lKn = landmarks[LM.LEFT_KNEE],  lAn = landmarks[LM.LEFT_ANKLE]
      const rHip = landmarks[LM.RIGHT_HIP], rKn = landmarks[LM.RIGHT_KNEE], rAn = landmarks[LM.RIGHT_ANKLE]
      const angles: number[] = []
      const lHipConf = lHip?.visibility ?? 0, lKnConf = lKn?.visibility ?? 0, lAnConf = lAn?.visibility ?? 0
      const rHipConf = rHip?.visibility ?? 0, rKnConf = rKn?.visibility ?? 0, rAnConf = rAn?.visibility ?? 0
      if (lHipConf >= 0.35 && lKnConf >= 0.35 && lAnConf >= 0.15) angles.push(calcAngle(lHip, lKn, lAn))
      if (rHipConf >= 0.35 && rKnConf >= 0.35 && rAnConf >= 0.15) angles.push(calcAngle(rHip, rKn, rAn))
      if (angles.length === 0) return
      rawSignal    = Math.min(...angles)
      invertSignal = false
    } else if (exerciseKey === 'calfraise') {
      // Average heel/ankle Y. Works even without face visible — only lower-body landmarks needed.
      // Lower confidence threshold (0.15) so partial-frame shots still register.
      const CALF_CONF = 0.15
      const lHeel = landmarks[LM.LEFT_HEEL], rHeel = landmarks[LM.RIGHT_HEEL]
      const lHeelConf = lHeel?.visibility ?? 0, rHeelConf = rHeel?.visibility ?? 0
      if (lHeelConf >= CALF_CONF && rHeelConf >= CALF_CONF) {
        rawSignal = (lHeel.y + rHeel.y) / 2
      } else {
        const lAn = landmarks[LM.LEFT_ANKLE], rAn = landmarks[LM.RIGHT_ANKLE]
        const laConf = lAn?.visibility ?? 0, raConf = rAn?.visibility ?? 0
        if (laConf >= CALF_CONF && raConf >= CALF_CONF) {
          rawSignal = (lAn.y + rAn.y) / 2
        } else {
          // Knee Y as last resort — whole body rises slightly on tiptoes
          const lKn = landmarks[LM.LEFT_KNEE], rKn = landmarks[LM.RIGHT_KNEE]
          if ((lKn?.visibility ?? 0) < CALF_CONF || (rKn?.visibility ?? 0) < CALF_CONF) return
          rawSignal = (lKn.y + rKn.y) / 2
        }
      }
      invertSignal = false  // high Y (heels down) = "down" phase naturally
    } else if (exerciseKey === 'situp') {
      // Same signal as curl-up: hipY−shoulderY. Full sit-up has larger range than curl-up.
      // Large diff (torso upright) = "up" position. Flat (diff≈0) = "down" position.
      const result = getCurlupSignal(landmarks)
      if (!result || result.confidence < CONFIDENCE_THRESH) return
      rawSignal    = result.value
      invertSignal = true  // large diff (sitting up) → low normalised → "up" phase
    } else if (exerciseKey === 'armcircle') {
      // Average wrist Y. Arms at sides (high Y) = "down"; overhead (low Y) = "up".
      // Each circle crosses the "up" zone once → rep on up_to_down (arms returning from overhead).
      const joint = getJointY(landmarks, config.joints[0], config.joints[1])
      if (!joint || joint.confidence < 0.35) return  // wrists can lose conf overhead
      rawSignal    = joint.y
      invertSignal = false  // high Y = "down", low Y = "up"
    } else if (exerciseKey === 'hipcircle') {
      // Hip center X oscillates left/right as hips rotate in a circle.
      // One side extreme (left or right) = 1 rep counted on up_to_down transition.
      const lHip = landmarks[LM.LEFT_HIP], rHip = landmarks[LM.RIGHT_HIP]
      const lConf = lHip?.visibility ?? 0, rConf = rHip?.visibility ?? 0
      if (lConf < 0.5 || rConf < 0.5) return
      rawSignal    = (lHip.x + rHip.x) / 2  // hip center X
      invertSignal = false
    } else if (exerciseKey === 'chestpress') {
      // Elbow angle: arms pulled to chest (~90°) = "down". Arms extended forward (~160°) = "up".
      // Same signal direction as pushup/benchpress — invert so large angle (extended) → "up".
      const result = getElbowAngle(landmarks)
      if (!result || result.confidence < 0.4) return
      rawSignal    = result.value
      invertSignal = true
    } else if (exerciseKey === 'scapulasqueeze') {
      // Shoulder width: |lSh.x - rSh.x|. Wide (relaxed) = large = "down". Narrow (squeezed) = small = "up".
      // The scapulae retract inward, slightly closing the shoulder gap visible from front camera.
      const lSh = landmarks[LM.LEFT_SHOULDER], rSh = landmarks[LM.RIGHT_SHOULDER]
      const lConf = lSh?.visibility ?? 0, rConf = rSh?.visibility ?? 0
      if (lConf < 0.5 || rConf < 0.5) return
      rawSignal    = Math.abs(lSh.x - rSh.x)
      invertSignal = false  // wide (relaxed) → high normalized → "down"; narrow (squeezed) → "up"
    } else if (exerciseKey === 'sidelunge') {
      // Min knee angle (same logic as lunge): the bending knee drives the signal.
      // Standing: ~160-170°. Deep side lunge: bending knee ~80-100°.
      // invertSignal: large angle (standing) → low normalised → "up" phase.
      const lHipS = landmarks[LM.LEFT_HIP],  lKnS = landmarks[LM.LEFT_KNEE],  lAnS = landmarks[LM.LEFT_ANKLE]
      const rHipS = landmarks[LM.RIGHT_HIP], rKnS = landmarks[LM.RIGHT_KNEE], rAnS = landmarks[LM.RIGHT_ANKLE]
      const lConfS = Math.min(lHipS?.visibility ?? 0, lKnS?.visibility ?? 0, lAnS?.visibility ?? 0)
      const rConfS = Math.min(rHipS?.visibility ?? 0, rKnS?.visibility ?? 0, rAnS?.visibility ?? 0)
      const anglesS: number[] = []
      if (lConfS >= 0.4) anglesS.push(calcAngle(lHipS, lKnS, lAnS))
      if (rConfS >= 0.4) anglesS.push(calcAngle(rHipS, rKnS, rAnS))
      if (anglesS.length === 0) return
      rawSignal    = Math.min(...anglesS)
      invertSignal = true
    } else if (exerciseKey === 'chestfly') {
      // Wrist horizontal spread: |lWr.x - rWr.x|. Arms wide = large = "down"; arms together = "up".
      // Rep counted on down→up: arms squeeze back together (concentric complete).
      const lWrF = landmarks[LM.LEFT_WRIST], rWrF = landmarks[LM.RIGHT_WRIST]
      if ((lWrF?.visibility ?? 0) < 0.4 || (rWrF?.visibility ?? 0) < 0.4) return
      rawSignal    = Math.abs(lWrF.x - rWrF.x)
      invertSignal = false
    } else if (exerciseKey === 'jumpsquat') {
      // Same pre-normalised knee-angle signal as squat. Explosive movement → faster debounce.
      // Standing (large angle) → squat (small angle) → jump/land → rep counted on return to "up".
      const kneeJ = getKneeAngle(landmarks, 0.35)
      if (kneeJ && kneeJ.confidence >= 0.3) {
        const KNEE_MIN = 60, KNEE_MAX = 175
        rawSignal = 1 - Math.max(0, Math.min(1, (kneeJ.value - KNEE_MIN) / (KNEE_MAX - KNEE_MIN)))
      } else {
        const hipJ = getJointY(landmarks, LM.LEFT_HIP, LM.RIGHT_HIP)
        if (!hipJ || hipJ.confidence < 0.5) return
        rawSignal = hipJ.y
      }
    } else if (exerciseKey === 'legRaise') {
      // Average ankle Y. Both legs flat (resting): ankles near floor = high Y = "down".
      // Both legs raised 90°: ankles rise in frame = low Y = "up".
      // Lower confidence threshold — legs may be partially out of frame when fully raised.
      const lAn = landmarks[LM.LEFT_ANKLE], rAn = landmarks[LM.RIGHT_ANKLE]
      const lConf = lAn?.visibility ?? 0, rConf = rAn?.visibility ?? 0
      if (lConf < 0.25 && rConf < 0.25) return
      const ys: number[] = []
      if (lConf >= 0.25) ys.push(lAn.y)
      if (rConf >= 0.25) ys.push(rAn.y)
      rawSignal    = ys.reduce((s, v) => s + v, 0) / ys.length
      invertSignal = false  // high Y (legs down) = "down"; low Y (legs up) = "up"
    } else if (exerciseKey === 'firehydrant') {
      // Hip abduction on hands and knees. One knee lifts laterally → rises toward hip level.
      // Use max(hipY - kneeY): when knee is neutral both are similar (small diff);
      // when knee is lifted the gap grows (large diff = "up" position).
      // invertSignal: large diff → low normalised → "up" phase.
      const lKn = landmarks[LM.LEFT_KNEE], lHip = landmarks[LM.LEFT_HIP]
      const rKn = landmarks[LM.RIGHT_KNEE], rHip = landmarks[LM.RIGHT_HIP]
      const lConf = Math.min(lKn?.visibility ?? 0, lHip?.visibility ?? 0)
      const rConf = Math.min(rKn?.visibility ?? 0, rHip?.visibility ?? 0)
      if (lConf < 0.3 && rConf < 0.3) return
      const diffs: number[] = []
      if (lConf >= 0.3) diffs.push(lHip.y - lKn.y)
      if (rConf >= 0.3) diffs.push(rHip.y - rKn.y)
      rawSignal    = Math.max(...diffs)  // most-lifted knee drives signal
      invertSignal = true  // large diff (knee above hip) → low normalised → "up"
    } else if (exerciseKey === 'donkeykick') {
      // On all fours: ankle kicks backward and upward toward hip level.
      // hip-ankle Y diff: neutral (ankle near floor) = small diff; kicked (ankle near hip) = large diff.
      // invertSignal: large diff → low normalised → "up" phase.
      const lAn = landmarks[LM.LEFT_ANKLE], lHip = landmarks[LM.LEFT_HIP]
      const rAn = landmarks[LM.RIGHT_ANKLE], rHip = landmarks[LM.RIGHT_HIP]
      const lConf = Math.min(lAn?.visibility ?? 0, lHip?.visibility ?? 0)
      const rConf = Math.min(rAn?.visibility ?? 0, rHip?.visibility ?? 0)
      if (lConf < 0.3 && rConf < 0.3) return
      const diffs: number[] = []
      if (lConf >= 0.3) diffs.push(lHip.y - lAn.y)
      if (rConf >= 0.3) diffs.push(rHip.y - rAn.y)
      rawSignal    = Math.max(...diffs)
      invertSignal = true  // ankle rises toward/above hip → "up"
    } else if (exerciseKey === 'glutebridge' || exerciseKey === 'hipthrust') {
      // Person lying supine. Hips start near the floor (high Y) and rise during the bridge (low Y).
      // Knee angle stays roughly constant at ~90° throughout — use hip Y directly.
      const lHip = landmarks[LM.LEFT_HIP], rHip = landmarks[LM.RIGHT_HIP]
      const lConf = lHip?.visibility ?? 0, rConf = rHip?.visibility ?? 0
      if (lConf < 0.3 && rConf < 0.3) return
      const ys: number[] = []
      if (lConf >= 0.3) ys.push(lHip.y)
      if (rConf >= 0.3) ys.push(rHip.y)
      rawSignal    = ys.reduce((s, v) => s + v, 0) / ys.length
      invertSignal = false  // high Y (hips on floor) = "down"; low Y (hips raised) = "up"
    } else if (exerciseKey === 'russiantwist') {
      // Seated torso rotation. Hips stay planted — hip X is static.
      // Wrists hold the weight and sweep left→right with the torso.
      // Track average wrist X: oscillates as torso rotates side to side.
      const lWr = landmarks[LM.LEFT_WRIST], rWr = landmarks[LM.RIGHT_WRIST]
      const lConf = lWr?.visibility ?? 0, rConf = rWr?.visibility ?? 0
      if (lConf < 0.3 && rConf < 0.3) return
      const xs: number[] = []
      if (lConf >= 0.3) xs.push(lWr.x)
      if (rConf >= 0.3) xs.push(rWr.x)
      rawSignal    = xs.reduce((s, v) => s + v, 0) / xs.length
      invertSignal = false  // X oscillates left (small) ↔ right (large); each crossing = half a twist
    } else if (exerciseKey === 'burpee') {
      // Body height via average of (shoulder + hip) Y.
      // Standing: all landmarks high in frame → low Y → "up".
      // Crouching / plank: body descends → high Y → "down".
      // Full 3-phase cycle (stand→squat→plank→squat→stand) = 1 rep, counted on stand-up.
      const lShB = landmarks[LM.LEFT_SHOULDER], rShB = landmarks[LM.RIGHT_SHOULDER]
      const lHiB = landmarks[LM.LEFT_HIP],      rHiB = landmarks[LM.RIGHT_HIP]
      const shConfB  = Math.min(lShB?.visibility ?? 0, rShB?.visibility ?? 0)
      const hipConfB = Math.min(lHiB?.visibility ?? 0, rHiB?.visibility ?? 0)
      if (shConfB < 0.35 && hipConfB < 0.35) return
      if (shConfB >= 0.35 && hipConfB >= 0.35) {
        rawSignal = (lShB.y + rShB.y + lHiB.y + rHiB.y) / 4
      } else if (shConfB >= 0.35) {
        rawSignal = (lShB.y + rShB.y) / 2
      } else {
        rawSignal = (lHiB.y + rHiB.y) / 2
      }
      invertSignal = false  // high Y (crouched/plank) = "down"; low Y (standing) = "up"
    } else {
      const joint = getJointY(landmarks, config.joints[0], config.joints[1])
      if (!joint || joint.confidence < CONFIDENCE_THRESH) return
      rawSignal = joint.y
    }

    const rawY = rawSignal

    if (smoothedY.current === null) {
      smoothedY.current = rawY
      calibrationEnd.current = now + CALIBRATION_MS
    } else {
      smoothedY.current = EMA_ALPHA * rawY + (1 - EMA_ALPHA) * smoothedY.current
    }

    const y = smoothedY.current

    // Calibration window — track range, don't count reps yet
    if (now < calibrationEnd.current) {
      calibratedMin.current = Math.min(calibratedMin.current, y)
      calibratedMax.current = Math.max(calibratedMax.current, y)
      setIsCalibrating(true)
      return
    }
    setIsCalibrating(false)

    // ── Always extend range live BEFORE the MIN_RANGE gate ───────────────
    // Previously this came AFTER the gate, so if the user was still during
    // calibration, range stayed 0 forever and every frame returned early.
    // Now movement after calibration self-heals the range.
    calibratedMin.current = Math.min(calibratedMin.current, y)
    calibratedMax.current = Math.max(calibratedMax.current, y)

    const range = calibratedMax.current - calibratedMin.current

    if (range < MIN_RANGE) {
      // Still not enough movement — if this has been going on too long,
      // reset so calibration restarts fresh on the next landmark.
      if (now - calibrationEnd.current > RECAL_AFTER_MS) {
        smoothedY.current      = null
        calibratedMin.current  = Infinity
        calibratedMax.current  = -Infinity
        calibrationEnd.current = 0
        setIsCalibrating(true)
      }
      return
    }

    const normalisedRaw = (y - calibratedMin.current) / range
    const normalised    = invertSignal ? 1 - normalisedRaw : normalisedRaw

    let newPhase = phaseRef.current
    if (normalised > DOWN_THRESHOLD) newPhase = 'down'
    else if (normalised < UP_THRESHOLD) newPhase = 'up'

    const phaseChanged = newPhase !== phaseRef.current

    // ── Rep counting: direction depends on exercise ───────────────────
    const isRepTransition =
      config.repOn === 'down_to_up'
        ? phaseChanged && newPhase === 'up'   && phaseRef.current === 'down'
        : phaseChanged && newPhase === 'down' && phaseRef.current === 'up'

    if (isRepTransition) {
      const timeSinceLast = lastRepTime.current ? now - lastRepTime.current : Infinity
      if (timeSinceLast >= (config.debounceMs ?? DEBOUNCE_MS)) {
        const newCount = repCountRef.current + 1
        repCountRef.current = newCount
        lastRepTime.current = now
        setRepCount(newCount)
        setLastRepTimestamp(now)
        setRepLog(prev => [
          ...prev,
          { exercise: exerciseKey, timestamp: now, phase: newPhase },
        ])
      }
    }

    if (phaseChanged) {
      phaseRef.current = newPhase
      setPhase(newPhase)
    }

    // ── Per-arm tracking for bicep / hammer curl ──────────────────────────
    if (exerciseKey === 'bicepcurl' || exerciseKey === 'hammercurl') {
      const ARM_DEBOUNCE_MS  = 800
      const ARM_UP_THRESH    = 0.3
      const ARM_DOWN_THRESH  = 0.65
      const ARM_MIN_RANGE_DEG = 25  // degrees — ignore noise / tiny movements

      const sides = ['left', 'right'] as const
      for (const side of sides) {
        const sh = landmarks[side === 'left' ? LM.LEFT_SHOULDER  : LM.RIGHT_SHOULDER]
        const el = landmarks[side === 'left' ? LM.LEFT_ELBOW     : LM.RIGHT_ELBOW]
        const wr = landmarks[side === 'left' ? LM.LEFT_WRIST     : LM.RIGHT_WRIST]
        const conf = Math.min(sh?.visibility ?? 0, el?.visibility ?? 0, wr?.visibility ?? 0)
        if (conf < 0.45) continue

        const angle = calcAngle(sh, el, wr)

        const smoothedRef  = side === 'left' ? leftSmoothed  : rightSmoothed
        const minRef       = side === 'left' ? leftMin       : rightMin
        const maxRef       = side === 'left' ? leftMax       : rightMax
        const armPhaseRef  = side === 'left' ? leftPhaseRef  : rightPhaseRef
        const lastRepRef   = side === 'left' ? leftLastRep   : rightLastRep
        const countRef2    = side === 'left' ? leftCountRef  : rightCountRef

        smoothedRef.current = smoothedRef.current === null
          ? angle
          : EMA_ALPHA * angle + (1 - EMA_ALPHA) * smoothedRef.current
        const s = smoothedRef.current
        minRef.current = Math.min(minRef.current, s)
        maxRef.current = Math.max(maxRef.current, s)

        const range = maxRef.current - minRef.current
        if (range < ARM_MIN_RANGE_DEG) continue

        // Normalise: extended (large angle) → HIGH ("down"); curled (small angle) → LOW ("up")
        const norm = (s - minRef.current) / range

        let newArmPhase = armPhaseRef.current
        if (norm > ARM_DOWN_THRESH) newArmPhase = 'down'
        else if (norm < ARM_UP_THRESH) newArmPhase = 'up'

        // Count on down→up: curl completes (fully curled position reached)
        if (newArmPhase === 'up' && armPhaseRef.current === 'down') {
          const elapsed = now - lastRepRef.current
          if (elapsed >= ARM_DEBOUNCE_MS) {
            countRef2.current++
            lastRepRef.current = now
            setArmReps({ left: leftCountRef.current, right: rightCountRef.current })
          }
        }
        armPhaseRef.current = newArmPhase
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landmarks, exerciseKey])

  return { repCount, phase, lastRepTimestamp, repLog, isCalibrating, reset, armReps }
}
