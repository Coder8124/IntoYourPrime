import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../lib/firebase'
import { getUserSessions, getUserProfile } from '../lib/firebaseHelpers'
import { isProSubscriber, loadSubscriptionStatus } from '../lib/subscriptionStatus'
import { EXERCISE_INFO } from '../lib/programs'
import type { Session } from '../types'
import OpenAI from 'openai'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function exName(id: string) {
  return EXERCISE_INFO.find(e => e.id === id)?.name ?? id.replace(/([A-Z])/g, ' $1').trim()
}

function riskColor(score: number) {
  if (score <= 30) return '#22c55e'
  if (score <= 60) return '#f59e0b'
  return '#ef4444'
}

function fmtDuration(min: number) {
  if (min < 60) return `${min}m`
  return `${Math.floor(min / 60)}h ${min % 60}m`
}

interface ScheduleSuggestion {
  recommendation: string
  suggestedFocus: string
  reason: string
  restDay: boolean
}

export function CalendarPage() {
  const navigate  = useNavigate()
  const today     = new Date()

  const [year,        setYear]        = useState(today.getFullYear())
  const [month,       setMonth]       = useState(today.getMonth())
  const [sessions,    setSessions]    = useState<Session[]>([])
  const [loading,     setLoading]     = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [suggestion,  setSuggestion]  = useState<ScheduleSuggestion | null>(null)
  const [suggesting,  setSuggesting]  = useState(false)
  const [isPro,       setIsPro]       = useState(false)
  const [apiKey,      setApiKey]      = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      await loadSubscriptionStatus()
      setIsPro(isProSubscriber())
      setApiKey(localStorage.getItem('formAI_openai_key'))

      const user = auth.currentUser
      if (!user) { setLoading(false); return }
      try {
        const data = await getUserSessions(user.uid, 120)
        setSessions(data)
      } catch {}
      setLoading(false)
    }
    init()
  }, [])

  // Build a map of date→sessions for quick lookup
  const sessionMap = sessions.reduce<Record<string, Session[]>>((acc, s) => {
    if (!acc[s.date]) acc[s.date] = []
    acc[s.date].push(s)
    return acc
  }, {})

  // Calendar grid for current month
  const firstDay  = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  const dayKey = (d: number) =>
    `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
  }
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
  }

  const selectedSessions = selectedDay ? (sessionMap[selectedDay] ?? []) : []

  const askSchedule = async () => {
    if (suggesting) return
    setSuggesting(true)
    setSuggestion(null)
    try {
      const recent = sessions.slice(0, 7).map(s => ({
        date: s.date,
        exercises: s.exercises,
        durationMinutes: s.durationMinutes,
        avgRiskScore: s.avgRiskScore,
      }))

      if (isPro) {
        const token = await auth.currentUser?.getIdToken() ?? ''
        const user  = auth.currentUser
        const profile = user ? await getUserProfile(user.uid) : null
        const resp = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ recentSessions: recent, fitnessLevel: profile?.fitnessLevel }),
        })
        if (resp.ok) setSuggestion(await resp.json())
      } else if (apiKey) {
        const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
        const res = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a fitness scheduling assistant. Return valid JSON only, no markdown.' },
            { role: 'user', content: `Based on these recent sessions suggest today's training:\n${JSON.stringify(recent)}\n\nReturn JSON: {"recommendation":"...","suggestedFocus":"...","reason":"...","restDay":false}` },
          ],
          max_tokens: 150,
        })
        const txt = res.choices[0].message.content ?? '{}'
        setSuggestion(JSON.parse(txt.replace(/```json\n?|\n?```/g, '').trim()))
      }
    } catch {}
    setSuggesting(false)
  }

  // Stats for this month
  const monthSessions = sessions.filter(s => {
    const d = new Date(s.date)
    return d.getFullYear() === year && d.getMonth() === month
  })
  const totalReps = monthSessions.reduce((sum, s) => sum + Object.values(s.repCounts).reduce((a, b) => a + b, 0), 0)

  return (
    <div className="min-h-screen bg-page text-white pb-24">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-subtle"
        style={{ background: 'rgba(7,7,14,0.95)', backdropFilter: 'blur(16px)', position: 'sticky', top: 0, zIndex: 20 }}>
        <button onClick={() => navigate(-1)} className="p-2 text-gray-400 hover:text-white text-[18px]">←</button>
        <p className="text-[15px] font-bold">Workout Calendar</p>
        <div className="w-10" />
      </div>

      <div className="px-4 py-5 space-y-5">

        {/* AI suggestion */}
        <div className="rounded-2xl p-5 space-y-3"
          style={{ background: 'linear-gradient(135deg,rgba(59,130,246,0.12),rgba(124,58,237,0.08))', border: '1px solid rgba(59,130,246,0.25)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-bold text-white">What should I train today?</p>
              <p className="text-[11px] text-gray-400 mt-0.5">AI looks at your recent history</p>
            </div>
            <button
              onClick={askSchedule}
              disabled={suggesting || (!isPro && !apiKey)}
              className="px-4 py-2 rounded-xl text-[12px] font-bold text-white transition-opacity disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}>
              {suggesting ? '…' : 'Ask AI'}
            </button>
          </div>

          {!isPro && !apiKey && (
            <p className="text-[11px] text-gray-500">
              <button onClick={() => navigate('/profile')} className="text-blue-400 hover:text-blue-300 underline">Add AI key or go Pro</button>
              {' '}to use this feature.
            </p>
          )}

          {suggestion && (
            <div className="rounded-xl px-4 py-3 space-y-1" style={{ background: 'rgba(0,0,0,0.3)' }}>
              <div className="flex items-center gap-2">
                <span className="text-[18px]">{suggestion.restDay ? '😴' : '💪'}</span>
                <p className="text-[13px] font-bold text-white">{suggestion.suggestedFocus}</p>
              </div>
              <p className="text-[13px] text-gray-300">{suggestion.recommendation}</p>
              <p className="text-[11px] text-gray-500">{suggestion.reason}</p>
            </div>
          )}
        </div>

        {/* Month stats */}
        {!loading && monthSessions.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Sessions', value: String(monthSessions.length) },
              { label: 'Total Reps', value: String(totalReps) },
              { label: 'Avg Risk', value: monthSessions.length ? `${(monthSessions.reduce((s,x)=>s+x.avgRiskScore,0)/monthSessions.length).toFixed(0)}` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl p-3 text-center"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-[20px] font-black text-white">{value}</p>
                <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-3)' }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Calendar */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {/* Month nav */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-subtle">
            <button onClick={prevMonth} className="p-1.5 text-gray-400 hover:text-white text-[16px]">‹</button>
            <p className="text-[15px] font-bold">{MONTHS[month]} {year}</p>
            <button onClick={nextMonth} className="p-1.5 text-gray-400 hover:text-white text-[16px]">›</button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-subtle">
            {DAYS.map(d => (
              <div key={d} className="py-2 text-center text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{d}</div>
            ))}
          </div>

          {/* Grid */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-600/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {cells.map((day, i) => {
                if (!day) return <div key={`e-${i}`} className="h-12 border-b border-r border-subtle/40" />
                const key = dayKey(day)
                const daySessions = sessionMap[key] ?? []
                const isToday = key === todayStr
                const isSelected = key === selectedDay
                const hasSession = daySessions.length > 0
                const avgRisk = hasSession
                  ? daySessions.reduce((s, x) => s + x.avgRiskScore, 0) / daySessions.length
                  : 0

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(isSelected ? null : key)}
                    className="h-12 flex flex-col items-center justify-center gap-0.5 border-b border-r border-subtle/40 transition-colors"
                    style={isSelected
                      ? { background: 'rgba(59,130,246,0.2)' }
                      : isToday
                        ? { background: 'rgba(59,130,246,0.08)' }
                        : {}}
                  >
                    <span className="text-[13px] font-semibold leading-none"
                      style={{ color: isToday ? '#3b82f6' : isSelected ? '#fff' : hasSession ? '#f0f0f0' : '#4b5563' }}>
                      {day}
                    </span>
                    {hasSession && (
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: riskColor(avgRisk) }} />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Selected day detail */}
        {selectedDay && (
          <div className="rounded-2xl p-5 space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-[13px] font-bold text-white">
              {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>

            {selectedSessions.length === 0 ? (
              <p className="text-[13px] text-gray-500">No workout recorded.</p>
            ) : selectedSessions.map((s, si) => (
              <div key={si} className="space-y-3">
                {/* Stats row */}
                <div className="flex gap-3 flex-wrap">
                  {[
                    { label: 'Duration', value: fmtDuration(s.durationMinutes) },
                    { label: 'Avg Risk', value: `${s.avgRiskScore.toFixed(0)}`, color: riskColor(s.avgRiskScore) },
                    { label: 'Score', value: s.workoutScore != null ? `${s.workoutScore}` : '—' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-xl px-3 py-2 text-center"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      <p className="text-[16px] font-black" style={{ color: color ?? '#fff' }}>{value}</p>
                      <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-3)' }}>{label}</p>
                    </div>
                  ))}
                </div>

                {/* Exercises */}
                <div className="space-y-1.5">
                  {s.exercises.map(ex => {
                    const reps = s.repCounts[ex] ?? 0
                    const risk = s.exerciseRiskScores?.[ex]
                    return (
                      <div key={ex} className="flex items-center justify-between py-1.5 border-b border-subtle last:border-0">
                        <p className="text-[13px] text-white">{exName(ex)}</p>
                        <div className="flex items-center gap-3">
                          {reps > 0 && <p className="text-[12px] font-bold text-blue-400">{reps} reps</p>}
                          {risk != null && (
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: riskColor(risk) }} />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Feel rating */}
                {s.feelRating != null && (
                  <p className="text-[12px] text-gray-500">
                    Felt: {'⭐'.repeat(s.feelRating)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 px-1">
          <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider">Risk</p>
          {[{ c: '#22c55e', l: 'Low ≤30' }, { c: '#f59e0b', l: 'Mid ≤60' }, { c: '#ef4444', l: 'High' }].map(({ c, l }) => (
            <div key={l} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: c }} />
              <p className="text-[11px] text-gray-500">{l}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
