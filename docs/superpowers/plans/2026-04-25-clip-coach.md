# Clip Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "📹 Analyze a clip" card to the Today dashboard that lets users upload a workout video, extracts 8 frames in-browser, and returns AI form coaching via the existing OpenAI key.

**Architecture:** One new component (`ClipCoach`) + one new exported function (`analyzeClip`) appended to the existing `formAnalysis.ts`. The shared exercise rubric map is extracted to a module-level constant so both `analyzeForm` and `analyzeClip` can use it. `ClipCoach` is mounted in `HomePage` between the quick-links grid and the footer links.

**Tech Stack:** React 19, TypeScript, browser `<video>` + `<canvas>` APIs, OpenAI JS SDK (already installed), existing `FormAnalysisResult` type.

---

## File Map

| File | Change |
|------|--------|
| `src/lib/formAnalysis.ts` | Extract `exerciseGuides` to module-level const; add `analyzeClip()` |
| `src/components/ClipCoach.tsx` | New — full upload/extract/analyze/results UI |
| `src/pages/HomePage.tsx` | Import and mount `<ClipCoach />` between quick-links and footer |

---

## Task 1: Extract exerciseGuides to module-level in formAnalysis.ts

**Files:**
- Modify: `src/lib/formAnalysis.ts`

The `exerciseGuides` record is currently defined inside the `attempt()` closure inside `analyzeForm`. Pull it out to module level so `analyzeClip` (Task 2) can share it without duplication.

- [ ] **Step 1: Locate the exerciseGuides declaration**

In `src/lib/formAnalysis.ts`, find this line inside the `attempt` closure (around line 170):
```ts
    // Per-exercise coaching rubrics: what to look for, ranked by injury risk
    const exerciseGuides: Record<string, string> = {
      pushup: [
```

- [ ] **Step 2: Move exerciseGuides to module level**

Cut the entire `const exerciseGuides: Record<string, string> = { … }` block (ends around line 362 with the closing `}`) and paste it at module level, just before the `analyzeForm` function. Change it from `const exerciseGuides` (local) to `const EXERCISE_GUIDES` (module-level) so both functions can use it. Add the export so tests can import it if needed.

The moved block should look like:

```ts
// ── Per-exercise coaching rubrics ─────────────────────────────────────────
export const EXERCISE_GUIDES: Record<string, string> = {
  pushup: [
    'BODY ALIGNMENT (highest priority): body must form a straight line ear→shoulder→hip→ankle.',
    '  - Hip sag (hips drop below line) = lower back compression. Score 60+ if sagging.',
    '  - Hip pike (butt in the air) = avoiding the hard part, not engaging core. Score 40+.',
    'ELBOW POSITION: elbows should track at ~45° from torso, NOT flaring out wide (shoulder impingement risk).',
    'DEPTH: chest should nearly touch the floor at the bottom. Partial reps that stop halfway = score 35+.',
    'HEAD: neutral — eyes looking slightly ahead of hands, not drooping or craning up.',
  ].join('\n'),
  // … (all other entries unchanged, just moved out of the closure)
}
```

- [ ] **Step 3: Update the reference inside analyzeForm**

Inside `analyzeForm`'s `attempt` closure, replace:
```ts
    const guide = exerciseGuides[params.exercise.toLowerCase()]
```
with:
```ts
    const guide = EXERCISE_GUIDES[params.exercise.toLowerCase()]
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/formAnalysis.ts
git commit -m "refactor: extract EXERCISE_GUIDES to module level for reuse"
```

---

## Task 2: Add analyzeClip to formAnalysis.ts

**Files:**
- Modify: `src/lib/formAnalysis.ts` (append after `generateRecoveryInsight`)

- [ ] **Step 1: Append analyzeClip at the end of formAnalysis.ts**

Add this function after the closing `}` of `generateRecoveryInsight`:

