# Basketball Shooting Form Tracker — Design

Date: 2026-04-22
Status: Approved, ready for implementation plan

## Goal

Ship a first version of a basketball shooting form tracker that scores each shot against the **B.E.E.F.** fundamentals (Balance, Eyes, Elbow, Follow-through), acknowledging modern shooting variations so well-established deviations (Curry-style offset elbow, turn/pivot stance, one-motion dip-and-rise) aren't punished. Replaces the existing "Shooting Form Tracker — Soon" card on the home page with a real feature.

## Non-goals (v1)

- **No make/miss detection.** Rim/ball detection is a separate CV problem unrelated to form. Explicit non-goal for v1.
- **No trend visualization UI.** Per-shot BEEF scores are persisted from day one, but the "form over time" charts come later.
- **No video upload mode.** Live camera only. The pipeline is scaffolded so a future video-upload producer slots in without downstream changes.
- **No OpenAI coaching call in v1.** Coaching text comes from a rule-based mapping. AI coaching can layer on later using the same persisted score records.
- **No front-facing / auto-angle camera mode.** Side-on only in v1.

## User-facing shape

- New standalone page at route `/basketball`, rendered by `src/pages/BasketballPage.tsx`.
- Entry point is the existing "Basketball — Shooting Form Tracker" card on `HomePage.tsx` (around line 543). The "Soon" badge is removed and the card becomes a live link.
- Setup flow on the page:
  1. Shooting hand picker (Right / Left) — persisted in localStorage under `basketball:handedness`.
  2. Camera permission prompt (same UX as `WorkoutPage`).
  3. Side-on framing instruction card: "Stand perpendicular to the camera with your shooting arm facing it. Back up so your full body is in frame."
- Live view:
  - Webcam feed with pose-skeleton overlay (reuse the existing canvas pattern from `usePoseDetection`).
  - Top-right: rolling list of the last ~5 shots showing overall score and four BEEF sub-scores.
  - Bottom: one-line coaching cue for the most recent shot (e.g., "Hold your follow-through — don't drop the wrist").
  - Current shot state indicator: IDLE / LOADED / RELEASED (small pill, mostly for user confidence that tracking is working).

The page is intentionally shot-based, not rep-based — no sets, no set-break, no "new set" key press. Free-form: user shoots, the page logs each detected shot.

## Architecture

```
MediaPipe Pose (CDN, existing)
  ↓
usePoseDetection  (existing, unchanged)
  ↓ stream of PoseFrame { landmarks, timestamp }
useShotDetector   (new)
  ↓ emits ShotWindow (buffered landmark frames spanning load → release → follow-through)
scoreShot         (new, pure function in src/lib/beefScore.ts)
  ↓ returns { balance, eyes, elbow, followThrough, overall, notes[] }
BasketballPage UI  +  Firestore persist (users/{uid}/basketballShots/{id})
```

**Isolation seam for future video-upload mode (option C):** `PoseFrame` is a shared type in `src/types/pose.ts`. The rest of the pipeline reads `PoseFrame`s, not raw landmarks or webcam state. A future `usePoseFromVideoFile(file)` producer emits the same `PoseFrame` stream — `useShotDetector` and `scoreShot` are unchanged.

## Types

New in `src/types/pose.ts`:

```ts
export interface PoseFrame {
  landmarks: NormalizedLandmark[]  // MediaPipe 33-landmark schema
  timestamp: number                 // ms, monotonic
}
```

New in `src/types/basketball.ts`:

```ts
export type Handedness = 'right' | 'left'

export interface ShotWindow {
  frames: PoseFrame[]     // load → release → follow-through
  loadIndex: number       // index of load-detected frame
  releaseIndex: number    // index of release-detected frame
  handedness: Handedness
}

export interface BeefScore {
  balance: number        // 0–100
  eyes: number           // 0–100 (head-stability proxy — see scoring rules)
  elbow: number          // 0–100
  followThrough: number  // 0–100
  overall: number        // 0–100 (simple mean of the four)
  notes: string[]        // human-readable cues, ordered by severity
}

export interface Shot {
  id: string
  timestamp: number
  handedness: Handedness
  beef: BeefScore
}
```

## Shot detection (`src/hooks/useShotDetector.ts`)

Three-state machine on the shooting-arm elbow angle and wrist-Y, evaluated each time `usePoseDetection` emits a new frame. Mirrors the pattern in `useRepCounter` / `useBurpeeCounter`.

States and transitions:

