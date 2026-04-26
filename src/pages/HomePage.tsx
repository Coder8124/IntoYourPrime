import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Flame } from 'lucide-react'
import { hasApiKey, generateRecoveryInsight } from '../lib/formAnalysis'
import {
  getActivityFeed,
  getRecentLogs,
  getUserProfile,
  getUserSessions,
} from '../lib/firebaseHelpers'
import { getOrSignInUserId } from '../lib/firestoreUser'
import { getOrCreateLocalUserId } from '../lib/localUserId'
import { getActiveProgram, EXERCISE_INFO, type ActiveProgram } from '../lib/programs'
import type { ActivityFeedItem, DailyLog, Session } from '../types'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { ClipCoach } from '../components/ClipCoach'

// ── Helpers ────────────────────────────────────────────────────────────────

function displayNameFromLocal(): string {
  try {
    const raw = localStorage.getItem('formAI_profile')
    if (!raw) return 'Athlete'
    const p = JSON.parse(raw) as { name?: string }
    const n = typeof p.name === 'string' ? p.name.trim() : ''
    return n || 'Athlete'
  } catch { return 'Athlete' }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function timeGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}

function fmtExercise(key: string): string {
  const info = EXERCISE_INFO.find(e => e.id === key)
  return info?.name ?? key.replace(/([A-Z])/g, ' $1').trim()
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MiniSparkline({
  values,
  color = '#3b82f6',
  invert = false,
}: {
  values: number[]
  color?: string
  invert?: boolean
}) {
  if (values.length < 2) return <div className="h-10" />
  const w = 160, h = 40, pad = 3
  const mn = Math.min(...values)
  const mx = Math.max(...values)
  const range = mx - mn || 1
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2)
    const norm = invert ? (v - mn) / range : (mx - v) / range
    const y = pad + norm * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-10">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.75}
      />
    </svg>
  )
}

