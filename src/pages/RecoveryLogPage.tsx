import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Star } from 'lucide-react'
import {
  getTodayLocalDateString,
  getTodayLog,
  saveDailyLog,
} from '../lib/firebaseHelpers'
import { getOrSignInUserId } from '../lib/firestoreUser'
import { getOrCreateLocalUserId } from '../lib/localUserId'
import { loadRecoveryLogLocal, saveRecoveryLogLocal } from '../lib/recoveryLogLocal'
import type { DailyLog } from '../types'
import { BodySorenessMap } from '../components/BodySorenessMap'
import { RECOVERY_MUSCLE_GROUPS, type RecoveryMuscle } from '../lib/recoveryMuscles'

const TRAINING_TYPES = [
  'Upper',
  'Lower',
  'Full body',
  'Cardio',
  'Rest day',
  'Other',
] as const

const ENERGY_EMOJI = ['😫', '😕', '😐', '🙂', '🔥'] as const
const MOOD_EMOJI = ['😣', '😔', '😐', '😊', '🌟'] as const

const RPE_LABELS: Record<number, string> = {
  1: 'Very easy',
  2: 'Easy',
  3: 'Light',
  4: 'Moderate',
  5: 'Challenging',
  6: 'Hard',
  7: 'Very hard',
  8: 'Near limit',
  9: 'Near maximal',
  10: 'Maximal effort',
}

function safeReturnPath(raw: string | null): '/session-summary' | '/home' | null {
  if (raw === '/session-summary' || raw === '/home') return raw
  return null
}

function computeOverallSoreness(map: Partial<Record<RecoveryMuscle, number>>): DailyLog['overallSoreness'] {
  const vals = RECOVERY_MUSCLE_GROUPS.map((k) => map[k] ?? 0)
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return Math.max(1, Math.min(5, Math.round(avg))) as DailyLog['overallSoreness']
}

function cleanSorenessForFirestore(
  map: Partial<Record<RecoveryMuscle, number>>,
): Partial<Record<RecoveryMuscle, number>> {
  const out: Partial<Record<RecoveryMuscle, number>> = {}
  for (const k of RECOVERY_MUSCLE_GROUPS) {
    const v = map[k]
    if (v !== undefined && v > 0) out[k] = v
  }
  return out
}

function logToSorenessState(log: DailyLog): Partial<Record<RecoveryMuscle, number>> {
  const out: Partial<Record<RecoveryMuscle, number>> = {}
  for (const k of RECOVERY_MUSCLE_GROUPS) {
    const v = log.sorenessMap[k]
    if (v !== undefined) out[k] = v
  }
  return out
}

