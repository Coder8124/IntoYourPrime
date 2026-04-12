import { useRef, useState, useCallback, useEffect } from 'react'
import type { NormalizedLandmark } from '@mediapipe/pose'

// ── MediaPipe landmark indices ─────────────────────────────────────────────
// https://developers.google.com/mediapipe/solutions/vision/pose_landmarker

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
  reset:             () => void
}

interface Thresholds {
  down:         number
  up:           number
  debounce:     number
  minRawRange:  number
}

type ExerciseConfig =
  | { kind: 'y'; joints: [number, number]; thresholds: Thresholds }
  | { kind: 'pushup_elbow'; thresholds: Thresholds }

const EXERCISE_CONFIG: Record<SupportedExercise, ExerciseConfig> = {
  squat: {
    kind: 'y',
    joints: [LM.LEFT_HIP, LM.RIGHT_HIP],
    thresholds: { down: 0.65, up: 0.35, debounce: 800, minRawRange: 0.02 },
  },
  pushup: {
    kind: 'pushup_elbow',
    thresholds: { down: 0.58, up: 0.42, debounce: 550, minRawRange: 10 },
  },
  lunge: {
    kind: 'y',
    joints: [LM.LEFT_KNEE, LM.RIGHT_KNEE],
    thresholds: { down: 0.65, up: 0.35, debounce: 800, minRawRange: 0.02 },
  },
  deadlift: {
    kind: 'y',
    joints: [LM.LEFT_HIP, LM.RIGHT_HIP],
    thresholds: { down: 0.65, up: 0.35, debounce: 800, minRawRange: 0.02 },
  },
  shoulderpress: {
    kind: 'y',
    joints: [LM.LEFT_WRIST, LM.RIGHT_WRIST],
    thresholds: { down: 0.62, up: 0.38, debounce: 750, minRawRange: 0.02 },
  },
}

// ── Constants ──────────────────────────────────────────────────────────────

const EMA_ALPHA         = 0.28
const CALIBRATION_MS    = 3200
const CONFIDENCE_THRESH = 0.5
const PAUSE_AFTER_MS    = 1000

// ── Geometry ───────────────────────────────────────────────────────────────

/** Interior angle at elbow (shoulder–elbow–wrist), degrees. ~180 extended, ~90 bent. */
function elbowAngleDegrees(
  shoulder: NormalizedLandmark,
  elbow: NormalizedLandmark,
  wrist: NormalizedLandmark,
): number {
  const bx = elbow.x
  const by = elbow.y
  const v1x = shoulder.x - bx
  const v1y = shoulder.y - by
  const v2x = wrist.x - bx
  const v2y = wrist.y - by
  const d1 = Math.hypot(v1x, v1y)
  const d2 = Math.hypot(v2x, v2y)
  if (d1 < 1e-5 || d2 < 1e-5) return NaN
  const cos = (v1x * v2x + v1y * v2y) / (d1 * d2)
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
}

/** Higher when elbows are more bent (better pushup ROM signal than shoulder Y alone). */
function getPushupBentness(landmarks: NormalizedLandmark[]): { raw: number; confidence: number } | null {
  const Ls = landmarks[LM.LEFT_SHOULDER]
  const Le = landmarks[LM.LEFT_ELBOW]
  const Lw = landmarks[LM.LEFT_WRIST]
  const Rs = landmarks[LM.RIGHT_SHOULDER]
  const Re = landmarks[LM.RIGHT_ELBOW]
  const Rw = landmarks[LM.RIGHT_WRIST]
  if (!Ls || !Le || !Lw || !Rs || !Re || !Rw) return null

  const vis =
    ((Ls.visibility ?? 0) + (Le.visibility ?? 0) + (Lw.visibility ?? 0) +
      (Rs.visibility ?? 0) + (Re.visibility ?? 0) + (Rw.visibility ?? 0)) /
    6
  if (vis < CONFIDENCE_THRESH) return null

  const aL = elbowAngleDegrees(Ls, Le, Lw)
  const aR = elbowAngleDegrees(Rs, Re, Rw)
  if (!Number.isFinite(aL) || !Number.isFinite(aR)) return null

  const avgAngle = (aL + aR) / 2
  const raw = 180 - avgAngle
  return { raw, confidence: vis }
}

