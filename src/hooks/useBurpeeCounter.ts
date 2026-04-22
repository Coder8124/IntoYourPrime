import { useRef, useState, useCallback, useEffect } from 'react'
import type { NormalizedLandmark } from '@mediapipe/pose'

// MediaPipe landmark indices
const LM_LEFT_SHOULDER  = 11
const LM_RIGHT_SHOULDER = 12
const LM_LEFT_HIP       = 23
const LM_RIGHT_HIP      = 24
const LM_LEFT_KNEE      = 25
const LM_RIGHT_KNEE     = 26
const LM_LEFT_ANKLE     = 27
const LM_RIGHT_ANKLE    = 28

export type BurpeePhase = 'stand' | 'squat' | 'plank'

export interface UseBurpeeCounterReturn {
  repCount:          number
  burpeePhase:       BurpeePhase
  isCalibrating:     boolean
  lastRepTimestamp:  number | null
  reset:             () => void
}

// Config
const CALIB_SAMPLES  = 30     // frames to average for standing baseline
const SQUAT_DROP     = 0.11   // shoulder must fall this far below standing baseline → squat
const PLANK_RATIO    = 0.55   // hip-shoulder gap < 55% of standing gap → plank candidate
const PLANK_KNEE_DEG = 130    // legs must be this straight (°) to confirm plank vs. deep squat
const CONFIRM_FRAMES = 3      // consecutive frames required before a phase transition sticks
const DEBOUNCE_MS    = 2000   // minimum ms between counted reps

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

function getAvgKneeAngle(lm: NormalizedLandmark[]): number | null {
  const lHip = lm[LM_LEFT_HIP],  lKn = lm[LM_LEFT_KNEE],  lAn = lm[LM_LEFT_ANKLE]
  const rHip = lm[LM_RIGHT_HIP], rKn = lm[LM_RIGHT_KNEE], rAn = lm[LM_RIGHT_ANKLE]
  const lConf = Math.min(lHip?.visibility ?? 0, lKn?.visibility ?? 0, lAn?.visibility ?? 0)
  const rConf = Math.min(rHip?.visibility ?? 0, rKn?.visibility ?? 0, rAn?.visibility ?? 0)
  const angles: number[] = []
  if (lConf >= 0.4) angles.push(calcAngle(lHip, lKn, lAn))
  if (rConf >= 0.4) angles.push(calcAngle(rHip, rKn, rAn))
  if (angles.length === 0) return null
  return angles.reduce((a, b) => a + b, 0) / angles.length
}

