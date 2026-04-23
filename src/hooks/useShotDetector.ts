import { useEffect, useRef } from 'react'
import type { NormalizedLandmark } from '@mediapipe/pose'
import type { PoseFrame } from '../types/pose'
import type { Handedness, ShotContext, ShotWindow } from '../types/basketball'

export type DetectorPhase = 'IDLE' | 'LOADED' | 'RELEASED'

export interface DetectorOpts {
  loadElbowDeg: number
  releaseElbowDeg: number
  followThroughTailMs: number
  bufferMs: number
  preLoadWindowMs: number
  movementHipThreshold: number
}

export const DEFAULT_OPTS: DetectorOpts = {
  loadElbowDeg: 85,
  releaseElbowDeg: 160,
  followThroughTailMs: 800,
  bufferMs: 2000,
  preLoadWindowMs: 500,
  movementHipThreshold: 0.10,
}

export interface DetectorState {
  phase: DetectorPhase
  buffer: PoseFrame[]
  loadIndex: number | null
  releaseIndex: number | null
  releaseTs: number | null
}

export function initialDetectorState(): DetectorState {
  return { phase: 'IDLE', buffer: [], loadIndex: null, releaseIndex: null, releaseTs: null }
}

export interface StepResult {
  state: DetectorState
  emit: ShotWindow | null
}

const LM = {
  NOSE: 0,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13,    R_ELBOW: 14,
  L_WRIST: 15,    R_WRIST: 16,
  L_HIP: 23,      R_HIP: 24,
} as const

type Pt = { x: number; y: number }

function angleDeg(a: Pt, b: Pt, c: Pt): number {
  const bax = a.x - b.x, bay = a.y - b.y
  const bcx = c.x - b.x, bcy = c.y - b.y
  const dot = bax * bcx + bay * bcy
  const mag = Math.sqrt((bax * bax + bay * bay) * (bcx * bcx + bcy * bcy))
  if (mag === 0) return 0
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI
}

function hipMidX(lm: NormalizedLandmark[]): number {
  return (lm[LM.L_HIP].x + lm[LM.R_HIP].x) / 2
}

function torsoHeight(lm: NormalizedLandmark[]): number {
  const midShoulderX = (lm[LM.L_SHOULDER].x + lm[LM.R_SHOULDER].x) / 2
  const midShoulderY = (lm[LM.L_SHOULDER].y + lm[LM.R_SHOULDER].y) / 2
  const midHipX = (lm[LM.L_HIP].x + lm[LM.R_HIP].x) / 2
  const midHipY = (lm[LM.L_HIP].y + lm[LM.R_HIP].y) / 2
  const dx = midShoulderX - midHipX
  const dy = midShoulderY - midHipY
  return Math.max(1e-6, Math.sqrt(dx * dx + dy * dy))
}

function classifyContext(preLoadFrames: PoseFrame[], threshold: number): ShotContext {
  if (preLoadFrames.length < 2) return 'stationary'
  const anchorLm = preLoadFrames[preLoadFrames.length - 1].landmarks
  const torsoH = torsoHeight(anchorLm)
  let minX = Infinity, maxX = -Infinity
  for (const f of preLoadFrames) {
    const x = hipMidX(f.landmarks)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
  }
  return (maxX - minX) / torsoH >= threshold ? 'movement' : 'stationary'
}

export function stepShotDetector(
  prev: DetectorState,
  frame: PoseFrame,
  handedness: Handedness,
  opts: DetectorOpts = DEFAULT_OPTS,
): StepResult {
  const buffer = [...prev.buffer, frame]

  const shoulderIdx = handedness === 'right' ? LM.R_SHOULDER : LM.L_SHOULDER
  const elbowIdx    = handedness === 'right' ? LM.R_ELBOW    : LM.L_ELBOW
  const wristIdx    = handedness === 'right' ? LM.R_WRIST    : LM.L_WRIST

  const lm = frame.landmarks
  const elbowAngle = angleDeg(lm[shoulderIdx], lm[elbowIdx], lm[wristIdx])

  if (prev.phase === 'IDLE') {
    // Trim old frames — only while idle
    const cutoff = frame.timestamp - opts.bufferMs
    let start = 0
    while (start < buffer.length - 1 && buffer[start].timestamp < cutoff) start++
    const trimmed = start > 0 ? buffer.slice(start) : buffer

    if (elbowAngle < opts.loadElbowDeg && lm[wristIdx].y < lm[shoulderIdx].y) {
      return {
        state: {
          phase: 'LOADED',
          buffer: trimmed,
          loadIndex: trimmed.length - 1,
          releaseIndex: null,
          releaseTs: null,
        },
        emit: null,
      }
    }
    return { state: { ...prev, buffer: trimmed }, emit: null }
  }

  if (prev.phase === 'LOADED') {
    if (elbowAngle > opts.releaseElbowDeg && lm[wristIdx].y < lm[LM.NOSE].y) {
      return {
        state: {
          phase: 'RELEASED',
          buffer,
          loadIndex: prev.loadIndex,
          releaseIndex: buffer.length - 1,
          releaseTs: frame.timestamp,
        },
        emit: null,
      }
    }
    return { state: { ...prev, buffer }, emit: null }
  }

  // prev.phase === 'RELEASED'
  if (frame.timestamp - prev.releaseTs! >= opts.followThroughTailMs) {
    const loadIndex = prev.loadIndex!
    const releaseIndex = prev.releaseIndex!
    const loadTs = buffer[loadIndex].timestamp
    const preStartTs = loadTs - opts.preLoadWindowMs
    const preLoadFrames = buffer.slice(0, loadIndex + 1).filter(f => f.timestamp >= preStartTs)
    const context = classifyContext(preLoadFrames, opts.movementHipThreshold)
    const shotFrames = buffer.slice(loadIndex)
    const emit: ShotWindow = {
      frames: shotFrames,
      preLoadFrames,
      loadIndex: 0,
      releaseIndex: releaseIndex - loadIndex,
      handedness,
      context,
    }
    return { state: initialDetectorState(), emit }
  }

  return { state: { ...prev, buffer }, emit: null }
}

export function useShotDetector(
  landmarks: NormalizedLandmark[] | null,
  handedness: Handedness,
  onShot: (w: ShotWindow) => void,
  opts?: DetectorOpts,
): { phase: DetectorPhase } {
  const stateRef = useRef<DetectorState>(initialDetectorState())
  const phaseRef = useRef<DetectorPhase>('IDLE')
  const onShotRef = useRef(onShot)
  onShotRef.current = onShot

  useEffect(() => {
    if (landmarks === null) return
    const frame: PoseFrame = { landmarks, timestamp: performance.now() }
    const { state, emit } = stepShotDetector(stateRef.current, frame, handedness, opts)
    stateRef.current = state
    phaseRef.current = state.phase
    if (emit) onShotRef.current(emit)
  }, [landmarks, handedness, opts])

  return { phase: phaseRef.current }
}
