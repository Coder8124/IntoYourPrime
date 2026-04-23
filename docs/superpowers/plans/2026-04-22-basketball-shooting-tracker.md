# Basketball Shooting Form Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a live-camera basketball shooting form tracker that scores each detected shot against the B.E.E.F. fundamentals with leniency for modern shooting mechanics and off-the-dribble shots.

**Architecture:** New `/basketball` page reuses the existing `usePoseDetection` MediaPipe pipeline. A new pure shot-detector state machine consumes landmark frames, buffers shot windows, and hands them to a pure BEEF scorer. Each scored shot is persisted to a new Firestore subcollection. The `PoseFrame` type is a deliberate isolation seam so a future video-upload producer can feed the same downstream pipeline.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind + MediaPipe Pose + Firebase Firestore.

**Spec:** `docs/superpowers/specs/2026-04-22-basketball-shooting-tracker-design.md`.

**Conventions honored:**
- Follow `CONVENTIONS.md` folder structure (`src/pages`, `src/hooks`, `src/lib`, `src/types`).
- No Claude co-author credits in commits.
- Commit each task separately (commit-count convention).
- No new test runner in v1 (hackathon velocity); pure functions are structured so tests slot in later without refactor.
- Deviation from spec noted: all normalization uses **torso height** (`dist(midShoulder, midHip)`) rather than shoulder-width, because shoulder-width collapses to near-zero in a side-on view. Thresholds are adjusted to fractions of torso height; scoring outcomes are equivalent-in-spirit to the spec.

---

## File Map

New:
- `src/types/pose.ts` — shared `PoseFrame`.
- `src/types/basketball.ts` — `Handedness`, `ShotContext`, `ShotWindow`, `BeefScore`, `Shot`.
- `src/lib/beefScore.ts` — pure `scoreShot(window)` and math helpers.
- `src/lib/basketballShots.ts` — `saveBasketballShot` Firestore helper.
- `src/hooks/useShotDetector.ts` — state machine + hook.
- `src/pages/BasketballPage.tsx` — the page.

Modified:
- `src/App.tsx` — add `/basketball` route.
- `src/pages/HomePage.tsx` — flip the "Basketball — Soon" sidebar card to a live `<Link>`.
- `firestore.rules` — allow owner read/write on the `basketballShots` subcollection.

---

## Task 1: Shared PoseFrame type

**Files:**
- Create: `src/types/pose.ts`

- [ ] **Step 1: Create the file**

```ts
// src/types/pose.ts
import type { NormalizedLandmark } from '@mediapipe/pose'

/**
 * A single frame of pose landmarks + timestamp. Shared across producers
 * (live webcam today, video upload later) and consumers (shot detector).
 */
export interface PoseFrame {
  landmarks: NormalizedLandmark[]
  timestamp: number  // ms, monotonic (performance.now())
}
```

- [ ] **Step 2: Type-check passes**

Run: `npm run build`
Expected: build succeeds (no type errors from the new file).

- [ ] **Step 3: Commit**

```bash
git add src/types/pose.ts
git commit -m "Add shared PoseFrame type for pose-stream producers/consumers"
```

---

## Task 2: Basketball feature types

**Files:**
- Create: `src/types/basketball.ts`

- [ ] **Step 1: Create the file**

```ts
// src/types/basketball.ts
import type { PoseFrame } from './pose'

export type Handedness = 'right' | 'left'

/**
 * How the shooter arrived at the load point. Affects BEEF leniency.
 * - 'stationary': set feet, catch-and-shoot, or stand-still form shooting.
 * - 'movement':   off the dribble / pull-up; hips translated into the load.
 */
export type ShotContext = 'stationary' | 'movement'

export interface ShotWindow {
  frames: PoseFrame[]        // load → release → follow-through tail
  preLoadFrames: PoseFrame[] // ~500ms before loadIndex
  loadIndex: number          // index within `frames`
  releaseIndex: number       // index within `frames`
  handedness: Handedness
  context: ShotContext
}

export interface BeefScore {
  balance: number        // 0–100
  eyes: number           // 0–100 (head-stability proxy)
  elbow: number          // 0–100
  followThrough: number  // 0–100
  overall: number        // 0–100, mean of the above
  notes: string[]        // human-readable cues, ordered by severity
}

export interface Shot {
  id: string
  timestamp: number
  handedness: Handedness
  context: ShotContext
  beef: BeefScore
}
```

