import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BottomNav } from '../components/BottomNav'

// ── Types ──────────────────────────────────────────────────────────────────

interface MeasurementEntry {
  date: string
  bodyWeightKg?: number
  bodyFatPct?: number
  waistCm?: number
  chestCm?: number
  hipsCm?: number
  leftArmCm?: number
  rightArmCm?: number
  leftThighCm?: number
  rightThighCm?: number
  notes?: string
}

const STORAGE_KEY = 'formAI_measurements'

function loadEntries(): MeasurementEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as MeasurementEntry[]) : []
  } catch { return [] }
}

function saveEntries(entries: MeasurementEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

// ── Sparkline ──────────────────────────────────────────────────────────────

function TrendLine({ values, color = '#3b82f6' }: { values: number[]; color?: string }) {
  if (values.length < 2) return null
  const w = 200
  const h = 40
  const pad = 6
  const mn = Math.min(...values)
  const mx = Math.max(...values)
  const range = mx - mn || 1
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2)
    const y = pad + ((mx - v) / range) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = values[values.length - 1]
  const first = values[0]
  const diff = last - first
  const sign = diff > 0 ? '+' : ''

  return (
    <div className="flex items-center gap-3">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />
        {pts.map((p, i) => {
          const [cx, cy] = p.split(',').map(Number)
          return <circle key={i} cx={cx} cy={cy} r={2.5} fill={color} opacity={0.7} />
        })}
      </svg>
      <span className="text-[11px] font-mono font-bold" style={{ color: diff <= 0 ? '#22c55e' : '#ef4444' }}>
        {sign}{diff.toFixed(1)}
      </span>
    </div>
  )
}

// ── Field config ───────────────────────────────────────────────────────────

const FIELDS: Array<{
  key: keyof Omit<MeasurementEntry, 'date' | 'notes'>
  label: string
  unit: string
  icon: string
  lowerIsBetter?: boolean
}> = [
  { key: 'bodyWeightKg',  label: 'Body Weight',   unit: 'kg',  icon: '⚖️',  lowerIsBetter: false },
  { key: 'bodyFatPct',    label: 'Body Fat',       unit: '%',   icon: '🔥',  lowerIsBetter: true },
  { key: 'waistCm',       label: 'Waist',          unit: 'cm',  icon: '📏',  lowerIsBetter: true },
  { key: 'chestCm',       label: 'Chest',          unit: 'cm',  icon: '💪',  lowerIsBetter: false },
  { key: 'hipsCm',        label: 'Hips',           unit: 'cm',  icon: '🦴',  lowerIsBetter: false },
  { key: 'leftArmCm',     label: 'Left Arm',       unit: 'cm',  icon: '💪',  lowerIsBetter: false },
  { key: 'rightArmCm',    label: 'Right Arm',      unit: 'cm',  icon: '💪',  lowerIsBetter: false },
  { key: 'leftThighCm',   label: 'Left Thigh',     unit: 'cm',  icon: '🦵',  lowerIsBetter: false },
  { key: 'rightThighCm',  label: 'Right Thigh',    unit: 'cm',  icon: '🦵',  lowerIsBetter: false },
]

// ── Page ───────────────────────────────────────────────────────────────────