- **IDLE** — default. Shooting-arm wrist below shooting-arm shoulder Y; elbow angle > 150°.
- **IDLE → LOADED** — elbow angle drops below **85°** AND wrist rises above shoulder Y. Start a ring buffer of `PoseFrame`s (capacity ~2 seconds at 30 fps ≈ 60 frames). Record `loadIndex`.
- **LOADED → RELEASED** — elbow angle extends above **160°** AND wrist rises above nose Y. Record `releaseIndex`. Keep buffering for an additional **~300 ms** to capture follow-through.
- **RELEASED → IDLE** — after the 300ms post-release tail, emit a `ShotWindow` event with the buffered frames, `loadIndex`, and `releaseIndex`. Buffer resets.

Tunables exposed on the hook's options (same pattern as existing counters): `loadElbowDeg` (85), `releaseElbowDeg` (160), `followThroughTailMs` (300), `bufferSeconds` (2). Defaults set on first compile; user-facing calibration UI is out of scope for v1.

Memory: the ring buffer is bounded. `ShotWindow.frames` is a fresh array slice on emission — the buffer itself is reused.

Landmarks used (MediaPipe indices):
- Right-handed shooter: right shoulder (12), right elbow (14), right wrist (16), nose (0), right hip (24), right ankle (28).
- Left-handed shooter: left shoulder (11), left elbow (13), left wrist (15), nose (0), left hip (23), left ankle (27).

## BEEF scoring (`src/lib/beefScore.ts`)

Pure function: `scoreShot(window: ShotWindow): BeefScore`. No IO, no OpenAI, deterministic.

Each component is scored 0–100. **Overall = arithmetic mean** of the four. Per-component rules:

### Balance (at release frame)

- Foot spacing: ankle-to-ankle X distance within shoulder-width ± 20% → full marks on this sub-criterion.
- Stance: hip midpoint X within ±15% of ankle midpoint X (vertical projection, normalized by shoulder-width) at release → full marks. Linear falloff to 0 at ±40% offset.
- **Modern exception:** slight forward lean is fine. Hard fade-away (hip posterior of ankle by more than 15% of shoulder-width) is penalized on the falloff curve above.
- Composition: 60% stance, 40% foot-spacing.

### Eyes (side-on proxy: head stability)

Upfront caveat documented in the UI: we cannot observe gaze from a side-on camera. We measure **head stability** as a proxy — stable head during the shot strongly correlates with eyes locked on target.

- Compute nose-X displacement (normalized) across the window from `loadIndex` to `releaseIndex`.
- ≤3% of frame width displacement → 100. Linear falloff to 0 at 10%.
- Rationale: if the head rotates mid-shot, the shooter has broken target focus.

### Elbow (at release frame + set point)

- **Release alignment (60% weight):** shooting-side elbow X relative to shooting-side shoulder X. Offset up to **15% of shoulder-width** in the direction of the shooting hand scores full marks (modern allowance). Graded penalty beyond that. Offset *toward* centerline (chicken-wing inward) is penalized more aggressively.
- **Set-point angle (40% weight):** at `loadIndex`, upper-arm / forearm angle should be near **90° ("L shape")**. ±15° → full marks, graded falloff beyond.

### Follow-through (post-release frames)

The single most predictive marker of good shooting form.

- **Gooseneck angle (50% weight):** wrist flexion relative to forearm, computed in the frame ~150ms after release. Wrist angle ≥60° → full marks; below 40° → 0. Linear between.
- **Hold duration (30% weight):** wrist stays flexed for ≥250ms post-release → full marks.
- **Snap speed bonus (20% weight):** peak angular velocity of wrist flexion over the 150ms following `releaseIndex`. ≥5 rad/s → full marks; linear falloff to 0 at ≤1 rad/s. Threshold is a tunable constant in `beefScore.ts`; the 5 rad/s default is a conservative starting value to be refined once we have real shot data.

### Notes / coaching cues

After scoring, build `notes[]` by walking the components in ascending score order and mapping each < 70 component to its canonical cue:

- balance < 70 → "Widen your base" or "Stay over your feet — not fading"
- eyes < 70 → "Keep your head still through the shot"
- elbow < 70 → "Elbow drifted outside the shoulder line" (or "Chicken wing — tuck it under")
- followThrough < 70 → "Hold your follow-through — don't drop the wrist"

Only the first note is shown in the live view; the full list is stored with the shot record.

## UI (`src/pages/BasketballPage.tsx`)

High-level layout (mirrors the dark theme used across the app):