- [ ] **Step 2: Type-check passes**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/types/basketball.ts
git commit -m "Add basketball feature types (Shot, BeefScore, ShotWindow, ShotContext)"
```

---

## Task 3: BEEF scorer (pure)

**Files:**
- Create: `src/lib/beefScore.ts`

- [ ] **Step 1: Create the scorer module**

```ts
// src/lib/beefScore.ts
import type { NormalizedLandmark } from '@mediapipe/pose'
import type { BeefScore, ShotWindow, Handedness } from '../types/basketball'

// ── MediaPipe landmark indices ─────────────────────────────────────────────
const LM = {
  NOSE:           0,
  LEFT_SHOULDER:  11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW:     13,
  RIGHT_ELBOW:    14,
  LEFT_WRIST:     15,
  RIGHT_WRIST:    16,
  LEFT_INDEX:     19,
  RIGHT_INDEX:    20,
  LEFT_HIP:       23,
  RIGHT_HIP:      24,
  LEFT_ANKLE:     27,
  RIGHT_ANKLE:    28,
} as const

// ── Tunables ───────────────────────────────────────────────────────────────
const POST_RELEASE_GOOSENECK_MS = 150
const HOLD_DURATION_TARGET_MS   = 250
const SNAP_SPEED_FULL_RAD_S     = 5
const SNAP_SPEED_ZERO_RAD_S     = 1

// ── Math helpers ───────────────────────────────────────────────────────────
interface Pt { x: number; y: number }

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Linear falloff: 100 inside `fullAbs`, 0 at `zeroAbs`, clamped. */
function falloff(absValue: number, fullAbs: number, zeroAbs: number): number {
  if (absValue <= fullAbs) return 100
  if (absValue >= zeroAbs) return 0
  const t = (absValue - fullAbs) / (zeroAbs - fullAbs)
  return 100 * (1 - t)
}

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Angle at vertex b formed by a-b-c, in degrees (0–180). */
function angleDeg(a: Pt, b: Pt, c: Pt): number {
  const abx = a.x - b.x, aby = a.y - b.y
  const cbx = c.x - b.x, cby = c.y - b.y
  const magAB = Math.hypot(abx, aby)
  const magCB = Math.hypot(cbx, cby)
  if (magAB === 0 || magCB === 0) return 0
  const cos = clamp((abx * cbx + aby * cby) / (magAB * magCB), -1, 1)
  return (Math.acos(cos) * 180) / Math.PI
}

/** Scale used for all distance normalization (stable in any camera angle). */
function torsoHeight(lm: NormalizedLandmark[]): number {
  const ms = mid(lm[LM.LEFT_SHOULDER], lm[LM.RIGHT_SHOULDER])
  const mh = mid(lm[LM.LEFT_HIP],      lm[LM.RIGHT_HIP])
  return Math.max(dist(ms, mh), 1e-6)
}

function shootingIndices(hand: Handedness) {
  return hand === 'right'
    ? { shoulder: LM.RIGHT_SHOULDER, elbow: LM.RIGHT_ELBOW, wrist: LM.RIGHT_WRIST, index: LM.RIGHT_INDEX }
    : { shoulder: LM.LEFT_SHOULDER,  elbow: LM.LEFT_ELBOW,  wrist: LM.LEFT_WRIST,  index: LM.LEFT_INDEX  }
}

/** Signed offset of elbow relative to shoulder in the shooting-hand X direction, normalized. */
function elbowOffset(lm: NormalizedLandmark[], hand: Handedness): number {
  const { shoulder, elbow } = shootingIndices(hand)
  const t = torsoHeight(lm)
  const signed = lm[elbow].x - lm[shoulder].x
  // Positive = offset in the shooting-hand direction (right-handed: +x; left-handed: -x).
  return (hand === 'right' ? signed : -signed) / t
}

// ── Component scorers ──────────────────────────────────────────────────────

function scoreBalance(window: ShotWindow): number {
  const frame = window.frames[window.releaseIndex]
  const lm = frame.landmarks
  const t = torsoHeight(lm)

  const ankleMidX = (lm[LM.LEFT_ANKLE].x + lm[LM.RIGHT_ANKLE].x) / 2
  const hipMidX   = (lm[LM.LEFT_HIP].x   + lm[LM.RIGHT_HIP].x)   / 2
  const stanceOffset = Math.abs(hipMidX - ankleMidX) / t

  if (window.context === 'movement') {
    // Drop foot-spacing, widen stance tolerance.
    return Math.round(falloff(stanceOffset, 0.25, 0.50))
  }

  // Stationary: 60% stance + 40% foot-spacing.
  const stanceScore = falloff(stanceOffset, 0.15, 0.40)

  const ankleSpan = Math.abs(lm[LM.LEFT_ANKLE].x - lm[LM.RIGHT_ANKLE].x) / t
  // Ideal foot spacing: 0.5–0.7 of torso height. Graded outside that band.
  const spanDeviation = ankleSpan < 0.5 ? (0.5 - ankleSpan) : Math.max(0, ankleSpan - 0.7)
  const spanScore = falloff(spanDeviation, 0.0, 0.40)

  return Math.round(0.6 * stanceScore + 0.4 * spanScore)
}

