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
} as const

// ── Helpers ────────────────────────────────────────────────────────────────

function vis(lm: NormalizedLandmark | undefined, t = 0.4): boolean {
  return (lm?.visibility ?? 0) >= t
}

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

// ── Pose detectors ─────────────────────────────────────────────────────────

/**
 * Plank: body roughly horizontal and straight.
 * Uses shoulder→hip→ankle body angle — should be > 145°.
 * Also checks shoulder and hip are at similar heights (horizontal body).
 */
function detectPlank(landmarks: NormalizedLandmark[]): boolean {
  if (landmarks.length < 29) return false

  const lSh  = landmarks[LM.LEFT_SHOULDER]
  const rSh  = landmarks[LM.RIGHT_SHOULDER]
  const lHip = landmarks[LM.LEFT_HIP]
  const rHip = landmarks[LM.RIGHT_HIP]
  const lAn  = landmarks[LM.LEFT_ANKLE]
  const rAn  = landmarks[LM.RIGHT_ANKLE]

  // Need at least shoulders and hips visible
  if (!vis(lSh) && !vis(rSh)) return false
  if (!vis(lHip) && !vis(rHip)) return false

  const shY  = ((vis(lSh)  ? lSh.y  : rSh.y)  + (vis(rSh)  ? rSh.y  : lSh.y))  / 2
  const hipY = ((vis(lHip) ? lHip.y : rHip.y) + (vis(rHip) ? rHip.y : lHip.y)) / 2

  // Body should be roughly horizontal: shoulder and hip at similar Y (< 0.25 apart in normalised)
  if (Math.abs(shY - hipY) > 0.28) return false

  // Body should be relatively straight (shoulder→hip→ankle angle > 145°)
  let straightCount = 0, straightTotal = 0
  if (vis(lSh) && vis(lHip) && vis(lAn)) {
    straightTotal++
    if (calcAngle(lSh, lHip, lAn) > 145) straightCount++
  }
  if (vis(rSh) && vis(rHip) && vis(rAn)) {
    straightTotal++
    if (calcAngle(rSh, rHip, rAn) > 145) straightCount++
  }

  // If ankles not visible, just trust the horizontal check
  if (straightTotal === 0) return true
  return straightCount >= 1
}

/**
 * Wall sit: knees bent to ~80–110°, torso upright.
 * Shoulder Y must be above (smaller than) hip Y in normalised coords.
 */
function detectWallSit(landmarks: NormalizedLandmark[]): boolean {
  if (landmarks.length < 27) return false

  const lSh  = landmarks[LM.LEFT_SHOULDER]
  const rSh  = landmarks[LM.RIGHT_SHOULDER]
  const lHip = landmarks[LM.LEFT_HIP]
  const rHip = landmarks[LM.RIGHT_HIP]
  const lKn  = landmarks[LM.LEFT_KNEE]
  const rKn  = landmarks[LM.RIGHT_KNEE]
  const lAn  = landmarks[LM.LEFT_ANKLE]
  const rAn  = landmarks[LM.RIGHT_ANKLE]

  if (!vis(lHip) && !vis(rHip)) return false
  if (!vis(lKn)  && !vis(rKn))  return false

  // Average knee angle — need at least one side
  const angles: number[] = []
  if (vis(lHip) && vis(lKn) && vis(lAn)) angles.push(calcAngle(lHip, lKn, lAn))
  if (vis(rHip) && vis(rKn) && vis(rAn)) angles.push(calcAngle(rHip, rKn, rAn))

  if (angles.length === 0) return false
  const kneeAngle = angles.reduce((a, b) => a + b, 0) / angles.length

  // Wall sit: knees at ~70–115°
  if (kneeAngle < 65 || kneeAngle > 120) return false

  // Torso upright: shoulders above hips (lower Y value in normalised coords)
  if (vis(lSh) || vis(rSh)) {
    const shY  = vis(lSh) ? lSh.y  : rSh.y
    const hipY = vis(lHip) ? lHip.y : rHip.y
    if (shY > hipY + 0.08) return false  // shoulders below hips = not upright
  }

  return true
}

/**
 * Cross-body shoulder stretch: one wrist has crossed to the opposite side of the body
 * (near the opposite shoulder), held at roughly chest height.
 */
