import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EXERCISE_INFO, saveCustomProgram, type WorkoutProgram } from '../lib/programs'
import { BottomNav } from '../components/BottomNav'

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const

export function CustomProgramPage() {
  const navigate = useNavigate()
  const [name, setName]           = useState('')
  const [description, setDesc]    = useState('')
  const [level, setLevel]         = useState<WorkoutProgram['level']>('Beginner')
  const [targetReps, setTargetReps] = useState(10)
  const [targetHoldSecs, setTargetHold] = useState(30)
  const [selectedExercises, setSelected] = useState<string[]>([])
  const [search, setSearch]       = useState('')

  const filtered = EXERCISE_INFO.filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.muscles.some(m => m.toLowerCase().includes(search.toLowerCase()))
  )

  const toggleExercise = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const moveUp = (i: number) => {
    if (i === 0) return
    setSelected(prev => { const a = [...prev]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a })
  }
  const moveDown = (i: number) => {
    setSelected(prev => {
      if (i === prev.length - 1) return prev
      const a = [...prev]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a
    })
  }

  const canSave = name.trim().length > 0 && selectedExercises.length > 0

  const handleSave = () => {
    if (!canSave) return
    const program: WorkoutProgram = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || `Custom ${level.toLowerCase()} program`,
      level,
      duration: `${Math.ceil(selectedExercises.length * 2.5)} min`,
      exercises: selectedExercises,
      tags: ['Custom'],
      emoji: '⭐',
      targetReps,
      targetHoldSecs,
    }
    saveCustomProgram(program)
    navigate('/programs')
  }

  return (
    <div className="min-h-screen bg-page text-white pb-24">
      <header className="sticky top-0 z-10 bg-panel/90 backdrop-blur border-b border-subtle px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/programs" className="text-sm font-semibold text-blue-400 hover:text-blue-300">← Programs</Link>
            <div className="w-px h-4 bg-[#1e1e2e]" />
            <h1 className="font-black text-white tracking-tight">Build Program</h1>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-1.5 rounded-xl text-[13px] font-bold text-white transition-colors disabled:opacity-40"
            style={{ background: canSave ? '#3b82f6' : '#1e1e2e' }}
          >
            Save →
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-5">

        {/* Basic info */}
        <div className="rounded-2xl bg-panel border border-subtle p-5 space-y-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Program Info</p>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1.5 font-semibold uppercase tracking-wider">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Push Day, Core Blast…"
              className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white placeholder-gray-600 outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border-2)' }}
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1.5 font-semibold uppercase tracking-wider">Description (optional)</label>
            <input
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="What's the goal of this program?"
              className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white placeholder-gray-600 outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border-2)' }}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1.5 font-semibold uppercase tracking-wider">Level</label>
              <select
                value={level}
                onChange={e => setLevel(e.target.value as WorkoutProgram['level'])}
                className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border-2)' }}
              >
                {LEVELS.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1.5 font-semibold uppercase tracking-wider">Target Reps</label>
              <input
                type="number"
                min={1} max={50}
                value={targetReps}
                onChange={e => setTargetReps(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border-2)' }}
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1.5 font-semibold uppercase tracking-wider">Hold (secs)</label>
              <input
                type="number"
                min={5} max={120}
                value={targetHoldSecs}
                onChange={e => setTargetHold(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border-2)' }}
              />
            </div>
          </div>
        </div>

        {/* Exercise order */}
        {selectedExercises.length > 0 && (
          <div className="rounded-2xl bg-panel border border-subtle p-5 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Exercise Order ({selectedExercises.length})</p>
            <div className="space-y-2">
              {selectedExercises.map((id, i) => {
                const info = EXERCISE_INFO.find(e => e.id === id)
                return (
                  <div key={id} className="flex items-center gap-3 p-2.5 rounded-xl bg-page border border-[#1a1a2a]">
                    <span className="text-[12px] font-black text-blue-600/50 w-5 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-white">{info?.name ?? id}</p>
                      {info && <p className="text-[11px] text-gray-600">{info.muscles.slice(0, 3).join(' · ')}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => moveUp(i)} className="px-1.5 py-1 text-[10px] text-gray-500 hover:text-white">↑</button>
                      <button onClick={() => moveDown(i)} className="px-1.5 py-1 text-[10px] text-gray-500 hover:text-white">↓</button>
                      <button onClick={() => toggleExercise(id)} className="px-1.5 py-1 text-[10px] text-red-400 hover:text-red-300">✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Exercise picker */}
        <div className="rounded-2xl bg-panel border border-subtle p-5 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Add Exercises</p>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search exercises or muscles…"
            className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white placeholder-gray-600 outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-2)' }}
          />
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {filtered.map(ex => {
              const active = selectedExercises.includes(ex.id)
              return (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => toggleExercise(ex.id)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors"
                  style={active
                    ? { background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)' }
                    : { background: 'var(--bg-2)', border: '1px solid var(--border)' }
                  }
                >
                  <span className="w-4 h-4 rounded flex items-center justify-center shrink-0 text-[10px] font-black"
                    style={active
                      ? { background: '#3b82f6', color: 'white' }
                      : { background: '#1e1e2e', color: '#4b5563' }
                    }>{active ? '✓' : '+'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-white">{ex.name}</p>
                    <p className="text-[11px] text-gray-600">{ex.muscles.slice(0, 3).join(' · ')}</p>
                  </div>
                  {ex.isHold && <span className="text-[10px] text-blue-400 font-bold shrink-0">Hold</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
