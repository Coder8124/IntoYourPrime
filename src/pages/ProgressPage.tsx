import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BottomNav } from '../components/BottomNav'
import { getUserSessions } from '../lib/firebaseHelpers'
import { getOrSignInUserId } from '../lib/firestoreUser'
import { getOrCreateLocalUserId } from '../lib/localUserId'
import { scoreGrade } from '../lib/workoutScore'
import type { Session } from '../types/index'

// ── Helpers ────────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function riskColor(score: number): string {
  if (score <= 30) return '#22c55e'
  if (score <= 60) return '#f59e0b'
  return '#ef4444'
}

const EXERCISE_LABELS: Record<string, string> = {
  squat: 'Squat', pushup: 'Push-Up', lunge: 'Lunge',
  deadlift: 'Deadlift', benchpress: 'Bench Press', mountainclimber: 'Mountain Climbers', shoulderpress: 'Shoulder Press',
  curlup: 'Curl-Up', situp: 'Sit-Up', bicepcurl: 'Bicep Curl',
  jumpingjack: 'Jumping Jack', highnees: 'High Knees',
  buttskick: 'Butt Kicks', calfraise: 'Calf Raises', armcircle: 'Arm Circles', scapulasqueeze: 'Scapula Squeeze',
  crossbodystretch: 'Cross-Body Shoulder Stretch', tricepstretch: 'Tricep Stretch',
  hipcircle: 'Hip Circles', chestpress: 'Chest Press',
  plank: 'Plank', wallsit: 'Wall Sit',
  sidelunge: 'Side Lunge', chestfly: 'Chest Fly',
  jumpsquat: 'Jump Squat', burpee: 'Burpee',
}

// ── Sparkline chart ────────────────────────────────────────────────────────

function Sparkline({ values, w = 240, h = 60 }: { values: number[]; w?: number; h?: number }) {
  if (values.length < 2) return (
    <div className="flex items-center justify-center h-[60px] text-[12px] text-gray-600">
      Need more sessions
    </div>
  )
  const pad = 8
  const mn = Math.min(...values)
  const mx = Math.max(...values)
  const range = mx - mn || 1
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2)
    // invert Y: lower risk = higher on chart (better)
    const y = pad + ((mx - v) / range) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = values[values.length - 1]
  const first = values[0]
  const improving = last < first
  const lineColor = improving ? '#22c55e' : '#ef4444'
  const [lx, ly] = pts[pts.length - 1].split(',').map(Number)

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {/* Fill area */}
      <polyline
        points={[...pts, `${(w - pad).toFixed(1)},${h}`, `${pad},${h}`].join(' ')}
        fill="url(#sparkGrad)"
        stroke="none"
      />
      {/* Line */}
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={lineColor}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Dots */}
      {pts.map((p, i) => {
        const [cx, cy] = p.split(',').map(Number)
        return <circle key={i} cx={cx} cy={cy} r={3} fill={lineColor} opacity={0.7} />
      })}
      {/* Last value label */}
      <text x={lx + 5} y={ly + 4} fill={lineColor} fontSize={10} fontWeight={700}>
        {Math.round(last)}
      </text>
    </svg>
  )
}

// ── Bar chart ──────────────────────────────────────────────────────────────

function HorizontalBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-[12px] text-gray-400 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-2 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="w-10 text-right text-[12px] font-mono font-bold text-gray-300">{value}</span>
    </div>
  )
}

// ── Session detail modal ───────────────────────────────────────────────────

function isBasketballSession(s: Session): boolean {
  return s.exercises.length === 1 && s.exercises[0] === 'basketball'
}

function SessionDetailModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const isBasketball = isBasketballSession(session)
  const shots = session.repCounts?.basketball ?? 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', maxHeight: '85vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="font-black text-white text-[15px]">
              {isBasketball ? '🏀 Basketball Session' : '💪 Workout Session'}
            </p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              {new Date(session.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-[20px] leading-none px-2">×</button>
        </div>

        <div className="px-5 py-4 space-y-5">

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-[20px] font-black text-white">{session.durationMinutes}m</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Duration</p>
            </div>
            {isBasketball ? (
              <div className="rounded-xl p-3 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-[20px] font-black text-amber-400">{shots}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Shots</p>
              </div>
            ) : (
              <div className="rounded-xl p-3 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-[20px] font-black" style={{ color: riskColor(session.avgRiskScore) }}>{Math.round(session.avgRiskScore)}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Form Risk</p>
              </div>
            )}
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-[20px] font-black text-blue-400">{Math.round(session.warmupScore)}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Warmup</p>
            </div>
          </div>

          {/* Exercise breakdown */}
          {!isBasketball && Object.keys(session.repCounts ?? {}).length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Exercises</p>
              <div className="space-y-2">
                {Object.entries(session.repCounts ?? {}).map(([ex, reps]) => {
                  const riskScore = session.exerciseRiskScores?.[ex]
                  return (
                    <div key={ex} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <span className="text-[13px] text-white capitalize">{EXERCISE_LABELS[ex] ?? ex}</span>
                      <div className="flex items-center gap-3">
                        {riskScore !== undefined && (
                          <span className="text-[11px] font-bold font-mono" style={{ color: riskColor(riskScore) }}>
                            risk {Math.round(riskScore)}
                          </span>
                        )}
                        <span className="text-[13px] font-bold text-gray-300">{reps} reps</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Basketball shot details */}
          {isBasketball && (
            <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-[13px] text-gray-400">
                <span className="text-amber-400 font-bold">{shots}</span> shots tracked during this basketball session.
              </p>
            </div>
          )}

          {/* Coach notes */}
          {session.formSuggestions?.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Coach Notes</p>
              <div className="space-y-1.5">
                {session.formSuggestions.map((note, i) => (
                  <div key={i} className="flex gap-2.5 px-3 py-2 rounded-xl"
                    style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                    <span className="text-amber-500 text-[12px] shrink-0 mt-0.5">⚡</span>
                    <p className="text-[12px] text-gray-300">{note}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cooldown status */}
          <div className="flex items-center gap-2">
            <span className={session.cooldownCompleted ? 'text-green-400' : 'text-gray-600'}>
              {session.cooldownCompleted ? '✓' : '○'}
            </span>
            <span className="text-[12px] text-gray-500">
              Cooldown {session.cooldownCompleted ? 'completed' : 'skipped'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export function ProgressPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<Session | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const localId = getOrCreateLocalUserId()
        const id = await Promise.race([
          getOrSignInUserId(),
          new Promise<string>(r => setTimeout(() => r(localId), 3000)),
        ])
        const s = await getUserSessions(id, 50)
        setSessions(s)
      } catch {
        /* show empty state */
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  // ── Derived stats ──────────────────────────────────────────────────────

  const totalReps = useMemo(() =>
    sessions.reduce((sum, s) => sum + Object.values(s.repCounts ?? {}).reduce((a, b) => a + b, 0), 0),
  [sessions])

  const avgScore = useMemo(() => {
    const scored = sessions.filter(s => s.workoutScore != null).map(s => s.workoutScore as number)
    return scored.length ? Math.round(avg(scored)) : null
  }, [sessions])

  const bestScore = useMemo(() => {
    const scored = sessions.filter(s => s.workoutScore != null).map(s => s.workoutScore as number)
    return scored.length ? Math.max(...scored) : null
  }, [sessions])

  // Last 10 sessions for trend chart (oldest first)
  const trendScores = useMemo(() =>
    [...sessions].reverse().slice(-10).map(s => s.avgRiskScore),
  [sessions])

  // Per-exercise total reps across all sessions
  const exerciseVolume = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of sessions) {
      for (const [ex, count] of Object.entries(s.repCounts ?? {})) {
        map[ex] = (map[ex] ?? 0) + count
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [sessions])

  // Per-exercise form risk trends (oldest → newest per exercise, across sessions)
  const exerciseFormTrends = useMemo(() => {
    const map: Record<string, number[]> = {}
    for (const s of [...sessions].reverse()) {
      if (!s.exerciseRiskScores) continue
      for (const [ex, score] of Object.entries(s.exerciseRiskScores)) {
        if (!map[ex]) map[ex] = []
        map[ex].push(score)
      }
    }
    return Object.entries(map)
      .filter(([, scores]) => scores.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
  }, [sessions])

  // Personal bests: max reps in a single session per exercise
  const personalBests = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of sessions) {
      for (const [ex, count] of Object.entries(s.repCounts ?? {})) {
        if (count > (map[ex] ?? 0)) map[ex] = count
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [sessions])

  const maxVolume = exerciseVolume[0]?.[1] ?? 1

  const improving = trendScores.length >= 2
    ? trendScores[trendScores.length - 1] < trendScores[0]
    : null

  return (
    <div className="min-h-screen bg-page pb-24 text-white">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-30 flex items-center justify-between px-5 py-4"
        style={{ background: 'rgba(var(--bg-rgb),0.9)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Link to="/home" className="flex items-center gap-2 text-[13px] font-semibold text-gray-400 hover:text-white transition-colors">
          ← Home
        </Link>
        <span className="text-[13px] font-black uppercase tracking-[0.18em] text-blue-400">Progress</span>
        <div className="w-12" />
      </nav>

      <div className="mx-auto max-w-lg px-5">

        {loading ? (
          <div className="mt-16 flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-blue-600/30 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-[13px] text-gray-500">Loading your progress…</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="text-5xl mb-4">📈</p>
            <p className="text-[16px] font-bold text-white mb-2">No sessions yet</p>
            <p className="text-[13px] text-gray-500 mb-8">Complete your first workout to start tracking progress.</p>
            <Link to="/workout"
              className="inline-block px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-white transition-colors">
              Start Workout →
            </Link>
          </div>
        ) : (
          <>
            {/* ── Hero stats ── */}
            <div className="mt-8 grid grid-cols-2 gap-3">
              {[
                { label: 'Sessions', value: sessions.length.toString() },
                { label: 'Total Reps', value: totalReps.toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-2xl p-4 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="text-[28px] font-black leading-none text-white">{value}</div>
                  <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</div>
                </div>
              ))}
            </div>
            {(avgScore !== null || bestScore !== null) && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {avgScore !== null && (() => {
                  const g = scoreGrade(avgScore)
                  return (
                    <div className="rounded-2xl p-4 text-center" style={{ background: `${g.color}10`, border: `1px solid ${g.color}30` }}>
                      <div className="text-[28px] font-black leading-none" style={{ color: g.color }}>{avgScore}</div>
                      <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-gray-500">Avg Score</div>
                    </div>
                  )
                })()}
                {bestScore !== null && (() => {
                  const g = scoreGrade(bestScore)
                  return (
                    <div className="rounded-2xl p-4 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-[28px] font-black leading-none" style={{ color: g.color }}>{bestScore}</span>
                        <span className="text-[11px] font-bold text-amber-500 mb-1">PB</span>
                      </div>
                      <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-gray-500">Best Score</div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ── Form score trend ── */}
            <section className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-500">Form Risk Trend</h2>
                {improving !== null && (
                  <span className="text-[11px] font-bold" style={{ color: improving ? '#22c55e' : '#ef4444' }}>
                    {improving ? '↓ Improving' : '↑ Worsening'}
                  </span>
                )}
              </div>
              <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-[11px] text-gray-600 mb-4">Lower score = better form. Last {trendScores.length} sessions.</p>
                <div className="w-full overflow-x-auto">
                  <Sparkline values={trendScores} w={380} h={72} />
                </div>
                {/* X-axis labels */}
                <div className="flex justify-between mt-1 px-2">
                  {[...sessions].reverse().slice(-10).map((s, i) => (
                    <span key={i} className="text-[9px] text-gray-700">{formatDate(s.date)}</span>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Exercise volume ── */}
            {exerciseVolume.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.18em] text-gray-500">Volume by Exercise</h2>
                <div className="rounded-2xl p-5 space-y-3.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {exerciseVolume.map(([ex, count]) => (
                    <HorizontalBar
                      key={ex}
                      label={EXERCISE_LABELS[ex] ?? ex}
                      value={count}
                      max={maxVolume}
                      color="#3b82f6"
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── Form trends by exercise ── */}
            {exerciseFormTrends.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.18em] text-gray-500">Form Risk by Exercise</h2>
                <p className="text-[11px] text-gray-600 mb-3">Avg risk score per exercise across sessions. Lower = better form.</p>
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {exerciseFormTrends.map(([ex, scores], i) => {
                    const latest = scores[scores.length - 1]
                    const first = scores[0]
                    const improving = latest < first
                    const trend = improving ? '↓' : latest > first ? '↑' : '→'
                    const trendColor = improving ? '#22c55e' : latest > first ? '#ef4444' : '#6b7280'
                    return (
                      <div key={ex}
                        className="flex items-center justify-between px-5 py-3.5"
                        style={{
                          background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                          borderBottom: i < exerciseFormTrends.length - 1 ? '1px solid var(--border)' : 'none',
                        }}>
                        <span className="text-[14px] text-gray-300">{EXERCISE_LABELS[ex] ?? ex}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-bold" style={{ color: trendColor }}>{trend}</span>
                          <span className="font-mono font-black text-[15px]" style={{ color: riskColor(latest) }}>{latest}</span>
                          <span className="text-[11px] text-gray-600">{scores.length}s</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* ── Personal bests ── */}
            {personalBests.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.18em] text-gray-500">Personal Bests</h2>
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {personalBests.map(([ex, best], i) => (
                    <div key={ex}
                      className="flex items-center justify-between px-5 py-3.5"
                      style={{
                        background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                        borderBottom: i < personalBests.length - 1 ? '1px solid var(--border)' : 'none',
                      }}>
                      <span className="text-[14px] text-gray-300">{EXERCISE_LABELS[ex] ?? ex}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-amber-500 font-semibold">PR</span>
                        <span className="font-mono font-black text-white text-[16px]">{best}</span>
                        <span className="text-[11px] text-gray-600">reps</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Session history ── */}
            <section className="mt-8">
              <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.18em] text-gray-500">
                Session History ({sessions.length})
              </h2>
              <ul className="space-y-2">
                {sessions.map((s) => {
                  const basketball = isBasketballSession(s)
                  const shots = s.repCounts?.basketball ?? 0
                  const reps = basketball ? 0 : Object.values(s.repCounts ?? {}).reduce((a, b) => a + b, 0)
                  const c = riskColor(s.avgRiskScore)
                  const g = s.workoutScore != null ? scoreGrade(s.workoutScore) : null
                  return (
                    <li key={s.id}
                      className="rounded-xl px-4 py-3.5 cursor-pointer hover:border-blue-500/40 transition-colors"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                      onClick={() => setSelected(s)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {basketball && <span className="text-[14px]">🏀</span>}
                          <span className="text-[15px] font-bold text-white">{formatDate(s.date)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {g && (
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] font-black px-1.5 py-0.5 rounded"
                                style={{ background: `${g.color}20`, color: g.color, border: `1px solid ${g.color}40` }}>
                                {g.grade}
                              </span>
                              <span className="font-mono font-bold text-[12px]" style={{ color: g.color }}>{s.workoutScore}</span>
                            </div>
                          )}
                          {basketball ? (
                            <span className="text-[12px] font-mono font-bold text-amber-400">{shots} shots</span>
                          ) : (
                            <span className="text-[12px] font-mono font-bold" style={{ color: c }}>
                              risk {Math.round(s.avgRiskScore)}
                            </span>
                          )}
                          {!basketball && <span className="text-[12px] text-gray-500 font-mono">{reps}r</span>}
                          <span className="text-[12px] text-gray-600">{s.durationMinutes}m</span>
                          <span className="text-[11px] text-gray-700">›</span>
                        </div>
                      </div>
                      {!basketball && s.exercises?.length > 0 && (
                        <p className="mt-1 text-[12px] capitalize text-gray-600">
                          {s.exercises.join(' · ')}
                        </p>
                      )}
                      {basketball && (
                        <p className="mt-1 text-[12px] text-gray-600">Basketball session</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          </>
        )}

        {/* ── Footer ── */}
        <div className="mt-10 text-center">
          <Link to="/home" className="text-[12px] text-gray-600 hover:text-gray-400 transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
      <BottomNav />
      {selected && <SessionDetailModal session={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
