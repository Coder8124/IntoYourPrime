import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { analyzeForm } from '../lib/formAnalysis'
import type { FormAnalysisResult } from '../types'

const EXERCISES = ['squat', 'pushup', 'lunge', 'deadlift', 'shoulderpress'] as const

function readLocalProfile() {
  try {
    const raw = localStorage.getItem('formAI_profile')
    const p = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    const ageN = Number(p.age)
    const weightN = Number(p.weight)
    return {
      age: Number.isFinite(ageN) && ageN > 0 ? ageN : 25,
      weight: Number.isFinite(weightN) && weightN > 0 ? weightN : 70,
      fitnessLevel:
        typeof p.fitnessLevel === 'string' ? p.fitnessLevel : 'intermediate',
    }
  } catch {
    return { age: 25, weight: 70, fitnessLevel: 'intermediate' }
  }
}

export function PipelineTestPage() {
  const userProfile = useMemo(() => readLocalProfile(), [])
  const [exercise, setExercise] = useState<string>('squat')
  const [phase, setPhase] = useState<'warmup' | 'main'>('main')
  const [frames, setFrames] = useState<string[]>([])
  const [result, setResult] = useState<FormAnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const next: string[] = []
    let pending = files.length
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      if (!f.type.startsWith('image/')) {
        pending--
        continue
      }
      const r = new FileReader()
      r.onload = () => {
        if (typeof r.result === 'string') next.push(r.result)
        pending--
        if (pending === 0) setFrames(next.slice(0, 5))
      }
      r.onerror = () => {
        pending--
        if (pending === 0) setFrames(next.slice(0, 5))
      }
      r.readAsDataURL(f)
    }
  }, [])

  const run = async () => {
    if (frames.length === 0) {
      setError('Choose one or more images (max 5).')
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await analyzeForm({
        frames,
        exercise,
        repCount: 0,
        userProfile,
        phase,
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] px-4 py-8 text-white">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link
            to="/home"
            className="text-sm font-semibold text-blue-400 hover:text-blue-300"
          >
            ← Home
          </Link>
        </div>

        <h1 className="mb-2 text-2xl font-black tracking-tight">
          Image pipeline test
        </h1>
        <p className="mb-6 text-sm text-gray-400">
          Sends still frames to <code className="text-gray-300">/api/analyze</code>{' '}
          (run <code className="text-gray-300">vercel dev</code> in another terminal,
          or deploy). Uses the same payload shape as the live workout loop.
        </p>

        <div className="card-surface space-y-4 p-6">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Images (1–5)
          </label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={onFiles}
            className="w-full text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">
                Exercise
              </span>
              <select
                value={exercise}
                onChange={(e) => setExercise(e.target.value)}
                className="input-dark"
              >
                {EXERCISES.map((ex) => (
                  <option key={ex} value={ex}>
                    {ex}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">
                Phase
              </span>
              <select
                value={phase}
                onChange={(e) =>
                  setPhase(e.target.value as 'warmup' | 'main')
                }
                className="input-dark"
              >
                <option value="main">main</option>
                <option value="warmup">warmup</option>
              </select>
            </label>
          </div>

          <p className="text-xs text-gray-500">
            Profile from onboarding (local): age {userProfile.age}, weight{' '}
            {userProfile.weight}, {userProfile.fitnessLevel}
          </p>

          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? 'Calling API…' : 'Run analyze'}
          </button>

          {error && (
            <p className="rounded-lg bg-red-950/50 p-3 text-sm text-red-300">
              {error}
            </p>
          )}

          {result && (
            <pre className="max-h-[420px] overflow-auto rounded-lg bg-black/40 p-4 text-xs text-gray-300">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