export function RecoveryLogPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = useMemo(
    () => safeReturnPath(searchParams.get('returnTo')),
    [searchParams],
  )

  const [uid, setUid] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [sleepHours, setSleepHours] = useState(7)
  const [sleepQuality, setSleepQuality] = useState<DailyLog['sleepQuality']>(3)
  const [energyLevel, setEnergyLevel] = useState<DailyLog['energyLevel']>(3)
  const [mood, setMood] = useState<DailyLog['mood']>(3)
  const [trainingType, setTrainingType] = useState<string>('Full body')
  const [rpe, setRpe] = useState(5)
  const [sorenessMap, setSorenessMap] = useState<Partial<Record<RecoveryMuscle, number>>>({})
  const [notes, setNotes] = useState('')

  const isRestDay = trainingType === 'Rest day'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const localId = getOrCreateLocalUserId()
      const id = await Promise.race([
        getOrSignInUserId(),
        new Promise<string>(resolve => setTimeout(() => resolve(localId), 3000)),
      ])
      if (cancelled) return
      setUid(id)

      const today = getTodayLocalDateString()
      let existing: DailyLog | null = null
      try {
        existing = await getTodayLog(id)
      } catch {
        /* permission / network */
      }
      if (!existing) existing = loadRecoveryLogLocal(id, today)

      if (cancelled) return
      if (existing) {
        setSleepHours(
          Number.isFinite(existing.sleepHours) ? existing.sleepHours : 7,
        )
        setSleepQuality(existing.sleepQuality)
        setEnergyLevel(existing.energyLevel)
        setMood(existing.mood)
        setTrainingType(existing.trainingType)
        setRpe(existing.rpe)
        setSorenessMap(logToSorenessState(existing))
        setNotes(existing.notes ?? '')
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (saving || !uid) return

      const rawH = Number(sleepHours)
      const hours = Number.isFinite(rawH)
        ? Math.min(12, Math.max(4, Math.round(rawH * 2) / 2))
        : 7
      const overallSoreness = computeOverallSoreness(sorenessMap)
      const sorenessFirestore = cleanSorenessForFirestore(sorenessMap)
      const rpeVal = isRestDay ? 0 : Math.min(10, Math.max(1, Math.round(rpe)))

      const payload: Omit<DailyLog, 'id'> = {
        userId: uid,
        date: getTodayLocalDateString(),
        sleepHours: hours,
        sleepQuality,
        energyLevel,
        mood,
        overallSoreness,
        sorenessMap: sorenessFirestore,
        rpe: rpeVal,
        trainingType,
        notes: notes.trim(),
      }

      const fullLog: DailyLog = { ...payload, id: payload.date }
      saveRecoveryLogLocal(uid, fullLog)

      setSaving(true)
      let cloudOk = false
      try {
        await saveDailyLog(payload)
        cloudOk = true
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Save failed'
        toast.error(
          `${msg} — your answers are still saved on this device. Check Firestore rules (allow auth uid) and Anonymous sign-in.`,
          { duration: 8000 },
        )
      } finally {
        setSaving(false)
      }

      if (cloudOk) {
        toast.success('Saved today’s recovery log')
      }
      navigate(returnTo ?? '/home', { replace: true })
    },
    [
      energyLevel,
      isRestDay,
      mood,
      navigate,
      notes,
      returnTo,
      rpe,
      saving,
      sleepHours,
      sleepQuality,
      sorenessMap,
      trainingType,
      uid,
    ],
  )

  if (loading || !uid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] text-gray-500">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] px-4 py-8 text-white pb-24">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            to="/home"
            className="text-[13px] font-semibold text-gray-500 transition hover:text-gray-300"
          >
            ← Home
          </Link>
          {returnTo === '/session-summary' && (
            <span className="text-[11px] text-gray-600">Returns to session summary after save</span>
          )}
        </div>

        <h1 className="text-2xl font-black tracking-tight">Daily recovery log</h1>
        <p className="mt-1 text-[13px] text-gray-500">
          {getTodayLocalDateString()} · one entry per day (updates overwrite)
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-8">
          {/* Sleep */}
          <section className="card-surface space-y-4 p-5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">Sleep</h2>
            <div>
              <label className="mb-2 block text-[12px] text-gray-400">Hours (4–12, step 0.5)</label>
              <input
                type="number"
                min={4}
                max={12}
                step={0.5}
                value={sleepHours}
                onChange={(e) => setSleepHours(Number(e.target.value))}
                className="input-dark max-w-[140px]"
              />
            </div>
            <div>
              <span className="mb-2 block text-[12px] text-gray-400">Quality (1–5)</span>
              <div className="flex gap-1">
                {([1, 2, 3, 4, 5] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSleepQuality(n)}
                    className="rounded-lg p-1.5 transition hover:bg-white/5"
                    aria-label={`Sleep quality ${n}`}
                  >
                    <Star
                      size={28}
                      className={
                        n <= sleepQuality ? 'fill-amber-400 text-amber-400' : 'text-gray-600'
                      }
                    />
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Energy */}
          <section className="card-surface space-y-3 p-5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">
              Energy level
            </h2>
            <div className="flex justify-between gap-2">
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setEnergyLevel(n)}
                  className={[
                    'flex flex-1 flex-col items-center rounded-xl border py-3 text-2xl transition',
                    energyLevel === n
                      ? 'border-blue-500/60 bg-blue-500/10'
                      : 'border-[#2e2e3e] bg-[#0f0f1a] hover:border-gray-600',
                  ].join(' ')}
                >
                  <span>{ENERGY_EMOJI[n - 1]}</span>
                  <span className="mt-1 text-[10px] font-bold text-gray-500">{n}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Mood */}
          <section className="card-surface space-y-3 p-5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">Mood</h2>
            <div className="flex justify-between gap-2">
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMood(n)}
                  className={[
                    'flex flex-1 flex-col items-center rounded-xl border py-3 text-2xl transition',
                    mood === n
                      ? 'border-violet-500/60 bg-violet-500/10'
                      : 'border-[#2e2e3e] bg-[#0f0f1a] hover:border-gray-600',
                  ].join(' ')}
                >
                  <span>{MOOD_EMOJI[n - 1]}</span>
                  <span className="mt-1 text-[10px] font-bold text-gray-500">{n}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Training */}
          <section className="card-surface space-y-4 p-5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">
              Today&apos;s training
            </h2>
            <select
              value={trainingType}
              onChange={(e) => setTrainingType(e.target.value)}
              className="input-dark"
            >
              {TRAINING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {!isRestDay && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-[12px] text-gray-400">Session RPE (1–10)</label>
                  <span className="text-[12px] font-mono font-bold text-blue-400">{rpe}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={rpe}
                  onChange={(e) => setRpe(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <p className="mt-1 text-[11px] text-gray-600">{RPE_LABELS[rpe]}</p>
              </div>
            )}
          </section>

          {/* Soreness map */}
          <section className="card-surface p-5">
            <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">
              Soreness map
            </h2>
            <BodySorenessMap value={sorenessMap} onChange={setSorenessMap} />
          </section>

          {/* Notes */}
          <section className="card-surface p-5">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">
              Notes (optional)
            </h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Anything else about today…"
              className="input-dark resize-y min-h-[100px]"
            />
          </section>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-[15px] font-bold text-white transition hover:bg-blue-500 disabled:opacity-50 btn-glow-blue"
          >
            {saving ? 'Saving…' : 'Save log'}
          </button>
        </form>
      </div>
    </div>
  )
}