function detectCrossBodyStretch(landmarks: NormalizedLandmark[]): boolean {
  if (landmarks.length < 17) return false
  const lSh = landmarks[LM.LEFT_SHOULDER], rSh = landmarks[LM.RIGHT_SHOULDER]
  const lWr = landmarks[LM.LEFT_WRIST],   rWr = landmarks[LM.RIGHT_WRIST]
  if (!vis(lSh) || !vis(rSh)) return false

  // Left wrist near right shoulder's X (left arm crossing right)
  const leftCrossed = vis(lWr, 0.3)
    && Math.abs(lWr.x - rSh.x) < 0.22
    && Math.abs(lWr.y - rSh.y) < 0.28
  // Right wrist near left shoulder's X (right arm crossing left)
  const rightCrossed = vis(rWr, 0.3)
    && Math.abs(rWr.x - lSh.x) < 0.22
    && Math.abs(rWr.y - lSh.y) < 0.28

  return leftCrossed || rightCrossed
}

/**
 * Tricep stretch: one elbow is raised above shoulder level with the wrist
 * dropping behind the head (elbow bent overhead).
 */
function detectTricepStretch(landmarks: NormalizedLandmark[]): boolean {
  if (landmarks.length < 17) return false
  const lSh = landmarks[LM.LEFT_SHOULDER], rSh = landmarks[LM.RIGHT_SHOULDER]
  const lEl = landmarks[LM.LEFT_ELBOW],   rEl = landmarks[LM.RIGHT_ELBOW]
  const lWr = landmarks[LM.LEFT_WRIST],   rWr = landmarks[LM.RIGHT_WRIST]

  // Left: elbow higher than shoulder AND wrist drops below elbow (bent behind head)
  const leftStretch = vis(lSh) && vis(lEl) && vis(lWr, 0.3)
    && lEl.y < lSh.y - 0.03
    && lWr.y > lEl.y + 0.05

  // Right: same
  const rightStretch = vis(rSh) && vis(rEl) && vis(rWr, 0.3)
    && rEl.y < rSh.y - 0.03
    && rWr.y > rEl.y + 0.05

  return leftStretch || rightStretch
}

// ── Hook ───────────────────────────────────────────────────────────────────

export type HoldExercise = 'plank' | 'wallsit' | 'crossbodystretch' | 'tricepstretch'

export const HOLD_EXERCISES: readonly string[] = [
  'plank', 'wallsit', 'crossbodystretch', 'tricepstretch',
  'sideplank', 'deadbug', 'birddog', 'hollowbody', 'vSit',
  'childpose', 'hipflexorstretch', 'hamstringstretch', 'quadstretch',
  'pigeonpose', 'downdogstretch', 'cobrapose', 'seatedspinaltwist',
  'worldsgreateststretch',
  'catcow', 'anklecircle', 'neckroll',
]

export interface UseHoldTimerReturn {
  holdSeconds:  number
  isInPosition: boolean
  reset:        () => void
}

export function useHoldTimer(
  landmarks: NormalizedLandmark[] | null,
  exercise:  string,
): UseHoldTimerReturn {
  const [holdSeconds,  setHoldSeconds]  = useState(0)
  const [isInPosition, setIsInPosition] = useState(false)

  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const inPositionRef  = useRef(false)

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    if (timerRef.current) return  // already running
    timerRef.current = setInterval(() => setHoldSeconds(s => s + 1), 1000)
  }, [])

  const reset = useCallback(() => {
    stopTimer()
    setHoldSeconds(0)
    setIsInPosition(false)
    inPositionRef.current = false
  }, [stopTimer])

  useEffect(() => {
    if (!landmarks) {
      if (inPositionRef.current) {
        inPositionRef.current = false
        setIsInPosition(false)
        stopTimer()
      }
      return
    }

    const ex = exercise.toLowerCase().trim()
    let detected = false
    if (ex === 'plank')            detected = detectPlank(landmarks)
    else if (ex === 'wallsit')          detected = detectWallSit(landmarks)
    else if (ex === 'crossbodystretch') detected = detectCrossBodyStretch(landmarks)
    else if (ex === 'tricepstretch')    detected = detectTricepStretch(landmarks)
    else if (HOLD_EXERCISES.includes(exercise)) {
      // For hold/stretch exercises without specific pose detection (floor poses,
      // mobility, etc.) run the timer whenever landmarks are visible.
      detected = landmarks.some(lm => (lm?.visibility ?? 0) > 0.5)
    }

    if (detected !== inPositionRef.current) {
      inPositionRef.current = detected
      setIsInPosition(detected)
      if (detected) startTimer()
      else stopTimer()
    }
  }, [landmarks, exercise, startTimer, stopTimer])

  // Reset timer when exercise changes
  const prevExercise = useRef(exercise)
  useEffect(() => {
    if (prevExercise.current !== exercise) {
      prevExercise.current = exercise
      reset()
    }
  }, [exercise, reset])

  // Cleanup on unmount
  useEffect(() => () => stopTimer(), [stopTimer])

  return { holdSeconds, isInPosition, reset }
}
