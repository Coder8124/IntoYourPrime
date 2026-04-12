import { useState, useCallback, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getPIBriefing, getDemoBriefing } from '../lib/primeIntelligence'
import { hasApiKey } from '../lib/formAnalysis'
import type { MemberData, PIBriefing, AvatarState } from '../lib/primeIntelligence'
import { auth } from '../lib/firebase'
import {
  searchUsersByDisplayName,
  addFriend,
  getFriends,
  getPendingFriendRequests,
  acceptFriendRequest,
} from '../lib/firebaseHelpers'
import type { FriendConnection, UserProfile } from '../types/index'

const ADMIN_EMAILS = ['vishweshck3@gmail.com', 'pragun.hebbar@gmail.com']

/** Estimate calories burned using MET formula: cal = MET × weight(kg) × hours */
function estimateCalories(durationSec: number, avgRisk: number, weightKg: number): number {
  const met = avgRisk >= 60 ? 8 : avgRisk >= 30 ? 5.5 : 3.5
  return Math.round(met * weightKg * (durationSec / 3600))
}

/** Read the current user's data from the last saved session + streak */
function loadMyData(): { calories: number; streakDays: number; sessionCompleted: boolean; intensity: MemberData['intensity'] } {
  try {
    const raw = localStorage.getItem('formAI_lastSession')
    const profile = JSON.parse(localStorage.getItem('formAI_profile') ?? '{}') as Record<string, unknown>
    const weightKg = Number(profile.weight ?? 70)
    const streakDays = Number(localStorage.getItem('formAI_streak') ?? 0)

    if (!raw) return { calories: 0, streakDays, sessionCompleted: false, intensity: 'N/A' }

    const s = JSON.parse(raw) as Record<string, unknown>
    const durationSec = typeof s.sessionEndedAt === 'number' && typeof s.sessionStartTime === 'number'
      ? Math.floor((s.sessionEndedAt - s.sessionStartTime) / 1000)
      : 0
    const riskScores = Array.isArray(s.riskScores) ? (s.riskScores as number[]) : []
    const avgRisk = riskScores.length ? riskScores.reduce((a, b) => a + b, 0) / riskScores.length : 0
    const calories = estimateCalories(durationSec, avgRisk, weightKg)

    // Determine intensity from avg risk
    const intensity: MemberData['intensity'] = avgRisk >= 60 ? 'High' : avgRisk >= 30 ? 'Medium' : 'Low'

    // Check if session was today
    const sessionDate = typeof s.sessionEndedAt === 'number' ? new Date(s.sessionEndedAt) : null
    const today = new Date()
    const sessionCompleted = sessionDate
      ? sessionDate.getDate() === today.getDate() &&
        sessionDate.getMonth() === today.getMonth() &&
        sessionDate.getFullYear() === today.getFullYear()
      : false

    return { calories, streakDays, sessionCompleted, intensity }
  } catch {
    return { calories: 0, streakDays: 0, sessionCompleted: false, intensity: 'N/A' }
  }
}

// ── Avatar renderer ────────────────────────────────────────────────────────