function scoreEyes(window: ShotWindow): number {
  const { loadIndex, releaseIndex, frames } = window
  let minNoseX = Infinity, maxNoseX = -Infinity
  for (let i = loadIndex; i <= releaseIndex; i++) {
    const nx = frames[i].landmarks[LM.NOSE].x
    if (nx < minNoseX) minNoseX = nx
    if (nx > maxNoseX) maxNoseX = nx
  }
  const disp = maxNoseX - minNoseX  // in normalized frame-width units (0..1)

  if (window.context === 'movement') {
    return Math.round(falloff(disp, 0.06, 0.15))
  }
  return Math.round(falloff(disp, 0.03, 0.10))
}

function scoreElbow(window: ShotWindow): number {
  const loadLm    = window.frames[window.loadIndex].landmarks
  const releaseLm = window.frames[window.releaseIndex].landmarks
  const { shoulder, elbow, wrist } = shootingIndices(window.handedness)

  // Release alignment (60%): elbow X relative to shoulder X, normalized.
  const offset = elbowOffset(releaseLm, window.handedness)
  let alignScore: number
  if (offset >= 0) {
    // Offset toward shooting-hand side (modern-allowable up to 0.15).
    alignScore = falloff(offset, 0.15, 0.45)
  } else {
    // Inward (chicken-wing) — penalized more aggressively.
    alignScore = falloff(-offset, 0.05, 0.25)
  }

  // Set-point L-shape (40%): upper-arm to forearm angle near 90°.
  const setAngle = angleDeg(loadLm[shoulder], loadLm[elbow], loadLm[wrist])
  const setScore = falloff(Math.abs(setAngle - 90), 15, 60)

  return Math.round(0.6 * alignScore + 0.4 * setScore)
}

function wristFlexion(lm: NormalizedLandmark[], hand: Handedness): number {
  const { elbow, wrist, index } = shootingIndices(hand)
  const inLine = angleDeg(lm[elbow], lm[wrist], lm[index])
  return Math.max(0, 180 - inLine)  // 0 = straight wrist; 90+ = strong gooseneck
}

function scoreFollowThrough(window: ShotWindow): number {
  const { frames, releaseIndex, handedness } = window
  const releaseTs = frames[releaseIndex].timestamp

  // Find the gooseneck measurement frame (release + ~150ms).
  let gooseneckIdx = releaseIndex
  for (let i = releaseIndex; i < frames.length; i++) {
    if (frames[i].timestamp - releaseTs >= POST_RELEASE_GOOSENECK_MS) {
      gooseneckIdx = i
      break
    }
  }
  const gooseneckFlex = wristFlexion(frames[gooseneckIdx].landmarks, handedness)
  // ≥60° → 100; ≤40° → 0.
  const gooseneckScore = falloff(Math.max(0, 60 - gooseneckFlex), 0, 20)

  // Hold duration: consecutive frames from gooseneckIdx where flexion ≥40°.
  let holdMs = 0
  for (let i = gooseneckIdx; i < frames.length; i++) {
    if (wristFlexion(frames[i].landmarks, handedness) >= 40) {
      holdMs = frames[i].timestamp - frames[gooseneckIdx].timestamp
    } else break
  }
  const holdScore = falloff(Math.max(0, HOLD_DURATION_TARGET_MS - holdMs), 0, HOLD_DURATION_TARGET_MS)

  // Snap speed: peak |Δflexion / Δt| over the 100ms post-release window.
  let peakRadS = 0
  for (let i = releaseIndex + 1; i < frames.length; i++) {
    const dtMs = frames[i].timestamp - frames[i - 1].timestamp
    if (dtMs <= 0) continue
    const dDeg = wristFlexion(frames[i].landmarks, handedness)
               - wristFlexion(frames[i - 1].landmarks, handedness)
    const radS = Math.abs((dDeg * Math.PI) / 180) / (dtMs / 1000)
    if (radS > peakRadS) peakRadS = radS
    if (frames[i].timestamp - releaseTs > 100) break
  }
  const snapScore = falloff(
    Math.max(0, SNAP_SPEED_FULL_RAD_S - peakRadS),
    0,
    SNAP_SPEED_FULL_RAD_S - SNAP_SPEED_ZERO_RAD_S,
  )

  return Math.round(0.5 * gooseneckScore + 0.3 * holdScore + 0.2 * snapScore)
}

