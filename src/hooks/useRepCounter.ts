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
}

// ── Constants ──────────────────────────────────────────────────────────────

const EMA_ALPHA         = 0.2   // more smoothing = less twitchy
const CALIBRATION_MS    = 3000  // first 3 s used to calibrate range
const DOWN_THRESHOLD    = 0.70  // must go further down before "down" phase
const UP_THRESHOLD      = 0.30  // must come further up before "up" phase
const DEBOUNCE_MS       = 1200  // min ms between reps (was 800)
const MIN_RANGE         = 0.06  // minimum movement range to count (was 0.02)
const CONFIDENCE_THRESH = 0.6   // higher confidence required (was 0.5)
const PAUSE_AFTER_MS    = 1000  // null-landmark gap before pausing

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

/**
 * Average elbow angle (shoulder→elbow→wrist) across visible arms.
 * Returns a value in degrees [0, 180].
 */
function getPushupElbowAngle(
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
    confidence: confs.reduce((s, v)  => s + v, 0) / n,
  }
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

  const repCountRef = useRef(0)

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

    // ── Pushups: use elbow angle instead of shoulder Y-position ───────────
    // Invert so that bent arms (low angle) → high normalised (= "down")
    let rawSignal: number
    let invertSignal = false

    if (exerciseKey === 'pushup') {
      const angleResult = getPushupElbowAngle(landmarks)
      if (!angleResult || angleResult.confidence < CONFIDENCE_THRESH) return
      rawSignal    = angleResult.value
      invertSignal = true
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

    const range = calibratedMax.current - calibratedMin.current
    if (range < MIN_RANGE) return  // not enough movement to be a real rep

    const normalisedRaw = (y - calibratedMin.current) / range
    const normalised    = invertSignal ? 1 - normalisedRaw : normalisedRaw

    // Extend range live (never shrink)
    calibratedMin.current = Math.min(calibratedMin.current, y)
    calibratedMax.current = Math.max(calibratedMax.current, y)

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

    if (isRepTransition) {
      const timeSinceLast = lastRepTime.current ? now - lastRepTime.current : Infinity
      if (timeSinceLast >= DEBOUNCE_MS) {
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