export function MeasurementsPage() {
  const [entries, setEntries] = useState<MeasurementEntry[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<MeasurementEntry>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setEntries(loadEntries())
  }, [])

  const sorted = useMemo(
    () => [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [entries],
  )

  const latest = sorted[0] ?? null

  // Per-field history (oldest → newest)
  const fieldHistory = useMemo(() => {
    const map: Partial<Record<keyof Omit<MeasurementEntry, 'date' | 'notes'>, number[]>> = {}
    const chronological = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    for (const field of FIELDS) {
      const vals = chronological
        .map(e => e[field.key] as number | undefined)
        .filter((v): v is number => typeof v === 'number')
      if (vals.length >= 2) map[field.key] = vals
    }
    return map
  }, [entries])

  function handleSave() {
    if (!form.date) {
      const today = new Date().toISOString().slice(0, 10)
      form.date = today
    }
    const entry: MeasurementEntry = { date: form.date! }
    for (const field of FIELDS) {
      const raw = form[field.key]
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        const num = parseFloat(String(raw))
        if (!Number.isNaN(num) && num > 0) {
          ;(entry as unknown as Record<string, unknown>)[field.key] = num
        }
      }
    }
    if (form.notes?.trim()) entry.notes = form.notes.trim()

    const updated = [entry, ...entries.filter(e => e.date !== entry.date)]
    setEntries(updated)
    saveEntries(updated)
    setForm({})
    setShowForm(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function handleDelete(date: string) {
    const updated = entries.filter(e => e.date !== date)
    setEntries(updated)
    saveEntries(updated)
  }

  return (
    <div className="min-h-screen bg-page pb-24 text-white">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-30 flex items-center justify-between px-5 py-4"
        style={{ background: 'rgba(var(--bg-rgb),0.9)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Link to="/progress" className="text-[13px] font-semibold text-gray-400 hover:text-white transition-colors">
          ← Progress
        </Link>
        <span className="text-[13px] font-black uppercase tracking-[0.18em] text-blue-400">Measurements</span>
        <button
          onClick={() => { setShowForm(!showForm); setForm({ date: new Date().toISOString().slice(0, 10) }) }}
          className="text-[12px] font-bold text-accent hover:text-accent/80 transition-colors"
        >
          + Log
        </button>
      </nav>

      <div className="mx-auto max-w-lg px-5">

        {/* ── Saved toast ── */}
        {saved && (
          <div className="mt-4 rounded-xl px-4 py-3 text-center text-[13px] font-bold text-green-400"
            style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
            ✓ Measurements saved
          </div>
        )}

        {/* ── Log form ── */}
        {showForm && (
          <div className="mt-6 rounded-2xl p-5 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-bold text-white">New Entry</p>
              <button onClick={() => setShowForm(false)} className="text-gray-500 text-[18px]">×</button>
            </div>

            <div>
              <label className="text-[11px] text-gray-500 uppercase tracking-wider block mb-1">Date</label>
              <input
                type="date"
                value={form.date ?? new Date().toISOString().slice(0, 10)}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="input-dark w-full rounded-xl px-3 py-2.5 text-[14px]"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: '#fff' }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map(f => (
                <div key={f.key}>
                  <label className="text-[11px] text-gray-500 uppercase tracking-wider block mb-1">
                    {f.label} ({f.unit})
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="—"
                    value={form[f.key] !== undefined ? String(form[f.key]) : ''}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value === '' ? undefined : parseFloat(e.target.value) }))}
                    className="w-full rounded-xl px-3 py-2.5 text-[14px] text-white"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="text-[11px] text-gray-500 uppercase tracking-wider block mb-1">Notes (optional)</label>
              <textarea
                placeholder="How are you feeling?"
                value={form.notes ?? ''}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full rounded-xl px-3 py-2.5 text-[14px] text-white resize-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}
              />
            </div>

            <button
              onClick={handleSave}
              className="w-full py-3 rounded-xl bg-accent hover:bg-accent/90 font-bold text-white text-[14px] transition-colors"
            >
              Save Entry
            </button>
          </div>
        )}

        {entries.length === 0 ? (
          <div className="mt-20 text-center">
            <p className="text-5xl mb-4">📏</p>
            <p className="text-[16px] font-bold text-white mb-2">No measurements yet</p>
            <p className="text-[13px] text-gray-500 mb-8">Track body weight, measurements, and body fat over time.</p>
            <button
              onClick={() => { setShowForm(true); setForm({ date: new Date().toISOString().slice(0, 10) }) }}
              className="inline-block px-8 py-3 rounded-xl bg-accent hover:bg-accent/90 font-bold text-white transition-colors"
            >
              Log First Entry →
            </button>
          </div>
        ) : (
          <>
            {/* ── Latest snapshot ── */}
            {latest && (
              <section className="mt-8">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-500 mb-3">Latest</h2>
                <div className="grid grid-cols-2 gap-3">
                  {FIELDS.filter(f => latest[f.key] !== undefined).map(f => {
                    const val = latest[f.key] as number
                    const history = fieldHistory[f.key]
                    return (
                      <div key={f.key} className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[11px] text-gray-500 uppercase tracking-wider">{f.label}</p>
                          <span className="text-[12px]">{f.icon}</span>
                        </div>
                        <p className="text-[22px] font-black text-white">
                          {val}<span className="text-[12px] text-gray-500 ml-1">{f.unit}</span>
                        </p>
                        {history && (
                          <TrendLine
                            values={history}
                            color={
                              f.lowerIsBetter
                                ? history[history.length - 1] <= history[0] ? '#22c55e' : '#ef4444'
                                : history[history.length - 1] >= history[0] ? '#22c55e' : '#ef4444'
                            }
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* ── History ── */}
            <section className="mt-8">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-500 mb-3">
                History ({entries.length})
              </h2>
              <ul className="space-y-2">
                {sorted.map(entry => (
                  <li key={entry.date} className="rounded-xl px-4 py-3.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[14px] font-bold text-white">
                        {new Date(entry.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <button
                        onClick={() => handleDelete(entry.date)}
                        className="text-[11px] text-gray-600 hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {FIELDS.filter(f => entry[f.key] !== undefined).map(f => (
                        <span key={f.key} className="text-[12px] text-gray-400">
                          <span className="text-gray-600">{f.label}: </span>
                          <span className="text-white font-semibold">{entry[f.key]}{f.unit}</span>
                        </span>
                      ))}
                    </div>
                    {entry.notes && (
                      <p className="mt-2 text-[11px] text-gray-500 italic">"{entry.notes}"</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        <div className="mt-10 text-center">
          <Link to="/progress" className="text-[12px] text-gray-600 hover:text-gray-400 transition-colors">
            ← Back to Progress
          </Link>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