```ts
// ── analyzeClip ────────────────────────────────────────────────────────────

export async function analyzeClip(params: {
  frames:      string[]
  exercise:    string
  userProfile: { age: number; weight: number; fitnessLevel: string }
}): Promise<FormAnalysisResult> {
  const c = client()
  if (!c) return { ...DEFAULT_FORM_RESULT }

  const guide = EXERCISE_GUIDES[params.exercise.toLowerCase()]
    ?? 'Check posture, joint alignment, spine neutrality, and full range of motion. Flag any rounding, collapsing, or compensatory movement patterns.'

  const levelMap: Record<string, string> = {
    beginner:     'beginner — be encouraging but very direct about safety issues',
    intermediate: 'intermediate — be direct and technically precise',
    advanced:     'advanced — be concise, assume they know the basics, focus only on what is actually off',
  }
  const levelNote = levelMap[params.userProfile.fitnessLevel] ?? 'intermediate'

  const imageBlocks: OpenAI.Chat.Completions.ChatCompletionContentPart[] = params.frames.map(f => ({
    type:      'image_url' as const,
    image_url: { url: f, detail: 'low' as const },
  }))

  const textBlock: OpenAI.Chat.Completions.ChatCompletionContentPart = {
    type: 'text',
    text: [
      `EXERCISE: ${params.exercise.toUpperCase()} (recorded clip review)`,
      `ATHLETE: ${params.userProfile.age} yrs, ${params.userProfile.weight} kg, ${levelNote}`,
      '',
      'FORM RUBRIC:',
      guide,
      '',
      'SCORING:',
      '  0–20 = excellent form',
      '  21–40 = minor issues',
      '  41–60 = clear form breakdown',
      '  61–80 = significant fault, needs correction',
      '  81–100 = dangerous, high injury risk',
      '',
      'IMPORTANT RULES:',
      '- These are evenly-spaced frames from a recorded clip, not live footage.',
      '- Identify the most common or most dangerous fault visible across the frames.',
      '- suggestions must be coaching cues in second person: "Your left knee is caving — press it out."',
      '- safetyConcerns only for genuinely dangerous patterns (score 65+). Empty array otherwise.',
      '- repCountEstimate: count visible reps across all frames. 0 if unclear.',
      '',
      'Respond with ONLY this JSON — no markdown, no prose:',
      '{',
      '  "riskScore": number,',
      '  "suggestions": string[],',
      '  "safetyConcerns": string[],',
      '  "dominantIssue": string | null,',
      '  "warmupQuality": null,',
      '  "repCountEstimate": number',
      '}',
    ].join('\n'),
  }

  try {
    const completion = await c.chat.completions.create({
      model:      'gpt-4o-mini',
      max_tokens: 500,
      messages: [
        {
          role:    'system',
          content: 'You are an elite strength coach reviewing recorded workout footage. Analyze form quality across all frames and return JSON only.',
        },
        {
          role:    'user',
          content: [...imageBlocks, textBlock],
        },
      ],
    })
    const raw = completion.choices[0]?.message?.content ?? ''
    return JSON.parse(stripJsonFences(raw)) as FormAnalysisResult
  } catch {
    return { ...DEFAULT_FORM_RESULT }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/formAnalysis.ts
git commit -m "feat: add analyzeClip for post-workout video review"
```

---

## Task 3: Create ClipCoach component

**Files:**
- Create: `src/components/ClipCoach.tsx`

This component manages the full upload → extract → analyze → results flow as a self-contained card.

- [ ] **Step 1: Create the file with this complete implementation**

