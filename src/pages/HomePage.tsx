import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Flame } from 'lucide-react'
import { hasApiKey } from '../lib/formAnalysis'
import { PoseSkeletonDecor } from '../components/PoseSkeletonDecor'
import {
  getActivityFeed,
  getRecentLogs,
  getUserProfile,
  getUserSessions,
} from '../lib/firebaseHelpers'
import { generateRecoveryInsight } from '../lib/formAnalysis'
import { getOrSignInUserId } from '../lib/firestoreUser'
import { getOrCreateLocalUserId } from '../lib/localUserId'
import type { ActivityFeedItem, Session } from '../types'

function timeGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

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
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeySet] = useState(hasApiKey)
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [streak, setStreak] = useState(0)
  const [feed, setFeed] = useState<ActivityFeedItem[]>([])
  const [insight, setInsight] = useState<string | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)


  const refresh = useCallback(async () => {
    try {
      // Use local id immediately so the page never hangs waiting for Firebase auth
      const localId = getOrCreateLocalUserId()
      const id = await Promise.race([
        getOrSignInUserId(),
        new Promise<string>(resolve => setTimeout(() => resolve(localId), 3000)),
      ])

      const [sessAll, profile, activity] = await Promise.allSettled([
        getUserSessions(id, 50),
        getUserProfile(id),
        getActivityFeed(id),
      ])
      const sessions = sessAll.status === 'fulfilled' ? sessAll.value : []
      const prof     = profile.status === 'fulfilled' ? profile.value : null
      const acts     = activity.status === 'fulfilled' ? activity.value : []

      setSessions(sessions.slice(0, 5))
      setStreak(prof?.streakCount ?? 0)
      setFeed(acts.filter((a) => a.userId !== id).slice(0, 10))

      if (sessions.length >= 5) {
        setInsightLoading(true)
        try {
          const logs = await getRecentLogs(id, 30)
          const text = await generateRecoveryInsight({ sessions, logs })
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
    } catch {
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
    window.location.reload()
  }, [apiKeyInput])

  const sessionCountForInsight = useMemo(() => {
    return sessions.length >= 5
  }, [sessions])

  return (
    <div className="min-h-screen bg-[#07070e] pb-24 text-white">

      {/* ── Top nav ── */}
      <nav className="sticky top-0 z-30 flex items-center justify-between px-5 py-4"
        style={{ background: 'rgba(7,7,14,0.85)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Link to="/home" className="text-[14px] font-black uppercase tracking-[0.18em] text-blue-400 hover:text-blue-300 transition-colors">
          IntoYourPrime
        </Link>
        <div className="flex items-center gap-3">
          {!apiKeySet && (
            <button
              type="button"
              onClick={() => setShowKeyInput(v => !v)}
              className="rounded-full border border-amber-500/40 px-3 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/10 transition-colors"
            >
              {showKeyInput ? 'Cancel' : '⚡ Add AI key'}
            </button>
          )}
          <Link to="/profile" className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-black text-white transition-opacity hover:opacity-70"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}>
            {welcomeName.slice(0, 1).toUpperCase()}
          </Link>
        </div>
      </nav>

      {/* ── API key input (dropdown from nav) ── */}
      {showKeyInput && (
        <div className="mx-auto max-w-lg px-5 pt-3">
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveApiKey()}
              placeholder="sk-proj-…"
              className="input-dark flex-1 font-mono text-[13px]"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
            <button
              type="button"
              onClick={handleSaveApiKey}
              disabled={!apiKeyInput.trim()}
              className="shrink-0 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-2.5 text-[13px] font-bold text-white transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-lg px-5">

        {/* ── Hero ── */}
        <header className="pt-12 pb-2 flex items-center justify-between gap-4">
          {/* Left: text */}
          <div className="flex-1 min-w-0">
            <p className="text-[15px] text-gray-400">{timeGreeting()}</p>
            <h1 className="mt-1 text-6xl font-black tracking-tight leading-none">{welcomeName}</h1>

            {/* Streak pill */}
            <div className="mt-5 inline-flex items-center gap-2.5 rounded-full px-5 py-2.5"
              style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.22)' }}>
              <Flame className="h-5 w-5 text-amber-400" />
              <span className="text-[15px] font-semibold text-amber-200">
                <span className="font-mono text-[18px] font-black">{streak}</span>
                <span className="ml-1.5 text-amber-300/70"> day streak</span>
              </span>
            </div>
          </div>

          {/* Right: pose skeleton */}
          <div className="shrink-0 flex items-center justify-center rounded-2xl p-3"
            style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.14)' }}>
            <PoseSkeletonDecor />
          </div>
        </header>

        {/* ── CTA ── */}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => navigate('/workout')}
            className="relative w-full overflow-hidden rounded-2xl py-5 text-[17px] font-black tracking-tight text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              boxShadow: '0 0 40px rgba(99,102,241,0.35), 0 2px 0 rgba(255,255,255,0.08) inset',
            }}
          >
            <span className="relative z-10">Start Workout</span>
            <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' }} />
          </button>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <Link
              to="/session-summary"
              className="flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-gray-400 transition-all hover:text-white"
              style={{ background: '#111119', border: '1px solid #1e1e2e' }}
            >
              Last session →
            </Link>
            <Link
              to="/friends"
              className="flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-gray-400 transition-all hover:text-white"
              style={{ background: '#111119', border: '1px solid #1e1e2e' }}
            >
              Squad →
            </Link>
          </div>
        </div>

        {/* ── Recent sessions ── */}
        <section className="mt-10">
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.2em] text-gray-500">
            Recent sessions
          </h2>
          {loading ? (
            <div className="space-y-2">
              {[1,2].map(i => (
                <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: '#111119' }} />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-2xl p-6 text-center" style={{ background: '#111119', border: '1px solid #1e1e2e' }}>
              <p className="text-2xl mb-2">🏋️</p>
              <p className="text-[14px] text-gray-500">No sessions yet — complete your first workout!</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id} className="rounded-xl px-4 py-3.5 transition-all hover:border-blue-500/30"
                  style={{ background: '#111119', border: '1px solid #1e1e2e' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-bold text-white">{formatSessionDate(s.date)}</span>
                    <div className="flex items-center gap-3 text-[12px]">
                      <span className="text-amber-400 font-mono font-semibold">warmup {Math.round(s.warmupScore)}</span>
                      <span className="text-blue-400 font-mono font-semibold">risk {Math.round(s.avgRiskScore)}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-[13px] capitalize text-gray-500">
                    {s.exercises.length ? s.exercises.join(' · ') : '—'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Recovery insight ── */}
        <section className="mt-8">
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.2em] text-gray-500">
            Recovery insight
          </h2>
          <div className="rounded-2xl p-5" style={{ background: '#111119', border: '1px solid #1e1e2e' }}>
            {!sessionCountForInsight ? (
              <div className="flex items-start gap-3">
                <span className="text-xl">🔒</span>
                <p className="text-[14px] leading-relaxed text-gray-500">
                  Complete 5 sessions to unlock personalized recovery insights.
                </p>
              </div>
            ) : insightLoading ? (
              <p className="text-[13px] text-gray-500 animate-pulse">Generating insight…</p>
            ) : insight ? (
              <p className="text-[15px] leading-relaxed text-gray-200">{insight}</p>
            ) : (
              <p className="text-[13px] text-gray-500">Add an OpenAI key to generate insights.</p>
            )}
          </div>
        </section>

        {/* ── Friends feed ── */}
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.2em] text-gray-500">Friends</h2>
            <Link to="/friends" className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors">
              Prime Intelligence →
            </Link>
          </div>
          {loading ? (
            <div className="h-16 rounded-xl animate-pulse" style={{ background: '#111119' }} />
          ) : feed.length === 0 ? (
            <div className="rounded-2xl p-5 text-center" style={{ background: '#111119', border: '1px solid #1e1e2e' }}>
              <p className="text-[13px] text-gray-500">No friend activity yet.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {feed.map((item) => (
                <li key={item.id} className="flex gap-3 items-center rounded-xl px-4 py-3"
                  style={{ background: '#111119', border: '1px solid #1e1e2e' }}>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
                    style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}>
                    {initials(item.displayName)}
                  </div>
                  <p className="min-w-0 flex-1 text-[14px] leading-snug text-gray-300">{feedLine(item)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Footer links ── */}
        <div className="mt-12 flex justify-center gap-6 border-t border-[#111119] pt-6 pb-4">
          <Link to="/profile" className="text-[12px] text-gray-600 hover:text-gray-400 transition-colors">Profile</Link>
          <Link to="/pipeline-test" className="text-[12px] text-gray-600 hover:text-gray-400 transition-colors">Pipeline test</Link>
          <Link to="/recovery-log" className="text-[12px] text-gray-600 hover:text-gray-400 transition-colors">Recovery log</Link>
        </div>
      </div>
    </div>
  )
}
