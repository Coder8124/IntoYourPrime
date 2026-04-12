import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ZoomIn, ZoomOut, Maximize2, Minimize2 } from 'lucide-react'
import { usePoseDetection } from '../hooks/usePoseDetection'
import { useRepCounter } from '../hooks/useRepCounter'
import { useWorkoutStore } from '../stores/workoutStore'
import { analyzeForm, generateCooldown, hasApiKey } from '../lib/formAnalysis'
import type { CooldownExercise, UserProfile } from '../types/index'

// ── Alignment-based risk (no angle math — pure body-segment deviation) ─────

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
  const BASE = 10
  if (ex === 'pushup') {
    if (!vis(lSh) || !vis(lHip) || !vis(lAn)) return 0
    const shX = (lSh.x + rSh.x) / 2, shY = (lSh.y + rSh.y) / 2
    const anX = (lAn.x + rAn.x) / 2, anY = (lAn.y + rAn.y) / 2
    const hipX = (lHip.x + rHip.x) / 2, hipY = (lHip.y + rHip.y) / 2
    return Math.min(100, BASE + Math.round(ptLineDist(shX, shY, anX, anY, hipX, hipY) * 1100))
  }
  if (ex === 'squat') {
    if (!vis(lKn) || !vis(lAn) || !vis(rKn) || !vis(rAn)) return 0
    return Math.min(100, BASE + Math.round(Math.max(Math.abs(lKn.x - lAn.x), Math.abs(rKn.x - rAn.x)) * 800))
  }
  if (ex === 'deadlift') {
    if (!vis(lSh) || !vis(lHip)) return 0
    const vertDist = Math.abs((lSh.y + rSh.y) / 2 - (lHip.y + rHip.y) / 2)
    if (vertDist < 0.05) return 0
    return Math.min(100, BASE + Math.round(Math.abs((lSh.x + rSh.x) / 2 - (lHip.x + rHip.x) / 2) / vertDist * 200))
  }
  if (ex === 'lunge') {
    if (!vis(lKn) || !vis(lAn)) return 0
    return Math.min(100, BASE + Math.round(Math.abs(lKn.x - lAn.x) * 800))
  }
  if (ex === 'shoulderpress') {
    const lWr = lms[15], rWr = lms[16]
    if (!vis(lSh, 0.3) || !vis(lWr, 0.3) || !vis(rWr, 0.3)) return BASE
    return Math.min(100, BASE + Math.round(Math.abs((lSh.y - lWr.y) - (rSh.y - rWr.y)) * 700))
  }
  if (ex === 'curlup') {
    // Check symmetry: both shoulders should rise equally (uneven = neck strain)
    if (!vis(lSh, 0.3) || !vis(rSh, 0.3)) return BASE
    const asymmetry = Math.abs(lSh.y - rSh.y)
    return Math.min(100, BASE + Math.round(asymmetry * 900))
  }
  if (ex === 'bicepcurl') {
    // Check elbow drift: elbows should stay at sides (drift = using momentum)
    const lEl = lms[13], rEl = lms[14]
    if (!vis(lEl, 0.3) || !vis(lHip, 0.3)) return BASE
    const leftDrift  = Math.abs(lEl.x - lHip.x)
    const rightDrift = Math.abs(rEl.x - rHip.x)
    const drift = Math.max(leftDrift, rightDrift)
    return Math.min(100, BASE + Math.round(drift * 600))
  }
  return 0
}

// ── Constants ──────────────────────────────────────────────────────────────

const EXERCISES = ['squat', 'pushup', 'lunge', 'deadlift', 'shoulderpress', 'curlup', 'bicepcurl'] as const

const EXERCISE_LABELS: Record<typeof EXERCISES[number], string> = {
  squat:         'Squat',
  pushup:        'Push-Up',
  lunge:         'Lunge',
  deadlift:      'Deadlift',
  shoulderpress: 'Shoulder Press',
  curlup:        'Curl-Up',
  bicepcurl:     'Bicep Curl',
}

