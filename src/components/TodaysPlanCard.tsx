/**
 * TodaysPlanCard — adaptive "what should I train today" card for the home page.
 *
 * Rules gate (computeReadiness) runs locally and always renders. The LLM
 * session builder (generateAdaptivePlan) runs on demand within those guardrails.
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRecoveryContext } from '../lib/firebaseHelpers'
import { getOrSignInUserId } from '../lib/firestoreUser'
import { getOrCreateLocalUserId } from '../lib/localUserId'
import { computeReadiness, type Readiness } from '../lib/readiness'
import { generateAdaptivePlan } from '../lib/formAnalysis'
import { EXERCISE_INFO, setActiveProgram, type WorkoutProgram } from '../lib/programs'
import type { Session } from '../types'

const LABEL: Record<string, string> = Object.fromEntries(EXERCISE_INFO.map(e => [e.id, e.name]))

const BAND_COLOR: Record<Readiness['band'], string> = {
  push:     '#22c55e',
  moderate: '#3b82f6',
  deload:   '#f59e0b',
}

function readProfile(): { age: number; weight: number; fitnessLevel: string } {
  try {
    const p = JSON.parse(localStorage.getItem('formAI_profile') ?? '{}') as Record<string, unknown>
    const age = Number(p.age), weight = Number(p.weight)
    return {
      age:    Number.isFinite(age) && age > 0 ? age : 25,
      weight: Number.isFinite(weight) && weight > 0 ? weight : 70,
      fitnessLevel: typeof p.fitnessLevel === 'string' ? p.fitnessLevel : 'intermediate',
    }
  } catch {
    return { age: 25, weight: 70, fitnessLevel: 'intermediate' }
  }
}

function historyString(sessions: Session[]): string {
  return sessions.slice(0, 7)
    .map(s => `${s.date.slice(0, 10)}: ${s.exercises.slice(0, 5).join(', ')} · risk ${s.avgRiskScore.toFixed(0)}`)
    .join('\n')
}

export function TodaysPlanCard() {
  const navigate = useNavigate()
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [history,   setHistory]   = useState('')
  const [plan,      setPlan]      = useState<WorkoutProgram | null>(null)
  const [building,  setBuilding]  = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const localId = getOrCreateLocalUserId()
        const uid = await Promise.race([
          getOrSignInUserId(),
          new Promise<string>(r => setTimeout(() => r(localId), 3000)),
        ])
        const { sessions, logs } = await getRecoveryContext(uid)
        if (!alive) return
        setReadiness(computeReadiness(logs, sessions))
        setHistory(historyString(sessions))
      } catch {
        if (alive) setReadiness(computeReadiness([], []))
      }
    })()
    return () => { alive = false }
  }, [])

  const build = useCallback(async () => {
    if (!readiness || building) return
    setBuilding(true)
    setError(null)
    try {
      const result = await generateAdaptivePlan({ readiness, history, userProfile: readProfile() })
      if (result) setPlan(result)
      else setError('Add an OpenAI key in Profile or go Pro to generate a session.')
    } finally {
      setBuilding(false)
    }
  }, [readiness, history, building])

  const start = useCallback(() => {
    if (!plan) return
    setActiveProgram(plan)
    localStorage.setItem('formAI_launchProgram', '1')
    navigate('/workout')
  }, [plan, navigate])

  if (!readiness) {
    return (
      <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="h-5 w-40 rounded animate-pulse mb-3" style={{ background: 'var(--border-2)' }} />
        <div className="h-10 w-full rounded animate-pulse" style={{ background: 'var(--border)' }} />
      </div>
    )
  }

  const color = BAND_COLOR[readiness.band]

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-subtle">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color }}>Today's Plan</span>
        </div>
        <span className="text-[11px] font-bold" style={{ color: 'var(--text-3)' }}>Readiness</span>
      </div>

      <div className="px-5 py-4">
        {/* Readiness gauge */}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0 w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: `conic-gradient(${color} ${readiness.score * 3.6}deg, var(--border-2) 0deg)` }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--surface)' }}>
              <span className="text-[18px] font-black text-white">{readiness.score}</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-white">{readiness.headline}</p>
            <p className="text-[12px] leading-snug" style={{ color: 'var(--text-3)' }}>
              {readiness.factors.join(' · ') || 'Log recovery for a sharper read'}
            </p>
          </div>
        </div>

        {/* Guardrail chips */}
        {(readiness.riskyExercises.length > 0 || readiness.soreMuscles.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {readiness.soreMuscles.slice(0, 4).map(m => (
              <span key={m} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>sore: {m}</span>
            ))}
            {readiness.riskyExercises.slice(0, 3).map(ex => (
              <span key={ex} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>watch: {LABEL[ex] ?? ex}</span>
            ))}
          </div>
        )}

        {/* Generated session or build button */}
        {plan ? (
          <div className="mt-4 rounded-xl p-3" style={{ background: 'var(--bg-2, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[15px]">{plan.emoji}</span>
              <p className="text-[13px] font-bold text-white">{plan.name}</p>
            </div>
            <p className="text-[12px] mb-2" style={{ color: 'var(--text-3)' }}>{plan.description}</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {plan.exercises.map((ex, i) => (
                <span key={`${ex}-${i}`} className="text-[11px] px-2 py-1 rounded-lg text-gray-200"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>{LABEL[ex] ?? ex}</span>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={start}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-black text-white transition-all hover:scale-[1.01]"
                style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>▶ Start session</button>
              <button onClick={build} disabled={building}
                className="px-4 py-2.5 rounded-xl text-[13px] font-bold transition-colors disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'rgba(255,255,255,0.7)' }}>↻</button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <button onClick={build} disabled={building}
              className="w-full py-2.5 rounded-xl text-[13px] font-black text-white transition-all hover:scale-[1.01] disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
              {building ? 'Building your session…' : '✨ Build today’s session'}
            </button>
            {error && <p className="text-[11px] mt-2 text-center" style={{ color: 'var(--text-3)' }}>{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
