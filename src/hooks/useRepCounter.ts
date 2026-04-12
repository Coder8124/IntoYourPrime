import { useRef, useState, useCallback, useEffect } from 'react'
import type { NormalizedLandmark } from '@mediapipe/pose'

// ── MediaPipe landmark indices ─────────────────────────────────────────────
// https://developers.google.com/mediapipe/solutions/vision/pose_landmarker

const LM = {
  LEFT_SHOULDER:  11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP:       23,
  RIGHT_HIP:      24,
  LEFT_KNEE:      25,
  RIGHT_KNEE:     26,
  LEFT_WRIST:     15,
  RIGHT_WRIST:    16,
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

// ── Exercise config ────────────────────────────────────────────────────────

interface ExerciseConfig {
  /** Indices of the two landmarks whose Y positions are averaged */
  joints: [number, number]
}

const EXERCISE_CONFIG: Record<SupportedExercise, ExerciseConfig> = {
  squat:         { joints: [LM.LEFT_HIP,       LM.RIGHT_HIP]       },
  pushup:        { joints: [LM.LEFT_SHOULDER,   LM.RIGHT_SHOULDER]  },
  lunge:         { joints: [LM.LEFT_KNEE,       LM.RIGHT_KNEE]      },
  deadlift:      { joints: [LM.LEFT_HIP,        LM.RIGHT_HIP]       },
  shoulderpress: { joints: [LM.LEFT_WRIST,      LM.RIGHT_WRIST]     },
}

// ── Constants ──────────────────────────────────────────────────────────────

const EMA_ALPHA         = 0.3   // smoothing factor
const CALIBRATION_MS    = 3000  // first 3 s used to calibrate range
const DOWN_THRESHOLD    = 0.65  // fraction of range = "down"
const UP_THRESHOLD      = 0.35  // fraction of range = "up"
const DEBOUNCE_MS       = 800   // min ms between reps
const CONFIDENCE_THRESH = 0.5   // min joint visibility to count
const PAUSE_AFTER_MS    = 1000  // null-landmark gap before pausing

// ── Helpers ────────────────────────────────────────────────────────────────

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
  const confidence = (confA + confB) / 2

  return {
    y: (a.y + b.y) / 2,
    confidence,
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useRepCounter(
  landmarks: NormalizedLandmark[] | null,
  exercise:  string,
): UseRepCounterReturn {

  // Normalise exercise string to a known key (default to squat)
  const exerciseKey: SupportedExercise =
    (exercise.toLowerCase().trim() as SupportedExercise) in EXERCISE_CONFIG
      ? (exercise.toLowerCase().trim() as SupportedExercise)
      : 'squat'

  const config = EXERCISE_CONFIG[exerciseKey]

  // ── Persistent state refs (reset-able) ────────────────────────────────
  const smoothedY       = useRef<number | null>(null)
  const calibratedMin   = useRef<number>(Infinity)
  const calibratedMax   = useRef<number>(-Infinity)
  const calibrationEnd  = useRef<number>(0)          // epoch ms when calibration ends
  const phaseRef        = useRef<MovementPhase>('unknown')
  const lastRepTime     = useRef<number | null>(null)
  const lastLandmarkTs  = useRef<number | null>(null)
  const isPaused        = useRef(false)

  // ── React state ────────────────────────────────────────────────────────
  const [repCount,         setRepCount]         = useState(0)
  const [phase,            setPhase]            = useState<MovementPhase>('unknown')
  const [lastRepTimestamp, setLastRepTimestamp] = useState<number | null>(null)
  const [repLog,           setRepLog]           = useState<RepLogEntry[]>([])

  // Keep a mutable ref of repCount so callbacks can read the latest value
  const repCountRef = useRef(0)

  // ── Reset ──────────────────────────────────────────────────────────────
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
  }, [])

  // Reset when exercise changes
  const prevExercise = useRef(exerciseKey)
  useEffect(() => {
    if (prevExercise.current !== exerciseKey) {
      prevExercise.current = exerciseKey
      // Rep FSM must reset when the lift changes; state is hook-internal only.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync FSM to new exerciseKey
      reset()
    }
  }, [exerciseKey, reset])

  // ── Main landmark processing ───────────────────────────────────────────
  useEffect(() => {
    // ── No landmarks: check if we should pause ────────────────────────
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

    // ── Extract joint data ────────────────────────────────────────────
    const joint = getJointY(landmarks, config.joints[0], config.joints[1])
    if (!joint || joint.confidence < CONFIDENCE_THRESH) return

    const rawY = joint.y

    // ── EMA smoothing ─────────────────────────────────────────────────
    if (smoothedY.current === null) {
      smoothedY.current = rawY
      // Start calibration window
      calibrationEnd.current = now + CALIBRATION_MS
    } else {
      smoothedY.current = EMA_ALPHA * rawY + (1 - EMA_ALPHA) * smoothedY.current
    }

    const y = smoothedY.current

    // ── Calibration: track min/max in first 3 s ───────────────────────
    if (now < calibrationEnd.current) {
      calibratedMin.current = Math.min(calibratedMin.current, y)
      calibratedMax.current = Math.max(calibratedMax.current, y)
      return  // don't count reps during calibration
    }

    // Guard: if range too small (person barely moving) skip
    const range = calibratedMax.current - calibratedMin.current
    if (range < 0.02) return  // < 2% of frame height — effectively stationary

    // ── Normalise position within calibrated range (0 = top, 1 = bottom) ──
    const normalised = (y - calibratedMin.current) / range

    // Update calibrated range live (extend, never shrink)
    calibratedMin.current = Math.min(calibratedMin.current, y)
    calibratedMax.current = Math.max(calibratedMax.current, y)

    // ── Phase detection ───────────────────────────────────────────────
    let newPhase = phaseRef.current

    if (normalised > DOWN_THRESHOLD) {
      newPhase = 'down'
    } else if (normalised < UP_THRESHOLD) {
      newPhase = 'up'
    }
    // positions between thresholds stay in current phase (hysteresis)

    const phaseChanged = newPhase !== phaseRef.current

    // ── Rep counting: down → up transition = completed rep ────────────
    if (phaseChanged && newPhase === 'up' && phaseRef.current === 'down') {
      const timeSinceLast = lastRepTime.current ? now - lastRepTime.current : Infinity

      if (timeSinceLast >= DEBOUNCE_MS) {
        const newCount = repCountRef.current + 1
        repCountRef.current = newCount
        lastRepTime.current = now

        setRepCount(newCount)
        setLastRepTimestamp(now)
        setRepLog(prev => [
          ...prev,
          { exercise: exerciseKey, timestamp: now, phase: 'up' },
        ])
      }
    }

    // ── Update phase state ────────────────────────────────────────────
    if (phaseChanged) {
      phaseRef.current = newPhase
      setPhase(newPhase)
    }

  }, [landmarks, config.joints, exerciseKey])

  return {
    repCount,
    phase,
    lastRepTimestamp,
    repLog,
    reset,
  }
}
