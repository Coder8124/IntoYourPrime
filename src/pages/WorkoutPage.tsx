import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePoseDetection } from '../hooks/usePoseDetection'
import { useRepCounter } from '../hooks/useRepCounter'
import { useWorkoutStore } from '../stores/workoutStore'

// ── Alignment-based risk (no angle math — just body segment deviation) ─────

interface Lm { x: number; y: number; visibility?: number }

function vis(lm: Lm, t = 0.5) { return (lm.visibility ?? 0) >= t }

function ptLineDist(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  const dx = bx - ax, dy = by - ay
  const len = Math.sqrt(dx * dx + dy * dy)
  return len === 0 ? 0 : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len
}

function computeAlignmentRisk(lms: Lm[], exercise: string): number {
  if (lms.length < 29) return 0
  const lSh = lms[11], rSh = lms[12], lHip = lms[23], rHip = lms[24]
  const lKn = lms[25], rKn = lms[26], lAn = lms[27], rAn = lms[28]
  const ex = exercise.toLowerCase()

  // Minimum baseline when tracked — even perfect form carries ~10 risk
  const BASE = 10

  if (ex === 'pushup') {
    if (!vis(lSh) || !vis(lHip) || !vis(lAn)) return 0
    const shX = (lSh.x + rSh.x) / 2, shY = (lSh.y + rSh.y) / 2
    const anX = (lAn.x + rAn.x) / 2, anY = (lAn.y + rAn.y) / 2
    const hipX = (lHip.x + rHip.x) / 2, hipY = (lHip.y + rHip.y) / 2
    const dev = ptLineDist(shX, shY, anX, anY, hipX, hipY)
    return Math.min(100, BASE + Math.round(dev * 1100))
  }
  if (ex === 'squat') {
    if (!vis(lKn) || !vis(lAn) || !vis(rKn) || !vis(rAn)) return 0
    const valgus = Math.max(Math.abs(lKn.x - lAn.x), Math.abs(rKn.x - rAn.x))
    return Math.min(100, BASE + Math.round(valgus * 800))
  }
  if (ex === 'deadlift') {
    if (!vis(lSh) || !vis(lHip)) return 0
    const vertDist = Math.abs((lSh.y + rSh.y) / 2 - (lHip.y + rHip.y) / 2)
    if (vertDist < 0.05) return 0
    const horizDrift = Math.abs((lSh.x + rSh.x) / 2 - (lHip.x + rHip.x) / 2) / vertDist
    return Math.min(100, BASE + Math.round(horizDrift * 200))
  }
  if (ex === 'lunge') {
    if (!vis(lKn) || !vis(lAn)) return 0
    return Math.min(100, BASE + Math.round(Math.abs(lKn.x - lAn.x) * 800))
  }
  if (ex === 'shoulderpress') {
    if (!vis(lSh) || !vis(lHip)) return 0
    return Math.min(100, BASE + Math.round(Math.abs((lSh.x + rSh.x) / 2 - (lHip.x + rHip.x) / 2) * 900))
  }
  return 0
}

// ── Constants ──────────────────────────────────────────────────────────────

const EXERCISES = ['squat', 'pushup', 'lunge', 'deadlift', 'shoulderpress'] as const
const DEMO_MODE = true  // suggestions use local cues; risk from landmarks

