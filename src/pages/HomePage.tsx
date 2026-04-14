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

const QUOTES = [
  { text: "The only bad workout is the one that didn't happen.", author: "Unknown" },
  { text: "Push yourself because no one else is going to do it for you.", author: "Unknown" },
  { text: "Your body can stand almost anything. It's your mind you have to convince.", author: "Unknown" },
  { text: "Strength does not come from the body. It comes from the will.", author: "Unknown" },
  { text: "The pain you feel today will be the strength you feel tomorrow.", author: "Unknown" },
  { text: "Don't stop when you're tired. Stop when you're done.", author: "Unknown" },
  { text: "Fall in love with taking care of your body.", author: "Unknown" },
  { text: "A one-hour workout is 4% of your day. No excuses.", author: "Unknown" },
  { text: "Success starts with self-discipline.", author: "Unknown" },
  { text: "Train insane or remain the same.", author: "Unknown" },
  { text: "What seems impossible today will one day become your warm-up.", author: "Unknown" },
  { text: "Your only competition is who you were yesterday.", author: "Unknown" },
  { text: "Believe in yourself and all that you are.", author: "Christian D. Larson" },
  { text: "It never gets easier. You just get stronger.", author: "Unknown" },
]

function getDailyQuote() {
  const day = Math.floor(Date.now() / 86_400_000)
  return QUOTES[day % QUOTES.length]
}

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
              className="rounded-full border border-amber-500/40 px-3 py-1.5 text-[12px] font-bold text-amber-300 hover:bg-amber-500/10 transition-colors"
            >
              {showKeyInput ? '✕ Cancel' : '⚡ Add AI key'}
            </button>
          )}
          <Link to="/profile" className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-black text-white transition-opacity hover:opacity-70"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}>
            {welcomeName.slice(0, 1).toUpperCase()}
          </Link>
        </div>
      </nav>

      {/* ── API key banner (shown when no key set) ── */}
      {!apiKeySet && !showKeyInput && (
        <div
          className="mx-auto max-w-lg px-5 pt-3"
          onClick={() => setShowKeyInput(true)}
          style={{ cursor: 'pointer' }}
        >
          <div
            className="flex items-center gap-4 rounded-2xl px-5 py-4 transition-all hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, rgba(245,158,11,0.14) 0%, rgba(234,88,12,0.12) 100%)',
              border: '1px solid rgba(245,158,11,0.35)',
              boxShadow: '0 0 28px rgba(245,158,11,0.1)',
            }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl"
              style={{ background: 'rgba(245,158,11,0.18)' }}>
              ⚡
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-black text-amber-200">Add your OpenAI API key</p>
              <p className="text-[12px] text-amber-400/70 mt-0.5">
                Unlock real-time form analysis, AI coaching &amp; voice feedback
              </p>
            </div>
            <span className="text-amber-400 text-[18px]">→</span>
          </div>
        </div>
      )}

      {/* ── API key input (expanded) ── */}
      {showKeyInput && (
        <div className="mx-auto max-w-lg px-5 pt-3">
          <div
            className="rounded-2xl p-5"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}
          >
            <p className="text-[12px] font-bold text-amber-300 mb-3">⚡ Add OpenAI API Key</p>
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
                className="shrink-0 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 px-5 py-2.5 text-[13px] font-black text-black transition-colors"
              >
                Save
              </button>
            </div>
            <p className="mt-2 text-[11px] text-amber-600/70">Stored locally — never sent to any server.</p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-lg px-5">

        {/* ── Hero ── */}
        <header className="relative pt-12 pb-2">
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

          {/* Pose skeleton — absolutely positioned, doesn't affect text layout */}
          <div className="absolute top-8 -right-6 opacity-70 rounded-2xl p-2"
            style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.14)' }}>
            <PoseSkeletonDecor size={110} />
          </div>
        </header>

        {/* ── Daily quote ── */}
        {(() => {
          const q = getDailyQuote()
          return (
            <div className="mt-6 rounded-2xl px-5 py-4"
              style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <p className="text-[14px] leading-relaxed text-gray-300 italic">&ldquo;{q.text}&rdquo;</p>
              {q.author !== 'Unknown' && (
                <p className="mt-1.5 text-[11px] font-semibold text-indigo-400">— {q.author}</p>
              )}
            </div>
          )
        })()}

        {/* ── CTA ── */}
        <div className="mt-6">
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

          <div className="mt-3 grid grid-cols-3 gap-3">
            <Link
              to="/session-summary"
              className="flex items-center justify-center gap-1 rounded-xl py-3 text-[12px] font-semibold text-gray-400 transition-all hover:text-white"
              style={{ background: '#111119', border: '1px solid #1e1e2e' }}
            >
              Last session →
            </Link>
            <Link
              to="/progress"
              className="flex items-center justify-center gap-1 rounded-xl py-3 text-[12px] font-semibold text-gray-400 transition-all hover:text-white"
              style={{ background: '#111119', border: '1px solid #1e1e2e' }}
            >
              Progress →
            </Link>
            <Link
              to="/friends"
              className="flex items-center justify-center gap-1 rounded-xl py-3 text-[12px] font-semibold text-gray-400 transition-all hover:text-white"
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

        {/* ── Pro subscription (coming soon) ── */}
        <section className="mt-8">
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(99,102,241,0.3)' }}>
            <div className="px-5 py-4 flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(124,58,237,0.12) 100%)' }}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-400">IntoYourPrime Pro</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Coming Soon
                  </span>
                </div>
                <p className="text-[13px] font-bold text-white">$15 / month</p>
              </div>
              <div className="text-2xl opacity-60">🔒</div>
            </div>
            <div className="px-5 py-4 space-y-2" style={{ background: 'rgba(10,10,20,0.8)' }}>
              {[
                { icon: '🧠', text: 'GPT-4o real-time form analysis' },
                { icon: '🎙️', text: 'AI voice coaching during workouts' },
                { icon: '📊', text: 'Progress analytics & form trends' },
                { icon: '📋', text: 'Personalized workout programs' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <span className="text-base">{icon}</span>
                  <span className="text-[13px] text-gray-400">{text}</span>
                </div>
              ))}
              <button
                className="w-full mt-3 py-3 rounded-xl text-[13px] font-bold text-indigo-300 transition-all"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)' }}
                onClick={() => alert('Pro plan launching soon — stay tuned!')}
              >
                Notify me when it launches →
              </button>
            </div>
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
