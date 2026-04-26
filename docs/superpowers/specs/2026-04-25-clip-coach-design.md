# Clip Coach Implementation Plan

**Goal:** Let users upload a workout video clip from their camera roll and receive AI-powered form coaching, placed inline on the Today dashboard below the AI Generate / Build Plan quick-links.

**Architecture:** One new component (`ClipCoach`) + one new function (`analyzeClip`) in the existing `formAnalysis.ts`. No new routes, no new nav entries, no server side. Frames are extracted entirely in-browser and sent directly to OpenAI via the user's stored API key.

**Tech Stack:** React 19, TypeScript, OpenAI JS SDK (already in project), browser `<video>` + `<canvas>` APIs for frame extraction.

---

## Components & Files

| File | Change |
|------|--------|
| `src/components/ClipCoach.tsx` | New — full upload/extract/analyze/results UI |
| `src/lib/formAnalysis.ts` | Add `analyzeClip()` function |
| `src/pages/HomePage.tsx` | Mount `<ClipCoach />` below quick-links grid |

---

## Data Flow

```
User selects video file
  → URL.createObjectURL(file) → hidden <video> element
  → seek to 8 evenly-spaced timestamps
  → draw each frame to 256×256 <canvas>, export JPEG q=0.7
  → 8 base64 data URLs
  → analyzeClip({ frames, exercise, userProfile })
  → OpenAI gpt-4o-mini with vision (same client() as analyzeForm)
  → FormAnalysisResult { riskScore, suggestions, safetyConcerns }
  → render results card
```

---

## `analyzeClip` function spec

```ts
// src/lib/formAnalysis.ts — new export
export async function analyzeClip(params: {
  frames: string[]        // 8 base64 JPEG data URLs
  exercise: string        // e.g. "push-up", "squat"
  userProfile: { age: number; weight: number; fitnessLevel: string }
}): Promise<FormAnalysisResult>
```

- Uses same `client()` and `gpt-4o-mini` as `analyzeForm`
- System prompt: "You are a strength coach reviewing recorded workout footage. Analyze form quality across all frames and return JSON."
- Reuses existing per-exercise coaching rubrics from `analyzeForm` (same `exerciseGuides` map)
- Returns same `FormAnalysisResult` shape so results rendering is shared
- Returns `DEFAULT_FORM_RESULT` if no API key or network error

---

## `ClipCoach` component spec

### States

```ts
type ClipState = 'idle' | 'picking' | 'extracting' | 'analyzing' | 'results' | 'error'
```

### `idle`
- Collapsed card with single button: "📹 Analyze a clip"
- Only renders if `hasApiKey()` is true; otherwise renders a small "Add an OpenAI key in Profile to unlock clip coaching" prompt

### `picking`
- File `<input accept="video/*">` (triggers native file picker)
- Exercise `<select>` with options: push-up, squat, deadlift, bench press, shoulder press, pull-up, lunge, plank, other
- "Analyze →" button, disabled until both file and exercise are selected

### `extracting`
- Animated progress bar (indeterminate)
- Text: "Extracting frames…"
- Frame extraction runs via `extractFrames(file): Promise<string[]>`:
  - Create `<video>` element, set `src = URL.createObjectURL(file)`
  - Wait for `loadedmetadata` event to get `video.duration`
  - Seek to 8 timestamps: `[0.05, 0.18, 0.31, 0.44, 0.57, 0.70, 0.83, 0.95]` × duration
  - For each timestamp: set `video.currentTime`, wait for `seeked`, draw to 256×256 canvas, `canvas.toDataURL('image/jpeg', 0.7)`
  - Revoke object URL after extraction
  - Returns array of 8 base64 strings

### `analyzing`
- Spinner + "Sending to coach…"
- Calls `analyzeClip({ frames, exercise, userProfile })`

### `results`
- Risk score pill (color-coded: green <30, amber 30–60, red >60)
- Up to 3 coaching suggestions as a bulleted list
- Safety concerns section (only shown if non-empty)
- "Try another clip" button → resets to `idle`

### `error`
- Error message
- "Try again" button → resets to `picking`

---

## Exercise options

```ts
const EXERCISES = [
  'push-up', 'squat', 'deadlift', 'bench press',
  'shoulder press', 'pull-up', 'lunge', 'plank', 'other',
]
```

"Other" maps to a generic form coaching prompt (no exercise-specific rubric).

---

## User profile loading

`ClipCoach` reads the profile from `localStorage.getItem('formAI_profile')` — same pattern as `WorkoutPage`. Falls back to `{ age: 30, weight: 70, fitnessLevel: 'intermediate' }` if not set.

---

## No-key state

If `hasApiKey()` returns false, the component renders a single dimmed line:
> "Add an OpenAI key in [Profile →] to unlock clip coaching."

No upload UI is shown — avoids confusing dead-end flows.

---

## Placement in HomePage

Below the quick-links 2×2 grid, above the footer links:

```tsx
{/* Quick links grid */}
<div className="grid grid-cols-2 gap-2">…</div>

{/* Clip coach */}
<ClipCoach />

{/* Footer links */}
<div className="flex …">…</div>
```