```tsx
// src/components/ClipCoach.tsx
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { hasApiKey, analyzeClip } from '../lib/formAnalysis'
import type { FormAnalysisResult } from '../types/index'

type ClipState = 'idle' | 'picking' | 'extracting' | 'analyzing' | 'results' | 'error'

const EXERCISES = [
  'push-up', 'squat', 'deadlift', 'bench press',
  'shoulder press', 'pull-up', 'lunge', 'plank', 'other',
]

const SEEK_RATIOS = [0.05, 0.18, 0.31, 0.44, 0.57, 0.70, 0.83, 0.95]

function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem('formAI_profile') ?? '{}') as Record<string, unknown>
    return {
      age:          typeof p.age === 'number' ? p.age : Number(p.age) || 30,
      weight:       typeof p.weight === 'number' ? p.weight : Math.round((Number(p.weight) || 154) / 2.20462),
      fitnessLevel: typeof p.fitnessLevel === 'string' ? p.fitnessLevel : 'intermediate',
    }
  } catch {
    return { age: 30, weight: 70, fitnessLevel: 'intermediate' }
  }
}

async function extractFrames(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    const url = URL.createObjectURL(file)
    video.src = url

    video.addEventListener('loadedmetadata', () => {
      const duration = video.duration
      if (!duration || !isFinite(duration)) {
        URL.revokeObjectURL(url)
        reject(new Error('Could not read video duration'))
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width  = 256
      canvas.height = 256
      const ctx = canvas.getContext('2d')!
      const frames: string[] = []
      let i = 0

      const seekNext = () => {
        if (i >= SEEK_RATIOS.length) {
          URL.revokeObjectURL(url)
          resolve(frames)
          return
        }
        video.currentTime = SEEK_RATIOS[i] * duration
      }

      video.addEventListener('seeked', () => {
        ctx.drawImage(video, 0, 0, 256, 256)
        frames.push(canvas.toDataURL('image/jpeg', 0.7))
        i++
        seekNext()
      })

      seekNext()
    })

    video.addEventListener('error', () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load video file'))
    })
  })
}

function riskColor(score: number): string {
  if (score < 30) return '#22c55e'
  if (score < 60) return '#f59e0b'
  return '#ef4444'
}

export function ClipCoach() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [state,    setState]    = useState<ClipState>('idle')
  const [file,     setFile]     = useState<File | null>(null)
  const [exercise, setExercise] = useState('')
  const [result,   setResult]   = useState<FormAnalysisResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  if (!hasApiKey()) {
    return (
      <p className="text-center text-[11px] text-gray-600 py-2">
        Add an OpenAI key in{' '}
        <Link to="/profile" className="text-accent hover:text-accent/80 transition-colors">
          Profile →
        </Link>{' '}
        to unlock clip coaching.
      </p>
    )
  }

  const reset = () => {
    setState('idle')
    setFile(null)
    setExercise('')
    setResult(null)
    setErrorMsg('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setFile(f)
  }

  const handleAnalyze = async () => {
    if (!file || !exercise) return
    try {
      setState('extracting')
      const frames = await extractFrames(file)

      setState('analyzing')
      const profile = loadProfile()
      const res = await analyzeClip({ frames, exercise, userProfile: profile })

      setResult(res)
      setState('results')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
      setState('error')
    }
  }

  // ── idle ──────────────────────────────────────────────────────────────────
  if (state === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setState('picking')}
        className="w-full rounded-xl py-3 text-[12px] font-semibold text-gray-400 hover:text-white transition-all"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        📹 Analyze a clip
      </button>
    )
  }

  // ── picking ───────────────────────────────────────────────────────────────
  if (state === 'picking') {
    return (
      <div className="card-surface p-4 space-y-3 rounded-xl">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold tracking-[0.12em] text-gray-500 uppercase">Clip Coach</p>
          <button type="button" onClick={reset} className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors">✕</button>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em] mb-1.5">
            Video file
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            className="w-full text-[12px] text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-accent/10 file:text-accent hover:file:bg-accent/20 transition-colors"
          />
          {file && <p className="mt-1 text-[10px] text-gray-600 truncate">{file.name}</p>}
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em] mb-1.5">
            Exercise
          </label>
          <select
            value={exercise}
            onChange={e => setExercise(e.target.value)}
            className="input-dark text-[13px]"
          >
            <option value="" disabled>Select exercise…</option>
            {EXERCISES.map(ex => (
              <option key={ex} value={ex}>{ex}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={!file || !exercise}
          className="w-full py-2.5 rounded-xl font-bold text-[13px] text-white transition-colors bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Analyze →
        </button>
      </div>
    )
  }

  // ── extracting ────────────────────────────────────────────────────────────
  if (state === 'extracting') {
    return (
      <div className="card-surface p-4 rounded-xl space-y-3">
        <p className="text-[12px] font-semibold text-gray-400">Extracting frames…</p>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <div
            className="h-full rounded-full animate-pulse"
            style={{ width: '60%', background: 'var(--accent)' }}
          />
        </div>
      </div>
    )
  }

  // ── analyzing ─────────────────────────────────────────────────────────────
  if (state === 'analyzing') {
    return (
      <div className="card-surface p-4 rounded-xl flex items-center gap-3">
        <div className="w-5 h-5 border-2 rounded-full animate-spin shrink-0"
          style={{ borderColor: 'var(--border-2)', borderTopColor: 'var(--accent)' }} />
        <p className="text-[12px] text-gray-400">Sending to coach…</p>
      </div>
    )
  }

  // ── error ─────────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="card-surface p-4 rounded-xl space-y-3">
        <p className="text-[12px] text-red-400">{errorMsg || 'Something went wrong.'}</p>
        <button type="button" onClick={() => setState('picking')}
          className="text-[11px] text-accent hover:text-accent/80 transition-colors">
          Try again
        </button>
      </div>
    )
  }

  // ── results ───────────────────────────────────────────────────────────────
  if (state === 'results' && result) {
    const color = riskColor(result.riskScore)
    return (
      <div className="card-surface p-4 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold tracking-[0.12em] text-gray-500 uppercase">Clip Coach · {exercise}</p>
          <span
            className="text-[11px] font-black px-2.5 py-0.5 rounded-full"
            style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}
          >
            Risk {result.riskScore}
          </span>
        </div>

        {result.suggestions.length > 0 && (
          <ul className="space-y-2">
            {result.suggestions.slice(0, 3).map((s, i) => (
              <li key={i} className="flex gap-2 text-[12px] text-gray-300 leading-snug">
                <span className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }}>→</span>
                {s}
              </li>
            ))}
          </ul>
        )}

        {result.safetyConcerns.length > 0 && (
          <div className="rounded-lg p-2.5 space-y-1" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide">Safety</p>
            {result.safetyConcerns.map((c, i) => (
              <p key={i} className="text-[11px] text-red-300 leading-snug">{c}</p>
            ))}
          </div>
        )}

        {result.repCountEstimate > 0 && (
          <p className="text-[11px] text-gray-600">~{result.repCountEstimate} reps detected</p>
        )}

        <button type="button" onClick={reset}
          className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors">
          Try another clip
        </button>
      </div>
    )
  }

  return null
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ClipCoach.tsx
git commit -m "feat: add ClipCoach component with frame extraction and AI analysis"
```

