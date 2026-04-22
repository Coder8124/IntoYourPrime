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

  const FEATURES = [
    { icon: '🤖', title: 'AI Form Analysis',      desc: 'GPT-4o vision watches your technique every 15s and gives real coaching feedback' },
    { icon: '⚡', title: 'Injury Risk Score',      desc: 'Real-time geometry scoring blended with AI — turns red when your form breaks down' },
    { icon: '🎙️', title: 'Voice Coaching',         desc: 'OpenAI TTS speaks feedback out loud so you never break your flow' },
    { icon: '🔥', title: 'Fatigue Detection',      desc: 'Alerts you when form degrades mid-set before injury happens' },
    { icon: '📈', title: 'Progress Dashboard',     desc: 'Form trends, volume charts, personal bests across all sessions' },
    { icon: '🎯', title: 'Progressive Overload',   desc: 'AI suggests next session\'s rep targets based on your form score' },
    { icon: '🧘', title: 'AI Cooldown',            desc: 'Personalized stretches generated based on what you actually trained' },
    { icon: '📓', title: 'Recovery Log',           desc: 'Track sleep, soreness, energy — AI cross-references with your workouts' },
    { icon: '🔢', title: 'Auto Rep Counting',      desc: 'MediaPipe tracks 33 body landmarks at 30fps — reps count themselves' },
    { icon: '👥', title: 'Squad Accountability',   desc: 'Friend leaderboard, streaks, and Prime Intelligence weekly rankings' },
  ]

  return (
    <div className="min-h-screen bg-[#07070e] pb-24 text-white">

      {/* ── Top nav ── */}
      <nav className="sticky top-0 z-30 flex items-center justify-between px-5 py-4"
        style={{ background: 'rgba(7,7,14,0.85)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Link to="/home" className="text-[14px] font-black uppercase tracking-[0.18em] text-blue-400 hover:text-blue-300 transition-colors">
          IntoYourPrime
        </Link>
        <Link to="/profile" className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-black text-white transition-opacity hover:opacity-70"
          style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}>
          {welcomeName.slice(0, 1).toUpperCase()}
        </Link>
      </nav>

      {/* ── 3-column layout ── */}
      <div className="mx-auto max-w-7xl px-4 pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_280px] gap-6 items-start">

          {/* ════ LEFT SIDEBAR — Features ════ */}
          <aside className="order-2 lg:order-1 space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-500 px-1">What it does</h2>

            {FEATURES.map(f => (
              <div key={f.title} className="flex gap-3 rounded-xl p-3" style={{ background: '#111119', border: '1px solid #1e1e2e' }}>
                <span className="text-xl shrink-0">{f.icon}</span>
                <div>
                  <p className="text-[13px] font-black text-white">{f.title}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}

            {/* Rep counting chip list */}
            <div className="rounded-xl p-3" style={{ background: 'linear-gradient(135deg,rgba(59,130,246,0.08),rgba(124,58,237,0.06))', border: '1px solid rgba(59,130,246,0.18)' }}>
              <p className="text-[11px] font-bold text-blue-400 mb-2">Supported exercises</p>
              <div className="flex flex-wrap gap-1">
                {['Squat','Push-Up','Lunge','Deadlift','Shoulder Press','Curl-Up','Bicep Curl','Hammer Curl','Tricep Ext','Lateral Raise','Pull-Up','Jumping Jack','High Knees','Plank','Wall Sit'].map(ex => (
                  <span key={ex} className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-blue-300 bg-blue-500/10 border border-blue-500/20">{ex}</span>
                ))}
              </div>
            </div>
          </aside>

          {/* ════ CENTER — Main content ════ */}
          <main className="order-1 lg:order-2 min-w-0">

            {/* Hero */}
            <header className="relative pt-6 pb-2">
              <p className="text-[15px] text-gray-400">{timeGreeting()}</p>
              <h1 className="mt-1 text-5xl font-black tracking-tight leading-none">{welcomeName}</h1>
              <div className="mt-4 inline-flex items-center gap-2.5 rounded-full px-5 py-2.5"
                style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.22)' }}>
                <Flame className="h-5 w-5 text-amber-400" />
                <span className="text-[15px] font-semibold text-amber-200">
                  <span className="font-mono text-[18px] font-black">{streak}</span>
                  <span className="ml-1.5 text-amber-300/70"> day streak</span>
                </span>
              </div>
              <div className="absolute top-6 right-0 opacity-60 rounded-2xl p-2"
                style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.14)' }}>
                <PoseSkeletonDecor size={90} />
              </div>
            </header>

            {/* Daily quote */}
            {(() => {
              const q = getDailyQuote()
              return (
                <div className="mt-5 rounded-2xl px-5 py-4"
                  style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)' }}>
                  <p className="text-[14px] leading-relaxed text-gray-300 italic">&ldquo;{q.text}&rdquo;</p>
                  {q.author !== 'Unknown' && (
                    <p className="mt-1.5 text-[11px] font-semibold text-indigo-400">— {q.author}</p>
                  )}
                </div>
              )
            })()}

            {/* CTA */}
            <div className="mt-5">
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
                <Link to="/programs" className="flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-bold text-blue-400 transition-all hover:text-blue-300"
                  style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                  📋 Programs
                </Link>
                <Link to="/library" className="flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-bold text-purple-400 transition-all hover:text-purple-300"
                  style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  📖 Library
                </Link>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Link to="/session-summary" className="flex items-center justify-center rounded-xl py-2.5 text-[12px] font-semibold text-gray-400 hover:text-white transition-colors"
                  style={{ background: '#111119', border: '1px solid #1e1e2e' }}>Last session →</Link>
                <Link to="/progress" className="flex items-center justify-center rounded-xl py-2.5 text-[12px] font-semibold text-gray-400 hover:text-white transition-colors"
                  style={{ background: '#111119', border: '1px solid #1e1e2e' }}>Progress →</Link>
                <Link to="/friends" className="flex items-center justify-center rounded-xl py-2.5 text-[12px] font-semibold text-gray-400 hover:text-white transition-colors"
                  style={{ background: '#111119', border: '1px solid #1e1e2e' }}>Squad →</Link>
              </div>
            </div>

            {/* Recent sessions */}
            <section className="mt-8">
              <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.2em] text-gray-500">Recent sessions</h2>
              {loading ? (
                <div className="space-y-2">
                  {[1,2].map(i => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: '#111119' }} />)}
                </div>
              ) : sessions.length === 0 ? (
                <div className="rounded-2xl p-6 text-center" style={{ background: '#111119', border: '1px solid #1e1e2e' }}>
                  <p className="text-2xl mb-2">🏋️</p>
                  <p className="text-[14px] text-gray-500">No sessions yet — complete your first workout!</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {sessions.map((s) => (
                    <li key={s.id} className="rounded-xl px-4 py-3.5 hover:border-blue-500/30 transition-colors"
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

            {/* Recovery insight */}
            <section className="mt-8">
              <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.2em] text-gray-500">Recovery insight</h2>
              <div className="rounded-2xl p-5" style={{ background: '#111119', border: '1px solid #1e1e2e' }}>
                {!sessionCountForInsight ? (
                  <div className="flex items-start gap-3">
                    <span className="text-xl">🔒</span>
                    <p className="text-[14px] leading-relaxed text-gray-500">Complete 5 sessions to unlock personalized recovery insights.</p>
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

            {/* Friends feed */}
            <section className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.2em] text-gray-500">Friends</h2>
                <Link to="/friends" className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors">Prime Intelligence →</Link>
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

            {/* Footer */}
            <div className="mt-12 flex justify-center gap-6 border-t border-[#111119] pt-6 pb-4">
              <Link to="/profile" className="text-[12px] text-gray-600 hover:text-gray-400 transition-colors">Profile</Link>
              <Link to="/pipeline-test" className="text-[12px] text-gray-600 hover:text-gray-400 transition-colors">Pipeline test</Link>
              <Link to="/recovery-log" className="text-[12px] text-gray-600 hover:text-gray-400 transition-colors">Recovery log</Link>
            </div>
          </main>

          {/* ════ RIGHT SIDEBAR — API key + Coming soon ════ */}
          <aside className="order-3 space-y-4">

            {/* API key — always visible when not set */}
            {!apiKeySet ? (
              <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.10),rgba(234,88,12,0.08))', border: '1px solid rgba(245,158,11,0.3)', boxShadow: '0 0 24px rgba(245,158,11,0.08)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">⚡</span>
                  <p className="text-[13px] font-black text-amber-200">Add OpenAI Key</p>
                </div>
                <p className="text-[11px] text-amber-400/70 mb-3 leading-relaxed">
                  Unlocks real-time AI form coaching, voice feedback &amp; personalized insights.
                </p>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveApiKey()}
                  placeholder="sk-proj-…"
                  className="input-dark w-full font-mono text-[12px] mb-2"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  disabled={!apiKeyInput.trim()}
                  className="w-full rounded-xl py-2.5 text-[13px] font-black text-black transition-colors disabled:opacity-40"
                  style={{ background: '#f59e0b' }}
                >
                  Save key →
                </button>
                <p className="mt-2 text-[10px] text-amber-700">Stored locally · never sent to a server</p>
              </div>
            ) : (
              <div className="rounded-xl px-4 py-3 flex items-center gap-2" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <span className="text-green-400 text-sm">✓</span>
                <p className="text-[12px] font-semibold text-green-400">AI coaching active</p>
              </div>
            )}

            {/* Pro coming soon */}
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(99,102,241,0.3)' }}>
              <div className="px-4 py-3 flex items-center justify-between"
                style={{ background: 'linear-gradient(135deg,rgba(59,130,246,0.12),rgba(124,58,237,0.12))' }}>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-400">Pro</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Soon</span>
                  </div>
                  <p className="text-[13px] font-bold text-white">$15 / month</p>
                </div>
                <span className="text-xl opacity-60">🔒</span>
              </div>
              <div className="px-4 py-3 space-y-2" style={{ background: 'rgba(10,10,20,0.8)' }}>
                {[
                  { icon: '🧠', text: 'GPT-4o real-time analysis' },
                  { icon: '🎙️', text: 'AI voice coaching' },
                  { icon: '📊', text: 'Advanced analytics' },
                  { icon: '📋', text: 'Custom programs' },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-center gap-2">
                    <span className="text-sm">{icon}</span>
                    <span className="text-[12px] text-gray-400">{text}</span>
                  </div>
                ))}
                <button
                  className="w-full mt-2 py-2.5 rounded-xl text-[12px] font-bold text-indigo-300 transition-all"
                  style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)' }}
                  onClick={() => alert('Pro plan launching soon — stay tuned!')}
                >
                  Notify me →
                </button>
              </div>
            </div>

            {/* Basketball coming soon */}
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(234,88,12,0.3)' }}>
              <div className="px-4 py-3 flex items-center justify-between"
                style={{ background: 'linear-gradient(135deg,rgba(234,88,12,0.12),rgba(245,158,11,0.10))' }}>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-orange-400">Basketball</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-orange-500/20 text-orange-300 border border-orange-500/30">Soon</span>
                  </div>
                  <p className="text-[13px] font-black text-white">Shooting Form Tracker</p>
                </div>
                <span className="text-2xl">🏀</span>
              </div>
              <div className="px-4 py-3 space-y-2" style={{ background: 'rgba(10,10,20,0.8)' }}>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Real-time shooting mechanics analysis — elbow, release point, follow-through &amp; arc.
                </p>
                {[
                  { icon: '📐', text: 'Elbow tuck & wrist alignment' },
                  { icon: '🎯', text: 'Release point consistency' },
                  { icon: '🔄', text: 'Follow-through & arc scoring' },
                  { icon: '📊', text: 'Shot-by-shot breakdown' },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-center gap-2">
                    <span className="text-sm">{icon}</span>
                    <span className="text-[12px] text-gray-400">{text}</span>
                  </div>
                ))}
              </div>
            </div>

          </aside>
        </div>
      </div>
    </div>
  )
}
