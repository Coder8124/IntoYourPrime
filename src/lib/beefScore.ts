import type { NormalizedLandmark } from '@mediapipe/pose'
import type { ShotWindow, BeefScore } from '../types/basketball'

const LM = {
  NOSE: 0,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13,    R_ELBOW: 14,
  L_WRIST: 15,    R_WRIST: 16,
  L_INDEX: 19,    R_INDEX: 20,
  L_HIP: 23,      R_HIP: 24,
  L_ANKLE: 27,    R_ANKLE: 28,
} as const

const POST_RELEASE_GOOSENECK_MS  = 150
const HOLD_DURATION_TARGET_MS    = 250
const SNAP_SPEED_FULL_RAD_S      = 5
const SNAP_SPEED_ZERO_RAD_S      = 1

type Pt = { x: number; y: number }

function dist(a: Pt, b: Pt): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

// Angle at vertex b, in degrees (0..180).
function angleDeg(a: Pt, b: Pt, c: Pt): number {
  const bax = a.x - b.x, bay = a.y - b.y
  const bcx = c.x - b.x, bcy = c.y - b.y
  const dot = bax * bcx + bay * bcy
  const mag = Math.sqrt((bax * bax + bay * bay) * (bcx * bcx + bcy * bcy))
  if (mag === 0) return 0
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI
}

// Linear falloff: 100 when absValue <= fullAbs, 0 when >= zeroAbs.
function falloff(absValue: number, fullAbs: number, zeroAbs: number): number {
  if (absValue <= fullAbs) return 100
  if (absValue >= zeroAbs) return 0
  return 100 * (1 - (absValue - fullAbs) / (zeroAbs - fullAbs))
}

