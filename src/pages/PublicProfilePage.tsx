import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BottomNav } from '../components/BottomNav'
import { getUserProfile, addFriend, getFriends, getOutgoingFriendRequests } from '../lib/firebaseHelpers'
import { auth } from '../lib/firebase'
import { scoreGrade } from '../lib/workoutScore'
import type { UserProfile } from '../types/index'

export function PublicProfilePage() {
  const { uid } = useParams<{ uid: string }>()
  const myUid = auth.currentUser?.uid ?? null
  const myName = (() => {
    try { return (JSON.parse(localStorage.getItem('formAI_profile') ?? '{}') as Record<string,unknown>).name as string ?? '' }
    catch { return '' }
  })()

  const [profile,       setProfile]       = useState<UserProfile | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [friendStatus,  setFriendStatus]  = useState<'none' | 'friends' | 'pending' | 'self'>('none')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionDone,    setActionDone]    = useState(false)

  useEffect(() => {
    if (!uid) return
    setLoading(true)
    getUserProfile(uid)
      .then(p => setProfile(p))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [uid])

  useEffect(() => {
    if (!uid || !myUid) return
    if (uid === myUid) { setFriendStatus('self'); return }
    Promise.all([getFriends(myUid), getOutgoingFriendRequests(myUid)])
      .then(([friends, outgoing]) => {
        if (friends.some(f => f.friendId === uid)) { setFriendStatus('friends'); return }
        if (outgoing.some(r => r.friendId === uid)) { setFriendStatus('pending'); return }
        setFriendStatus('none')
      }).catch(() => {})
  }, [uid, myUid])

  const handleAddFriend = async () => {
    if (!uid || !myUid || !profile) return
    setActionLoading(true)
    try {
      await addFriend(myUid, profile, myName)
      setFriendStatus('pending')
      setActionDone(true)
    } catch { /* ignore */ }
    setActionLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-page px-5 py-12 text-white text-center">
        <p className="text-[16px] font-bold mb-2">Profile not found</p>
        <Link to="/friends" className="text-blue-400 text-[13px]">← Back</Link>
      </div>
    )
  }

  const initial = (profile.displayName || profile.email || '?')[0].toUpperCase()
  const g = profile.avgWorkoutScore != null ? scoreGrade(profile.avgWorkoutScore) : null
  const joinYear = profile.createdAt instanceof Date ? profile.createdAt.getFullYear() : null

  return (
    <div className="min-h-screen bg-page pb-24 text-white">
      <header className="sticky top-0 z-10 px-5 py-4 flex items-center gap-3"
        style={{ background: 'rgba(var(--bg-rgb),0.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <Link to="/friends" className="text-[13px] font-semibold text-blue-400 hover:text-blue-300">← Squad</Link>
        <span className="text-[13px] font-black text-white tracking-tight">Profile</span>
      </header>

      <div className="max-w-md mx-auto px-5 pt-8 space-y-5">

        {/* Avatar + name card */}
        <div className="card-surface p-6 flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-blue-600/20 border-2 border-blue-600/30 flex items-center justify-center text-[28px] font-black text-blue-400 shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[20px] font-black text-white truncate">{profile.displayName || profile.email}</h1>
            {profile.fitnessLevel && (
              <p className="text-[12px] text-gray-500 capitalize mt-0.5">{profile.fitnessLevel} athlete</p>
            )}
            {joinYear && (
              <p className="text-[11px] text-gray-600 mt-0.5">Member since {joinYear}</p>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          {g && (
            <div className="rounded-2xl p-4 text-center" style={{ background: `${g.color}10`, border: `1px solid ${g.color}30` }}>
              <p className="text-[24px] font-black leading-none" style={{ color: g.color }}>{profile.avgWorkoutScore}</p>
              <p className="text-[11px] font-black mt-0.5" style={{ color: g.color }}>{g.grade}</p>
              <p className="text-[9.5px] text-gray-500 uppercase tracking-wider mt-0.5">Avg Score</p>
            </div>
          )}
          <div className="rounded-2xl p-4 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-[24px] font-black text-amber-400 leading-none">{profile.streakCount}</p>
            <p className="text-[9.5px] text-gray-500 uppercase tracking-wider mt-1">Day Streak</p>
          </div>
          <div className="rounded-2xl p-4 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-[24px] font-black text-blue-400 leading-none">{profile.totalSessions ?? 0}</p>
            <p className="text-[9.5px] text-gray-500 uppercase tracking-wider mt-1">Workouts</p>
          </div>
        </div>

        {/* Last workout */}
        {profile.lastWorkoutDate && (
          <div className="card-surface px-5 py-4 flex items-center justify-between">
            <p className="text-[12px] text-gray-500">Last workout</p>
            <p className="text-[13px] font-semibold text-white">
              {profile.lastWorkoutDate === new Date().toISOString().slice(0, 10)
                ? 'Today'
                : profile.lastWorkoutDate === new Date(Date.now() - 86400000).toISOString().slice(0, 10)
                ? 'Yesterday'
                : profile.lastWorkoutDate}
            </p>
          </div>
        )}

        {/* Add friend / status */}
        {myUid && friendStatus !== 'self' && (
          <div>
            {friendStatus === 'friends' ? (
              <div className="w-full py-3 rounded-xl text-center text-[13px] font-semibold text-green-400"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                ✓ In your squad
              </div>
            ) : friendStatus === 'pending' ? (
              <div className="w-full py-3 rounded-xl text-center text-[13px] font-semibold text-amber-400"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                Request sent
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAddFriend}
                disabled={actionLoading || actionDone}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-[14px] font-bold text-white transition-colors"
              >
                {actionLoading ? 'Sending…' : '+ Add to Squad'}
              </button>
            )}
          </div>
        )}

        {!myUid && (
          <Link to="/auth"
            className="block w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-[14px] font-bold text-white text-center transition-colors">
            Sign in to add to squad
          </Link>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
