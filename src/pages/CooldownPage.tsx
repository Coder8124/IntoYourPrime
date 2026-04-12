import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkoutStore } from '../stores/workoutStore'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

// ── CooldownPage ───────────────────────────────────────────────────────────

export function CooldownPage() {
  const navigate           = useNavigate()
  const cooldownExercises  = useWorkoutStore(s => s.cooldownExercises)

  const [currentIdx,   setCurrentIdx]   = useState(0)
  const [timeLeft,     setTimeLeft]     = useState<number | null>(null)
  const [running,      setRunning]      = useState(false)
  const [allDone,      setAllDone]      = useState(false)

  const exercise = cooldownExercises[currentIdx] ?? null

  // Initialise timer when exercise changes
  useEffect(() => {
    if (exercise) {
      setTimeLeft(exercise.durationSeconds)
      setRunning(false)
    }
  }, [currentIdx, exercise])

  // If no exercises were generated, push straight to recovery
  useEffect(() => {
    if (cooldownExercises.length === 0) {
      navigate('/recovery-log', { replace: true })
    }
  }, [cooldownExercises, navigate])

  // Countdown tick
  useEffect(() => {
    if (!running || timeLeft === null || timeLeft <= 0) return
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t === null || t <= 1) { clearInterval(id); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [running, timeLeft])

  // Auto-advance when timer hits 0
  useEffect(() => {
    if (timeLeft !== 0 || !running) return
    setRunning(false)
    if (currentIdx < cooldownExercises.length - 1) {
      setTimeout(() => setCurrentIdx(i => i + 1), 800)
    } else {
      setAllDone(true)
    }
  }, [timeLeft, running, currentIdx, cooldownExercises.length])

  const handleStartPause = useCallback(() => setRunning(r => !r), [])

  const handleSkip = useCallback(() => {
    setRunning(false)
    if (currentIdx < cooldownExercises.length - 1) {
      setCurrentIdx(i => i + 1)
    } else {
      setAllDone(true)
    }
  }, [currentIdx, cooldownExercises.length])

  // ── All done screen ────────────────────────────────────────────────────
  if (allDone) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center gap-6 text-white px-6">
        <div className="text-6xl">✅</div>
        <h1 className="text-3xl font-black tracking-tight">Cooldown Complete</h1>
        <p className="text-gray-400 text-[14px] text-center max-w-xs">
          Great work. Your muscles will thank you tomorrow. Time to log how you feel.
        </p>
        <button
          onClick={() => navigate('/recovery-log')}
          className="px-8 py-3.5 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-white text-[14px] transition-all"
        >
          Log Recovery →
        </button>
        <button
          onClick={() => navigate('/home')}
          className="text-[13px] text-gray-600 hover:text-gray-400 transition-colors"
        >
          Skip to Home
        </button>
      </div>
    )
  }

  if (!exercise) return null

  const progress = exercise.durationSeconds > 0
    ? ((exercise.durationSeconds - (timeLeft ?? exercise.durationSeconds)) / exercise.durationSeconds) * 100
    : 0

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center px-4 pt-10 pb-8 text-white">

      {/* Header */}
      <div className="w-full max-w-lg mb-8">
        <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-gray-500 mb-1">
          Cooldown
        </p>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tight">Cool Down</h1>
          <span className="text-[12px] text-gray-500">
            {currentIdx + 1} / {cooldownExercises.length}
          </span>
        </div>

        {/* Exercise progress dots */}
        <div className="flex gap-1.5 mt-3">
          {cooldownExercises.map((_, i) => (
            <div
              key={i}
              className="h-1 rounded-full flex-1 transition-all duration-500"
              style={{
                background: i < currentIdx
                  ? '#22c55e'
                  : i === currentIdx
                  ? '#3b82f6'
                  : '#1e1e2e',
              }}
            />
          ))}
        </div>
      </div>

      {/* Exercise cards — current is large, upcoming shown below */}
      <div className="w-full max-w-lg space-y-4 flex-1">

        {/* Current exercise card */}
        <div className="card-surface p-6 rounded-2xl">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-[20px] font-black text-white mb-1">{exercise.name}</h2>
              <div className="flex flex-wrap gap-1.5">
                {exercise.targetMuscles.map(m => (
                  <span
                    key={m}
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize"
                    style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
            {/* Circular timer */}
            <div className="relative shrink-0 ml-4">
              <svg width={72} height={72} viewBox="0 0 72 72">
                <circle cx={36} cy={36} r={28} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
                <circle
                  cx={36} cy={36} r={28}
                  fill="none"
                  stroke={timeLeft === 0 ? '#22c55e' : '#3b82f6'}
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 28}
                  strokeDashoffset={2 * Math.PI * 28 * (1 - progress / 100)}
                  transform="rotate(-90 36 36)"
                  style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease' }}
                />
                <text
                  x={36} y={40}
                  textAnchor="middle"
                  fill="white"
                  fontSize={14}
                  fontWeight={900}
                  fontFamily="Inter,system-ui,sans-serif"
                >
                  {fmt(timeLeft ?? exercise.durationSeconds)}
                </text>
              </svg>
            </div>
          </div>

          {/* Instruction */}
          <p className="text-[13px] text-gray-300 leading-relaxed mb-6">
            {exercise.instruction}
          </p>

          {/* Controls */}
          <div className="flex gap-3">
            <button
              onClick={handleStartPause}
              className="flex-1 py-3 rounded-xl font-bold text-[14px] transition-all"
              style={{
                background: running ? 'rgba(59,130,246,0.15)' : '#2563eb',
                border: running ? '1px solid rgba(59,130,246,0.4)' : 'none',
                color: 'white',
              }}
            >
              {timeLeft === 0 ? '✓ Done' : running ? '⏸ Pause' : '▶ Start'}
            </button>
            <button
              onClick={handleSkip}
              className="px-5 py-3 rounded-xl font-semibold text-[13px] text-gray-500 border border-[#1e1e2e] hover:text-gray-300 hover:border-[#2e2e3e] transition-all"
            >
              Skip →
            </button>
          </div>
        </div>

        {/* Upcoming exercises */}
        {cooldownExercises.slice(currentIdx + 1, currentIdx + 3).map((ex, i) => (
          <div
            key={ex.name + i}
            className="card-surface p-4 rounded-xl flex items-center gap-4"
            style={{ opacity: i === 0 ? 0.55 : 0.3 }}
          >
            <div
              className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-[11px] font-black text-gray-500"
              style={{ background: '#0f0f1a', border: '1px solid #1e1e2e' }}
            >
              {fmt(ex.durationSeconds)}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white truncate">{ex.name}</p>
              <p className="text-[11px] text-gray-600 truncate">{ex.targetMuscles.join(', ')}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Finish early */}
      <button
        onClick={() => navigate('/recovery-log')}
        className="mt-8 text-[12px] text-gray-700 hover:text-gray-400 transition-colors"
      >
        Finish early → Log Recovery
      </button>
    </div>
  )
}