function mid(a: NormalizedLandmark, b: NormalizedLandmark): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function scoreShot(window: ShotWindow): BeefScore {
  const { frames, loadIndex, releaseIndex, handedness, context } = window

  const relFrame  = frames[releaseIndex]
  const loadFrame = frames[loadIndex]
  const relLm     = relFrame.landmarks
  const loadLm    = loadFrame.landmarks

  const midShoulder = mid(relLm[LM.L_SHOULDER], relLm[LM.R_SHOULDER])
  const midHip      = mid(relLm[LM.L_HIP],      relLm[LM.R_HIP])
  const torsoH      = dist(midShoulder, midHip)

  // ---- Balance ----
  const leftAnkle  = relLm[LM.L_ANKLE]
  const rightAnkle = relLm[LM.R_ANKLE]
  const ankleMidX  = (leftAnkle.x + rightAnkle.x) / 2
  const hipMidX    = midHip.x
  const stanceOffset = Math.abs(hipMidX - ankleMidX) / torsoH

  let balance: number
  if (context === 'movement') {
    balance = falloff(stanceOffset, 0.25, 0.50)
  } else {
    const stanceScore = falloff(stanceOffset, 0.15, 0.40)
    const ankleSpan   = Math.abs(leftAnkle.x - rightAnkle.x) / torsoH
    // Ideal band 0.5..0.7; deviation = distance outside band (0 if inside)
    const footDev     = ankleSpan < 0.5 ? 0.5 - ankleSpan : ankleSpan > 0.7 ? ankleSpan - 0.7 : 0
    const footScore   = falloff(footDev, 0.0, 0.40)
    balance = 0.6 * stanceScore + 0.4 * footScore
  }

  // ---- Eyes ----
  let noseMinX = Infinity, noseMaxX = -Infinity
  for (let i = loadIndex; i <= releaseIndex; i++) {
    const nx = frames[i].landmarks[LM.NOSE].x
    if (nx < noseMinX) noseMinX = nx
    if (nx > noseMaxX) noseMaxX = nx
  }
  const nosDisp = noseMaxX - noseMinX
  const eyes = context === 'stationary'
    ? falloff(nosDisp, 0.03, 0.10)
    : falloff(nosDisp, 0.06, 0.15)

  // ---- Elbow ----
  const shootShoulder = handedness === 'right' ? relLm[LM.R_SHOULDER] : relLm[LM.L_SHOULDER]
  const shootElbow    = handedness === 'right' ? relLm[LM.R_ELBOW]    : relLm[LM.L_ELBOW]

  // Signed offset: positive = shooting-hand-outward direction, negative = chicken-wing inward.
  // For right-handed, outward = elbow.x > shoulder.x (larger x = right side in mirrored view).
  // We flip sign so positive = outward regardless of handedness.
  const rawOffset   = (shootElbow.x - shootShoulder.x) / torsoH
  const signedOffset = handedness === 'right' ? rawOffset : -rawOffset

  const releaseAlignScore = signedOffset >= 0
    ? falloff(signedOffset, 0.15, 0.45)
    : falloff(-signedOffset, 0.05, 0.25)

  const loadShootShoulder = handedness === 'right' ? loadLm[LM.R_SHOULDER] : loadLm[LM.L_SHOULDER]
  const loadShootElbow    = handedness === 'right' ? loadLm[LM.R_ELBOW]    : loadLm[LM.L_ELBOW]
  const loadShootWrist    = handedness === 'right' ? loadLm[LM.R_WRIST]    : loadLm[LM.L_WRIST]
  const elbowAngle = angleDeg(loadShootShoulder, loadShootElbow, loadShootWrist)
  const setPointScore = falloff(Math.abs(elbowAngle - 90), 15, 60)

  const elbow = 0.6 * releaseAlignScore + 0.4 * setPointScore

  // ---- Follow-through ----
  function wristFlexion(lm: NormalizedLandmark[]): number {
    const e = handedness === 'right' ? lm[LM.R_ELBOW] : lm[LM.L_ELBOW]
    const w = handedness === 'right' ? lm[LM.R_WRIST] : lm[LM.L_WRIST]
    const f = handedness === 'right' ? lm[LM.R_INDEX] : lm[LM.L_INDEX]
    return Math.max(0, 180 - angleDeg(e, w, f))
  }

  const relTs = relFrame.timestamp

  // Gooseneck frame: first frame at relTs + 150ms, else releaseIndex
  let gooseneckIdx = releaseIndex
  for (let i = releaseIndex + 1; i < frames.length; i++) {
    if (frames[i].timestamp >= relTs + POST_RELEASE_GOOSENECK_MS) {
      gooseneckIdx = i
      break
    }
  }

  const gooseneckFlexion = wristFlexion(frames[gooseneckIdx].landmarks)
  // Full marks when flexion >= 60, zero at <= 40
  const gooseneckScore = falloff(Math.max(0, 60 - gooseneckFlexion), 0, 20)

  // Hold: consecutive frames from gooseneck with flexion >= 40
  const gooseneckTs = frames[gooseneckIdx].timestamp
  let holdLastTs = gooseneckTs
  for (let i = gooseneckIdx + 1; i < frames.length; i++) {
    if (wristFlexion(frames[i].landmarks) >= 40) {
      holdLastTs = frames[i].timestamp
    } else {
      break
    }
  }
  const holdMs = holdLastTs - gooseneckTs
  const holdScore = falloff(Math.max(0, HOLD_DURATION_TARGET_MS - holdMs), 0, HOLD_DURATION_TARGET_MS)

  // Snap speed: peak |Δflexion/Δt| in rad/s from releaseIndex+1 through first frame > release+100ms
  let peakRadS = 0
  let prevFlexion = wristFlexion(relFrame.landmarks)
  let prevTs = relTs
  for (let i = releaseIndex + 1; i < frames.length; i++) {
    const f = frames[i]
    if (f.timestamp > relTs + 100) break
    const flex = wristFlexion(f.landmarks)
    const dt = (f.timestamp - prevTs) / 1000
    if (dt > 0) {
      const radS = Math.abs((flex - prevFlexion) * Math.PI / 180) / dt
      if (radS > peakRadS) peakRadS = radS
    }
    prevFlexion = flex
    prevTs = f.timestamp
  }
  const snapScore = falloff(Math.max(0, SNAP_SPEED_FULL_RAD_S - peakRadS), 0, SNAP_SPEED_FULL_RAD_S - SNAP_SPEED_ZERO_RAD_S)

  const followThrough = 0.5 * gooseneckScore + 0.3 * holdScore + 0.2 * snapScore

  // ---- Round components ----
  const bBalance      = Math.round(balance)
  const bEyes         = Math.round(eyes)
  const bElbow        = Math.round(elbow)
  const bFollowThrough = Math.round(followThrough)
  const overall       = Math.round((bBalance + bEyes + bElbow + bFollowThrough) / 4)

  // ---- Notes (worst-first) ----
  type Note = { score: number; text: string }
  const cues: Note[] = []

  if (bBalance < 70) {
    const text = context === 'movement'
      ? "Stay over your feet on the pull-up — don't fade"
      : "Widen your base and stay over your feet"
    cues.push({ score: bBalance, text })
  }
  if (bEyes < 70) {
    cues.push({ score: bEyes, text: "Keep your head still through the shot" })
  }
  if (bElbow < 70) {
    const text = signedOffset < 0
      ? "Elbow tucking inward — push it under the ball"
      : "Elbow drifted wide — tighten it under the shoulder"
    cues.push({ score: bElbow, text })
  }
  if (bFollowThrough < 70) {
    cues.push({ score: bFollowThrough, text: "Hold your follow-through — don't drop the wrist" })
  }

  cues.sort((a, b) => a.score - b.score)

  return {
    balance:       bBalance,
    eyes:          bEyes,
    elbow:         bElbow,
    followThrough: bFollowThrough,
    overall,
    notes: cues.map(c => c.text),
  }
}
