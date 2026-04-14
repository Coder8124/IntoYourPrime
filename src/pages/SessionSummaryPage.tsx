import { useMemo, useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useWorkoutStore, type SuggestionEntry, type WorkoutPhase } from '../stores/workoutStore'
import { saveSession, updateStreak, postActivityItem } from '../lib/firebaseHelpers'
import { getOrSignInUserId } from '../lib/firestoreUser'
import { getOrCreateLocalUserId } from '../lib/localUserId'
import type { CooldownExercise } from '../types/index'

const LAST_SESSION_KEY = 'formAI_lastSession'
const LAST_SESSION_SAVED_KEY = 'formAI_lastSession_savedId'

interface SessionSnapshot {
  sessionStartTime: number
  sessionEndedAt: number
  phase: WorkoutPhase
  warmupScore: number | null
  warmupEndedAt: number | null
  repCounts: Record<string, number>
  riskScores: number[]
  suggestions: SuggestionEntry[]
  safetyConcerns: string[]
  lastExercise: string
  cooldownExercises: CooldownExercise[]
  cooldownCompleted: boolean
}

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function fmtClock(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function riskLabel(score: number): string {
  if (score <= 30) return 'Low'
  if (score <= 60) return 'Moderate'
  return 'Elevated'
}

function riskColor(score: number): string {
  if (score <= 30) return '#22c55e'
  if (score <= 60) return '#f59e0b'
  return '#ef4444'
}

function buildSnapshot(): SessionSnapshot | null {
  const s = useWorkoutStore.getState()
  if (s.sessionEndedAt == null || s.sessionStartTime == null) return null
  return {
    sessionStartTime: s.sessionStartTime,
    sessionEndedAt: s.sessionEndedAt,
    phase: s.phase,
    warmupScore: s.warmupScore,
    warmupEndedAt: s.warmupEndedAt ?? null,
    repCounts: { ...s.repCounts },
    riskScores: [...s.riskScores],
    suggestions: s.suggestions.map((e) => ({ ...e })),
    safetyConcerns: [...s.safetyConcerns],
    lastExercise: s.currentExercise,
    cooldownExercises: [...s.cooldownExercises],
    cooldownCompleted: s.cooldownCompleted,
  }
}

function loadStoredSnapshot(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as SessionSnapshot
    if (
      typeof p.sessionStartTime !== 'number' ||
      typeof p.sessionEndedAt !== 'number'
    ) {
      return null
    }
    // backfill optional fields for older snapshots
    if (!p.cooldownExercises) p.cooldownExercises = []
    if (p.cooldownCompleted === undefined) p.cooldownCompleted = false
    if (p.warmupEndedAt === undefined) p.warmupEndedAt = null
    return p
  } catch {
    return null
  }
}