function CircularGauge({ score }: { score: number }) {
  const r = 48, cx = 65, cy = 65
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'
  const zoneLabel = score >= 75 ? 'Peak Zone' : score >= 50 ? 'Good' : 'Rest Up'
  const toRad = (d: number) => (d * Math.PI) / 180
  const startDeg = 135, sweep = 270
  const endDeg = startDeg + sweep * (score / 100)
  const p = (deg: number) => ({
    x: cx + r * Math.cos(toRad(deg)),
    y: cy + r * Math.sin(toRad(deg)),
  })
  const s = p(startDeg), e = p(startDeg + sweep), f = p(endDeg)
  const trackD = `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 1 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
  const fillD  = `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${(sweep * score / 100) > 180 ? 1 : 0} 1 ${f.x.toFixed(2)} ${f.y.toFixed(2)}`
  return (
    <svg width={130} height={130} viewBox="0 0 130 130">
      <path d={trackD} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={9} strokeLinecap="round" />
      {score > 0 && <path d={fillD} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" />}
      <text x={cx} y={cy + 2} textAnchor="middle" fill="white" fontSize={26} fontWeight={900}>{score}</text>
      <text x={cx} y={cy + 18} textAnchor="middle" fill={color} fontSize={9.5} fontWeight={700} letterSpacing={1}>{zoneLabel.toUpperCase()}</text>
    </svg>
  )
}

function StreakBars({ sessions }: { sessions: Session[]; streak: number }) {
  const days = Array.from({ length: 8 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (7 - i))
    const key = d.toISOString().slice(0, 10)
    const worked = sessions.some(s => s.date.slice(0, 10) === key)
    return { key, worked, isToday: i === 7 }
  })
  const maxH = 28
  return (
    <div className="flex items-end gap-1.5">
      {days.map((d) => (
        <div key={d.key} className="flex flex-col items-center gap-1">
          <div
            className="w-5 rounded-sm transition-all"
            style={{
              height: d.worked ? maxH : d.isToday ? 6 : 4,
              background: d.worked
                ? 'linear-gradient(to top, #f59e0b, #fbbf24)'
                : 'rgba(255,255,255,0.08)',
            }}
          />
          <span className="text-[8px] text-gray-700 font-mono">
            {new Date(d.key + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'narrow' })}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export function HomePage() {
  const navigate = useNavigate()
  const welcomeName = useMemo(() => displayNameFromLocal(), [])

  const [loading, setLoading]           = useState(true)
  const [sessions, setSessions]         = useState<Session[]>([])
  const [allSessions, setAllSessions]   = useState<Session[]>([])
  const [streak, setStreak]             = useState(0)
  const [feed, setFeed]                 = useState<ActivityFeedItem[]>([])
  const [lastLog, setLastLog]           = useState<DailyLog | null>(null)
  const [activeProgram, setActiveProgramState] = useState<ActiveProgram | null>(null)
  const [apiKeyInput, setApiKeyInput]   = useState('')
  const [apiKeySet, setApiKeySet]       = useState(hasApiKey)
  const [showApiInput, setShowApiInput] = useState(false)
  const [insight, setInsight]           = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const localId = getOrCreateLocalUserId()
      const id = await Promise.race([
        getOrSignInUserId(),
        new Promise<string>(r => setTimeout(() => r(localId), 3000)),
      ])

      const [sessAll, profile, activity, logsAll] = await Promise.allSettled([
        getUserSessions(id, 50),
        getUserProfile(id),
        getActivityFeed(id),
        getRecentLogs(id, 7),
      ])

      const allSess = sessAll.status === 'fulfilled' ? sessAll.value : []
      const prof    = profile.status === 'fulfilled'  ? profile.value  : null
      const acts    = activity.status === 'fulfilled' ? activity.value : []
      const logs    = logsAll.status === 'fulfilled'  ? logsAll.value  : []

      setAllSessions(allSess)
      setSessions(allSess.slice(0, 10))
      setStreak(prof?.streakCount ?? 0)
      setFeed(acts.filter(a => a.userId !== id).slice(0, 10))
      setLastLog(logs[0] ?? null)

      if (allSess.length >= 5) {
        try {
          const text = await generateRecoveryInsight({ sessions: allSess, logs })
          setInsight(text.trim() || null)
        } catch { setInsight(null) }
      }
    } catch { /* show empty state */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { setActiveProgramState(getActiveProgram()) }, [])

  const handleSaveApiKey = useCallback(() => {
    const t = apiKeyInput.trim()
    if (!t) return
    localStorage.setItem('formAI_openai_key', t)
    setApiKeySet(true)
    setApiKeyInput('')
    setShowApiInput(false)
  }, [apiKeyInput])

  // ── Computed stats ─────────────────────────────────────────────────────

  const weekCutoff = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10)
  }, [])

  const weeklyReps = useMemo(() => {
    return allSessions
      .filter(s => s.date.slice(0, 10) >= weekCutoff)
      .reduce((sum, s) => sum + Object.values(s.repCounts ?? {}).reduce((a, b) => a + b, 0), 0)
  }, [allSessions, weekCutoff])

  const prevWeeklyReps = useMemo(() => {
    const prev = new Date(); prev.setDate(prev.getDate() - 14)
    const prevKey = prev.toISOString().slice(0, 10)
    return allSessions
      .filter(s => s.date.slice(0, 10) >= prevKey && s.date.slice(0, 10) < weekCutoff)
      .reduce((sum, s) => sum + Object.values(s.repCounts ?? {}).reduce((a, b) => a + b, 0), 0)
  }, [allSessions, weekCutoff])

  const formScore = useMemo(() => {
    const r = sessions.slice(0, 3)
    if (!r.length) return null
    return Math.round(100 - r.reduce((s, x) => s + x.avgRiskScore, 0) / r.length)
  }, [sessions])

  const prevFormScore = useMemo(() => {
    const r = sessions.slice(3, 6)
    if (!r.length) return null
    return Math.round(100 - r.reduce((s, x) => s + x.avgRiskScore, 0) / r.length)
  }, [sessions])

  const injuryRisk = useMemo(() =>
    sessions[0] ? Math.round(sessions[0].avgRiskScore) : null,
  [sessions])

  const prevInjuryRisk = useMemo(() =>
    sessions[1] ? Math.round(sessions[1].avgRiskScore) : null,
  [sessions])

  const readiness = useMemo(() => {
    if (!lastLog) return null
    const sleep   = Math.min(1, lastLog.sleepHours / 8) * 100 * 0.4
    const energy  = ((lastLog.energyLevel - 1) / 4) * 100 * 0.4
    const fresh   = ((5 - lastLog.overallSoreness) / 4) * 100 * 0.2
    return Math.round(sleep + energy + fresh)
  }, [lastLog])

  const formSpark  = useMemo(() =>
    [...sessions].reverse().map(s => 100 - s.avgRiskScore), [sessions])
  const repsSpark  = useMemo(() =>
    [...sessions].reverse().map(s => Object.values(s.repCounts ?? {}).reduce((a, b) => a + b, 0)), [sessions])
  const riskSpark  = useMemo(() =>
    [...sessions].reverse().map(s => s.avgRiskScore), [sessions])

  const todayExercises = useMemo(() => {
    if (!activeProgram) return null
    return activeProgram.exercises.slice(activeProgram.currentIndex, activeProgram.currentIndex + 5)
  }, [activeProgram])

  const squadBoard = useMemo(() => {
    const seen: Record<string, { name: string; score: number; streak: number }> = {}
    for (const item of feed) {
      if (!seen[item.userId] && item.avgRiskScore != null) {
        seen[item.userId] = {
          name: item.displayName,
          score: Math.round(100 - (item.avgRiskScore ?? 50)),
          streak: item.streak ?? 0,
        }
      }
    }
    const others = Object.values(seen)
    const me = formScore != null
      ? [{ name: welcomeName, score: formScore, streak, isMe: true }]
      : []
    return [...me, ...others.map(x => ({ ...x, isMe: false }))]
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
  }, [feed, formScore, streak, welcomeName])

  // ── Hero card content ──────────────────────────────────────────────────

  const heroTitle = useMemo(() => {
    if (activeProgram) return activeProgram.name
    if (!sessions.length) return 'Start your first workout'
    const recent = sessions[0]?.exercises ?? []
    if (recent.includes('squat') || recent.includes('deadlift')) return 'Upper body day — time to push'
    if (recent.includes('pushup') || recent.includes('benchpress')) return 'Lower body & core day'
    return `Good ${timeGreeting()} — ready to move?`
  }, [activeProgram, sessions])

  const heroSub = useMemo(() => {
    if (activeProgram) {
      const remaining = activeProgram.exercises.length - activeProgram.currentIndex
      return `${remaining} exercises queued${formScore != null ? ` · Form forecast ${formScore >= 80 ? 'strong' : formScore >= 60 ? 'moderate' : 'needs work'}` : ''}`
    }
    if (sessions.length) {
      const lastEx = sessions[0]?.exercises?.map(fmtExercise).join(', ') ?? ''
      return `Last session: ${lastEx || '—'} · ${formScore != null ? `Form score ${formScore}` : 'Start tracking your form'}`
    }
    return 'Your AI coach is ready. Camera-based form analysis, rep counting, and real-time coaching.'
  }, [activeProgram, sessions, formScore])

  // ── Nav tabs ───────────────────────────────────────────────────────────

  const NAV_TABS = [
    { label: 'Today',    to: '/home' },
    { label: 'Workout',  to: '/workout' },
    { label: 'Progress', to: '/progress' },
    { label: 'Squad',    to: '/friends' },
    { label: 'Recovery', to: '/recovery-log' },
  ]

  return (
    <div className="min-h-screen bg-page text-white">

      {/* ── Top Navigation ── */}
      <nav className="sticky top-0 z-30"
        style={{ background: 'rgba(7,7,14,0.9)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="mx-auto max-w-7xl flex items-center justify-between px-5 py-3">

          {/* Logo */}
          <div className="flex items-center gap-5">
            <Link to="/home" className="flex items-center gap-2 group">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black"
                style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}>I</div>
              <span className="text-[14px] font-black text-white tracking-tight hidden sm:block">IntoYourPrime</span>
            </Link>

            {/* Tabs */}
            <div className="flex items-center gap-1">
              {NAV_TABS.map(tab => {
                const active = tab.to === '/home'
                return (
                  <Link key={tab.label} to={tab.to}
                    className="px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all"
                    style={{
                      color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                      background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                    }}>
                    {tab.label}
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {!apiKeySet ? (
              <button
                onClick={() => setShowApiInput(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all"
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24' }}>
                ⚡ Add AI Key
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold"
                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }}>
                ✓ AI Active
              </div>
            )}
            <Link to="/profile"
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black text-white"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}>
              {welcomeName.slice(0, 1).toUpperCase()}
            </Link>
          </div>
        </div>

        {/* API key dropdown */}
        {showApiInput && (
          <div className="mx-auto max-w-7xl px-5 pb-3">
            <div className="flex gap-2 max-w-sm">
              <input
                type="text"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveApiKey()}
                placeholder="sk-proj-…"
                className="input-dark flex-1 font-mono text-[12px]"
                autoComplete="off"
                spellCheck={false}
              />
              <button onClick={handleSaveApiKey} disabled={!apiKeyInput.trim()}
                className="px-4 py-2 rounded-xl text-[12px] font-black text-black disabled:opacity-40"
                style={{ background: '#f59e0b' }}>
                Save
              </button>
            </div>
            <p className="text-[10px] text-amber-700 mt-1">Stored locally · never sent to a server</p>
          </div>
        )}
      </nav>

      {/* ── Dashboard ── */}
      <div className="mx-auto max-w-7xl px-4 py-5 grid grid-cols-1 lg:grid-cols-[1fr_296px] gap-5">

        {/* ════ LEFT COLUMN ════ */}
        <div className="space-y-5 min-w-0">

          {/* Hero workout card */}
          <div className="relative rounded-2xl overflow-hidden p-6"
            style={{
              background: 'linear-gradient(135deg, #0d1f12 0%, #0a1628 50%, #0e0e22 100%)',
              border: '1px solid rgba(34,197,94,0.2)',
              boxShadow: '0 0 60px rgba(34,197,94,0.06), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}>
            {/* Label pill */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-green-400">
                {new Date().toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase()} · {activeProgram ? 'PROGRAM' : 'READY TO TRAIN'}
              </span>
            </div>

            {/* Title */}
            <h1 className="text-[26px] sm:text-[32px] font-black text-white leading-tight max-w-lg mb-2">
              {heroTitle}
            </h1>
            <p className="text-[14px] text-gray-400 leading-relaxed mb-5 max-w-md">
              {heroSub}
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate('/workout')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[14px] font-black text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', boxShadow: '0 0 20px rgba(34,197,94,0.25)' }}>
                ▶ Start session
              </button>
              <Link to="/programs"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[14px] font-bold transition-all hover:text-white"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                ↺ Programs
              </Link>
              <Link to="/programs/generate"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[14px] font-bold transition-all hover:text-white"
                style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', color: '#93c5fd' }}>
                ✨ AI Generate
              </Link>
              <Link to="/basketball"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[14px] font-bold transition-all hover:text-white"
                style={{ background: 'rgba(234,88,12,0.12)', border: '1px solid rgba(234,88,12,0.25)', color: '#fb923c' }}>
                🏀 Shooting
              </Link>
            </div>

            {/* Decorative glow */}
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%)', transform: 'translate(30%,-30%)' }} />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                label: 'FORM SCORE',
                value: formScore,
                prev: prevFormScore,
                spark: formSpark,
                color: '#3b82f6',
                higherBetter: true,
                suffix: '',
              },
              {
                label: 'WEEKLY REPS',
                value: weeklyReps || null,
                prev: prevWeeklyReps || null,
                spark: repsSpark,
                color: '#a78bfa',
                higherBetter: true,
                suffix: '',
              },
              {
                label: 'INJURY RISK',
                value: injuryRisk,
                prev: prevInjuryRisk,
                spark: riskSpark,
                color: '#f59e0b',
                higherBetter: false,
                suffix: '',
              },
            ].map(({ label, value, prev, spark, color, higherBetter }) => {
              const diff = value != null && prev != null ? value - prev : null
              const trendGood = diff != null ? (higherBetter ? diff > 0 : diff < 0) : null
              const trendColor = trendGood === true ? '#22c55e' : trendGood === false ? '#ef4444' : '#6b7280'
              return (
                <div key={label} className="rounded-2xl p-4"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500 mb-1">{label}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[30px] font-black text-white leading-none">
                      {loading ? '—' : value ?? '—'}
                    </span>
                    {diff != null && (
                      <span className="text-[12px] font-bold" style={{ color: trendColor }}>
                        {diff > 0 ? '+' : ''}{diff}
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <MiniSparkline values={spark} color={color} invert={!higherBetter} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Today's plan */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-subtle">
              <div>
                <h2 className="text-[13px] font-black text-white">
                  {activeProgram ? "Today's Plan" : "Quick Start"}
                </h2>
                {activeProgram && (
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {activeProgram.exercises.length - activeProgram.currentIndex} exercises remaining
                  </p>
                )}
              </div>
              <Link to={activeProgram ? '/workout' : '/programs'}
                className="text-[12px] font-bold text-accent hover:text-accent/80 transition-colors">
                {activeProgram ? 'Start →' : 'Browse plans →'}
              </Link>
            </div>

            {todayExercises ? (
              <ul>
                {todayExercises.map((ex, i) => {
                  const done = i < 0  // none done yet
                  const isNext = i === 0
                  return (
                    <li key={ex + i}
                      className="flex items-center gap-4 px-5 py-3.5 border-b border-subtle last:border-0">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black"
                        style={{
                          background: done ? '#22c55e' : isNext ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                          border: isNext ? '1px solid rgba(59,130,246,0.4)' : 'none',
                          color: done ? 'white' : isNext ? '#60a5fa' : '#6b7280',
                        }}>
                        {done ? '✓' : activeProgram!.currentIndex + i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-white capitalize">{fmtExercise(ex)}</p>
                      </div>
                      {isNext && (
                        <span className="text-[11px] font-bold text-blue-400 shrink-0">Up next</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="px-5 py-4 space-y-2">
                {[
                  { icon: '🏋️', label: 'Custom Workout',      desc: 'Any exercise, AI-coached',        to: '/workout' },
                  { icon: '📋', label: 'Structured Program',   desc: 'Follow a preset training plan',   to: '/programs' },
                  { icon: '✨', label: 'AI Workout Generator', desc: 'Describe a goal, get a program',  to: '/programs/generate' },
                  { icon: '🔧', label: 'Build Your Program',   desc: 'Pick exercises, set reps & order', to: '/programs/builder' },
                  { icon: '📖', label: 'Exercise Library',     desc: 'Browse all 30+ exercises',        to: '/library' },
                  { icon: '🏀', label: 'Basketball',           desc: 'Shooting form + BEEF scoring',    to: '/basketball' },
                  { icon: '🏆', label: 'Squad Leaderboard',    desc: 'See how you rank vs friends',     to: '/friends' },
                  { icon: '📈', label: 'Progress',             desc: 'Sessions, reps & form trends',    to: '/progress' },
                ].map(opt => (
                  <Link key={opt.to} to={opt.to}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:brightness-110"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <span className="text-[18px]">{opt.icon}</span>
                    <div>
                      <p className="text-[13px] font-bold text-white">{opt.label}</p>
                      <p className="text-[11px] text-gray-500">{opt.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recovery insight */}
          {insight && (
            <div className="rounded-2xl px-5 py-4"
              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-400 mb-2">AI Recovery Insight</p>
              <p className="text-[14px] leading-relaxed text-gray-300">{insight}</p>
            </div>
          )}
        </div>

        {/* ════ RIGHT COLUMN ════ */}
        <div className="space-y-4">

          {/* Readiness */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-4">Readiness</p>
            <div className="flex justify-center mb-3">
              {readiness != null
                ? <CircularGauge score={readiness} />
                : (
                  <div className="flex flex-col items-center justify-center h-32 gap-2">
                    <span className="text-2xl">📓</span>
                    <p className="text-[11px] text-gray-600 text-center">Log recovery to<br />see readiness score</p>
                    <Link to="/recovery-log" className="text-[11px] text-accent hover:text-accent/80 font-semibold">Log now →</Link>
                  </div>
                )
              }
            </div>
            {lastLog && (
              <div className="grid grid-cols-3 gap-2 text-center mt-1">
                {[
                  { label: 'Sleep', value: `${lastLog.sleepHours}h` },
                  { label: 'Energy', value: `${lastLog.energyLevel}/5` },
                  { label: 'Soreness', value: `${lastLog.overallSoreness}/5` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-[14px] font-black text-white">{value}</p>
                    <p className="text-[9px] text-gray-600 uppercase tracking-wider mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Streak */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Streak</p>
              <Flame className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-[40px] font-black text-white leading-none">{streak}</span>
              <span className="text-[14px] text-gray-500">days</span>
            </div>
            <StreakBars sessions={allSessions} streak={streak} />
          </div>

          {/* Squad */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-subtle">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Squad This Week</p>
              <Link to="/friends" className="text-[11px] text-accent hover:text-accent/80 font-semibold transition-colors">
                {squadBoard.length} active →
              </Link>
            </div>
            {squadBoard.length === 0 ? (
              <div className="px-5 py-6 text-center">
                <p className="text-[12px] text-gray-600">No squad activity yet.</p>
                <Link to="/friends" className="text-[12px] text-accent hover:text-accent/80 font-semibold mt-1 block">Add friends →</Link>
              </div>
            ) : (
              <ul>
                {squadBoard.map((member, i) => (
                  <li key={i}
                    className="flex items-center gap-3 px-5 py-3 border-b border-subtle last:border-0"
                    style={member.isMe ? { background: 'rgba(59,130,246,0.06)' } : {}}>
                    <span className="text-[12px] font-black text-gray-600 w-4 shrink-0">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white shrink-0"
                      style={{ background: member.isMe ? 'linear-gradient(135deg,#3b82f6,#7c3aed)' : 'linear-gradient(135deg,#374151,#1f2937)' }}>
                      {initials(member.name)}
                    </div>
                    <span className="flex-1 text-[13px] font-semibold text-white truncate">
                      {member.isMe ? 'You' : member.name}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[14px] font-black text-white">{member.score}</span>
                      {member.streak > 0 && (
                        <span className="text-[10px] text-amber-400 font-bold">🔥{member.streak}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-2">
            <Link to="/session-summary"
              className="rounded-xl py-2.5 text-center text-[11px] font-semibold text-gray-400 hover:text-white transition-colors"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              Last session →
            </Link>
            <Link to="/recovery-log"
              className="rounded-xl py-2.5 text-center text-[11px] font-semibold text-gray-400 hover:text-white transition-colors"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              Recovery log →
            </Link>
            <Link to="/programs/generate"
              className="rounded-xl py-2.5 text-center text-[11px] font-semibold text-accent hover:text-accent/80 transition-colors"
              style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
              ✨ AI Generate →
            </Link>
            <Link to="/programs/builder"
              className="rounded-xl py-2.5 text-center text-[11px] font-semibold text-gray-400 hover:text-white transition-colors"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              🔧 Build plan →
            </Link>
          </div>

          {/* Clip coach — video upload for post-workout AI analysis */}
          <ClipCoach />

          {/* Footer links */}
          <div className="flex justify-center flex-wrap gap-x-4 gap-y-1.5 pt-2">
            <Link to="/profile"      className="text-[11px] text-gray-700 hover:text-gray-400 transition-colors">Profile</Link>
            <Link to="/progress"     className="text-[11px] text-gray-700 hover:text-gray-400 transition-colors">Progress</Link>
            <Link to="/friends"      className="text-[11px] text-gray-700 hover:text-gray-400 transition-colors">Squad</Link>
            <Link to="/recovery-log" className="text-[11px] text-gray-700 hover:text-gray-400 transition-colors">Recovery</Link>
            <Link to="/library"      className="text-[11px] text-gray-700 hover:text-gray-400 transition-colors">Library</Link>
            <Link to="/measurements" className="text-[11px] text-gray-700 hover:text-gray-400 transition-colors">Measurements</Link>
            <Link to="/auth"         className="text-[11px] text-gray-700 hover:text-gray-400 transition-colors">🏛 Gym</Link>
          </div>

          {/* Spacer so the floating theme pill never overlaps the footer */}
          <div style={{ height: 64 }} aria-hidden />
        </div>
      </div>

      {/* Floating theme picker — bottom-center, fixed to viewport */}
      <ThemeSwitcher />
    </div>
  )
}