// ── Notes (coaching cues) ──────────────────────────────────────────────────

function buildNotes(s: Omit<BeefScore, 'overall' | 'notes'>, window: ShotWindow): string[] {
  const cues: [number, string][] = []
  if (s.balance < 70) {
    cues.push([s.balance, window.context === 'movement'
      ? 'Stay over your feet on the pull-up — don’t fade'
      : 'Widen your base and stay over your feet'])
  }
  if (s.eyes < 70) {
    cues.push([s.eyes, 'Keep your head still through the shot'])
  }
  if (s.elbow < 70) {
    const releaseLm = window.frames[window.releaseIndex].landmarks
    const offset = elbowOffset(releaseLm, window.handedness)
    cues.push([s.elbow, offset < 0
      ? 'Elbow tucking inward — push it under the ball'
      : 'Elbow drifted wide — tighten it under the shoulder'])
  }
  if (s.followThrough < 70) {
    cues.push([s.followThrough, 'Hold your follow-through — don’t drop the wrist'])
  }
  cues.sort((a, b) => a[0] - b[0])
  return cues.map(([, msg]) => msg)
}

// ── Public entry point ─────────────────────────────────────────────────────

export function scoreShot(window: ShotWindow): BeefScore {
  const balance       = scoreBalance(window)
  const eyes          = scoreEyes(window)
  const elbow         = scoreElbow(window)
  const followThrough = scoreFollowThrough(window)
  const overall = Math.round((balance + eyes + elbow + followThrough) / 4)
  const notes = buildNotes({ balance, eyes, elbow, followThrough }, window)
  return { balance, eyes, elbow, followThrough, overall, notes }
}
```

- [ ] **Step 2: Type-check passes**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beefScore.ts
git commit -m "Add pure BEEF scorer with context-aware leniency"
```

---

## Task 4: Shot detector state machine (pure) + hook

**Files:**
- Create: `src/hooks/useShotDetector.ts`

- [ ] **Step 1: Create the hook module (pure reducer + React wrapper in one file)**

