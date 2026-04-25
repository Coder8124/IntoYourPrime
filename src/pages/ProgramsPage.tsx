import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { WORKOUT_PROGRAMS, EXERCISE_INFO, setActiveProgram, getActiveProgram, clearActiveProgram, getCustomPrograms, deleteCustomProgram, type WorkoutProgram } from '../lib/programs'
import { BottomNav } from '../components/BottomNav'

const LEVEL_COLOR = {
  Beginner:     { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',  text: '#86efac' },
  Intermediate: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', text: '#fcd34d' },
  Advanced:     { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  text: '#fca5a5' },
}

function exerciseName(id: string) {
  return EXERCISE_INFO.find(e => e.id === id)?.name ?? id
}

function ProgramCard({ program, onStart }: { program: WorkoutProgram; onStart: (p: WorkoutProgram) => void }) {
  const [expanded, setExpanded] = useState(false)
  const d = LEVEL_COLOR[program.level]

  return (
    <div
      className="rounded-2xl border border-subtle bg-panel overflow-hidden transition-all"
      style={{ borderColor: expanded ? 'rgba(59,130,246,0.35)' : undefined }}
    >
      <div className="p-5 space-y-3">
        {/* Top row */}
        <div className="flex items-start gap-3">
          <span className="text-[32px] shrink-0 leading-none">{program.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-black text-[16px] text-white">{program.name}</h3>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: d.bg, border: `1px solid ${d.border}`, color: d.text }}
              >
                {program.level}
              </span>
            </div>
            <p className="text-[12px] text-gray-500">{program.duration} · {program.exercises.length} exercises</p>
          </div>
        </div>

        <p className="text-[13px] text-gray-400 leading-relaxed">{program.description}</p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {program.tags.map(t => (
            <span key={t} className="px-2 py-0.5 rounded-full text-[11px] text-gray-600 border border-subtle">
              {t}
            </span>
          ))}
        </div>

        {/* Exercise sequence preview */}
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-[12px] text-blue-400 hover:text-blue-300 transition-colors"
        >
          {expanded ? 'Hide exercises ↑' : `See ${program.exercises.length} exercises ↓`}
        </button>

        {expanded && (
          <div className="space-y-2 pt-1">
            {program.exercises.map((ex, i) => {
              const info = EXERCISE_INFO.find(e => e.id === ex)
              return (
                <div key={ex} className="flex items-center gap-3 p-2.5 rounded-xl bg-page border border-subtle">
                  <span className="text-[12px] font-black text-blue-600/50 w-5 shrink-0">{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-white">{exerciseName(ex)}</p>
                    {info && <p className="text-[11px] text-gray-600">{info.muscles.slice(0, 3).join(' · ')}</p>}
                  </div>
                  {info?.isHold && (
                    <span className="text-[10px] text-blue-400 font-bold">Hold</span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => onStart(program)}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-[14px] font-black text-white transition-colors"
          style={{ boxShadow: '0 0 20px rgba(59,130,246,0.3)' }}
        >
          Start Program →
        </button>
        <p className="text-[10px] text-gray-700 text-center">Warmup first, then program exercises begin</p>
      </div>
    </div>
  )
}

export function ProgramsPage() {
  const navigate = useNavigate()
  const active = getActiveProgram()
  const [levelFilter, setLevelFilter] = useState<'All' | 'Beginner' | 'Intermediate' | 'Advanced'>('All')
  const [customPrograms, setCustomPrograms] = useState(() => getCustomPrograms())

  const handleDeleteCustom = (id: string) => {
    deleteCustomProgram(id)
    setCustomPrograms(getCustomPrograms())
  }

  const filtered = WORKOUT_PROGRAMS.filter(p =>
    levelFilter === 'All' || p.level === levelFilter
  )

  const handleStart = (program: WorkoutProgram) => {
    setActiveProgram(program)
    localStorage.setItem('formAI_launchProgram', '1')
    navigate('/workout')
  }

  return (
    <div className="min-h-screen bg-page text-white pb-24">
      <header className="sticky top-0 z-10 bg-[color:rgba(var(--bg-rgb),0.9)] backdrop-blur border-b border-subtle px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/home" className="text-sm font-semibold text-blue-400 hover:text-blue-300">← Home</Link>
            <div className="w-px h-4 bg-panel-2" />
            <h1 className="font-black text-white tracking-tight">Programs</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/programs/generate"
              className="px-3 py-1.5 rounded-xl border border-blue-500/30 text-[12px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
            >
              ✨ AI Generate
            </Link>
            <Link
              to="/programs/builder"
              className="px-3 py-1.5 rounded-xl border border-strong text-[12px] font-semibold text-gray-400 hover:text-white transition-colors"
            >
              + Build
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-5">

        {/* Active program banner */}
        {active && (
          <div className="p-4 rounded-2xl border border-blue-500/30 bg-blue-500/8 flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-0.5">Active Program</p>
              <p className="font-black text-white text-[14px]">{active.name}</p>
              <p className="text-[12px] text-gray-400">
                Exercise {active.currentIndex + 1} of {active.exercises.length}: {' '}
                <span className="text-white font-semibold">{exerciseName(active.exercises[active.currentIndex])}</span>
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                type="button"
                onClick={() => { localStorage.setItem('formAI_launchProgram', '1'); navigate('/workout') }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-[12px] font-bold text-white transition-colors"
              >
                Resume →
              </button>
              <button
                type="button"
                onClick={() => { clearActiveProgram(); window.location.reload() }}
                className="px-4 py-2 rounded-xl border border-red-900/40 text-red-400 text-[11px] font-bold transition-colors hover:border-red-700"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Level filter */}
        <div className="flex gap-2">
          {(['All', 'Beginner', 'Intermediate', 'Advanced'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setLevelFilter(f)}
              className="px-3 py-1.5 rounded-xl text-[12px] font-bold transition-colors"
              style={levelFilter === f
                ? { background: 'rgba(59,130,246,0.2)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.4)' }
                : { background: 'rgba(255,255,255,0.04)', color: '#4b5563', border: '1px solid var(--border)' }
              }
            >
              {f}
            </button>
          ))}
        </div>

        {/* Custom programs */}
        {customPrograms.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 px-1">My Programs</p>
            {customPrograms.map(p => (
              <div key={p.id} className="relative">
                <ProgramCard program={p} onStart={handleStart} />
                <button
                  type="button"
                  onClick={() => handleDeleteCustom(p.id)}
                  className="absolute top-3 right-3 px-2 py-0.5 rounded-lg text-[10px] text-red-400 border border-red-900/40 hover:border-red-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Program cards */}
        <div className="space-y-4">
          {customPrograms.length > 0 && <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 px-1">Built-in Programs</p>}
          {filtered.map(p => (
            <ProgramCard key={p.id} program={p} onStart={handleStart} />
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