function RiskSparkline({ scores }: { scores: number[] }) {
  if (scores.length === 0) {
    return <p className="text-[12px] text-gray-600">No risk samples captured this session.</p>
  }
  if (scores.length === 1) {
    const v = scores[0]
    return (
      <p className="text-[12px] text-gray-400">
        Single reading:{' '}
        <span className="font-mono font-bold" style={{ color: riskColor(v) }}>
          {Math.round(v)}
        </span>
        <span className="text-gray-600"> — keep training to see a trend line.</span>
      </p>
    )
  }
  const w = 280
  const h = 72
  const pad = 4
  const max = 100
  const step = (w - pad * 2) / Math.max(1, scores.length - 1)
  const pts = scores.map((v, i) => {
    const x = pad + i * step
    const y = pad + (1 - Math.min(100, Math.max(0, v)) / max) * (h - pad * 2)
    return `${x},${y}`
  })
  const d = `M ${pts.join(' L ')}`

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      className="max-h-[88px]"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="riskLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={w} height={h} fill="rgba(15,15,26,0.6)" rx={8} />
      <path
        d={d}
        fill="none"
        stroke="url(#riskLine)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SessionSummaryPage() {
  const [snapshot] = useState<SessionSnapshot | null>(() => {
    const live = buildSnapshot()
    if (live) {
      try {
        localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(live))
      } catch {
        /* quota / private mode */
      }
      return live
    }
    return loadStoredSnapshot()
  })

  const stats = useMemo(() => {
    if (!snapshot) return null
    const durationSec = Math.max(
      0,
      Math.floor((snapshot.sessionEndedAt - snapshot.sessionStartTime) / 1000),
    )
    const totalReps = Object.values(snapshot.repCounts).reduce((a, b) => a + b, 0)
    const rs = snapshot.riskScores
    const avgRisk = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0
    const peakRisk = rs.length ? Math.max(...rs) : 0
    const minRisk = rs.length ? Math.min(...rs) : 0
    const highRiskEvents = rs.filter((x) => x > 60).length
    const exercisesWithReps = Object.entries(snapshot.repCounts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
    return {
      durationSec,
      totalReps,
      avgRisk,
      peakRisk,
      minRisk,
      highRiskEvents,
      analysisSamples: rs.length,
      exercisesWithReps,
    }
  }, [snapshot])

  // ── Auto-save session to Firestore ─────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<'pending' | 'saving' | 'saved' | 'error'>('pending')
  const saveAttempted = useRef(false)

  useEffect(() => {
    if (!snapshot || !stats || saveAttempted.current) return
    saveAttempted.current = true

    // Skip if this exact session was already saved (e.g. page refresh)
    const storedSavedKey = `${LAST_SESSION_SAVED_KEY}_${snapshot.sessionStartTime}`
    if (localStorage.getItem(storedSavedKey)) {
      setSaveStatus('saved')
      return
    }

    setSaveStatus('saving')

    const durationMinutes = stats.durationSec / 60
    const warmupDurationMinutes = snapshot.warmupEndedAt
      ? (snapshot.warmupEndedAt - snapshot.sessionStartTime) / 60000
      : 0
    const exercises = [
      ...new Set([...Object.keys(snapshot.repCounts), snapshot.lastExercise].filter(Boolean)),
    ]

    ;(async () => {
      try {
        const localId = getOrCreateLocalUserId()
        const userId = await Promise.race([
          getOrSignInUserId(),
          new Promise<string>(resolve => setTimeout(() => resolve(localId), 3000)),
        ])
        const today = new Date().toISOString().slice(0, 10)

        const sessionId = await saveSession({
          userId,
          date: today,
          exercises,
          durationMinutes,
          warmupScore: snapshot.warmupScore ?? 0,
          warmupDurationMinutes,
          avgRiskScore: Math.round(stats.avgRisk),
          peakRiskScore: Math.round(stats.peakRisk),
          repCounts: snapshot.repCounts,
          formSuggestions: snapshot.suggestions.map((s) => s.text).slice(0, 20),
          cooldownCompleted: snapshot.cooldownCompleted,
          cooldownExercises: snapshot.cooldownExercises,
          feelRating: null,
          totalRiskEvents: stats.highRiskEvents,
        })

        // Cache streak locally so FriendsPage can read it without Firebase
        updateStreak(userId).then(() => {
          import('../lib/firebaseHelpers').then(({ getUserProfile }) =>
            getUserProfile(userId).then(p => {
              if (p?.streakCount != null) localStorage.setItem('formAI_streak', String(p.streakCount))
            }).catch(() => {})
          )
        }).catch(() => {})

        await Promise.allSettled([
          updateStreak(userId),
          postActivityItem({
            userId,
            displayName: (() => {
              try {
                const p = localStorage.getItem('formAI_profile')
                return p ? (JSON.parse(p) as Record<string, unknown>).name as string ?? 'Athlete' : 'Athlete'
              } catch { return 'Athlete' }
            })(),
            type: 'workout_completed',
            sessionId,
            warmupScore: snapshot.warmupScore ?? 0,
            avgRiskScore: Math.round(stats.avgRisk),
            timestamp: new Date(),
          }),
        ])

        localStorage.setItem(storedSavedKey, sessionId)
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    })()
  }, [snapshot, stats])

  if (!snapshot || !stats) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] px-6 py-12 text-white">
        <div className="mx-auto max-w-lg">
          <Link to="/home" className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400 hover:text-blue-300 cursor-pointer">IntoYourPrime</Link>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Session summary</h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            No finished session yet. Complete a live workout and tap{' '}
            <span className="text-gray-300">End Workout</span> to see duration, reps, risk trend, and
            coach feedback here. Summaries are saved on this device so you can refresh this page.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Link
              to="/workout"
              className="card-surface px-5 py-4 text-center font-bold text-blue-400 transition hover:border-blue-500/40"
            >
              Start live workout →
            </Link>
            <Link
              to="/home"
              className="rounded-xl border border-dashed border-gray-700 px-5 py-3 text-center text-sm font-semibold text-gray-500 hover:text-gray-300"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const { durationSec, totalReps, avgRisk, peakRisk, minRisk, highRiskEvents, analysisSamples, exercisesWithReps } =
    stats

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="border-b border-[#1e1e2e] bg-[#0d0d18] px-6 py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400">Session complete</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Workout summary</h1>
            <p className="mt-1 text-[13px] text-gray-500">{fmtClock(snapshot.sessionEndedAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {saveStatus === 'saving' && (
              <span className="text-[11px] text-gray-500 flex items-center gap-1.5">
                <span className="w-3 h-3 border border-gray-600 border-t-gray-400 rounded-full animate-spin inline-block" />
                Saving…
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-[11px] text-green-500">✓ Saved</span>
            )}
            {saveStatus === 'error' && (
              <span className="text-[11px] text-red-400">Could not save</span>
            )}
            <Link
              to="/workout"
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-blue-500 btn-glow-blue"
            >
              New session
            </Link>
            <Link
              to="/home"
              className="rounded-xl border border-[#2e2e3e] px-4 py-2.5 text-[13px] font-semibold text-gray-400 transition hover:border-gray-500 hover:text-gray-200"
            >
              Home
            </Link>
            <Link
              to={`/recovery-log?returnTo=${encodeURIComponent('/session-summary')}`}
              className="rounded-xl border border-[#2e2e3e] px-4 py-2.5 text-[13px] font-semibold text-gray-400 transition hover:border-gray-500 hover:text-gray-200"
            >
              Recovery log
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-6 py-8">
        {/* Hero metrics */}
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="card-surface p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">Duration</p>
            <p className="mt-2 font-mono text-3xl font-black text-glow-blue">{fmtDuration(durationSec)}</p>
            <p className="mt-1 text-[11px] text-gray-600">
              Started {fmtClock(snapshot.sessionStartTime)}
            </p>
          </div>
          <div className="card-surface p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">Total reps</p>
            <p className="mt-2 text-3xl font-black text-white">{totalReps}</p>
            <p className="mt-1 text-[11px] capitalize text-gray-600">
              Last exercise: {snapshot.lastExercise}
            </p>
          </div>
          <div className="card-surface p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">Warmup score</p>
            <p className="mt-2 text-3xl font-black text-white">
              {snapshot.warmupScore != null ? snapshot.warmupScore : '—'}
            </p>
            <p className="mt-1 text-[11px] text-gray-600">
              From warmup risk average (higher = better readiness)
            </p>
          </div>
        </section>

        {/* Phase & analysis depth */}
        <section className="card-surface flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">Ended in</span>
            <span
              className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider"
              style={{
                background: 'rgba(59,130,246,0.12)',
                color: '#60a5fa',
                border: '1px solid rgba(59,130,246,0.25)',
              }}
            >
              {snapshot.phase === 'warmup' ? 'Warmup' : 'Main workout'}
            </span>
          </div>
          <p className="text-[12px] text-gray-500">
            <span className="font-semibold text-gray-400">{analysisSamples}</span> vision analysis samples
            (~2.5s interval)
          </p>
        </section>

        {/* Risk detail */}
        <section className="card-surface p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">Injury risk</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[12px] text-gray-500">Average</span>
                <span className="font-mono text-xl font-black" style={{ color: riskColor(avgRisk) }}>
                  {analysisSamples ? Math.round(avgRisk) : '—'}
                  <span className="ml-2 text-[11px] font-semibold text-gray-500">
                    {analysisSamples ? riskLabel(avgRisk) : ''}
                  </span>
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[12px] text-gray-500">Peak</span>
                <span className="font-mono text-xl font-black" style={{ color: riskColor(peakRisk) }}>
                  {analysisSamples ? Math.round(peakRisk) : '—'}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[12px] text-gray-500">Lowest</span>
                <span className="font-mono text-xl font-black" style={{ color: riskColor(minRisk) }}>
                  {analysisSamples ? Math.round(minRisk) : '—'}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t border-[#1e1e2e] pt-3">
                <span className="text-[12px] text-gray-500">Samples over 60 (elevated)</span>
                <span className="font-mono text-lg font-black text-amber-400">{highRiskEvents}</span>
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold text-gray-500">Risk over time</p>
              <RiskSparkline scores={snapshot.riskScores} />
            </div>
          </div>
        </section>

        {/* Reps by exercise */}
        <section className="card-surface p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">Reps by exercise</h2>
          {exercisesWithReps.length === 0 ? (
            <p className="mt-4 text-[13px] text-gray-600">No counted reps this session.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {exercisesWithReps.map(([name, count]) => (
                <li
                  key={name}
                  className="flex items-center justify-between rounded-lg border border-[#1e1e2e] bg-[#0f0f1a] px-3 py-2.5"
                >
                  <span className="text-[13px] font-semibold capitalize text-white">{name}</span>
                  <span className="font-mono text-lg font-black text-blue-400">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Progressive overload recommendations */}
        {exercisesWithReps.length > 0 && (
          <section
            className="rounded-2xl p-5"
            style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)' }}
          >
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-400 mb-4">
              Next Session Targets
            </h2>
            <ul className="space-y-3">
              {exercisesWithReps.map(([exName, count]) => {
                const risk = Math.round(avgRisk)
                let target: number
                let message: string
                let color: string
                let arrow: string
                if (risk < 45) {
                  target = count + 2
                  message = `Form was clean — push to ${target} reps`
                  color = '#22c55e'
                  arrow = '↑'
                } else if (risk < 65) {
                  target = count
                  message = `Solid — maintain ${target} reps, tighten your form`
                  color = '#f59e0b'
                  arrow = '→'
                } else {
                  target = Math.max(1, count - 2)
                  message = `Drop to ${target} reps and lock in technique first`
                  color = '#ef4444'
                  arrow = '↓'
                }
                return (
                  <li key={exName} className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-white capitalize">{exName}</p>
                      <p className="text-[12px] text-gray-500 mt-0.5">{message}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className="text-[11px] font-bold" style={{ color }}>{arrow}</span>
                      <span className="font-mono font-black text-[20px]" style={{ color }}>{target}</span>
                      <span className="text-[11px] text-gray-600">reps</span>
                    </div>
                  </li>
                )
              })}
            </ul>
            <p className="mt-4 text-[11px] text-gray-600 border-t border-[#1e1e2e] pt-3">
              Based on your avg form risk score of {Math.round(avgRisk)} this session.
            </p>
          </section>
        )}

        {/* Safety */}
        {snapshot.safetyConcerns.length > 0 && (
          <section
            className="rounded-xl p-5"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)' }}
          >
            <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-red-400">Latest safety flags</h2>
            <p className="mt-1 text-[11px] text-red-300/80">
              From the most recent analysis call (not a full history).
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-4 text-[13px] text-red-200">
              {snapshot.safetyConcerns.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Coach feedback timeline */}
        <section className="card-surface p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">Coach feedback</h2>
          <p className="mt-1 text-[12px] text-gray-600">
            Newest first — up to 40 cues stored for the session.
          </p>
          {snapshot.suggestions.length === 0 ? (
            <p className="mt-4 text-[13px] text-gray-600">No suggestions recorded this session.</p>
          ) : (
            <ul className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {snapshot.suggestions.map((entry, i) => (
                <li
                  key={`${entry.timestamp}-${i}`}
                  className="rounded-lg border border-[#1e1e2e] bg-[#0f0f1a] px-3 py-2.5"
                >
                  <p className="font-mono text-[10px] text-gray-600">
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-gray-300">{entry.text}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* How are you feeling? */}
        <section className="card-surface p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
            How are you feeling?
          </h2>
          <p className="mt-1 text-[13px] text-gray-500">Log sleep, energy &amp; soreness post-workout.</p>
          <Link
            to={`/recovery-log?returnTo=${encodeURIComponent('/session-summary')}`}
            className="mt-4 inline-block rounded-xl bg-blue-600/20 border border-blue-500/30 px-5 py-3 text-[14px] font-bold text-blue-300 transition hover:bg-blue-600/30 hover:text-blue-200"
          >
            Log how you&apos;re feeling →
          </Link>
        </section>

        {/* Raw samples (power users) */}
        {snapshot.riskScores.length > 0 && (
          <section className="card-surface p-5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
              Risk samples (chronological)
            </h2>
            <p className="mt-1 text-[12px] text-gray-600">
              Index matches analysis order during the session.
            </p>
            <ol className="mt-3 columns-2 gap-x-6 text-[12px] text-gray-400 sm:columns-3">
              {snapshot.riskScores.map((score, idx) => (
                <li key={idx} className="mb-1 break-inside-avoid">
                  <span className="text-gray-600">#{idx + 1}</span>{' '}
                  <span className="font-mono font-semibold" style={{ color: riskColor(score) }}>
                    {Math.round(score)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
    </div>
  )
}