```ts
// src/hooks/useShotDetector.ts
import { useEffect, useRef } from 'react'
import type { NormalizedLandmark } from '@mediapipe/pose'
import type { PoseFrame } from '../types/pose'
import type { Handedness, ShotContext, ShotWindow } from '../types/basketball'

// ── Landmark indices (local copy — detector is decoupled from scorer) ─────
const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW:    13, RIGHT_ELBOW:    14,
  LEFT_WRIST:    15, RIGHT_WRIST:    16,
  LEFT_HIP:      23, RIGHT_HIP:      24,
} as const

// ── Tunables ──────────────────────────────────────────────────────────────
export interface DetectorOpts {
  loadElbowDeg:         number  // elbow angle below which we consider the ball loaded
  releaseElbowDeg:      number  // elbow angle above which we consider the ball released
  followThroughTailMs:  number  // how long we keep buffering after release
  bufferMs:             number  // total ring-buffer capacity in ms
  preLoadWindowMs:      number  // window sampled before load for context classification
  movementHipThreshold: number  // hip-X displacement fraction of torso height for 'movement'
}
export const DEFAULT_OPTS: DetectorOpts = {
  loadElbowDeg:         85,
  releaseElbowDeg:      160,
  followThroughTailMs:  300,
  bufferMs:             2000,
  preLoadWindowMs:      500,
  movementHipThreshold: 0.10,
}

// ── Math (local copy, no import from scorer — keeps modules independent) ──
function angleDeg(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const abx = a.x - b.x, aby = a.y - b.y
  const cbx = c.x - b.x, cby = c.y - b.y
  const magAB = Math.hypot(abx, aby)
  const magCB = Math.hypot(cbx, cby)
  if (magAB === 0 || magCB === 0) return 0
  const cos = Math.max(-1, Math.min(1, (abx * cbx + aby * cby) / (magAB * magCB)))
  return (Math.acos(cos) * 180) / Math.PI
}
function hipMidX(lm: NormalizedLandmark[]): number {
  return (lm[LM.LEFT_HIP].x + lm[LM.RIGHT_HIP].x) / 2
}
function torsoHeight(lm: NormalizedLandmark[]): number {
  const msx = (lm[LM.LEFT_SHOULDER].x + lm[LM.RIGHT_SHOULDER].x) / 2
  const msy = (lm[LM.LEFT_SHOULDER].y + lm[LM.RIGHT_SHOULDER].y) / 2
  const mhx = (lm[LM.LEFT_HIP].x + lm[LM.RIGHT_HIP].x) / 2
  const mhy = (lm[LM.LEFT_HIP].y + lm[LM.RIGHT_HIP].y) / 2
  return Math.max(Math.hypot(msx - mhx, msy - mhy), 1e-6)
}

// ── Reducer state ──────────────────────────────────────────────────────────
export type DetectorPhase = 'IDLE' | 'LOADED' | 'RELEASED'

export interface DetectorState {
  phase: DetectorPhase
  buffer: PoseFrame[]       // bounded ring; oldest popped when over capacity
  loadIndex: number | null  // index within `buffer` when LOAD was detected
  releaseIndex: number | null
  releaseTs: number | null  // ms; used to decide when follow-through tail is complete
}

export function initialDetectorState(): DetectorState {
  return { phase: 'IDLE', buffer: [], loadIndex: null, releaseIndex: null, releaseTs: null }
}

export interface StepResult {
  state: DetectorState
  emit: ShotWindow | null
}

function trimBuffer(buf: PoseFrame[], bufferMs: number): PoseFrame[] {
  if (buf.length === 0) return buf
  const cutoff = buf[buf.length - 1].timestamp - bufferMs
  let i = 0
  while (i < buf.length && buf[i].timestamp < cutoff) i++
  return i === 0 ? buf : buf.slice(i)
}

function classifyContext(preLoad: PoseFrame[], threshold: number): ShotContext {
  if (preLoad.length < 2) return 'stationary'
  const anchorT = torsoHeight(preLoad[preLoad.length - 1].landmarks)
  let minX = Infinity, maxX = -Infinity
  for (const f of preLoad) {
    const h = hipMidX(f.landmarks)
    if (h < minX) minX = h
    if (h > maxX) maxX = h
  }
  const disp = (maxX - minX) / anchorT
  return disp >= threshold ? 'movement' : 'stationary'
}

/** Pure step: feed one new frame, get new state + (optionally) a completed ShotWindow. */
export function stepShotDetector(
  prev: DetectorState,
  frame: PoseFrame,
  handedness: Handedness,
  opts: DetectorOpts = DEFAULT_OPTS,
): StepResult {
  // Always append + trim.
  let buffer = prev.buffer.concat(frame)
  // Pre-trim keeps memory bounded, but we also need all pre-load frames *inside* the shot cycle.
  // So we only trim when IDLE; during LOADED/RELEASED we keep growing until emission.
  if (prev.phase === 'IDLE') {
    buffer = trimBuffer(buffer, opts.bufferMs)
  }

  const lm = frame.landmarks
  const shoulderIdx = handedness === 'right' ? LM.RIGHT_SHOULDER : LM.LEFT_SHOULDER
  const elbowIdx    = handedness === 'right' ? LM.RIGHT_ELBOW    : LM.LEFT_ELBOW
  const wristIdx    = handedness === 'right' ? LM.RIGHT_WRIST    : LM.LEFT_WRIST
  const elbowAngle = angleDeg(lm[shoulderIdx], lm[elbowIdx], lm[wristIdx])
  const wristAboveShoulder = lm[wristIdx].y < lm[shoulderIdx].y
  const wristAboveNose     = lm[wristIdx].y < lm[LM.NOSE].y

  // ── IDLE → LOADED ────────────────────────────────────────────────────────
  if (prev.phase === 'IDLE') {
    if (elbowAngle < opts.loadElbowDeg && wristAboveShoulder) {
      return {
        state: {
          phase: 'LOADED',
          buffer,
          loadIndex: buffer.length - 1,
          releaseIndex: null,
          releaseTs: null,
        },
        emit: null,
      }
    }
    return { state: { ...prev, buffer }, emit: null }
  }

  // ── LOADED → RELEASED ────────────────────────────────────────────────────
  if (prev.phase === 'LOADED') {
    if (elbowAngle > opts.releaseElbowDeg && wristAboveNose) {
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

  // ── RELEASED → emit → IDLE ───────────────────────────────────────────────
  if (prev.releaseTs !== null && frame.timestamp - prev.releaseTs >= opts.followThroughTailMs) {
    const loadIdx = prev.loadIndex ?? 0
    const relIdx  = prev.releaseIndex ?? loadIdx
    const loadTs  = buffer[loadIdx].timestamp
    // Pre-load frames: those between (loadTs - preLoadWindowMs) and loadTs, inclusive of load frame.
    const preStartTs = loadTs - opts.preLoadWindowMs
    const preLoadFrames: PoseFrame[] = []
    for (let i = 0; i <= loadIdx; i++) {
      if (buffer[i].timestamp >= preStartTs) preLoadFrames.push(buffer[i])
    }
    const context = classifyContext(preLoadFrames, opts.movementHipThreshold)

    const shotFrames = buffer.slice(loadIdx)
    const win: ShotWindow = {
      frames: shotFrames,
      preLoadFrames,
      loadIndex: 0,
      releaseIndex: relIdx - loadIdx,
      handedness,
      context,
    }
    return {
      state: initialDetectorState(),
      emit: win,
    }
  }

  return { state: { ...prev, buffer }, emit: null }
}

// ── React adapter ──────────────────────────────────────────────────────────

export function useShotDetector(
  landmarks: NormalizedLandmark[] | null,
  handedness: Handedness,
  onShot: (window: ShotWindow) => void,
  opts: DetectorOpts = DEFAULT_OPTS,
): { phase: DetectorPhase } {
  const stateRef = useRef<DetectorState>(initialDetectorState())
  const phaseRef = useRef<DetectorPhase>('IDLE')
  const onShotRef = useRef(onShot)
  useEffect(() => { onShotRef.current = onShot }, [onShot])

  useEffect(() => {
    if (!landmarks) return
    const frame: PoseFrame = { landmarks, timestamp: performance.now() }
    const { state, emit } = stepShotDetector(stateRef.current, frame, handedness, opts)
    stateRef.current = state
    phaseRef.current = state.phase
    if (emit) onShotRef.current(emit)
  }, [landmarks, handedness, opts])

  return { phase: phaseRef.current }
}
```