const DEMO_SUGGESTIONS = [
  'Keep your chest up and drive through your heels.',
  'Engage your core — brace your abs like you\'re about to take a punch.',
  'Control the descent — aim for a 3-second eccentric.',
  'Keep your knees tracking over your toes, not caving inward.',
  'Breathe out on the concentric, in on the way down.',
  'Neutral spine throughout — don\'t let your lower back round.',
]

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(sec: number) {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

function riskColor(score: number): string {
  if (score <= 30) return '#22c55e'
  if (score <= 60) return '#f59e0b'
  return '#ef4444'
}

function riskLabel(score: number): string {
  if (score <= 30) return 'Safe'
  if (score <= 60) return 'Watch form'
  return 'High risk'
}

// ── RiskGauge ──────────────────────────────────────────────────────────────

function RiskGauge({ score }: { score: number }) {
  const R      = 40
  const circ   = 2 * Math.PI * R
  const offset = circ * (1 - score / 100)
  const color  = riskColor(score)

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={104} height={104} viewBox="0 0 104 104">
        {/* Track */}
        <circle cx={52} cy={52} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
        {/* Arc */}
        <circle
          cx={52} cy={52} r={R}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 52 52)"
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
        />
        {/* Score number */}
        <text
          x={52} y={48}
          textAnchor="middle"
          fill={color}
          fontSize={20}
          fontWeight={900}
          fontFamily="Inter,system-ui,sans-serif"
          style={{ transition: 'fill 0.4s ease' }}
        >
          {score}
        </text>
        {/* Sub-label */}
        <text
          x={52} y={62}
          textAnchor="middle"
          fill="rgba(255,255,255,0.3)"
          fontSize={7}
          fontFamily="Inter,system-ui,sans-serif"
          letterSpacing={1.2}
        >
          RISK SCORE
        </text>
      </svg>
      <span
        className="text-[11px] font-black tracking-[0.13em] uppercase"
        style={{ color, transition: 'color 0.4s ease' }}
      >
        {riskLabel(score)}
      </span>
    </div>
  )
}

// ── WarmupScoreModal ───────────────────────────────────────────────────────

interface WarmupScoreModalProps {
  score:            number
  onContinueWarmup: () => void
  onStartWorkout:   () => void
}

