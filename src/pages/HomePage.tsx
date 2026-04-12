import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Flame } from 'lucide-react'
import { hasApiKey } from '../lib/formAnalysis'
import {
  getActivityFeed,
  getRecentLogs,
  getTodayLocalDateString,
  getTodayLog,
  getUserProfile,
  getUserSessions,
} from '../lib/firebaseHelpers'
import { generateRecoveryInsight } from '../lib/formAnalysis'
import { getOrSignInUserId } from '../lib/firestoreUser'
import { loadRecoveryLogLocal } from '../lib/recoveryLogLocal'
import type { ActivityFeedItem, DailyLog, Session } from '../types'

function displayNameFromLocal(): string {
  try {
    const raw = localStorage.getItem('formAI_profile')
    if (!raw) return 'Athlete'
    const p = JSON.parse(raw) as { name?: string }
    const n = typeof p.name === 'string' ? p.name.trim() : ''
    return n || 'Athlete'
  } catch {
    return 'Athlete'
  }
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function feedLine(item: ActivityFeedItem): string {
  if (item.type === 'workout_completed') {
    const w = item.warmupScore != null ? String(Math.round(item.warmupScore)) : '—'
    const r = item.avgRiskScore != null ? String(Math.round(item.avgRiskScore)) : '—'
    return `${item.displayName} completed a workout · warmup ${w} · risk ${r}`
  }
  if (item.type === 'streak_milestone') {
    return `${item.displayName} hit a ${item.streak ?? '—'}-day streak 🔥`
  }
  return `${item.displayName} joined the crew`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function HomePage() {
  const navigate = useNavigate()
  const welcomeName = useMemo(() => displayNameFromLocal(), [])

  const [loading, setLoading] = useState(true)
  const [todayLog, setTodayLog] = useState<DailyLog | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeySet, setApiKeySet] = useState(hasApiKey)
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [streak, setStreak] = useState(0)
  const [feed, setFeed] = useState<ActivityFeedItem[]>([])
  const [insight, setInsight] = useState<string | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoadError(null)
    const id = await getOrSignInUserId()

    try {
      let log: DailyLog | null = null
      try {
        log = await getTodayLog(id)
      } catch {
        /* Firestore read denied / offline */
      }
      if (!log) {
        log = loadRecoveryLogLocal(id, getTodayLocalDateString())
      }

      const [sessAll, profile, activity] = await Promise.all([
        getUserSessions(id, 50),
        getUserProfile(id),
        getActivityFeed(id),
      ])
      setTodayLog(log)
      setSessions(sessAll.slice(0, 5))
      setStreak(profile?.streakCount ?? 0)
      const friendsOnly = activity.filter((a) => a.userId !== id).slice(0, 10)
      setFeed(friendsOnly)

      if (sessAll.length >= 5) {
        setInsightLoading(true)
        try {
          const logs = await getRecentLogs(id, 30)
          const text = await generateRecoveryInsight({ sessions: sessAll, logs })
          setInsight(text.trim() || null)
        } catch {
          setInsight(null)
        } finally {
          setInsightLoading(false)
        }
      } else {
        setInsight(null)
        setInsightLoading(false)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load home data'
      setLoadError(msg)
      setInsightLoading(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSaveApiKey = useCallback(() => {
    const trimmed = apiKeyInput.trim()
    if (!trimmed) return
    localStorage.setItem('formAI_openai_key', trimmed)
    setApiKeySet(true)
    setApiKeyInput('')
    setShowKeyInput(false)
  }, [apiKeyInput])

  const sessionCountForInsight = useMemo(() => {
    return sessions.length >= 5
  }, [sessions])

  return (
    <div className="min-h-screen bg-[#0a0a0f] pb-16 text-white">
      <div className="mx-auto max-w-lg px-5 pt-10">
        {/* Top */}
        <header className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400">FormIQ</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
            Welcome back, {welcomeName}
          </h1>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2">
            <Flame className="h-5 w-5 text-amber-400" aria-hidden />
            <span className="text-[13px] font-semibold text-amber-100">
              <span className="font-mono text-lg font-black">{streak}</span>
              <span className="ml-1.5 text-amber-200/80">day streak</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/workout')}
            className="mt-8 w-full max-w-sm rounded-2xl bg-blue-600 py-4 text-[16px] font-black tracking-tight text-white shadow-[0_0_40px_rgba(59,130,246,0.35)] transition hover:bg-blue-500"
          >
            Start workout
          </button>
        </header>

        {!apiKeySet && (
          <div className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-5 py-4"
            style={{ background: 'rgba(245,158,11,0.07)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-amber-200">AI coaching is off</p>
                <p className="mt-0.5 text-[12px] text-amber-200/60 leading-snug">
                  Add an OpenAI key to enable real-time form analysis &amp; injury risk scoring.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowKeyInput(v => !v)}
                className="shrink-0 rounded-xl px-5 py-2.5 text-[14px] font-bold text-amber-300 border border-amber-500/40 hover:border-amber-400/70 hover:bg-amber-500/10 transition-colors"
              >
                {showKeyInput ? 'Cancel' : 'Add key'}
              </button>
            </div>
            {showKeyInput && (
              <div className="mt-3 flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveApiKey()}
                  placeholder="sk-proj-…"
                  className="input-dark flex-1 font-mono text-[13px] py-2"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  disabled={!apiKeyInput.trim()}
                  className="shrink-0 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-2 text-[13px] font-bold text-white transition-colors"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        )}

        {loadError && (
          <p className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-[13px] text-red-300">
            {loadError}
            <span className="mt-1 block text-[11px] text-red-400/80">
              Check <code className="text-red-200">VITE_FIREBASE_*</code> and Firestore rules.
            </span>
          </p>
        )}

        {/* Today's status */}
        <section className="mt-10">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
            Today&apos;s status
          </h2>
          {todayLog ? (
            <div className="card-surface mt-3 space-y-3 p-5">
              <p className="text-[13px] text-gray-400">
                Sleep <span className="font-mono font-bold text-white">{todayLog.sleepHours}h</span>
                <span className="text-gray-600"> · </span>
                quality{' '}
                <span className="font-mono font-bold text-amber-400">{todayLog.sleepQuality}/5</span>
              </p>
              <p className="text-[13px] text-gray-400">
                Energy <span className="font-mono font-bold text-white">{todayLog.energyLevel}/5</span>
                <span className="text-gray-600"> · </span>
                soreness{' '}
                <span className="font-mono font-bold text-white">{todayLog.overallSoreness}/5</span>
              </p>
              <Link
                to="/recovery-log"
                className="inline-block text-[12px] font-semibold text-blue-400 underline-offset-2 hover:underline"
              >
                Edit today&apos;s log
              </Link>
            </div>
          ) : (
            <Link
              to="/recovery-log"
              className="card-surface mt-3 block p-5 transition hover:border-blue-500/40"
            >
              <p className="text-[15px] font-bold text-white">Log how you&apos;re feeling today</p>
              <p className="mt-1 text-[13px] text-gray-500">Sleep, energy, soreness →</p>
            </Link>
          )}
        </section>

        {/* Recent sessions */}
        <section className="mt-10">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
            Recent sessions
          </h2>
          {loading ? (
            <p className="mt-3 text-[13px] text-gray-600">Loading…</p>
          ) : sessions.length === 0 ? (
            <p className="card-surface mt-3 p-5 text-[13px] text-gray-500">
              No saved sessions yet. Finish a workout and sync to Firestore to see history here.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {sessions.map((s) => (
                <li key={s.id} className="card-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] font-bold text-white">{formatSessionDate(s.date)}</span>
                    <span className="shrink-0 text-[11px] text-gray-600">
                      feel {s.feelRating != null ? `${s.feelRating}/5` : '—'}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] capitalize text-gray-400">
                    {s.exercises.length ? s.exercises.join(', ') : '—'}
                  </p>
                  <p className="mt-2 text-[12px] text-gray-500">
                    Warmup{' '}
                    <span className="font-mono font-semibold text-amber-400">
                      {Math.round(s.warmupScore)}
                    </span>
                    <span className="mx-1.5 text-gray-700">·</span>
                    Avg risk{' '}
                    <span className="font-mono font-semibold text-blue-400">
                      {Math.round(s.avgRiskScore)}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recovery insight */}
        <section className="mt-10">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
            Recovery insight
          </h2>
          <div className="card-surface mt-3 p-5">
            {!sessionCountForInsight ? (
              <p className="text-[13px] leading-relaxed text-gray-400">
                Complete 5 sessions to unlock your personalized recovery insights.
              </p>
            ) : insightLoading ? (
              <p className="text-[13px] text-gray-500">Generating insight…</p>
            ) : insight ? (
              <p className="text-[14px] leading-relaxed text-gray-200">{insight}</p>
            ) : (
              <p className="text-[13px] text-gray-500">
                Run <code className="text-gray-400">vercel dev</code> with{' '}
                <code className="text-gray-400">OPENAI_API_KEY</code> for AI insights.
              </p>
            )}
          </div>
        </section>

        {/* Friends feed */}
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
              Friends
            </h2>
            <Link to="/friends" className="text-[11px] font-semibold text-blue-400 hover:underline">
              Manage
            </Link>
          </div>
          {loading ? (
            <p className="mt-3 text-[13px] text-gray-600">Loading…</p>
          ) : feed.length === 0 ? (
            <p className="card-surface mt-3 p-5 text-[13px] text-gray-500">
              No friend activity yet. Add friends to see their workouts here.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {feed.map((item) => (
                <li key={item.id} className="card-surface flex gap-3 p-3.5">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
                    style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}
                  >
                    {initials(item.displayName)}
                  </div>
                  <p className="min-w-0 flex-1 text-[13px] leading-snug text-gray-300">
                    {feedLine(item)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Secondary links */}
        <nav className="mt-12 flex flex-col gap-2 border-t border-[#1e1e2e] pt-8">
          <Link
            to="/session-summary"
            className="text-[13px] font-semibold text-gray-500 hover:text-gray-300"
          >
            Last session summary →
          </Link>
          <Link
            to="/pipeline-test"
            className="text-[13px] font-semibold text-gray-500 hover:text-gray-300"
          >
            Image pipeline test →
          </Link>
          <Link
            to="/profile"
            className="text-[13px] font-semibold text-gray-500 hover:text-gray-300"
          >
            Edit profile / API key →
          </Link>
        </nav>
      </div>
    </div>
  )
}
