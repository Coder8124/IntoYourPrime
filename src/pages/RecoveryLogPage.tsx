import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkoutStore } from '../stores/workoutStore'
import { generateRecoveryInsight } from '../lib/formAnalysis'
import type { DailyLog } from '../types/index'

// ── Star-rating widget ─────────────────────────────────────────────────────

function StarRating({ value, onChange, max = 5 }: { value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: max }, (_, i) => i + 1).map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="text-[22px] transition-transform hover:scale-110 active:scale-95"
          style={{ color: n <= value ? '#eab308' : '#1e1e2e' }}
        >
          ★
        </button>
      ))}
    </div>
  )
}

// ── RPE dot-scale ──────────────────────────────────────────────────────────

function RpeScale({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
        const active = n <= value
        const color  = n <= 3 ? '#22c55e' : n <= 6 ? '#f59e0b' : '#ef4444'
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="w-8 h-8 rounded-md text-[11px] font-black transition-all hover:scale-105"
            style={{
              background: active ? color + '22' : '#0f0f1a',
              border:     `1px solid ${active ? color : '#1e1e2e'}`,
              color:      active ? color : '#374151',
            }}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

// ── Field wrapper ──────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-[11px] font-bold tracking-[0.14em] uppercase text-gray-400">{label}</label>
        {hint && <span className="text-[11px] text-gray-600 ml-2">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

// ── RecoveryLogPage ────────────────────────────────────────────────────────

export function RecoveryLogPage() {
  const navigate   = useNavigate()
  const sessions   = useWorkoutStore(s => s.riskScores)   // used for insight context

  // Form state
  const [sleepHours,    setSleepHours]    = useState(7)
  const [sleepQuality,  setSleepQuality]  = useState(3)
  const [energyLevel,   setEnergyLevel]   = useState(3)
  const [mood,          setMood]          = useState(3)
  const [overallSoreness, setOverallSoreness] = useState(2)
  const [rpe,           setRpe]           = useState(6)
  const [notes,         setNotes]         = useState('')

  // AI insight
  const [insight,       setInsight]       = useState<string | null>(null)
  const [loadingInsight, setLoadingInsight] = useState(false)

  // Save state
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const riskScores = sessions  // alias

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveErr(null)

    const storedUid = (() => {
      try { return (JSON.parse(localStorage.getItem('formAI_profile') ?? '{}') as Record<string, unknown>).uid as string | undefined }
      catch { return undefined }
    })()

    const log: Omit<DailyLog, 'id'> = {
      userId:          storedUid ?? 'anonymous',
      date:            new Date().toISOString().slice(0, 10),
      sleepHours,
      sleepQuality:    sleepQuality    as DailyLog['sleepQuality'],
      energyLevel:     energyLevel     as DailyLog['energyLevel'],
      mood:            mood            as DailyLog['mood'],
      overallSoreness: overallSoreness as DailyLog['overallSoreness'],
      sorenessMap:     {},
      rpe:             rpe             as DailyLog['rpe'],
      trainingType:    'strength',
      notes,
    }

    // AI insight (non-blocking)
    setLoadingInsight(true)
    generateRecoveryInsight({ sessions: [], logs: [{ ...log, id: '' }] })
      .then(text => setInsight(text || null))
      .catch(() => {/* ignore */})
      .finally(() => setLoadingInsight(false))

    // Firestore save — optional, may fail if no Firebase credentials
    try {
      if (storedUid) {
        const { saveDailyLog } = await import('../lib/firebaseHelpers')
        await saveDailyLog(log)
      }
    } catch {
      // Firebase not configured or user not signed in — silently continue
    }

    setSaving(false)
    setSaved(true)
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const avgRisk = useMemo(
    () => riskScores.length ? Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length) : null,
    [riskScores],
  )

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-xl mx-auto px-4 pt-10 pb-16">

        {/* Header */}
        <div className="mb-8">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-gray-500 mb-1">Recovery</p>
          <h1 className="text-3xl font-black tracking-tight">How are you feeling?</h1>
          {avgRisk !== null && (
            <p className="text-[13px] text-gray-500 mt-2">
              Session avg risk: <span className="font-bold text-white">{avgRisk}</span>
            </p>
          )}
        </div>

        {/* AI insight card (appears after submit) */}
        {(insight || loadingInsight) && (
          <div
            className="rounded-xl p-5 mb-6"
            style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.25)' }}
          >
            <p className="text-[10.5px] font-black tracking-[0.15em] uppercase text-blue-400 mb-2">AI Recovery Insight</p>
            {loadingInsight ? (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-blue-500/40 border-t-blue-400 rounded-full animate-spin" />
                <span className="text-gray-500 text-[13px]">Analysing your session…</span>
              </div>
            ) : (
              <p className="text-[13px] text-gray-200 leading-relaxed">{insight}</p>
            )}
          </div>
        )}

        {/* Success banner */}
        {saved && (
          <div
            className="rounded-xl p-4 mb-6 flex items-center gap-3"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}
          >
            <span className="text-green-400 text-lg">✓</span>
            <p className="text-[13px] text-green-300 font-semibold">Recovery log saved.</p>
          </div>
        )}

        {saveErr && (
          <div
            className="rounded-xl p-4 mb-6"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <p className="text-[13px] text-red-300">{saveErr}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-7">

          {/* Sleep hours */}
          <Field label="Sleep" hint="hours last night">
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0} max={12} step={0.5}
                value={sleepHours}
                onChange={e => setSleepHours(Number(e.target.value))}
                className="flex-1 accent-blue-500"
              />
              <span className="text-white font-black text-[18px] w-12 text-right tabular-nums">
                {sleepHours}h
              </span>
            </div>
          </Field>

          {/* Sleep quality */}
          <Field label="Sleep Quality" hint="1 = terrible · 5 = amazing">
            <StarRating value={sleepQuality} onChange={setSleepQuality} />
          </Field>

          {/* Energy */}
          <Field label="Energy Level" hint="right now">
            <StarRating value={energyLevel} onChange={setEnergyLevel} />
          </Field>

          {/* Mood */}
          <Field label="Mood">
            <StarRating value={mood} onChange={setMood} />
          </Field>

          {/* Soreness */}
          <Field label="Overall Soreness" hint="1 = none · 5 = very sore">
            <StarRating value={overallSoreness} onChange={setOverallSoreness} />
          </Field>

          {/* RPE */}
          <Field label="Session RPE" hint="Rate of Perceived Exertion · 1-10">
            <RpeScale value={rpe} onChange={setRpe} />
          </Field>

          {/* Notes */}
          <Field label="Notes" hint="optional">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="How did the workout feel? Any pain or discomfort?"
              rows={3}
              className="w-full bg-[#0f0f1a] border border-[#1e1e2e] rounded-xl px-4 py-3 text-[13px] text-white placeholder-gray-700 resize-none focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </Field>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || saved}
              className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 rounded-xl font-bold text-[14px] text-white transition-all"
            >
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Log & Get Insight'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="px-5 py-3.5 border border-[#1e1e2e] text-gray-500 rounded-xl font-semibold text-[13px] hover:text-gray-300 hover:border-[#2e2e3e] transition-all"
            >
              Home
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