---

## Task 4: Mount ClipCoach in HomePage

**Files:**
- Modify: `src/pages/HomePage.tsx`

- [ ] **Step 1: Add the import**

At the top of `src/pages/HomePage.tsx`, after the existing imports, add:

```ts
import { ClipCoach } from '../components/ClipCoach'
```

- [ ] **Step 2: Mount ClipCoach between quick-links and footer**

Find this block in `HomePage.tsx`:

```tsx
          {/* Footer links */}
          <div className="flex justify-center flex-wrap gap-x-4 gap-y-1.5 pt-2">
```

Immediately before that line, insert:

```tsx
          {/* Clip coach — video upload for post-workout AI analysis */}
          <ClipCoach />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Verify build succeeds**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✓ built in ...ms` with no errors (chunk size warnings are fine).

- [ ] **Step 5: Manual smoke test**

Start dev server:
```bash
npm run dev
```

1. Navigate to `/home`
2. Scroll down past the quick-links grid — confirm "📹 Analyze a clip" button is visible above the footer links
3. If no API key is set in Profile → confirm the "Add an OpenAI key in Profile →" fallback text appears instead
4. If API key is set: click the button → confirm the form expands with file input and exercise dropdown
5. Select a short video file and choose an exercise → click "Analyze →" → confirm the extracting and analyzing states appear → results card renders with risk score, suggestions, and "Try another clip" button

- [ ] **Step 6: Commit**

```bash
git add src/pages/HomePage.tsx
git commit -m "feat: mount ClipCoach on Today dashboard below quick-links"
```
