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
  // Tricep extension: elbow angle. Extended overhead (~160°) = up; bent behind head (~40°) = down.
  // invertSignal=true: large angle (extended) → low normalised → "up" phase.
  tricepextension: { joints: [LM.LEFT_WRIST,       LM.RIGHT_WRIST],    repOn: 'down_to_up' },
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
  buttskick:       { joints: [LM.LEFT_ANKLE,        LM.RIGHT_ANKLE],    repOn: 'up_to_down', debounceMs: 400 },
  // Calf raise: average heel Y. Heels on floor (high Y) = "down"; raised on toes (low Y) = "up".
  calfraise:       { joints: [LM.LEFT_HEEL,         LM.RIGHT_HEEL],     repOn: 'down_to_up', debounceMs: 1000 },
  // Sit-up: same hipY−shoulderY signal as curl-up, full range.
  situp:           { joints: [LM.LEFT_SHOULDER,     LM.RIGHT_SHOULDER], repOn: 'down_to_up' },
  // Arm circle: average wrist Y. Arms overhead (low Y) = "up". Rep on up_to_down (arms return down).
  armcircle:       { joints: [LM.LEFT_WRIST,        LM.RIGHT_WRIST],    repOn: 'up_to_down', debounceMs: 700 },
  // Scapula squeeze: shoulder width (|lSh.x - rSh.x|). Wide/relaxed = "down". Squeezed/narrow = "up".
  // Rep counted on squeeze (down→up). Slow debounce — squeeze for 2–3 s, then release.
  scapulasqueeze:  { joints: [LM.LEFT_SHOULDER,     LM.RIGHT_SHOULDER], repOn: 'down_to_up', debounceMs: 1500 },
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
 * Overhead tricep-extension signal: average of (wristY − elbowY) across visible arms.
 * Extended (top): wrist near or above elbow → diff ≈ 0 or negative.
 * Bent behind head (bottom): wrist drops well below elbow → diff large positive.
 * Uses a lower wrist-confidence threshold (0.35) because the wrist partially
 * occludes behind the head at the bottom of the movement.
 */
function getTricepExtSignal(
  landmarks: NormalizedLandmark[],
): { value: number; confidence: number } | null {
  const lEl = landmarks[LM.LEFT_ELBOW],  lWr = landmarks[LM.LEFT_WRIST]
  const rEl = landmarks[LM.RIGHT_ELBOW], rWr = landmarks[LM.RIGHT_WRIST]

  const lElConf = lEl?.visibility ?? 0
  const lWrConf = lWr?.visibility ?? 0
  const rElConf = rEl?.visibility ?? 0
  const rWrConf = rWr?.visibility ?? 0

  const diffs: number[] = []
  const confs:  number[] = []
  // Require elbow clearly visible; wrist can lose confidence behind the head
  if (lElConf >= CONFIDENCE_THRESH && lWrConf >= 0.35) { diffs.push(lWr.y - lEl.y); confs.push(Math.min(lElConf, lWrConf)) }
  if (rElConf >= CONFIDENCE_THRESH && rWrConf >= 0.35) { diffs.push(rWr.y - rEl.y); confs.push(Math.min(rElConf, rWrConf)) }
  if (diffs.length === 0) return null

  const n = diffs.length
  return {
    value:      diffs.reduce((s, v) => s + v, 0) / n,
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

export function useRepCounter(
  landmarks: NormalizedLandmark[] | null,
  exercise:  string,
): UseRepCounterReturn {

  const exerciseKey: SupportedExercise =
    (exercise.toLowerCase().trim() as SupportedExercise) in EXERCISE_CONFIG
      ? (exercise.toLowerCase().trim() as SupportedExercise)
      : 'squat'

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

  const repCountRef     = useRef(0)
  const calibrateTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    // Hold exercises (plank, wallsit) don't count reps — useHoldTimer handles them
    if (exerciseKey === 'plank' || exerciseKey === 'wallsit') return

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
      // Same signal as high knees: absolute knee-Y difference.
      // Both legs extended in plank: diff≈0 → "up". One knee drives to chest: diff large → "down".
      // Rep counted on up_to_down (each knee drive). Fast debounce for the pace of mountain climbers.
      const lKn = landmarks[LM.LEFT_KNEE], rKn = landmarks[LM.RIGHT_KNEE]
      if ((lKn?.visibility ?? 0) < 0.3 || (rKn?.visibility ?? 0) < 0.3) return
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
      // wristY − elbowY. Extended overhead: wrist near/above elbow → diff ≈ 0 or negative.
      // Bent behind head: wrist drops below elbow → diff grows positive.
      // No inversion: large diff = "down" (bent); small diff = "up" (extended).
      // Rep counted on down→up (returning to full extension).
      // Lower wrist-confidence threshold (0.35) so occlusion behind the head doesn't drop the signal.
      const result = getTricepExtSignal(landmarks)
      if (!result) return
      rawSignal    = result.value
      invertSignal = false
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
      // Absolute ankle-Y difference. Both ankles level = diff≈0 = "up". One heel kicked up = diff large = "down".
      // Mirror of high knees: same signal structure but with ankles instead of knees.
      const lAn = landmarks[LM.LEFT_ANKLE], rAn = landmarks[LM.RIGHT_ANKLE]
      if ((lAn?.visibility ?? 0) < 0.3 || (rAn?.visibility ?? 0) < 0.3) return
      rawSignal    = Math.abs(lAn.y - rAn.y)
      invertSignal = false
    } else if (exerciseKey === 'calfraise') {
      // Average heel Y. Heels on floor (high Y) = "down"; raised onto toes (low Y) = "up".
      // Use heels (29/30) for better sensitivity than ankle joints (27/28).
      const lHeel = landmarks[LM.LEFT_HEEL], rHeel = landmarks[LM.RIGHT_HEEL]
      const lConf = lHeel?.visibility ?? 0, rConf = rHeel?.visibility ?? 0
      // Fall back to ankles if heels aren't detected
      if (lConf >= 0.3 && rConf >= 0.3) {
        rawSignal = (lHeel.y + rHeel.y) / 2
      } else {
        const lAn = landmarks[LM.LEFT_ANKLE], rAn = landmarks[LM.RIGHT_ANKLE]
        if ((lAn?.visibility ?? 0) < 0.3 || (rAn?.visibility ?? 0) < 0.3) return
        rawSignal = (lAn.y + rAn.y) / 2
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
    } else if (exerciseKey === 'scapulasqueeze') {
      // Shoulder width: |lSh.x - rSh.x|. Wide (relaxed) = large = "down". Narrow (squeezed) = small = "up".
      // The scapulae retract inward, slightly closing the shoulder gap visible from front camera.
      const lSh = landmarks[LM.LEFT_SHOULDER], rSh = landmarks[LM.RIGHT_SHOULDER]
      const lConf = lSh?.visibility ?? 0, rConf = rSh?.visibility ?? 0
      if (lConf < 0.5 || rConf < 0.5) return
      rawSignal    = Math.abs(lSh.x - rSh.x)
      invertSignal = false  // wide (relaxed) → high normalized → "down"; narrow (squeezed) → "up"
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landmarks, exerciseKey])

  return { repCount, phase, lastRepTimestamp, repLog, isCalibrating, reset }
}