- **Header:** page title, handedness indicator (tap to change), "end session" button.
- **Main area:** webcam video with MediaPipe skeleton overlay (reuse canvas-draw pattern from existing `usePoseDetection` consumers in `WorkoutPage`).
- **Top-right panel:** rolling list of the last 5 shots — overall score + 4 BEEF sub-scores + timestamp.
- **Bottom banner:** coaching cue for the latest shot (largest type); pill showing current detector state (IDLE / LOADED / RELEASED).
- **Empty state:** until the first shot is detected, a persistent overlay on the video area reiterates the side-on framing instruction ("Stand perpendicular to camera — shooting arm toward it"). Dismissed automatically on first successful shot.

State in the page component:
- `handedness: Handedness` (initialized from localStorage, defaults to 'right')
- `shots: Shot[]` (most recent first, kept to a rolling N in memory; full history lives in Firestore)
- `detectorState: 'IDLE' | 'LOADED' | 'RELEASED'` from the hook

Persistence is fire-and-forget on each shot (no optimistic-UI gymnastics); if Firestore writes fail offline, the in-memory list still updates — same pattern as `RecoveryLogPage`.

## Persistence

Firestore path: `users/{uid}/basketballShots/{shotId}`.

Document shape:

```ts
{
  timestamp: number,
  handedness: 'right' | 'left',
  beef: {
    balance: number,
    eyes: number,
    elbow: number,
    followThrough: number,
    overall: number,
  },
  notes: string[],
}
```

Mirrors the existing per-user sub-collection convention used elsewhere in `firestoreUser.ts`. Security rules need updating to allow authenticated users read/write on their own `basketballShots` sub-collection.

## Routing

- Add `/basketball` route in `App.tsx` → `BasketballPage`.
- `HomePage.tsx:543` "Basketball — Soon" card:
  - Remove the "Soon" badge.
  - Change the card from a `<div>` with `onClick={alert(…)}` (if present) to a `<Link to="/basketball">`.
  - Keep the existing visual treatment.

## Scaffold for option C (video upload) — not built, but honored

`PoseFrame` is defined in a shared types file. `useShotDetector` and `scoreShot` consume `PoseFrame` streams, not webcam-specific state. A future `usePoseFromVideoFile(file)` producer will:

- Read video frames via `HTMLVideoElement` + `requestVideoFrameCallback`.
- Run the same MediaPipe Pose instance over each frame.
- Emit `PoseFrame`s with `video.currentTime * 1000` as `timestamp`.

No downstream code changes required.

## Files added or changed

New:
- `src/pages/BasketballPage.tsx`
- `src/hooks/useShotDetector.ts`
- `src/lib/beefScore.ts`
- `src/types/pose.ts` (shared `PoseFrame`)
- `src/types/basketball.ts` (shot + score types)

Changed:
- `src/App.tsx` — add `/basketball` route.
- `src/pages/HomePage.tsx` — flip the "Soon" card to a live link around line 543.
- `firestore.rules` — allow owner read/write on `users/{uid}/basketballShots/**`.

## Testing approach

- `beefScore.ts` is pure and easy to unit-test with synthetic `ShotWindow` fixtures (mock landmark arrays representing known-good and known-bad shots). At minimum: one test per component (balance/eyes/elbow/follow-through) hitting a good case and a degraded case.
- `useShotDetector.ts` tested with a scripted `PoseFrame` sequence that walks IDLE → LOADED → RELEASED and asserts a single `ShotWindow` emission with correct `loadIndex` / `releaseIndex`.
- End-to-end browser validation: open `/basketball`, verify webcam + skeleton, mime a shooting motion (even without a ball — the detector is purely geometric), confirm a shot is detected and scored.

## Open risks

- **Pose jitter on fast release motion.** If MediaPipe's single-person model smears wrist landmarks during a fast release, follow-through snap-speed measurement may be unreliable. Mitigation: weight follow-through on the gooseneck angle (static) more than snap speed (dynamic).
- **Side-on stance misalignment.** If the user stands at ~45° instead of true side-on, elbow-X vs shoulder-X math is compressed. Mitigation: on first shot, check shoulder-depth vs shoulder-width ratio; if torso rotation exceeds a threshold, surface a one-shot "angle looks off — stand more perpendicular" nudge. Out of scope for v1 if it grows; note it as a follow-up.
- **No calibration step.** Detector thresholds are global defaults. Works for most adult shooters; may misfire for users with atypical proportions. Acceptable for v1 — calibration is a later addition.
