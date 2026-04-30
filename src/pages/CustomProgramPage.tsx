import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EXERCISE_INFO, saveCustomProgram, type WorkoutProgram } from '../lib/programs'
import { BottomNav } from '../components/BottomNav'

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const

type Section = 'warmup' | 'main'

export function CustomProgramPage() {
  const navigate = useNavigate()
  const [name, setName]             = useState('')
  const [description, setDesc]      = useState('')
  const [level, setLevel]           = useState<WorkoutProgram['level']>('Beginner')
  const [targetReps, setTargetReps] = useState(10)
  const [targetHoldSecs, setTargetHold] = useState(30)
  const [warmupExercises, setWarmup] = useState<string[]>([])
  const [mainExercises, setMain]    = useState<string[]>([])
  const [activeSection, setSection] = useState<Section>('main')
  const [search, setSearch]         = useState('')

  const filtered = EXERCISE_INFO.filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.muscles.some(m => m.toLowerCase().includes(search.toLowerCase()))
  )

  const isSelected = (id: string) =>
    activeSection === 'warmup' ? warmupExercises.includes(id) : mainExercises.includes(id)

  const toggleExercise = (id: string) => {
    if (activeSection === 'warmup') {
      setWarmup(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    } else {
      setMain(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }
  }

  const moveInList = (list: string[], setList: (v: string[]) => void, i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const a = [...list];[a[i], a[j]] = [a[j], a[i]]; setList(a)
  }

  const removeFrom = (list: string[], setList: (v: string[]) => void, id: string) =>
    setList(list.filter(x => x !== id))

  const totalCount = warmupExercises.length + mainExercises.length
  const canSave = name.trim().length > 0 && mainExercises.length > 0

  const handleSave = () => {
    if (!canSave) return
    const program: WorkoutProgram = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || `Custom ${level.toLowerCase()} program`,
      level,
      duration: `${Math.ceil(totalCount * 2.5)} min`,
      warmup: warmupExercises.length > 0 ? warmupExercises : undefined,
      exercises: mainExercises,
      tags: ['Custom'],
      emoji: '⭐',
      targetReps,
      targetHoldSecs,
    }
    saveCustomProgram(program)
    navigate('/programs')
  }

  const OrderList = ({
    list,
    setList,
    label,
    color,
  }: {
    list: string[]
    setList: (v: string[]) => void
    label: string
    color: string
  }) => list.length === 0 ? null : (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{label}</p>
      {list.map((id, i) => {
        const info = EXERCISE_INFO.find(e => e.id === id)
        return (
          <div key={id} className="flex items-center gap-3 p-2.5 rounded-xl bg-page border border-subtle">
            <span className="text-[12px] font-black w-5 shrink-0" style={{ color: color + '80' }}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-white">{info?.name ?? id}</p>
              {info && <p className="text-[11px] text-gray-600">{info.muscles.slice(0, 3).join(' · ')}</p>}
            </div>
            <div className="flex gap-1">
              <button onClick={() => moveInList(list, setList, i, -1)} className="px-1.5 py-1 text-[10px] text-gray-500 hover:text-white">↑</button>
              <button onClick={() => moveInList(list, setList, i, 1)} className="px-1.5 py-1 text-[10px] text-gray-500 hover:text-white">↓</button>
              <button onClick={() => removeFrom(list, setList, id)} className="px-1.5 py-1 text-[10px] text-red-400 hover:text-red-300">✕</button>
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="min-h-screen bg-page text-white pb-24">
      <header className="sticky top-0 z-10 bg-panel/90 backdrop-blur border-b border-subtle px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/programs" className="text-sm font-semibold text-blue-400 hover:text-blue-300">← Programs</Link>
            <div className="w-px h-4 bg-panel-2" />
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

        {/* Exercise order summary */}
        {totalCount > 0 && (
          <div className="rounded-2xl bg-panel border border-subtle p-5 space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Exercise Order ({totalCount})
            </p>
            <OrderList list={warmupExercises} setList={setWarmup} label="Warmup" color="#f59e0b" />
            {warmupExercises.length > 0 && mainExercises.length > 0 && (
              <div className="border-t border-subtle" />
            )}
            <OrderList list={mainExercises} setList={setMain} label="Main" color="#3b82f6" />
          </div>
        )}

        {/* Section tabs + picker */}
        <div className="rounded-2xl bg-panel border border-subtle p-5 space-y-3">
          {/* Tab toggle */}
          <div className="flex gap-2">
            {(['warmup', 'main'] as Section[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSection(s)}
                className="flex-1 py-2 rounded-xl text-[12px] font-bold transition-colors capitalize"
                style={activeSection === s
                  ? s === 'warmup'
                    ? { background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }
                    : { background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }
                  : { background: 'var(--surface)', color: '#6b7280', border: '1px solid var(--border-2)' }
                }
              >
                {s === 'warmup'
                  ? `Warmup${warmupExercises.length > 0 ? ` (${warmupExercises.length})` : ''}`
                  : `Main${mainExercises.length > 0 ? ` (${mainExercises.length})` : ''}`}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-gray-600">
            {activeSection === 'warmup'
              ? 'Add light mobility or warm-up exercises done before the main set.'
              : 'Add your primary workout exercises.'}
          </p>

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search exercises or muscles…"
            className="w-full px-3 py-2.5 rounded-xl text-[13px] text-white placeholder-gray-600 outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-2)' }}
          />
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {filtered.map(ex => {
              const active = isSelected(ex.id)
              const inOther = activeSection === 'warmup'
                ? mainExercises.includes(ex.id)
                : warmupExercises.includes(ex.id)
              return (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => toggleExercise(ex.id)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors"
                  style={active
                    ? activeSection === 'warmup'
                      ? { background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)' }
                      : { background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)' }
                    : { background: 'var(--bg-2)', border: '1px solid var(--border)' }
                  }
                >
                  <span className="w-4 h-4 rounded flex items-center justify-center shrink-0 text-[10px] font-black"
                    style={active
                      ? activeSection === 'warmup'
                        ? { background: '#f59e0b', color: 'white' }
                        : { background: '#3b82f6', color: 'white' }
                      : { background: '#1e1e2e', color: '#4b5563' }
                    }>{active ? '✓' : '+'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-white">{ex.name}</p>
                    <p className="text-[11px] text-gray-600">{ex.muscles.slice(0, 3).join(' · ')}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {ex.isHold && <span className="text-[10px] text-blue-400 font-bold">Hold</span>}
                    {inOther && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                        style={activeSection === 'warmup'
                          ? { background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }
                          : { background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }
                        }>
                        {activeSection === 'warmup' ? 'in main' : 'in warmup'}
                      </span>
                    )}
                  </div>
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