function WarmupScoreModal({ score, onContinueWarmup, onStartWorkout }: WarmupScoreModalProps) {
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'

  const { message, detail } =
    score >= 80
      ? { message: 'Great warmup!',           detail: 'Your body is ready to train.' }
      : score >= 50
      ? { message: 'Decent warmup.',           detail: "You're good to go, but a bit more wouldn't hurt." }
      : { message: 'Your warmup needs work.',  detail: 'You may not be ready — consider continuing your warmup. Risk of injury is higher if you start now.' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="card-surface p-8 max-w-[380px] w-full mx-4 text-center">
        <p className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-gray-500 mb-5">
          Warmup Assessment
        </p>

        {/* Score */}
        <div
          className="font-black leading-none mb-3"
          style={{ fontSize: 96, color, textShadow: `0 0 48px ${color}55` }}
        >
          {score}
        </div>
        <p className="text-white font-bold text-[17px] mb-1">{message}</p>
        <p className="text-gray-400 text-[13px] leading-relaxed mb-8">{detail}</p>

        {/* Buttons — three different layouts */}
        {score >= 80 ? (
          <button
            onClick={onStartWorkout}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white text-[14px] btn-glow-blue transition-all"
          >
            Start Workout →
          </button>
        ) : score >= 50 ? (
          <div className="flex flex-col gap-3">
            <button
              onClick={onStartWorkout}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white btn-glow-blue transition-all"
            >
              Start Workout →
            </button>
            <button
              onClick={onContinueWarmup}
              className="w-full py-3 border border-[#2e2e3e] text-gray-400 rounded-xl font-semibold text-[13px] hover:border-gray-500 hover:text-gray-200 transition-all"
            >
              Continue Warming Up
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 items-center">
            <button
              onClick={onContinueWarmup}
              className="w-full py-3.5 rounded-xl font-bold text-amber-400 text-[14px] transition-all"
              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}
            >
              Keep Warming Up
            </button>
            <button
              onClick={onStartWorkout}
              className="text-[12px] text-gray-600 hover:text-gray-400 underline underline-offset-2 transition-colors mt-1"
            >
              Start anyway
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── WorkoutPage ────────────────────────────────────────────────────────────

export function WorkoutPage() {
  const navigate = useNavigate()

  // ── Refs ───────────────────────────────────────────────────────────────
  const videoRef            = useRef<HTMLVideoElement>(null)
  const canvasRef           = useRef<HTMLCanvasElement>(null)
  const repCountRef         = useRef(0)
  const exerciseRef         = useRef('squat')
  const warmupModalFiredRef = useRef(false)
  const phaseRef            = useRef<string>('warmup')
  const demoSugIdxRef       = useRef(0)
  const lastSpokenRef       = useRef(0)

  // ── Store ──────────────────────────────────────────────────────────────
  const {
    phase, currentExercise, repCounts,
    riskScores, suggestions, safetyConcerns, warmupScore, sessionStartTime,
    setPhase, setExercise, addRep, updateAnalysis, setWarmupScore, resetSession,
  } = useWorkoutStore()

  // ── Local UI state ─────────────────────────────────────────────────────
  const [elapsed,       setElapsed]       = useState(0)
  const [showModal,     setShowModal]     = useState(false)
  const [cameraStarted, setCameraStarted] = useState(false)
  const [voiceMuted,    setVoiceMuted]    = useState(false)


  // ── Pose detection hook ────────────────────────────────────────────────
  const {
    landmarks, isTracking,
    isLoading: cameraLoading, error: cameraError,
    startCamera, stopCamera,
  } = usePoseDetection(videoRef, canvasRef)

  // ── Rep counter hook ───────────────────────────────────────────────────
  const { repCount, phase: movementPhase, lastRepTimestamp } =
    useRepCounter(landmarks, currentExercise)

  // ── Keep mutable refs in sync with latest values ───────────────────────
  useEffect(() => { repCountRef.current = repCount        }, [repCount])
  useEffect(() => { exerciseRef.current = currentExercise }, [currentExercise])
  useEffect(() => { phaseRef.current    = phase           }, [phase])

  // ── Mount: reset store, start camera ──────────────────────────────────
  useEffect(() => {
    resetSession()
    startCamera()
      .then(() => setCameraStarted(true))
      .catch(() => { /* cameraError state set inside hook */ })
    return () => stopCamera()
    // stable callbacks — intentionally empty dep array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Session timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionStartTime) return
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - sessionStartTime) / 1000)),
      1000,
    )
    return () => clearInterval(id)
  }, [sessionStartTime])

  // ── Canvas size → match rendered size ─────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const obs = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    })
    obs.observe(canvas)
    return () => obs.disconnect()
  }, [])

  // ── Sync new reps from hook → store ───────────────────────────────────
  useEffect(() => {
    if (lastRepTimestamp !== null) {
      addRep(exerciseRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRepTimestamp])

  // ── Voice feedback — speak newest suggestion when it arrives ──────────
  useEffect(() => {
    if (!suggestions.length || voiceMuted) return
    const newest = suggestions[0]
    if (newest.timestamp > lastSpokenRef.current) {
      lastSpokenRef.current = newest.timestamp
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const utter = new SpeechSynthesisUtterance(newest.text)
        utter.rate = 0.92
        utter.pitch = 1.0
        window.speechSynthesis.speak(utter)
      }
    }
  }, [suggestions, voiceMuted])

  // ── Auto-fire warmup modal at 60 s (once per session) ────────────────
  useEffect(() => {
    if (phase !== 'warmup' || showModal || warmupModalFiredRef.current) return
    if (elapsed < 60) return
    warmupModalFiredRef.current = true
    if (DEMO_MODE) {
      setWarmupScore(74)
      setShowModal(true)
    } else {
      handleEndWarmup()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, phase, showModal])

  // ── Rotating coaching suggestions every 10 s ─────────────────────────
  useEffect(() => {
    const sugId = setInterval(() => {
      const idx = demoSugIdxRef.current % DEMO_SUGGESTIONS.length
      demoSugIdxRef.current++
      updateAnalysis({
        riskScore:        0,          // risk comes from landmarks below
        suggestions:      [DEMO_SUGGESTIONS[idx]],
        safetyConcerns:   [],
        repCountEstimate: 0,
        dominantIssue:    null,
        warmupQuality:    phaseRef.current === 'warmup' ? 74 : null,
      })
    }, 10000)

    return () => clearInterval(sugId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Live risk from pose landmarks ─────────────────────────────────────
  useEffect(() => {
    if (!landmarks || !isTracking) return
    const score = computeAlignmentRisk(landmarks, exerciseRef.current)
    // patch only the riskScore without overwriting suggestions
    updateAnalysis({
      riskScore:        score,
      suggestions:      [],
      safetyConcerns:   score >= 70 ? ['High injury risk — check your form'] : [],
      repCountEstimate: 0,
      dominantIssue:    null,
      warmupQuality:    null,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landmarks, isTracking])


  // ── Derived ────────────────────────────────────────────────────────────
  // Smooth over last 8 frames to avoid jitter
  const latestRisk = riskScores.length
    ? Math.round(riskScores.slice(-8).reduce((a, b) => a + b, 0) / Math.min(riskScores.length, 8))
    : 0
  const latestSuggestions = suggestions.slice(0, 3)
  const totalReps         = Object.values(repCounts).reduce((a, b) => a + b, 0)

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleEndWarmup = useCallback(() => {
    const avg = riskScores.length
      ? riskScores.reduce((a, b) => a + b, 0) / riskScores.length
      : 50
    setWarmupScore(Math.round(Math.max(0, Math.min(100, 100 - avg))))
    setShowModal(true)
  }, [riskScores, setWarmupScore])

  const handleContinueWarmup = useCallback(() => setShowModal(false), [])

  const handleStartWorkout = useCallback(() => {
    setShowModal(false)
    setPhase('main')
  }, [setPhase])

  const handleEndWorkout = useCallback(() => {
    navigate('/session-summary')
  }, [navigate])

  // ── Camera error screen ────────────────────────────────────────────────
  if (cameraError && !cameraStarted && !DEMO_MODE) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
        <div className="card-surface p-10 max-w-[380px] text-center">
          <div className="text-5xl mb-5">📷</div>
          <h2 className="text-xl font-bold text-white mb-2">Camera Required</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-7">{cameraError}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-blue-600 rounded-xl font-semibold text-white hover:bg-blue-500 transition-colors btn-glow-blue"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────
  return (
    <>
      {/* Inline keyframe for suggestion slide-in */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .suggestion-enter { animation: slideDown 0.25s ease forwards; }
      `}</style>

      {/* Warmup score modal */}
      {showModal && warmupScore !== null && (
        <WarmupScoreModal
          score={warmupScore}
          onContinueWarmup={handleContinueWarmup}
          onStartWorkout={handleStartWorkout}
        />
      )}

      <div className="h-screen bg-[#0a0a0f] flex flex-col overflow-hidden">

        {/* ── HEADER ──────────────────────────────────────────────────── */}
        <header className="h-14 flex items-center justify-between px-6 bg-[#0d0d18] border-b border-[#1e1e2e] shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}
            >
              <span className="text-white font-black text-[15px]" style={{ letterSpacing: -1 }}>F</span>
            </div>
            <span className="font-black text-white text-[14px] tracking-tight">FormAI</span>
            {DEMO_MODE && (
              <span
                className="px-2 py-0.5 text-[9px] font-black tracking-[0.15em] uppercase rounded-md"
                style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid rgba(234,179,8,0.35)' }}
              >
                DEMO
              </span>
            )}
            <div className="w-px h-4 bg-[#1e1e2e]" />
            <span
              className="text-[11px] font-bold tracking-[0.13em] uppercase"
              style={{ color: '#3b82f6' }}
            >
              {phase === 'warmup' ? 'Warm-Up Phase' : 'Main Workout'}
            </span>
          </div>

          <div className="flex items-center gap-5">
            <span className="text-[13px] font-mono text-gray-500">
              <span className="text-white font-bold">{fmt(elapsed)}</span>
            </span>
            <button
              onClick={phase === 'main' ? handleEndWorkout : handleEndWarmup}
              className="px-4 py-1.5 border border-red-500/60 text-red-400 text-[12px] font-semibold rounded-lg hover:bg-red-500/10 transition-all"
            >
              {phase === 'main' ? 'End Workout' : 'End Warmup'}
            </button>
          </div>
        </header>

        {/* ── THREE COLUMNS ───────────────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* ── LEFT PANEL (30%) ────────────────────────────────────── */}
          <aside className="w-[22%] shrink-0 flex flex-col gap-3 p-4 border-r border-[#1e1e2e] overflow-y-auto">

            {/* Exercise selector */}
            <div className="card-surface p-4">
              <label className="block text-[10.5px] font-bold tracking-[0.15em] uppercase text-gray-500 mb-2">
                Exercise
              </label>
              <select
                value={currentExercise}
                onChange={e => setExercise(e.target.value)}
                className="input-dark capitalize"
              >
                {EXERCISES.map(ex => (
                  <option key={ex} value={ex}>{ex.charAt(0).toUpperCase() + ex.slice(1)}</option>
                ))}
              </select>
            </div>

            {/* Rep counter */}
            <div className="card-surface p-5 flex flex-col items-center">
              <span className="text-[10.5px] font-bold tracking-[0.15em] uppercase text-gray-500 mb-2">
                Current Reps
              </span>
              <div
                className="font-black leading-none select-none text-white"
                style={{ fontSize: 84, letterSpacing: -4 }}
              >
                {String(repCounts[currentExercise] ?? 0).padStart(2, '0')}
              </div>
              <span className="text-[11px] text-gray-600 mt-1 capitalize">{currentExercise}</span>

              {/* Movement phase dot */}
              <div className="mt-3 flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full transition-colors duration-200"
                  style={{
                    background: movementPhase === 'down' ? '#3b82f6'
                              : movementPhase === 'up'   ? '#22c55e'
                              : '#374151',
                    boxShadow: movementPhase !== 'unknown' ? `0 0 6px ${movementPhase === 'down' ? '#3b82f6' : '#22c55e'}` : 'none',
                  }}
                />
                <span className="text-[11px] text-gray-500 capitalize">{movementPhase}</span>
              </div>
            </div>

            {/* Phase badge */}
            <div className="card-surface p-4 flex items-center justify-between">
              <span className="text-[10.5px] font-bold tracking-[0.15em] uppercase text-gray-500">
                Phase
              </span>
              <span
                className="px-3 py-1 rounded-full text-[10.5px] font-black tracking-wider uppercase"
                style={{
                  background: phase === 'warmup'
                    ? 'rgba(234,179,8,0.1)' : 'rgba(59,130,246,0.1)',
                  color: phase === 'warmup' ? '#eab308' : '#3b82f6',
                  border: phase === 'warmup'
                    ? '1px solid rgba(234,179,8,0.25)' : '1px solid rgba(59,130,246,0.25)',
                }}
              >
                {phase === 'warmup' ? 'Warmup' : 'Main Workout'}
              </span>
            </div>

            {/* Session timer */}
            <div className="card-surface p-4">
              <span className="block text-[10.5px] font-bold tracking-[0.15em] uppercase text-gray-500 mb-2">
                Elapsed
              </span>
              <div className="font-mono text-[30px] font-black text-white text-glow-blue">
                {fmt(elapsed)}
              </div>
            </div>

            {/* Rep history */}
            <div className="card-surface p-4 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <span className="text-[10.5px] font-bold tracking-[0.15em] uppercase text-gray-500">
                  Session Reps
                </span>
                <span className="text-[11px] font-black text-blue-400">{totalReps} total</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                {Object.keys(repCounts).length === 0 ? (
                  <p className="text-gray-700 text-[12px] text-center py-4">No reps yet</p>
                ) : (
                  Object.entries(repCounts).map(([ex, count]) => (
                    <div
                      key={ex}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-[#0f0f1a] border border-[#1e1e2e]"
                    >
                      <span className="text-[12px] font-semibold text-white capitalize">{ex}</span>
                      <span className="text-blue-400 font-black text-[15px]">{count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          {/* ── CENTER (40%) ───────────────────────────────────────────── */}
          <main className="flex-1 flex flex-col p-4 min-w-0 overflow-hidden">
            <div className="relative flex-1 rounded-xl overflow-hidden bg-[#050508] min-h-0 shadow-[0_0_0_1px_#1e1e2e]">

              {/* Camera initialising */}
              {cameraLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#050508] z-10">
                  <div className="w-10 h-10 border-2 border-blue-600/30 border-t-blue-500 rounded-full animate-spin" />
                  <span className="text-gray-600 text-[13px]">Initializing camera…</span>
                </div>
              )}

              {/* No pose detected overlay */}
              {!cameraLoading && cameraStarted && !isTracking && (
                <div className="absolute inset-0 flex items-end justify-center pb-6 pointer-events-none z-10">
                  <div className="px-4 py-2.5 bg-black/70 backdrop-blur-md rounded-full border border-white/[0.07]">
                    <span className="text-gray-400 text-[13px]">No pose detected — step into frame</span>
                  </div>
                </div>
              )}

              {/* Video — mirrored with CSS so it feels like a mirror */}
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
                playsInline muted autoPlay
              />
              {/* Canvas — skeleton drawn mirrored inside usePoseDetection */}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
              />
            </div>
          </main>

          {/* ── RIGHT PANEL (30%) ──────────────────────────────────────── */}
          <aside className="w-[22%] shrink-0 flex flex-col gap-3 p-4 border-l border-[#1e1e2e] overflow-hidden">

            {/* Risk gauge */}
            <div className="card-surface p-5 flex flex-col items-center">
              <span className="text-[10.5px] font-bold tracking-[0.15em] uppercase text-gray-500 mb-3">
                Injury Risk
              </span>
              <RiskGauge score={latestRisk} />
            </div>

            {/* Safety concern banner */}
            {safetyConcerns.length > 0 && (
              <div
                className="rounded-xl p-4 shrink-0"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                  <span className="text-[10.5px] font-black tracking-wider uppercase text-red-400">
                    Safety Alert
                  </span>
                </div>
                {safetyConcerns.map((concern, i) => (
                  <p key={i} className="text-[12px] text-red-300 leading-relaxed">{concern}</p>
                ))}
              </div>
            )}

            {/* Coach feedback / suggestions */}
            <div className="flex-1 flex flex-col min-h-0">
              <span className="text-[10.5px] font-bold tracking-[0.15em] uppercase text-gray-500 mb-3 shrink-0">
                Coach Feedback
              </span>

              <div className="flex-1 overflow-y-auto space-y-2.5 min-h-0">
                {latestSuggestions.length === 0 ? (
                  <div className="card-surface p-5 text-center mt-2">
                    <div className="text-2xl mb-2">🎯</div>
                    <p className="text-[12px] text-gray-600 leading-relaxed">
                      Form cues will appear once you start moving.
                    </p>
                  </div>
                ) : (
                  latestSuggestions.map((entry, i) => (
                    <div
                      key={`${entry.timestamp}-${i}`}
                      className={i === 0 ? 'suggestion-enter' : ''}
                      style={{
                        background:      '#13131f',
                        borderRadius:    10,
                        border:          '1px solid',
                        borderColor:     i === 0 ? 'rgba(59,130,246,0.35)' : '#1e1e2e',
                        borderLeftWidth: i === 0 ? 3 : 1,
                        borderLeftColor: i === 0 ? '#3b82f6' : '#1e1e2e',
                        opacity:         i === 0 ? 1 : i === 1 ? 0.62 : 0.35,
                        padding:         '10px 12px',
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        <span className="text-[10px] text-gray-600 font-mono">
                          {new Date(entry.timestamp).toLocaleTimeString([], {
                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-[12px] text-gray-300 leading-[1.55]">{entry.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>

        {/* ── BOTTOM BAR ──────────────────────────────────────────────── */}
        <div className="h-16 flex items-center justify-between px-6 bg-[#0d0d18] border-t border-[#1e1e2e] shrink-0">

          {/* Mute toggle */}
          <button
            onClick={() => setVoiceMuted(m => !m)}
            className={[
              'flex items-center gap-2 px-4 py-2 rounded-lg border text-[12px] font-semibold transition-all',
              voiceMuted
                ? 'border-[#1e1e2e] text-gray-600 hover:text-gray-400'
                : 'border-[#1e1e2e] text-gray-500 hover:text-gray-300 hover:border-[#2e2e3e]',
            ].join(' ')}
          >
            {voiceMuted ? '🔇' : '🔊'}
            <span>{voiceMuted ? 'Voice Off' : 'Voice On'}</span>
          </button>

          {/* Phase CTA */}
          {phase === 'warmup' ? (
            <button
              onClick={handleEndWarmup}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white text-[14px] btn-glow-blue transition-all"
            >
              End Warmup → Start Workout
            </button>
          ) : (
            <button
              onClick={handleEndWorkout}
              className="px-8 py-3 rounded-xl font-bold text-white text-[14px] transition-all"
              style={{
                background: 'rgba(239,68,68,0.75)',
                border: '1px solid rgba(239,68,68,0.5)',
              }}
            >
              End Workout
            </button>
          )}

          {/* Tracking status */}
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full transition-all duration-300"
              style={{
                background: isTracking ? '#22c55e' : '#374151',
                boxShadow:  isTracking ? '0 0 6px #22c55e' : 'none',
              }}
            />
            <span className="text-[12px] text-gray-500">
              {isTracking ? 'Tracking' : 'Not detected'}
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