function getJointY(
  landmarks: NormalizedLandmark[],
  idxA: number,
  idxB: number,
): { raw: number; confidence: number } | null {
  const a = landmarks[idxA]
  const b = landmarks[idxB]
  if (!a || !b) return null

  const confA = a.visibility ?? 0
  const confB = b.visibility ?? 0
  const confidence = (confA + confB) / 2

  return {
    raw: (a.y + b.y) / 2,
    confidence,
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

  const smoothedSignal = useRef<number | null>(null)
  const calibratedMin  = useRef<number>(Infinity)
  const calibratedMax  = useRef<number>(-Infinity)
  const calibrationEnd = useRef<number>(0)
  const phaseRef       = useRef<MovementPhase>('unknown')
  const lastRepTime    = useRef<number | null>(null)
  const lastLandmarkTs = useRef<number | null>(null)
  const isPaused       = useRef(false)

  const [repCount,         setRepCount]         = useState(0)
  const [phase,            setPhase]            = useState<MovementPhase>('unknown')
  const [lastRepTimestamp, setLastRepTimestamp] = useState<number | null>(null)
  const [repLog,           setRepLog]           = useState<RepLogEntry[]>([])

  const repCountRef = useRef(0)

  const reset = useCallback(() => {
    smoothedSignal.current = null
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
  }, [])

  const prevExercise = useRef(exerciseKey)
  useEffect(() => {
    if (prevExercise.current !== exerciseKey) {
      prevExercise.current = exerciseKey
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync FSM to new exerciseKey
      reset()
    }
  }, [exerciseKey, reset])

  useEffect(() => {
    const cfg = EXERCISE_CONFIG[exerciseKey]
    const th = cfg.thresholds

    if (!landmarks) {
      if (lastLandmarkTs.current != null) {
        const gap = Date.now() - lastLandmarkTs.current
        if (gap > PAUSE_AFTER_MS) {
          isPaused.current = true
        }
      }
      return
    }

    const now = Date.now()
    lastLandmarkTs.current = now
    isPaused.current = false

    const sample =
      cfg.kind === 'pushup_elbow'
        ? getPushupBentness(landmarks)
        : getJointY(landmarks, cfg.joints[0], cfg.joints[1])

    if (!sample || sample.confidence < CONFIDENCE_THRESH) return

    const raw = sample.raw

    if (smoothedSignal.current === null) {
      smoothedSignal.current = raw
      calibrationEnd.current = now + CALIBRATION_MS
    } else {
      smoothedSignal.current =
        EMA_ALPHA * raw + (1 - EMA_ALPHA) * smoothedSignal.current
    }

    const signal = smoothedSignal.current

    if (now < calibrationEnd.current) {
      calibratedMin.current = Math.min(calibratedMin.current, signal)
      calibratedMax.current = Math.max(calibratedMax.current, signal)
      return
    }

    const range = calibratedMax.current - calibratedMin.current
    if (range < th.minRawRange) return

    const normalised = (signal - calibratedMin.current) / range

    calibratedMin.current = Math.min(calibratedMin.current, signal)
    calibratedMax.current = Math.max(calibratedMax.current, signal)

    let newPhase = phaseRef.current

    if (normalised > th.down) {
      newPhase = 'down'
    } else if (normalised < th.up) {
      newPhase = 'up'
    }

    const phaseChanged = newPhase !== phaseRef.current

    if (phaseChanged && newPhase === 'up' && phaseRef.current === 'down') {
      const timeSinceLast = lastRepTime.current ? now - lastRepTime.current : Infinity

      if (timeSinceLast >= th.debounce) {
        const newCount = repCountRef.current + 1
        repCountRef.current = newCount
        lastRepTime.current = now

        setRepCount(newCount)
        setLastRepTimestamp(now)
        setRepLog((prev) => [
          ...prev,
          { exercise: exerciseKey, timestamp: now, phase: 'up' },
        ])
      }
    }

    if (phaseChanged) {
      phaseRef.current = newPhase
      setPhase(newPhase)
    }
  }, [landmarks, exerciseKey])

  return {
    repCount,
    phase,
    lastRepTimestamp,
    repLog,
    reset,
  }
}