export function useBurpeeCounter(
  landmarks: NormalizedLandmark[] | null,
): UseBurpeeCounterReturn {

  // Calibration
  const calibShoulderY = useRef<number | null>(null)
  const calibHipGap    = useRef<number | null>(null)
  const calibCount     = useRef(0)

  // Phase state machine
  const phaseRef       = useRef<BurpeePhase>('stand')
  const seenSquat      = useRef(false)
  const seenPlank      = useRef(false)
  const confirmBuf     = useRef<BurpeePhase[]>([])
  const lastRepTime    = useRef<number | null>(null)
  const repCountRef    = useRef(0)

  // React state
  const [repCount,         setRepCount]         = useState(0)
  const [burpeePhase,      setBurpeePhase]      = useState<BurpeePhase>('stand')
  const [isCalibrating,    setIsCalibrating]    = useState(true)
  const [lastRepTimestamp, setLastRepTimestamp] = useState<number | null>(null)

  const reset = useCallback(() => {
    calibShoulderY.current = null
    calibHipGap.current    = null
    calibCount.current     = 0
    phaseRef.current       = 'stand'
    seenSquat.current      = false
    seenPlank.current      = false
    confirmBuf.current     = []
    lastRepTime.current    = null
    repCountRef.current    = 0
    setRepCount(0)
    setBurpeePhase('stand')
    setIsCalibrating(true)
    setLastRepTimestamp(null)
  }, [])

  useEffect(() => {
    if (!landmarks) return

    const lSh  = landmarks[LM_LEFT_SHOULDER],  rSh  = landmarks[LM_RIGHT_SHOULDER]
    const lHip = landmarks[LM_LEFT_HIP],       rHip = landmarks[LM_RIGHT_HIP]

    const shConf  = Math.min(lSh?.visibility ?? 0, rSh?.visibility ?? 0)
    const hipConf = Math.min(lHip?.visibility ?? 0, rHip?.visibility ?? 0)
    if (shConf < 0.35 || hipConf < 0.35) return

    const shoulderY      = (lSh.y + rSh.y) / 2
    const hipY           = (lHip.y + rHip.y) / 2
    const hipShoulderGap = hipY - shoulderY

    // ── Calibration: build standing baseline from first N frames ─────────
    if (calibCount.current < CALIB_SAMPLES) {
      const n = calibCount.current
      calibShoulderY.current = n === 0
        ? shoulderY
        : (calibShoulderY.current! * n + shoulderY) / (n + 1)
      calibHipGap.current = n === 0
        ? hipShoulderGap
        : (calibHipGap.current! * n + hipShoulderGap) / (n + 1)
      calibCount.current++
      if (calibCount.current < CALIB_SAMPLES) return
      setIsCalibrating(false)
      return
    }

    const calibSY  = calibShoulderY.current!
    const calibGap = calibHipGap.current!

    // ── Phase detection ───────────────────────────────────────────────────
    //
    // Key signals:
    //   shoulderY:      how far the shoulders have dropped below standing baseline
    //   hipShoulderGap: vertical distance between hips and shoulders
    //     - Standing:  large gap (~0.28–0.35) — body is upright
    //     - Squatting: gap slightly larger or similar (hips drop with body)
    //     - Plank:     gap collapses to near-zero (body is horizontal)
    //
    // The critical discriminator for plank vs. deep squat (both have small gap):
    //   knee angle — legs are STRAIGHT in plank (~160–170°), BENT in deep squat (~80–100°)

    const kneeAngle = getAvgKneeAngle(landmarks)

    let detected: BurpeePhase
    if (hipShoulderGap < calibGap * PLANK_RATIO) {
      // Gap has collapsed — body is either horizontal (plank) or deeply hunched (squat)
      // Confirm plank via knee angle: plank = legs straight; squat = legs bent
      const confirmedPlank = kneeAngle !== null
        ? kneeAngle > PLANK_KNEE_DEG
        : hipShoulderGap < calibGap * 0.40   // stricter fallback when knees aren't visible
      detected = confirmedPlank ? 'plank' : 'squat'
    } else if (shoulderY > calibSY + SQUAT_DROP) {
      detected = 'squat'
    } else {
      detected = 'stand'
    }

    // ── Confirmation buffer: require CONFIRM_FRAMES consecutive frames ─────
    // Prevents single-frame noise from triggering a phase transition
    confirmBuf.current.push(detected)
    if (confirmBuf.current.length > CONFIRM_FRAMES) confirmBuf.current.shift()
    if (
      confirmBuf.current.length < CONFIRM_FRAMES ||
      !confirmBuf.current.every(p => p === detected)
    ) return

    if (detected === phaseRef.current) return   // no change

    const prev = phaseRef.current
    phaseRef.current = detected
    setBurpeePhase(detected)

    // ── State machine ─────────────────────────────────────────────────────
    //
    // Valid rep sequence: stand → squat → plank → stand
    // The return path (plank → squat → stand OR plank → stand directly) both count.
    // A partial rep (stand → squat → stand, no plank) does NOT count.

    if (prev === 'stand' && detected === 'squat') {
      seenSquat.current = true
      seenPlank.current = false   // reset in case of a partial previous rep
    }

    if (detected === 'plank' && seenSquat.current) {
      seenPlank.current = true
    }

    if (detected === 'stand' && seenPlank.current) {
      const now     = Date.now()
      const elapsed = lastRepTime.current ? now - lastRepTime.current : Infinity
      if (elapsed >= DEBOUNCE_MS) {
        repCountRef.current++
        lastRepTime.current = now
        setRepCount(repCountRef.current)
        setLastRepTimestamp(now)
      }
      seenSquat.current = false
      seenPlank.current = false
    }
  }, [landmarks])

  return { repCount, burpeePhase, isCalibrating, lastRepTimestamp, reset }
}
