import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BottomNav } from '../components/BottomNav'
import { getLeaderboard, getWeeklyChallengeLeaderboard } from '../lib/firebaseHelpers'
import { scoreGrade } from '../lib/workoutScore'
import { getCurrentChallenge, getWeekKey } from '../lib/challenges'
import { auth } from '../lib/firebase'
import type { UserProfile } from '../types/index'

type Tab = 'alltime' | 'weekly'
type LevelFilter = 'all' | 'beginner' | 'intermediate' | 'advanced'

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-[20px]">🥇</span>
  if (rank === 2) return <span className="text-[20px]">🥈</span>
  if (rank === 3) return <span className="text-[20px]">🥉</span>
  return <span className="text-[13px] font-black text-gray-500 w-7 text-center">{rank}</span>
}

export function LeaderboardPage() {
  const myUid = auth.currentUser?.uid ?? null
  const challenge = getCurrentChallenge()
  const weekKey = getWeekKey()

  const [tab,           setTab]           = useState<Tab>('alltime')
  const [levelFilter,   setLevelFilter]   = useState<LevelFilter>('all')
  const [allTimeList,   setAllTimeList]   = useState<UserProfile[]>([])
  const [weeklyList,    setWeeklyList]    = useState<UserProfile[]>([])
  const [loading,       setLoading]       = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getLeaderboard(100),
      getWeeklyChallengeLeaderboard(weekKey, 100),
    ]).then(([allTime, weekly]) => {
      setAllTimeList(allTime)
      setWeeklyList(weekly)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [weekKey])

  const displayList = (tab === 'alltime' ? allTimeList : weeklyList)
    .filter(u => levelFilter === 'all' || u.fitnessLevel === levelFilter)

  return (
    <div className="min-h-screen bg-page pb-24 text-white">
      <header className="sticky top-0 z-10 px-5 py-4"
        style={{ background: 'rgba(var(--bg-rgb),0.92)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/home" className="text-[13px] font-semibold text-accent hover:text-accent/80">← Home</Link>
            <span className="text-[14px] font-black tracking-tight">🏆 Leaderboard</span>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-5 pt-6 space-y-5">

        {/* Tab nav */}
        <div className="flex gap-1 p-1 rounded-xl bg-panel border border-subtle">
          {([['alltime', 'All Time'], ['weekly', `This Week`]] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className="flex-1 py-2 rounded-lg text-[12px] font-bold transition-colors"
              style={tab === id
                ? { background: 'rgba(59,130,246,0.2)', color: '#93c5fd' }
                : { color: '#4b5563' }
              }>
              {label}
            </button>
          ))}
        </div>

        {/* Weekly challenge banner */}
        {tab === 'weekly' && (
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[16px]">{challenge.icon}</span>
              <p className="text-[12px] font-black uppercase tracking-wider text-amber-400">{challenge.title}</p>
            </div>
            <p className="text-[12px] text-gray-400">{challenge.description}</p>
            <p className="text-[10px] text-gray-600 mt-1">Resets Monday · Week {weekKey}</p>
          </div>
        )}

        {/* Level filter */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'beginner', 'intermediate', 'advanced'] as const).map(f => (
            <button key={f} type="button" onClick={() => setLevelFilter(f)}
              className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors capitalize"
              style={levelFilter === f
                ? { background: 'rgba(59,130,246,0.2)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.4)' }
                : { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }
              }>
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : displayList.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-[40px]">🏋️</p>
            <p className="text-[15px] font-bold text-white">No scores yet</p>
            <p className="text-[13px] text-gray-500">Complete a workout to appear here!</p>
            <Link to="/workout"
              className="inline-block mt-4 px-6 py-3 rounded-xl bg-accent hover:bg-accent/90 font-bold text-white transition-colors">
              Start Workout →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {displayList.map((user, i) => {
              const isMe = user.uid === myUid
              const value = tab === 'weekly'
                ? (user.weeklyProgress?.value ?? 0)
                : (user.avgWorkoutScore ?? 0)
              const g = tab === 'alltime' && user.avgWorkoutScore != null
                ? scoreGrade(user.avgWorkoutScore)
                : null
              const pct = tab === 'weekly' && challenge.target > 0
                ? Math.min((value / challenge.target) * 100, 100)
                : null
              const initial = (user.displayName || user.email || '?')[0].toUpperCase()

              return (
                <Link key={user.uid} to={`/profile/${user.uid}`}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all block"
                  style={isMe
                    ? { background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)' }
                    : { background: 'var(--surface)', border: '1px solid var(--border)' }
                  }>
                  <RankBadge rank={i + 1} />

                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-black shrink-0"
                    style={{
                      background: isMe ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
                      border: isMe ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.1)',
                      color: isMe ? '#93c5fd' : '#9ca3af',
                    }}>
                    {initial}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-white truncate">
                      {user.displayName || user.email}
                      {isMe && <span className="text-blue-400 text-[11px] ml-1.5">(you)</span>}
                    </p>
                    {user.fitnessLevel && (
                      <p className="text-[11px] text-gray-600 capitalize">{user.fitnessLevel}</p>
                    )}
                    {pct !== null && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-white/5">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: pct >= 100 ? '#22c55e' : '#f59e0b' }} />
                        </div>
                        <span className="text-[10px] font-bold text-gray-500">{value}/{challenge.target}</span>
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    {g ? (
                      <>
                        <p className="text-[22px] font-black leading-none" style={{ color: g.color }}>{value}</p>
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded"
                          style={{ background: `${g.color}20`, color: g.color }}>
                          {g.grade}
                        </span>
                      </>
                    ) : (
                      <p className="text-[18px] font-black text-amber-400">{value}</p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        <p className="text-[11px] text-gray-700 text-center pb-4">
          {tab === 'alltime' ? `${displayList.length} athletes ranked` : `Rankings reset every Monday`}
        </p>
      </div>

      <BottomNav />
    </div>
  )
}