function PIAvatar({ avatar }: { avatar: AvatarState }) {
  const glow    = Math.round(avatar.aura_glow    * 255)
  const density = Math.round(avatar.muscle_mass  * 255)
  const prime   = avatar.state_label === 'The Prime'

  const bodyColor   = `rgb(${density}, ${Math.round(density * 0.6)}, ${Math.round(density * 0.4)})`
  const glowColor   = prime ? `rgba(59,130,246,${avatar.aura_glow.toFixed(2)})` : `rgba(239,68,68,${(avatar.aura_glow * 0.6).toFixed(2)})`
  const glowSize    = Math.round(avatar.aura_glow * 80)
  const borderColor = prime ? '#3b82f6' : avatar.aura_glow > 0.4 ? '#f59e0b' : '#374151'

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Avatar silhouette */}
      <div
        className="relative"
        style={{
          width: 120, height: 160,
          filter: `drop-shadow(0 0 ${glowSize}px ${glowColor})`,
        }}
      >
        <svg viewBox="0 0 120 160" width={120} height={160}>
          {/* Head */}
          <ellipse cx={60} cy={22} rx={18} ry={20} fill={bodyColor} />
          {/* Neck */}
          <rect x={54} y={40} width={12} height={10} rx={4} fill={bodyColor} />
          {/* Torso */}
          <path
            d={`M ${30 + (1 - avatar.muscle_mass) * 8} 50
                L ${90 - (1 - avatar.muscle_mass) * 8} 50
                L ${85 - (1 - avatar.muscle_mass) * 4} 105
                L ${35 + (1 - avatar.muscle_mass) * 4} 105 Z`}
            fill={bodyColor}
          />
          {/* Left arm */}
          <path
            d={`M ${30 + (1 - avatar.symmetry) * 6} 55
                L ${10 + (1 - avatar.muscle_mass) * 6} 100
                L ${20 + (1 - avatar.muscle_mass) * 4} 103
                L ${38} 58 Z`}
            fill={bodyColor}
          />
          {/* Right arm */}
          <path
            d={`M ${90 - (1 - avatar.symmetry) * 6} 55
                L ${110 - (1 - avatar.muscle_mass) * 6} 100
                L ${100 - (1 - avatar.muscle_mass) * 4} 103
                L ${82} 58 Z`}
            fill={bodyColor}
          />
          {/* Left leg */}
          <path
            d={`M ${40} 105 L ${32} 155 L ${46} 157 L ${52} 107 Z`}
            fill={bodyColor}
          />
          {/* Right leg */}
          <path
            d={`M ${80} 105 L ${88} 155 L ${74} 157 L ${68} 107 Z`}
            fill={bodyColor}
          />
          {/* Vascularity overlay (subtle veins) */}
          {avatar.vascularity > 0.5 && (
            <>
              <line x1={38} y1={60} x2={22} y2={92} stroke={`rgba(220,38,38,${((avatar.vascularity - 0.5) * 1.2).toFixed(2)})`} strokeWidth={1.2} />
              <line x1={82} y1={60} x2={98} y2={92} stroke={`rgba(220,38,38,${((avatar.vascularity - 0.5) * 1.2).toFixed(2)})`} strokeWidth={1.2} />
            </>
          )}
          {/* Aura particles */}
          {prime && avatar.aura_glow > 0.6 && (
            <>
              <circle cx={20} cy={40} r={3} fill={glowColor} opacity={0.7} />
              <circle cx={100} cy={35} r={2} fill={glowColor} opacity={0.6} />
              <circle cx={15} cy={80} r={2} fill={glowColor} opacity={0.5} />
              <circle cx={105} cy={75} r={3} fill={glowColor} opacity={0.6} />
            </>
          )}
        </svg>
      </div>

      {/* State label */}
      <div
        className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider"
        style={{
          background: prime ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.12)',
          border:     `1px solid ${borderColor}`,
          color:      prime ? '#93c5fd' : '#fca5a5',
        }}
      >
        {avatar.state_label}
      </div>

      {/* Stat bars */}
      <div className="w-full space-y-1.5 mt-1">
        {([
          ['Muscle Mass',     avatar.muscle_mass,    '#3b82f6'],
          ['Aura',            avatar.aura_glow,      '#8b5cf6'],
          ['Symmetry',        avatar.symmetry,       '#22c55e'],
          ['Vascularity',     avatar.vascularity,    '#ef4444'],
          ['Metabolic Aura',  avatar.metabolic_aura, '#f59e0b'],
        ] as [string, number, string][]).map(([label, val, color]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[9px] text-gray-600 w-[68px] shrink-0">{label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/5">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.round(val * 100)}%`, background: color }}
              />
            </div>
            <span className="text-[9px] font-mono text-gray-600 w-6 text-right">{Math.round(val * 100)}</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-gray-600 italic">{avatar.dominant_modality} modality</p>
    </div>
  )
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PIBriefing['status'] }) {
  const cfg = {
    OPTIMAL:    { label: 'OPTIMAL',     bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.4)',   text: '#86efac' },
    'SUB-OPTIMAL': { label: 'SUB-OPTIMAL', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)', text: '#fcd34d' },
    CRITICAL:   { label: 'CRITICAL',    bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.4)',   text: '#fca5a5' },
  }[status]

  return (
    <span
      className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-[0.18em]"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text }}
    >
      {cfg.label}
    </span>
  )
}

// ── Optimization score bar ─────────────────────────────────────────────────

function OptBar({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-white/5">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <span className="text-[11px] font-mono font-bold w-7 text-right" style={{ color }}>{score}</span>
      <span className="text-[10px] text-gray-600 w-28 truncate">{label}</span>
    </div>
  )
}

// ── Default demo members ───────────────────────────────────────────────────

const DEFAULT_MEMBERS: MemberData[] = [
  { name: 'You',    sessionCompleted: false, calories: 0, intensity: 'N/A', streakDays: 0 },
  { name: 'Alex',   sessionCompleted: false, calories: 0, intensity: 'N/A', streakDays: 0 },
  { name: 'Jordan', sessionCompleted: false, calories: 0, intensity: 'N/A', streakDays: 0 },
]

// ── FriendsPage ────────────────────────────────────────────────────────────

export function FriendsPage() {
  const isAdmin = ADMIN_EMAILS.includes(auth.currentUser?.email ?? '')
  const myUid   = auth.currentUser?.uid ?? null
  const myName  = (JSON.parse(localStorage.getItem('formAI_profile') ?? '{}') as Record<string, unknown>).name as string | undefined

  const [members,      setMembers]      = useState<MemberData[]>(() => {
    const myData = loadMyData()
    return DEFAULT_MEMBERS.map((m, i) =>
      i === 0 ? { ...m, ...myData } : m
    )
  })
  const [groupStreak,  setGroupStreak]  = useState(0)
  const [briefing,     setBriefing]     = useState<PIBriefing | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // ── Squad state ────────────────────────────────────────────────────────
  const [myFriends,       setMyFriends]       = useState<FriendConnection[]>([])
  const [pendingRequests, setPendingRequests] = useState<FriendConnection[]>([])
  const [squadLoading,    setSquadLoading]    = useState(true)
  const [searchQuery,     setSearchQuery]     = useState('')
  const [searchResults,   setSearchResults]   = useState<UserProfile[]>([])
  const [searchBusy,      setSearchBusy]      = useState(false)
  const [sentTo,          setSentTo]          = useState<Set<string>>(new Set())
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load friends + pending on mount
  useEffect(() => {
    if (!myUid) { setSquadLoading(false); return }
    Promise.all([getFriends(myUid), getPendingFriendRequests(myUid)])
      .then(([friends, pending]) => {
        setMyFriends(friends)
        setPendingRequests(pending)
        if (friends.length > 0) {
          const myData = loadMyData()
          setMembers([
            { name: myName || 'You', ...myData },
            ...friends.map(f => ({
              name: f.friendDisplayName || 'Friend',
              sessionCompleted: false,
              calories: 0,
              intensity: 'N/A' as MemberData['intensity'],
              streakDays: 0,
            })),
          ])
        }
      })
      .catch(() => {})
      .finally(() => setSquadLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUid])

  // Debounced displayName search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!searchQuery.trim()) { setSearchResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearchBusy(true)
      try {
        const results = await searchUsersByDisplayName(searchQuery)
        setSearchResults(results.filter(u => u.uid !== myUid))
      } catch { /* ignore */ } finally {
        setSearchBusy(false)
      }
    }, 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [searchQuery, myUid])

  const handleAddFriend = async (profile: UserProfile) => {
    if (!myUid) return
    setSentTo(prev => new Set(prev).add(profile.uid))
    try { await addFriend(myUid, profile) } catch { /* ignore */ }
  }

  const handleAccept = async (conn: FriendConnection) => {
    try {
      await acceptFriendRequest(conn.id)
      setPendingRequests(prev => prev.filter(r => r.id !== conn.id))
      setMyFriends(prev => [...prev, { ...conn, status: 'accepted' }])
      setMembers(prev => [...prev, {
        name: conn.friendDisplayName || 'Friend',
        sessionCompleted: false,
        calories: 0,
        intensity: 'N/A' as MemberData['intensity'],
        streakDays: 0,
      }])
    } catch { /* ignore */ }
  }

  // Refresh "You" row whenever the page gains focus (after a workout)
  useEffect(() => {
    const refresh = () => {
      const myData = loadMyData()
      setMembers(prev => prev.map((m, i) => i === 0 ? { ...m, ...myData } : m))
    }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  // ── Member editor ──────────────────────────────────────────────────────
  const updateMember = (i: number, patch: Partial<MemberData>) => {
    if (!isAdmin) return  // only admins can edit
    setMembers(prev => prev.map((m, idx) => idx === i ? { ...m, ...patch } : m))
  }

  const addMember = () =>
    setMembers(prev => [...prev, { name: `Member ${prev.length + 1}`, sessionCompleted: false, calories: 0, intensity: 'N/A', streakDays: 0 }])

  const removeMember = (i: number) =>
    setMembers(prev => prev.filter((_, idx) => idx !== i))

  // ── Run PI ─────────────────────────────────────────────────────────────
  const runPI = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (hasApiKey()) {
        const result = await getPIBriefing(members, groupStreak)
        if (result) {
          setBriefing(result)
        } else {
          setError('PI returned no data — check your API key.')
        }
      } else {
        // Demo mode: generate locally without API
        setBriefing(getDemoBriefing(members, groupStreak))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [members, groupStreak])

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white pb-12">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0d0d18]/90 backdrop-blur border-b border-[#1e1e2e] px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/home" className="text-sm font-semibold text-blue-400 hover:text-blue-300">← Home</Link>
          <div className="w-px h-4 bg-[#1e1e2e]" />
          <h1 className="font-black text-white tracking-tight">
            Prime Intelligence
            <span className="ml-2 text-[10px] font-bold tracking-[0.15em] uppercase text-blue-400">PI</span>
          </h1>
        </div>
        {briefing && <StatusBadge status={briefing.status} />}
      </header>

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-6">

        {/* ── Squad / Friends ──────────────────────────────────────────── */}
        <div className="card-surface p-5 space-y-4">
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-gray-500">Your Squad</p>

          {/* Search bar */}
          {myUid ? (
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by display name…"
                className="input-dark w-full pr-10 text-[13px]"
                autoComplete="off"
              />
              {searchBusy && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-[11px]">…</span>
              )}
            </div>
          ) : (
            <p className="text-[12px] text-gray-600">Sign in to search for friends.</p>
          )}

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map(u => {
                const alreadyFriend = myFriends.some(f => f.friendId === u.uid)
                const sent = sentTo.has(u.uid)
                return (
                  <div key={u.uid} className="flex items-center justify-between p-3 rounded-xl bg-[#0f0f1a] border border-[#1e1e2e]">
                    <div>
                      <p className="text-[13px] font-semibold text-white">{u.displayName}</p>
                      <p className="text-[11px] text-gray-600">{u.email}</p>
                    </div>
                    {alreadyFriend ? (
                      <span className="text-[11px] font-bold text-green-400">In squad</span>
                    ) : sent ? (
                      <span className="text-[11px] font-bold text-amber-400">Sent</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddFriend(u)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[12px] font-bold text-white transition-colors"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Pending incoming requests */}
          {pendingRequests.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-400">Incoming Requests</p>
              {pendingRequests.map(req => (
                <div key={req.id} className="flex items-center justify-between p-3 rounded-xl bg-[#0f0f1a] border border-amber-900/30">
                  <p className="text-[13px] font-semibold text-white">{req.friendDisplayName || req.friendEmail || 'Someone'}</p>
                  <button
                    type="button"
                    onClick={() => handleAccept(req)}
                    className="px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-[12px] font-bold text-white transition-colors"
                  >
                    Accept
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Current squad */}
          {squadLoading ? (
            <p className="text-[12px] text-gray-600">Loading squad…</p>
          ) : myFriends.length === 0 && pendingRequests.length === 0 ? (
            <p className="text-[12px] text-gray-600">No squad members yet — search above to add friends.</p>
          ) : myFriends.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-600">Members</p>
              {myFriends.map(f => (
                <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#0f0f1a] border border-[#1e1e2e]">
                  <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-[12px] font-black text-blue-400">
                    {(f.friendDisplayName || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-white">{f.friendDisplayName}</p>
                    {f.sharedStreak > 0 && (
                      <p className="text-[11px] text-amber-400">{f.sharedStreak}-day shared streak</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* ── Group setup ─────────────────────────────────────────────── */}
        <div className="card-surface p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-gray-500">Group Data</p>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500">Group streak</span>
              <input
                type="number"
                value={groupStreak}
                onChange={e => isAdmin && setGroupStreak(Math.max(0, Number(e.target.value)))}
                className="input-dark w-16 text-center text-[13px] py-1"
                min={0}
                readOnly={!isAdmin}
              />
              <span className="text-[11px] text-gray-600">days</span>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 px-3 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-600">Member</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-600 w-[90px] text-center">Intensity</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-600 w-20 text-center">Cal burned</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-600 w-16 text-center">Streak</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-600 w-16 text-center">Session</span>
            <span className="w-5" />
          </div>

          <div className="space-y-2">
            {members.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 items-center p-3 rounded-xl bg-[#0f0f1a] border border-[#1e1e2e]">
                <input
                  value={m.name}
                  onChange={e => updateMember(i, { name: e.target.value })}
                  className="input-dark text-[13px] py-1.5"
                  placeholder="Name"
                  readOnly={!isAdmin}
                />
                <select
                  value={m.intensity}
                  onChange={e => updateMember(i, { intensity: e.target.value as MemberData['intensity'] })}
                  className="input-dark text-[12px] py-1.5 w-[90px]"
                  disabled={!isAdmin}
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                  <option value="N/A">N/A</option>
                </select>
                <input
                  type="number"
                  value={m.calories ?? 0}
                  onChange={e => updateMember(i, { calories: Number(e.target.value) })}
                  className="input-dark w-20 text-[12px] py-1.5 text-center"
                  placeholder="0"
                  min={0}
                  readOnly={!isAdmin}
                />
                <input
                  type="number"
                  value={m.streakDays}
                  onChange={e => updateMember(i, { streakDays: Number(e.target.value) })}
                  className="input-dark w-16 text-[12px] py-1.5 text-center"
                  placeholder="0"
                  min={0}
                  readOnly={!isAdmin}
                />
                <button
                  type="button"
                  onClick={() => isAdmin && updateMember(i, { sessionCompleted: !m.sessionCompleted })}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors"
                  style={{
                    ...(m.sessionCompleted
                      ? { background: 'rgba(34,197,94,0.15)', color: '#86efac', border: '1px solid rgba(34,197,94,0.3)' }
                      : { background: 'rgba(239,68,68,0.10)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }),
                    ...(!isAdmin ? { cursor: 'default', opacity: 0.7 } : {}),
                  }}
                >
                  {m.sessionCompleted ? 'Done' : 'Missed'}
                </button>
                {isAdmin && members.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMember(i)}
                    className="text-gray-700 hover:text-red-400 transition-colors text-lg leading-none"
                  >
                    ×
                  </button>
                )}
                {!isAdmin && <span className="w-5" />}
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            {isAdmin && (
              <button type="button" onClick={addMember}
                className="px-4 py-2 rounded-xl border border-[#2e2e3e] text-gray-500 text-[12px] font-semibold hover:border-gray-600 hover:text-gray-300 transition-colors">
                + Add Member
              </button>
            )}
            <button
              type="button"
              onClick={runPI}
              disabled={loading}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-black text-[14px] text-white transition-colors"
              style={{ boxShadow: loading ? 'none' : '0 0 24px rgba(59,130,246,0.35)' }}
            >
              {loading ? 'Analyzing…' : 'Run Prime Intelligence'}
            </button>
          </div>

          {!hasApiKey() && (
            <p className="text-[11px] text-amber-500/70 text-center">
              No API key — running in demo mode. Add a key in Profile for full AI analysis.
            </p>
          )}
          {error && <p className="text-[12px] text-red-400 text-center">{error}</p>}
        </div>

        {/* ── PI Briefing output ───────────────────────────────────────── */}
        {briefing && (
          <>
            {/* Status + Headline */}
            <div
              className="card-surface p-6 space-y-3"
              style={{ borderColor: briefing.status === 'OPTIMAL' ? 'rgba(34,197,94,0.25)' : briefing.status === 'CRITICAL' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)' }}
            >
              <div className="flex items-center gap-3">
                <StatusBadge status={briefing.status} />
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">Prime Intelligence Briefing</span>
              </div>
              <h2 className="font-black text-[20px] tracking-tight text-white">{briefing.headline}</h2>
              <p className="text-gray-400 text-[13px] leading-relaxed">{briefing.groupSummary}</p>
            </div>

            {/* Avatar + Leaderboard row */}
            <div className="grid grid-cols-[auto_1fr] gap-5">

              {/* Avatar */}
              <div className="card-surface p-5 w-52">
                <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-500 mb-4 text-center">Group Avatar</p>
                <PIAvatar avatar={briefing.avatar} />
              </div>

              {/* Leaderboard */}
              <div className="card-surface p-5 space-y-3">
                <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-gray-500">Optimization Leaderboard</p>
                <div className="space-y-3">
                  {briefing.leaderboard.map((entry, i) => (
                    <div key={entry.name} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-gray-600">#{i + 1}</span>
                        <span className="text-[13px] font-bold text-white">{entry.name}</span>
                        <span
                          className="ml-auto px-2 py-0.5 rounded text-[10px] font-bold"
                          style={{
                            background: entry.label.includes('Catalyst') ? 'rgba(59,130,246,0.15)'
                              : entry.label.includes('Anchor') ? 'rgba(239,68,68,0.12)'
                              : 'rgba(255,255,255,0.05)',
                            color: entry.label.includes('Catalyst') ? '#93c5fd'
                              : entry.label.includes('Anchor') ? '#fca5a5'
                              : '#6b7280',
                          }}
                        >
                          {entry.label}
                        </span>
                      </div>
                      <OptBar score={entry.optimizationScore} label="" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Catalyst + Anchor */}
            {(briefing.catalyst || briefing.anchor) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {briefing.catalyst && (
                  <div className="card-surface p-5 space-y-2"
                    style={{ borderColor: 'rgba(59,130,246,0.3)' }}>
                    <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-blue-400">The Catalyst</p>
                    <p className="font-black text-white text-[17px]">{briefing.catalyst.name}</p>
                    <p className="text-gray-400 text-[12px] leading-relaxed">{briefing.catalyst.message}</p>
                  </div>
                )}
                {briefing.anchor && (
                  <div className="card-surface p-5 space-y-2"
                    style={{ borderColor: 'rgba(239,68,68,0.25)' }}>
                    <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-red-400">The Anchor</p>
                    <p className="font-black text-white text-[17px]">{briefing.anchor.name}</p>
                    <p className="text-gray-400 text-[12px] leading-relaxed">{briefing.anchor.message}</p>
                    {briefing.burden && (
                      <p className="text-[11px] text-red-400/70 italic mt-1">{briefing.burden}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Prime Streak */}
            <div className="card-surface p-5"
              style={{ borderColor: briefing.primeStreak.statusLabel === 'HOLDING' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-gray-500">Prime Streak</p>
                <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded"
                  style={{
                    background: briefing.primeStreak.statusLabel === 'HOLDING' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                    color:      briefing.primeStreak.statusLabel === 'HOLDING' ? '#fcd34d' : '#fca5a5',
                  }}>
                  {briefing.primeStreak.statusLabel}
                </span>
              </div>
              <div className="flex items-end gap-2 mb-1">
                <span className="font-black text-white leading-none" style={{ fontSize: 48 }}>{briefing.primeStreak.days}</span>
                <span className="text-gray-500 text-[13px] mb-2">days</span>
              </div>
              <p className="text-gray-400 text-[12px] leading-relaxed">{briefing.primeStreak.message}</p>
            </div>

            {/* Duo Links */}
            {briefing.duoLinks.length > 0 && (
              <div className="card-surface p-5 space-y-3">
                <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-gray-500">Mutual Optimization Pacts</p>
                {briefing.duoLinks.map((duo, i) => (
                  <div key={i} className="p-3 rounded-xl bg-[#0f0f1a] border border-[#1e1e2e] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-[13px]">{duo.memberA} × {duo.memberB}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                        style={{
                          background: duo.status === 'Active' ? 'rgba(34,197,94,0.12)' : duo.status === 'Critical' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                          color:      duo.status === 'Active' ? '#86efac' : duo.status === 'Critical' ? '#fcd34d' : '#fca5a5',
                        }}>
                        {duo.status}
                      </span>
                    </div>
                    <p className="text-gray-500 text-[11px]">{duo.streakDays}-day pact · {duo.message}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Directive */}
            <div className="card-surface p-5"
              style={{ borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)' }}>
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-red-400 mb-2">Warden's Directive</p>
              <p className="text-white font-semibold text-[14px] leading-relaxed">"{briefing.directive}"</p>
            </div>

            {/* Raw avatar tags (for devs) */}
            <details className="card-surface p-4">
              <summary className="text-[11px] text-gray-600 cursor-pointer hover:text-gray-400 transition-colors">
                Avatar visual tags (JSON)
              </summary>
              <pre className="mt-3 text-[11px] text-gray-400 overflow-auto">
                {JSON.stringify(briefing.avatar, null, 2)}
              </pre>
            </details>
          </>
        )}
      </div>
    </div>
  )
}