- [ ] **Step 2: Type-check passes**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useShotDetector.ts
git commit -m "Add useShotDetector: pure reducer + React wrapper for shot detection"
```

---

## Task 5: Firestore persistence helper

**Files:**
- Create: `src/lib/basketballShots.ts`

- [ ] **Step 1: Create the helper**

```ts
// src/lib/basketballShots.ts
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { Shot } from '../types/basketball'

/**
 * Persist a single scored shot to Firestore under users/{uid}/basketballShots.
 * Fire-and-forget: swallows errors so the UI stays responsive offline.
 */
export async function saveBasketballShot(uid: string, shot: Omit<Shot, 'id'>): Promise<void> {
  try {
    await addDoc(collection(db, 'users', uid, 'basketballShots'), {
      ...shot,
      createdAt: serverTimestamp(),
    })
  } catch (e) {
    console.warn('[basketballShots] save failed:', e)
  }
}
```

- [ ] **Step 2: Type-check passes**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/basketballShots.ts
git commit -m "Add saveBasketballShot Firestore helper"
```

---

## Task 6: Firestore rules for basketballShots

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Update the users block**

Open `firestore.rules` and replace this block:

```
    match /users/{uid} {
      allow read:  if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }
```

with:

```
    match /users/{uid} {
      allow read:  if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;

      // Basketball shots — owner only
      match /basketballShots/{shotId} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
```

- [ ] **Step 2: Deploy rules (if user wants to deploy; otherwise commit for later deploy)**

Run: `firebase deploy --only firestore:rules` (requires Firebase CLI + auth).
Expected: successful deploy, or skip if CLI not configured.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "Allow owner read/write on users/{uid}/basketballShots subcollection"
```

---

## Task 7: BasketballPage UI

**Files:**
- Create: `src/pages/BasketballPage.tsx`

- [ ] **Step 1: Create the page**

```tsx
// src/pages/BasketballPage.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { usePoseDetection } from '../hooks/usePoseDetection'
import { useShotDetector } from '../hooks/useShotDetector'
import { scoreShot } from '../lib/beefScore'
import { saveBasketballShot } from '../lib/basketballShots'
import type { Handedness, Shot, ShotWindow } from '../types/basketball'

const HANDEDNESS_KEY = 'basketball:handedness'

