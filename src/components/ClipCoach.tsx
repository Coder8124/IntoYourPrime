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

async function extractFrames(file: File, signal?: AbortSignal): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }

    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    const url = URL.createObjectURL(file)
    video.src = url

    const cleanup = () => {
      URL.revokeObjectURL(url)
      video.src = ''
    }

    signal?.addEventListener('abort', () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })

    video.addEventListener('loadedmetadata', () => {
      if (signal?.aborted) { cleanup(); reject(new DOMException('Aborted', 'AbortError')); return }

      const duration = video.duration
      if (!duration || !isFinite(duration)) {
        cleanup()
        reject(new Error('Could not read video duration'))
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width  = 256
      canvas.height = 256
      const ctx = canvas.getContext('2d')! // always non-null for createElement canvas
      const frames: string[] = []
      let i = 0

      const onSeeked = () => {
        if (signal?.aborted) {
          video.removeEventListener('seeked', onSeeked)
          cleanup()
          reject(new DOMException('Aborted', 'AbortError'))
          return
        }
        ctx.drawImage(video, 0, 0, 256, 256)
        frames.push(canvas.toDataURL('image/jpeg', 0.7))
        i++
        if (i >= SEEK_RATIOS.length) {
          video.removeEventListener('seeked', onSeeked)
          cleanup()
          resolve(frames)
        } else {
          video.currentTime = SEEK_RATIOS[i] * duration
        }
      }

      video.addEventListener('seeked', onSeeked)
      video.currentTime = SEEK_RATIOS[0] * duration
    }, { once: true })

    video.addEventListener('error', () => {
      cleanup()
      reject(new Error('Failed to load video file'))
    }, { once: true })
  })
}

function riskColor(score: number): string {
  if (score < 30) return '#22c55e'
  if (score < 60) return '#f59e0b'
  return '#ef4444'
}

export function ClipCoach() {
  const fileRef  = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
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
    abortRef.current?.abort()
    abortRef.current = null
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
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      setState('extracting')
      const frames = await extractFrames(file, ctrl.signal)
      if (ctrl.signal.aborted) return

      setState('analyzing')
      const profile = loadProfile()
      const res = await analyzeClip({ frames, exercise, userProfile: profile })
      if (ctrl.signal.aborted) return

      setResult(res)
      setState('results')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
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