const DEMO_SUGGESTIONS = [
  "Keep your chest up and drive through your heels.",
  "Engage your core — brace your abs like you're about to take a punch.",
  "Control the descent — aim for a 3-second eccentric.",
  "Keep your knees tracking over your toes, not caving inward.",
  "Breathe out on the concentric, in on the way down.",
  "Neutral spine throughout — don't let your lower back round.",
]

/** Optional center-crop so a small subject fills more of the preview (pose still uses full camera). */
const CAMERA_ZOOM_MIN = 1
const CAMERA_ZOOM_MAX = 2.75
const CAMERA_ZOOM_STEP = 0.125

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
      : { message: 'Your warmup needs work.',  detail: 'Risk of injury is higher going into the main session.' }

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
          <div className="flex flex-col gap-3">
            <button
              onClick={onStartWorkout}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white text-[14px] btn-glow-blue transition-all"
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
  const cameraShellRef      = useRef<HTMLDivElement>(null)
  const analyzingRef        = useRef(false)
  const repCountRef         = useRef(0)
  const exerciseRef         = useRef('squat')
  const phaseRef            = useRef<string>('warmup')
  const warmupModalFiredRef = useRef(false)
  const demoSugIdxRef       = useRef(0)
  const lastSpokenRef       = useRef(0)
  const aiRiskRef           = useRef<number | null>(null)
  const referenceFrameRef   = useRef<string | null>(null)   // reference photo for AI person tracking

  // ── Store ──────────────────────────────────────────────────────────────
  const {
    phase, currentExercise, repCounts,
    riskScores, suggestions, safetyConcerns, warmupScore, sessionStartTime,
    cooldownExercises,
    setPhase, setExercise, addRep, resetExerciseReps, updateAnalysis, setWarmupScore,
    setCooldownExercises, setCooldownCompleted, endSession, resetSession,
  } = useWorkoutStore()

  // ── Local UI state ─────────────────────────────────────────────────────
  const [elapsed,       setElapsed]       = useState(0)
  const [showModal,     setShowModal]     = useState(false)
  const [cameraStarted, setCameraStarted] = useState(false)
  const [voiceMuted,    setVoiceMuted]    = useState(false)
  const [cameraZoom,       setCameraZoom]       = useState(1)
  const [wideCameraLayout, setWideCameraLayout] = useState(false)
  const [cameraFullscreen, setCameraFullscreen] = useState(false)
  const [refCaptured,      setRefCaptured]      = useState(false)   // whether reference photo has been taken

  // ── Set counter ────────────────────────────────────────────────────────
  interface SetLogEntry { setNum: number; exercise: string; reps: number }
  const [setCount, setSetCount] = useState(0)
  const [setLog,   setSetLog]   = useState<SetLogEntry[]>([])

  // ── Cooldown state ─────────────────────────────────────────────────────
  const [loadingCooldown,  setLoadingCooldown]  = useState(false)
  const [cooldownIdx,      setCooldownIdx]      = useState(0)
  const [cooldownTimeLeft, setCooldownTimeLeft] = useState(0)

  // ── User profile ───────────────────────────────────────────────────────
  const userProfile = useMemo(() => {
    try {
      const stored = localStorage.getItem('formAI_profile')
      const p = stored ? (JSON.parse(stored) as Record<string, unknown>) : {}
      const ageN = Number(p.age)
      const weightN = Number(p.weight)
      return {
        age: Number.isFinite(ageN) && ageN > 0 ? ageN : 25,
        weight: Number.isFinite(weightN) && weightN > 0 ? weightN : 70,
        fitnessLevel:
          typeof p.fitnessLevel === 'string' ? p.fitnessLevel : 'intermediate',
      }
    } catch {
      return { age: 25, weight: 70, fitnessLevel: 'intermediate' }
    }
  }, [])

  const nudgeCameraZoom = useCallback((delta: number) => {
    setCameraZoom((z) => {
      const next = z + delta
      const clamped = Math.min(CAMERA_ZOOM_MAX, Math.max(CAMERA_ZOOM_MIN, next))
      return Math.round(clamped * 1000) / 1000
    })
  }, [])

  const onCameraPreviewWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const step = e.ctrlKey || e.metaKey ? CAMERA_ZOOM_STEP * 1.5 : CAMERA_ZOOM_STEP
      nudgeCameraZoom(e.deltaY > 0 ? -step : step)
    },
    [nudgeCameraZoom],
  )

  useEffect(() => {
    const sync = () => {
      setCameraFullscreen(document.fullscreenElement === cameraShellRef.current)
    }
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  // ── Reference photo capture ────────────────────────────────────────────
  const captureReferencePhoto = useCallback(() => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    const canvas = document.createElement('canvas')
    canvas.width  = 640
    canvas.height = 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Mirror to match the displayed feed
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    referenceFrameRef.current = canvas.toDataURL('image/jpeg', 0.85)
    setRefCaptured(true)
  }, [videoRef])

  const toggleCameraFullscreen = useCallback(() => {
    const el = cameraShellRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      void el.requestFullscreen().catch(() => {
        /* Safari / blocked */
      })
    } else {
      void document.exitFullscreen()
    }
  }, [])

  // ── Pose detection hook ────────────────────────────────────────────────
  const {
    landmarks, isTracking,
    isLoading: cameraLoading, error: cameraError,
    getBestFrames, startCamera, stopCamera,
  } = usePoseDetection(videoRef, canvasRef)

  // ── Rep counter hook ───────────────────────────────────────────────────
  const { repCount, phase: movementPhase, lastRepTimestamp, isCalibrating, reset: resetRepCounter } =
    useRepCounter(landmarks, currentExercise)

  // ── Keep mutable refs in sync with latest values ───────────────────────
  useEffect(() => { repCountRef.current = repCount        }, [repCount])
  useEffect(() => { exerciseRef.current = currentExercise }, [currentExercise])
  useEffect(() => { phaseRef.current    = phase           }, [phase])

  // ── New-set handler (spacebar) ─────────────────────────────────────────
  const handleNewSet = useCallback(() => {
    const reps = repCounts[currentExercise] ?? 0
    setSetCount(prev => {
      const nextNum = prev + 1
      setSetLog(log => [...log, { setNum: nextNum, exercise: currentExercise, reps }])
      return nextNum
    })
    resetExerciseReps(currentExercise)
    resetRepCounter()
  }, [repCounts, currentExercise, resetExerciseReps, resetRepCounter])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        phaseRef.current === 'main' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault()
        handleNewSet()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleNewSet])

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
        window.speechSynthesis.speak(utter)
      }
    }
  }, [suggestions, voiceMuted])

  // ── Auto-fire warmup modal at 60 s (once per session) ─────────────────
  useEffect(() => {
    if (phase !== 'warmup' || showModal || warmupModalFiredRef.current) return
    if (elapsed < 60) return
    warmupModalFiredRef.current = true
    handleEndWarmup()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, phase, showModal])

  // ── Rotating coaching suggestions every 10 s (only when no API key) ───
  useEffect(() => {
    if (hasApiKey()) return   // OpenAI handles coaching — don't override with canned suggestions
    const id = setInterval(() => {
      const idx = demoSugIdxRef.current % DEMO_SUGGESTIONS.length
      demoSugIdxRef.current++
      updateAnalysis({
        riskScore:        0,
        suggestions:      [DEMO_SUGGESTIONS[idx]],
        safetyConcerns:   [],
        repCountEstimate: 0,
        dominantIssue:    null,
        warmupQuality:    phaseRef.current === 'warmup' ? 74 : null,
      })
    }, 10000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Live risk from pose landmarks (runs every frame) ──────────────────
  useEffect(() => {
    if (!landmarks || !isTracking) return
    const localScore = computeAlignmentRisk(landmarks, exerciseRef.current)
    const aiScore = aiRiskRef.current
    const blended = aiScore !== null
      ? Math.round(aiScore * 0.6 + localScore * 0.4)
      : localScore
    updateAnalysis({
      riskScore:        blended,
      suggestions:      [],
      safetyConcerns:   blended >= 70 ? ['High injury risk — check your form'] : [],
      repCountEstimate: 0,
      dominantIssue:    null,
      warmupQuality:    null,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landmarks, isTracking])

  // ── API risk + suggestions: first at 8 s, then every 30 s ────────────
  useEffect(() => {
    if (!hasApiKey()) return
    const callApi = async () => {
      if (!isTracking || analyzingRef.current) return
      const frames = getBestFrames(3, exerciseRef.current)
      if (!frames.length) return
      analyzingRef.current = true
      try {
        const result = await analyzeForm({
          frames,
          exercise:       exerciseRef.current,
          repCount:       repCountRef.current,
          userProfile,
          phase:          phaseRef.current === 'warmup' ? 'warmup' : 'main',
          referenceFrame: referenceFrameRef.current,
        })
        aiRiskRef.current = result.riskScore
        if (result.suggestions.length > 0) {
          updateAnalysis({
            riskScore:        result.riskScore,
            suggestions:      result.suggestions,
            safetyConcerns:   result.safetyConcerns,
            repCountEstimate: 0,
            dominantIssue:    result.dominantIssue,
            warmupQuality:    result.warmupQuality,
          })
        }
      } catch { /* keep using local score */ } finally {
        analyzingRef.current = false
      }
    }
    const firstTimer = setTimeout(callApi, 8_000)
    const interval   = setInterval(callApi, 30_000)
    return () => { clearTimeout(firstTimer); clearInterval(interval) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTracking, getBestFrames])

  // ── Derived ────────────────────────────────────────────────────────────
  // Smooth over last 8 frames to reduce jitter
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

  const handleEndWorkout = useCallback(async () => {
    setPhase('cooldown')
    setLoadingCooldown(true)
    setCooldownIdx(0)

    let profileData: Record<string, unknown> = {}
    try {
      const raw = localStorage.getItem('formAI_profile')
      if (raw) profileData = JSON.parse(raw) as Record<string, unknown>
    } catch { /* ignore */ }

    const fullProfile: UserProfile = {
      uid: '',
      email: '',
      displayName: String(profileData.name ?? ''),
      age: Number(profileData.age) || 25,
      weightKg: Number(profileData.weight) || 70,
      heightCm: Number(profileData.height) || 170,
      biologicalSex: (profileData.biologicalSex as UserProfile['biologicalSex']) ?? 'other',
      fitnessLevel: (profileData.fitnessLevel as UserProfile['fitnessLevel']) ?? 'intermediate',
      createdAt: new Date(),
      streakCount: 0,
      lastWorkoutDate: null,
    }

    const exercises: CooldownExercise[] = await generateCooldown(
      { exercises: Object.keys(repCounts), repCounts },
      fullProfile,
    )

    const fallback: CooldownExercise[] = [
      { name: 'Standing quad stretch', durationSeconds: 30, targetMuscles: ['quads'], instruction: 'Stand on one leg, pull the other foot to your glutes. Hold and switch.' },
      { name: 'Seated hamstring stretch', durationSeconds: 40, targetMuscles: ['hamstrings'], instruction: 'Sit on the floor, legs straight, reach toward your toes. Keep your back flat.' },
      { name: 'Child\'s pose', durationSeconds: 45, targetMuscles: ['back', 'shoulders'], instruction: 'Kneel and sit back on your heels, stretch arms forward on the floor. Breathe deeply.' },
      { name: 'Cross-body shoulder stretch', durationSeconds: 30, targetMuscles: ['shoulders'], instruction: 'Pull one arm across your chest with the opposite hand. Hold then switch.' },
    ]

    const final = exercises.length > 0 ? exercises : fallback
    setCooldownExercises(final)
    setCooldownTimeLeft(final[0].durationSeconds)
    setLoadingCooldown(false)
  }, [setPhase, repCounts, setCooldownExercises])

  // ── Cooldown timer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'cooldown' || loadingCooldown || cooldownExercises.length === 0) return
    if (cooldownIdx >= cooldownExercises.length) return

    const id = setInterval(() => {
      setCooldownTimeLeft(t => Math.max(0, t - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [phase, loadingCooldown, cooldownExercises, cooldownIdx])

  // ── Auto-advance when timer hits 0 ─────────────────────────────────────
  useEffect(() => {
    if (phase !== 'cooldown' || loadingCooldown || cooldownExercises.length === 0) return
    if (cooldownTimeLeft !== 0) return
    if (cooldownIdx >= cooldownExercises.length) return

    const next = cooldownIdx + 1
    if (next >= cooldownExercises.length) {
      setCooldownCompleted(true)
      endSession()
      navigate('/session-summary')
    } else {
      setCooldownIdx(next)
      setCooldownTimeLeft(cooldownExercises[next].durationSeconds)
    }
  }, [cooldownTimeLeft, phase, loadingCooldown, cooldownExercises, cooldownIdx, setCooldownCompleted, endSession, navigate])

  // ── Cooldown screen ────────────────────────────────────────────────────
  if (phase === 'cooldown') {
    const currentEx = cooldownExercises[cooldownIdx] ?? null

    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center p-6 text-white">
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-green-400 mb-2">Cooldown</p>
        <h1 className="text-2xl font-black tracking-tight mb-1">Nice work — cool down now</h1>
        <p className="text-gray-500 text-sm mb-10">Follow each stretch at a gentle pace</p>

        {loadingCooldown ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-green-600/30 border-t-green-500 rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Generating your cooldown…</p>
          </div>
        ) : currentEx ? (
          <div className="w-full max-w-md">
            {/* Progress dots */}
            <div className="flex justify-center gap-2 mb-8">
              {cooldownExercises.map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full transition-all"
                  style={{
                    background: i < cooldownIdx ? '#22c55e' : i === cooldownIdx ? '#86efac' : '#1e1e2e',
                  }}
                />
              ))}
            </div>

            {/* Current exercise card */}
            <div
              className="card-surface p-8 text-center mb-6"
              style={{ borderColor: 'rgba(34,197,94,0.25)' }}
            >
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-500 mb-3">
                {cooldownIdx + 1} of {cooldownExercises.length}
              </p>
              <h2 className="text-2xl font-black text-white mb-2">{currentEx.name}</h2>
              <p className="text-gray-400 text-sm leading-relaxed mb-6">{currentEx.instruction}</p>

              {/* Timer circle */}
              <div className="flex justify-center mb-6">
                <div className="relative w-24 h-24">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
                    <circle cx={48} cy={48} r={40} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6} />
                    <circle
                      cx={48} cy={48} r={40}
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth={6}
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 40}
                      strokeDashoffset={2 * Math.PI * 40 * (1 - cooldownTimeLeft / (currentEx.durationSeconds || 1))}
                      style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-mono text-2xl font-black text-green-400">{cooldownTimeLeft}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-1.5">
                {currentEx.targetMuscles.map(m => (
                  <span key={m} className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-green-500/10 text-green-400 border border-green-500/20 capitalize">
                    {m}
                  </span>
                ))}
              </div>
            </div>

            {/* Controls */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  const next = cooldownIdx + 1
                  if (next >= cooldownExercises.length) {
                    setCooldownCompleted(true)
                    endSession()
                    navigate('/session-summary')
                  } else {
                    setCooldownIdx(next)
                    setCooldownTimeLeft(cooldownExercises[next].durationSeconds)
                  }
                }}
                className="flex-1 py-3 rounded-xl border border-[#2e2e3e] text-gray-400 font-semibold text-sm hover:border-gray-500 hover:text-gray-200 transition-all"
              >
                Skip →
              </button>
              <button
                onClick={() => {
                  setCooldownCompleted(true)
                  endSession()
                  navigate('/session-summary')
                }}
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-green-400 transition-all"
                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}
              >
                Finish early
              </button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  // ── Camera error screen ────────────────────────────────────────────────
  if (cameraError && !cameraStarted) {
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

          {/* ── LEFT PANEL ───────────────────────────────────────────── */}
          <aside
            className={[
              'shrink-0 flex flex-col gap-3 border-r border-[#1e1e2e] overflow-y-auto',
              wideCameraLayout ? 'p-3' : 'p-4',
              wideCameraLayout ? 'w-[min(13.5rem,22vw)]' : 'w-[30%]',
            ].join(' ')}
          >

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
                  <option key={ex} value={ex}>{EXERCISE_LABELS[ex]}</option>
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
              <span className="text-[11px] text-gray-600 mt-1">{EXERCISE_LABELS[currentExercise as typeof EXERCISES[number]] ?? currentExercise}</span>

              {/* Movement phase dot */}
              {isCalibrating ? (
                <p className="mt-3 text-[11px] text-amber-500 animate-pulse">Calibrating…</p>
              ) : (
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
              )}
            </div>

            {/* Set counter */}
            <div className="card-surface p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10.5px] font-bold tracking-[0.15em] uppercase text-gray-500">
                  Sets
                </span>
                <button
                  type="button"
                  onClick={handleNewSet}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-green-400 border border-green-500/30 hover:border-green-400/50 hover:bg-green-500/10 transition-colors"
                >
                  + New Set
                </button>
              </div>
              <div className="font-black text-white leading-none" style={{ fontSize: 48, letterSpacing: -2 }}>
                {String(setCount).padStart(2, '0')}
              </div>
              {setLog.length > 0 && (
                <div className="mt-2 space-y-1 max-h-20 overflow-y-auto">
                  {[...setLog].reverse().map(s => (
                    <div key={s.setNum} className="flex justify-between text-[11px]">
                      <span className="text-gray-600">Set {s.setNum} · <span className="capitalize">{s.exercise}</span></span>
                      <span className="font-mono font-bold text-gray-400">{s.reps} reps</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[10px] text-gray-700">Space to start new set</p>
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
                      <span className="text-[12px] font-semibold text-white">{EXERCISE_LABELS[ex as typeof EXERCISES[number]] ?? ex}</span>
                      <span className="text-blue-400 font-black text-[15px]">{count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          {/* ── CENTER (40%) ───────────────────────────────────────────── */}
          <main className={`flex-1 flex flex-col min-w-0 overflow-hidden ${wideCameraLayout ? 'p-3' : 'p-4'}`}>
            <div
              ref={cameraShellRef}
              className={[
                'relative flex-1 overflow-hidden bg-[#050508] min-h-0 shadow-[0_0_0_1px_#1e1e2e]',
                cameraFullscreen ? 'rounded-none' : 'rounded-xl',
              ].join(' ')}
              onWheel={onCameraPreviewWheel}
            >

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

              {/* Reference photo prompt — shown once after pose is first detected */}
              {!cameraLoading && cameraStarted && isTracking && !refCaptured && (
                <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                  <div
                    className="mx-4 w-full max-w-sm rounded-2xl p-5 text-center pointer-events-auto"
                    style={{ background: 'rgba(10,10,20,0.88)', border: '1px solid rgba(59,130,246,0.35)', backdropFilter: 'blur(12px)' }}
                  >
                    <div className="text-3xl mb-3">📸</div>
                    <p className="font-black text-white text-[16px] mb-1">Set your reference</p>
                    <p className="text-gray-400 text-[12px] leading-relaxed mb-4">
                      Stand in frame so we can identify you. The AI will focus on you even if others walk through.
                    </p>
                    <button
                      type="button"
                      onClick={captureReferencePhoto}
                      className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-[15px] text-white transition-colors"
                      style={{ boxShadow: '0 0 24px rgba(59,130,246,0.4)' }}
                    >
                      That's me — capture photo
                    </button>
                    <button
                      type="button"
                      onClick={() => setRefCaptured(true)}
                      className="mt-2 w-full py-2 text-[12px] text-gray-600 hover:text-gray-400 transition-colors"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}

              {/* Reference captured confirmation — fades after 2s */}
              {refCaptured && referenceFrameRef.current && (
                <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full pointer-events-none"
                  style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-[11px] font-semibold text-green-400">Reference set</span>
                </div>
              )}

              {/* Scaled preview (crop to center when zoomed in) */}
              <div className="absolute inset-0 overflow-hidden">
                <div
                  className="absolute inset-0 will-change-transform"
                  style={{
                    transform: `scale(${cameraZoom})`,
                    transformOrigin: 'center center',
                  }}
                >
                  <video
                    ref={videoRef}
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                    playsInline
                    muted
                    autoPlay
                  />
                  <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
                </div>
              </div>

              {/* Display + magnify controls */}
              {!cameraLoading && cameraStarted && (
                <>
                  <div className="absolute right-2 top-2 z-20 flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={toggleCameraFullscreen}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/70 text-gray-200 backdrop-blur-md transition hover:bg-white/10"
                      title={cameraFullscreen ? 'Exit fullscreen' : 'Fullscreen camera'}
                      aria-label={cameraFullscreen ? 'Exit fullscreen' : 'Fullscreen camera'}
                    >
                      {cameraFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWideCameraLayout((w) => !w)}
                      className={[
                        'rounded-lg border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide backdrop-blur-md transition',
                        wideCameraLayout
                          ? 'border-blue-500/50 bg-blue-600/30 text-blue-100'
                          : 'border-white/15 bg-black/70 text-gray-300 hover:bg-white/10',
                      ].join(' ')}
                      title="Give the camera column more space (narrow side panels)"
                    >
                      {wideCameraLayout ? 'Wide on' : 'Wide view'}
                    </button>
                  </div>

                  <div className="absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-col items-center gap-1.5 sm:max-w-none">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                      Magnify center (optional)
                    </span>
                    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/65 px-2 py-1.5 backdrop-blur-md">
                      <button
                        type="button"
                        aria-label="Magnify less"
                        disabled={cameraZoom <= CAMERA_ZOOM_MIN}
                        onClick={() => nudgeCameraZoom(-CAMERA_ZOOM_STEP)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-300 transition hover:bg-white/10 disabled:opacity-30"
                      >
                        <ZoomOut className="h-4 w-4" />
                      </button>
                      <input
                        type="range"
                        aria-label="Magnify center"
                        min={CAMERA_ZOOM_MIN}
                        max={CAMERA_ZOOM_MAX}
                        step={CAMERA_ZOOM_STEP}
                        value={cameraZoom}
                        onChange={(e) => setCameraZoom(Number(e.target.value))}
                        className="h-1 w-[72px] cursor-pointer accent-blue-500 sm:w-[120px]"
                      />
                      <button
                        type="button"
                        aria-label="Magnify more"
                        disabled={cameraZoom >= CAMERA_ZOOM_MAX}
                        onClick={() => nudgeCameraZoom(CAMERA_ZOOM_STEP)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-300 transition hover:bg-white/10 disabled:opacity-30"
                      >
                        <ZoomIn className="h-4 w-4" />
                      </button>
                      <span className="hidden min-w-[2.5rem] pr-0.5 text-center font-mono text-[10px] text-gray-400 sm:inline">
                        {cameraZoom.toFixed(2)}×
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </main>

          {/* ── RIGHT PANEL ─────────────────────────────────────────────── */}
          <aside
            className={[
              'shrink-0 flex flex-col gap-3 border-l border-[#1e1e2e] overflow-hidden',
              wideCameraLayout ? 'p-3' : 'p-4',
              wideCameraLayout ? 'w-[min(13.5rem,22vw)]' : 'w-[30%]',
            ].join(' ')}
          >

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