export default function BasketballPage() {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [handedness, setHandedness] = useState<Handedness>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(HANDEDNESS_KEY) : null
    return stored === 'left' ? 'left' : 'right'
  })
  useEffect(() => { localStorage.setItem(HANDEDNESS_KEY, handedness) }, [handedness])

  const [uid, setUid] = useState<string | null>(null)
  useEffect(() => onAuthStateChanged(auth, u => setUid(u?.uid ?? null)), [])

  const { landmarks, isTracking, isLoading, error, startCamera, stopCamera } =
    usePoseDetection(videoRef, canvasRef)

  const [shots, setShots] = useState<Shot[]>([])

  const handleShot = useCallback((window: ShotWindow) => {
    const beef = scoreShot(window)
    const shot: Omit<Shot, 'id'> = {
      timestamp: Date.now(),
      handedness: window.handedness,
      context: window.context,
      beef,
    }
    setShots(prev => [{ ...shot, id: `local-${Date.now()}` }, ...prev].slice(0, 20))
    if (uid) void saveBasketballShot(uid, shot)
  }, [uid])

  const { phase } = useShotDetector(landmarks, handedness, handleShot)

  // Start camera on mount; stop on unmount.
  useEffect(() => {
    void startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  const latest = shots[0]
  const latestCue = latest?.beef.notes[0]

  return (
    <div className="min-h-screen bg-[#05050a] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#111119]">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-[12px] text-gray-400 hover:text-white">← Home</Link>
          <h1 className="text-[20px] font-black">🏀 Shooting Form</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500">Shooting hand</span>
          <button
            type="button"
            onClick={() => setHandedness(h => h === 'right' ? 'left' : 'right')}
            className="px-3 py-1 rounded-full text-[12px] font-bold bg-orange-500/15 text-orange-300 border border-orange-500/30"
          >
            {handedness === 'right' ? 'Right' : 'Left'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 p-4">
        {/* Camera area */}
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          {(isLoading || !isTracking) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="text-center px-6">
                <p className="text-[18px] font-black mb-2">{isLoading ? 'Starting camera…' : 'Ready to track'}</p>
                <p className="text-[12px] text-gray-400 max-w-xs">
                  Stand perpendicular to the camera — shooting arm facing it. Back up so your full body is in frame.
                </p>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute top-2 left-2 right-2 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-[12px] text-red-300">
              {error}
            </div>
          )}
          {/* State pill */}
          <div className="absolute top-2 right-2 px-2 py-1 rounded-full text-[10px] font-black tracking-widest uppercase"
               style={{
                 background: phase === 'LOADED' ? 'rgba(245,158,11,0.2)' :
                             phase === 'RELEASED' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)',
                 color:      phase === 'LOADED' ? '#fbbf24' :
                             phase === 'RELEASED' ? '#22c55e' : '#9ca3af',
               }}>
            {phase}
          </div>
          {/* Bottom cue banner */}
          {latest && (
            <div className="absolute left-2 right-2 bottom-2 px-4 py-3 rounded-xl bg-black/70 backdrop-blur-sm border border-white/10">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[14px] font-bold">
                  {latestCue ?? 'Solid shot — repeat it.'}
                </p>
                <span className="text-[20px] font-black" style={{ color: scoreColor(latest.beef.overall) }}>
                  {latest.beef.overall}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Shot list */}
        <aside className="rounded-2xl bg-[#0a0a14] border border-[#111119] p-3 space-y-2 max-h-[70vh] overflow-y-auto">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 px-1">Recent shots</p>
          {shots.length === 0 ? (
            <p className="text-[12px] text-gray-600 px-1">Take your first shot — scores will appear here.</p>
          ) : (
            shots.map(s => (
              <div key={s.id} className="rounded-xl border border-[#15151f] bg-[#07070d] px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest"
                        style={{ color: s.context === 'movement' ? '#f59e0b' : '#60a5fa' }}>
                    {s.context === 'movement' ? 'Pull-up' : 'Set'}
                  </span>
                  <span className="text-[16px] font-black" style={{ color: scoreColor(s.beef.overall) }}>
                    {s.beef.overall}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-center">
                  {(['balance','eyes','elbow','followThrough'] as const).map(k => (
                    <div key={k} className="rounded-md bg-[#0d0d17] py-1">
                      <p className="text-[9px] uppercase text-gray-600">{k === 'followThrough' ? 'F' : k[0]}</p>
                      <p className="text-[11px] font-bold" style={{ color: scoreColor(s.beef[k]) }}>{s.beef[k]}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </aside>
      </div>
    </div>
  )
}

function scoreColor(v: number): string {
  if (v >= 85) return '#22c55e'
  if (v >= 70) return '#eab308'
  if (v >= 50) return '#f97316'
  return '#ef4444'
}
```

- [ ] **Step 2: Type-check passes**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/BasketballPage.tsx
git commit -m "Add BasketballPage with live camera, shot list, and coaching cue"
```

---

## Task 8: Add /basketball route

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Identify the route list**

Run: `grep -n "Route" src/App.tsx | head -20`
Expected: lines showing the existing `<Route>` declarations. Locate the group where other page routes are registered.

- [ ] **Step 2: Add the import and route**

At the top of `src/App.tsx`, add alongside the other page imports:

```tsx
import BasketballPage from './pages/BasketballPage'
```

In the `<Routes>` block, alongside the existing routes, add:

```tsx
<Route path="/basketball" element={<BasketballPage />} />
```

- [ ] **Step 3: Type-check passes**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "Add /basketball route"
```

---

## Task 9: Flip HomePage "Basketball — Soon" card to live link

**Files:**
- Modify: `src/pages/HomePage.tsx` (around line 543)

- [ ] **Step 1: Locate the card**

Run: `grep -n "Shooting Form Tracker\|Basketball" src/pages/HomePage.tsx`
Expected: hits near line 543 in the sidebar's "Basketball coming soon" comment block.

- [ ] **Step 2: Replace the card**

Replace the entire `{/* Basketball coming soon */}` block. The existing outer `<div className="rounded-2xl overflow-hidden" ...>` wraps the whole card. Replace the **outer wrapper** only, keeping the same visual content but removing the "Soon" badge and making the whole card a `<Link>`. Concretely:

- Change the outer `<div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(234,88,12,0.3)' }}>` opener to `<Link to="/basketball" className="block rounded-2xl overflow-hidden hover:brightness-110 transition-all" style={{ border: '1px solid rgba(234,88,12,0.3)' }}>`.
- Change the matching closing `</div>` for that block to `</Link>`.
- Inside, find and delete this span:

```tsx
<span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-orange-500/20 text-orange-300 border border-orange-500/30">Soon</span>
```

- Make sure `Link` is imported at the top of `HomePage.tsx`. Search: `grep -n "from 'react-router-dom'" src/pages/HomePage.tsx`. If `Link` is not already in that import list, add it.

- [ ] **Step 3: Type-check passes**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/pages/HomePage.tsx
git commit -m "Flip Basketball sidebar card from coming-soon to live link"
```

---

## Task 10: Manual browser smoke test

**Files:** none changed.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: Vite prints a local HTTPS (or localhost) URL. Open it in a browser with camera permission.

- [ ] **Step 2: Navigate via home card**

Go to `/` → click the "Basketball Shooting Form Tracker" sidebar card → lands on `/basketball`.

- [ ] **Step 3: Verify setup flow**

- Page loads. Camera permission prompt appears.
- Grant permission. Video feed starts. Skeleton overlay appears on pose detection.
- Handedness toggle works (Right ↔ Left, persists across reloads).

- [ ] **Step 4: Verify shot detection**

Stand perpendicular to camera, shooting arm toward it. Mime a shot: lower the ball to set point (elbow ≤85°, wrist above shoulder) → push up to release (elbow ≥160°, wrist above nose) → hold follow-through ~300ms.

Expected: state pill transitions `IDLE → LOADED → RELEASED → IDLE`. One shot appears at the top of the "Recent shots" list with overall and 4 sub-scores. Bottom cue banner shows a coaching line.

- [ ] **Step 5: Verify context classification**

Simulate a pull-up: shuffle sideways for ~500ms before loading the shot. Context badge on the shot row reads "Pull-up". A stationary set shot reads "Set".

- [ ] **Step 6: Verify persistence (if signed in)**

In Firebase console, open Firestore → `users/{your-uid}/basketballShots`. The shots from this session are present with matching BEEF scores and context.

- [ ] **Step 7: Final smoke commit (optional)**

If any small polish commits happened during this step, squash-commit them. Otherwise skip.

---

## Self-Review Notes (pre-execution)

**Spec coverage:** each spec section maps to at least one task.

- Goal / non-goals → Task 7 (UI shape), Task 6 (rules), Task 5 (persistence).
- User-facing shape → Task 7 + Task 9 (home card flip).
- Architecture / Types → Tasks 1, 2.
- Shot detection + context classification → Task 4.
- BEEF scoring (all four components, leniency) → Task 3.
- UI → Task 7.
- Persistence → Task 5 + Task 6.
- Routing → Task 8.
- Scaffold for option C (video upload) → satisfied by the `PoseFrame` type (Task 1) being consumed by the detector (Task 4) without knowing its source.

**Type consistency check:** `ShotWindow`, `Shot`, `BeefScore`, `ShotContext`, `Handedness`, `PoseFrame` have a single definition in `src/types/` and are referenced consistently in `beefScore.ts`, `useShotDetector.ts`, `basketballShots.ts`, and `BasketballPage.tsx`. `scoreShot` signature is `(window: ShotWindow) => BeefScore`. `stepShotDetector` signature is `(prev, frame, handedness, opts?) => StepResult`.

**Scope:** single feature, single plan. Not further decomposable without losing cohesion.

**Known deviations from spec, documented inline:**
- Normalization uses torso height, not shoulder-width (see plan header).
- Tests deferred (hackathon mode). Plan structure keeps all logic in pure functions so tests can be added later without refactor.
