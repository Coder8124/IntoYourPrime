import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BottomNav } from '../components/BottomNav'
import { EXERCISE_INFO, type ExerciseInfo } from '../lib/programs'

const DIFFICULTY_COLOR = {
  Beginner:     { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',  text: '#86efac' },
  Intermediate: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', text: '#fcd34d' },
  Advanced:     { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  text: '#fca5a5' },
}

function ExerciseCard({ ex, onSelect }: { ex: ExerciseInfo; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const d = DIFFICULTY_COLOR[ex.difficulty]

  return (
    <div
      className="rounded-2xl border border-[#1e1e2e] bg-[#0d0d18] overflow-hidden transition-all"
      style={{ borderColor: open ? 'rgba(59,130,246,0.35)' : undefined }}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-black text-[15px] text-white">{ex.name}</h3>
            {ex.isHold && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-blue-400 border border-blue-500/30 bg-blue-500/10">
                Isometric
              </span>
            )}
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: d.bg, border: `1px solid ${d.border}`, color: d.text }}
            >
              {ex.difficulty}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ex.muscles.map(m => (
              <span key={m} className="text-[11px] text-gray-500">{m}</span>
            ))}
          </div>
        </div>
        <span className="text-gray-600 text-[20px] shrink-0">{open ? '−' : '+'}</span>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-[#1e1e2e]">
          <p className="text-[13px] text-gray-400 leading-relaxed pt-4">{ex.description}</p>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-400 mb-2">Form Cues</p>
            <ul className="space-y-1.5">
              {ex.cues.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-gray-300">
                  <span className="text-blue-500 shrink-0 mt-0.5">›</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-400 mb-1">AI monitors</p>
            <p className="text-[12px] text-amber-200/70">{ex.riskNote}</p>
          </div>

          <button
            type="button"
            onClick={() => onSelect(ex.id)}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-[13px] font-bold text-white transition-colors"
          >
            Train this exercise →
          </button>
        </div>
      )}
    </div>
  )
}

export function ExerciseLibraryPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'All' | 'Beginner' | 'Intermediate' | 'Advanced'>('All')
  const [search, setSearch] = useState('')

  const filtered = EXERCISE_INFO.filter(ex => {
    const matchDiff = filter === 'All' || ex.difficulty === filter
    const matchSearch = !search.trim() ||
      ex.name.toLowerCase().includes(search.toLowerCase()) ||
      ex.muscles.some(m => m.toLowerCase().includes(search.toLowerCase()))
    return matchDiff && matchSearch
  })

  const handleSelect = (id: string) => {
    // Store chosen exercise and navigate to workout
    localStorage.setItem('formAI_startExercise', id)
    navigate('/workout')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white pb-24">
      <header className="sticky top-0 z-10 bg-[#0d0d18]/90 backdrop-blur border-b border-[#1e1e2e] px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/home" className="text-sm font-semibold text-blue-400 hover:text-blue-300">← Home</Link>
            <div className="w-px h-4 bg-[#1e1e2e]" />
            <h1 className="font-black text-white tracking-tight">Exercise Library</h1>
          </div>
          <Link
            to="/programs"
            className="px-3 py-1.5 rounded-xl border border-[#2e2e3e] text-[12px] font-semibold text-gray-400 hover:text-white transition-colors"
          >
            Programs →
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search exercises or muscle groups…"
          className="input-dark w-full text-[13px]"
        />

        {/* Filter pills */}
        <div className="flex gap-2">
          {(['All', 'Beginner', 'Intermediate', 'Advanced'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-xl text-[12px] font-bold transition-colors"
              style={filter === f
                ? { background: 'rgba(59,130,246,0.2)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.4)' }
                : { background: 'rgba(255,255,255,0.04)', color: '#4b5563', border: '1px solid #1e1e2e' }
              }
            >
              {f}
            </button>
          ))}
        </div>

        <p className="text-[11px] text-gray-600">{filtered.length} exercise{filtered.length !== 1 ? 's' : ''}</p>

        {/* Exercise cards */}
        <div className="space-y-3">
          {filtered.map(ex => (
            <ExerciseCard key={ex.id} ex={ex} onSelect={handleSelect} />
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
