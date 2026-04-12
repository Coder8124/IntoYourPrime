import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type CSSProperties,
} from 'react'
import { useNavigate } from 'react-router-dom'

// ── Types ──────────────────────────────────────────────────────────────────

type Phase      = 'warmup' | 'main'
type RiskLevel  = 'safe' | 'caution' | 'high' | 'danger'
type MsgType    = 'tip' | 'warning' | 'encouragement'

interface CompletedSet {
  id: string
  exercise: string
  reps: number
  timestamp: number
}

interface TranscriptMsg {
  id: string
  text: string
  timestamp: number  // seconds from start
  type: MsgType
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(sec: number) {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

function getRiskLevel(s: number): RiskLevel {
  if (s <= 30) return 'safe'
  if (s <= 60) return 'caution'
  if (s <= 85) return 'high'
  return 'danger'
}

const RISK_META: Record<RiskLevel, { stroke: string; text: string; label: string }> = {
  safe:    { stroke: '#22c55e', text: '#22c55e', label: 'SAFE' },
  caution: { stroke: '#eab308', text: '#eab308', label: 'CAUTION' },
  high:    { stroke: '#f97316', text: '#f97316', label: 'HIGH RISK' },
  danger:  { stroke: '#ef4444', text: '#ef4444', label: 'DANGER' },
}

const MSG_DOT: Record<MsgType, string> = {
  tip:          '#3b82f6',
  warning:      '#eab308',
  encouragement:'#22c55e',
}

// Demo coaching messages seeded at specific timestamps
const DEMO_MSGS: Omit<TranscriptMsg, 'id'>[] = [
  { text: 'Great depth on that squat! Keep your chest up and back neutral.', timestamp: 4,  type: 'encouragement' },
  { text: "Watch your left knee \u2014 it's tracking slightly inward. Push it out over the 2nd toe.", timestamp: 14, type: 'warning' },
  { text: 'Core is engaged well. Maintain that brace throughout the entire range.', timestamp: 26, type: 'tip' },
  { text: 'Excellent control on the descent. 3 more reps at this pace.', timestamp: 38, type: 'encouragement' },
  { text: 'Hip hinge looks sharp. Drive through the heels on the way up.', timestamp: 52, type: 'tip' },
  { text: 'Breathing pattern is off — exhale on the exertion phase.', timestamp: 67, type: 'warning' },
  { text: 'Perfect set! Rep tempo and depth were consistent throughout.', timestamp: 80, type: 'encouragement' },
]

// ── Risk Gauge ─────────────────────────────────────────────────────────────

function RiskGauge({ score }: { score: number }) {
  const level   = getRiskLevel(score)
  const meta    = RISK_META[level]
  const R       = 44
  const circ    = 2 * Math.PI * R
  const offset  = circ * (1 - score / 100)
  const isDanger = level === 'danger'

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div
        className={`flex flex-col items-center ${isDanger ? 'animate-pulse' : ''}`}
        style={{
          background: 'rgba(0,0,0,0.52)',
          backdropFilter: 'blur(8px)',
          borderRadius: '50%',
          padding: 14,
        }}
      >
        <svg width={118} height={118} viewBox="0 0 118 118">
          {/* Track */}
          <circle
            cx={59} cy={59} r={R}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={8}
          />
          {/* Arc */}
          <circle
            cx={59} cy={59} r={R}
            fill="none"
            stroke={meta.stroke}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform="rotate(-90 59 59)"
            style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
          />
          {/* Score */}
          <text
            x={59} y={54}
            textAnchor="middle"
            fill={meta.text}
            fontSize={22}
            fontWeight={900}
            fontFamily="Inter,system-ui,sans-serif"
            style={{ transition: 'fill 0.4s ease' }}
          >
            {score}
          </text>
          {/* Sub-label */}
          <text
            x={59} y={70}
            textAnchor="middle"
            fill="rgba(255,255,255,0.4)"
            fontSize={7.5}
            fontFamily="Inter,system-ui,sans-serif"
            letterSpacing={1.2}
          >
            INJURY RISK
          </text>
        </svg>
        <span
          className="text-[10px] font-black tracking-[0.15em] mt-[-4px]"
          style={{ color: meta.text, transition: 'color 0.4s ease' }}
        >
          {meta.label}
        </span>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export function WorkoutPage() {
  const navigate = useNavigate()

  const videoRef        = useRef<HTMLVideoElement>(null)
  const canvasRef       = useRef<HTMLCanvasElement>(null)
  const poseRef         = useRef<PoseInstance | null>(null)
  const streamRef       = useRef<MediaStream | null>(null)
  const frameTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastLogRef      = useRef<number>(0)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  const [phase,           setPhase]           = useState<Phase>('warmup')
  const [reps,            setReps]            = useState(0)
  const [repPulse,        setRepPulse]        = useState(false)
  const [sets,            setSets]            = useState<CompletedSet[]>([])
  const [transcript,      setTranscript]      = useState<TranscriptMsg[]>([])
  const [riskScore,       setRiskScore]       = useState(14)
  const [detectedExercise,setDetectedExercise]= useState<string | null>(null)
  const [isDetecting,     setIsDetecting]     = useState(true)
  const [elapsed,         setElapsed]         = useState(0)
  const [voiceEnabled,    setVoiceEnabled]    = useState(
    () => localStorage.getItem('formAI_voice') !== 'false'
  )
  const [cameraError,     setCameraError]     = useState<string | null>(null)
  const [cameraReady,     setCameraReady]     = useState(false)

  const userName = (() => {
    try {
      return (JSON.parse(localStorage.getItem('formAI_profile') ?? '{}') as { name?: string }).name ?? 'Athlete'
    } catch { return 'Athlete' }
  })()

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // ── Seed demo transcript messages at timestamps ──────────────────────────
  useEffect(() => {
    DEMO_MSGS.forEach(msg => {
      if (elapsed === msg.timestamp) {
        setTranscript(prev => [
          ...prev,
          { ...msg, id: `${msg.timestamp}-${Math.random().toString(36).slice(2)}` },
        ])
      }
    })
  }, [elapsed])

  // ── Auto-scroll transcript ───────────────────────────────────────────────
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  // ── Demo exercise detection (3s delay) ──────────────────────────────────
  useEffect(() => {
    const id = setTimeout(() => {
      setIsDetecting(false)
      setDetectedExercise('Squat')
    }, 3200)
    return () => clearTimeout(id)
  }, [])

  // ── Demo risk score fluctuation ──────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setRiskScore(prev => Math.max(5, Math.min(94, Math.round(prev + (Math.random() - 0.5) * 12))))
    }, 2200)
    return () => clearInterval(id)
  }, [])

  // ── Canvas resize sync ───────────────────────────────────────────────────
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

  // ── MediaPipe pose results handler ───────────────────────────────────────
  const onPoseResults = useCallback((results: PoseResults) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!results.poseLandmarks) return

    if (typeof window.drawConnectors !== 'undefined') {
      window.drawConnectors(ctx, results.poseLandmarks, window.POSE_CONNECTIONS, {
        color: '#3b82f6',
        lineWidth: 2,
      })
    }
    if (typeof window.drawLandmarks !== 'undefined') {
      window.drawLandmarks(ctx, results.poseLandmarks, {
        color: '#ffffff',
        fillColor: '#3b82f680',
        lineWidth: 1,
        radius: 4,
      })
    }

    const now = Date.now()
    if (now - lastLogRef.current > 1000) {
      console.log('[FormAI] keypoints', results.poseLandmarks)
      lastLogRef.current = now
    }
  }, [])

  // ── Camera + MediaPipe init ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' } })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        video.play().then(() => {
          if (!cancelled) setCameraReady(true)
        }).catch(() => {/* ignore */})

        // Init MediaPipe if loaded from CDN
        if (typeof window.Pose !== 'undefined') {
          const pose = new window.Pose({
            locateFile: (f: string) =>
              `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`,
          })
          pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          })
          pose.onResults(onPoseResults)
          poseRef.current = pose

          const sendFrame = async () => {
            if (cancelled) return
            if (video.readyState >= 2 && poseRef.current) {
              await poseRef.current.send({ image: video }).catch(() => {/* ignore */})
            }
            if (!cancelled) {
              frameTimerRef.current = setTimeout(sendFrame, 33)
            }
          }
          sendFrame()
        }
      })
      .catch(() => {
        if (!cancelled) setCameraError('Camera access denied. Please allow camera permissions and reload.')
      })

    return () => {
      cancelled = true
      poseRef.current?.close()
      if (frameTimerRef.current) clearTimeout(frameTimerRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [onPoseResults])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const toggleVoice = () => {
    const next = !voiceEnabled
    setVoiceEnabled(next)
    localStorage.setItem('formAI_voice', String(next))
  }

  const addRep = () => {
    setReps(r => r + 1)
    setRepPulse(true)
    setTimeout(() => setRepPulse(false), 350)
  }

  const completeSet = () => {
    if (reps === 0) return
    setSets(prev => [
      ...prev,
      { id: Math.random().toString(36).slice(2), exercise: detectedExercise ?? 'Exercise', reps, timestamp: elapsed },
    ])
    setReps(0)
  }

  const endWorkout = () => {
    if (frameTimerRef.current) clearTimeout(frameTimerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    navigate('/recovery')
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const level     = getRiskLevel(riskScore)
  const isDanger  = level === 'danger'

  const phaseProgress = Math.min(
    100,
    phase === 'warmup'
      ? (elapsed / 300) * 100
      : ((elapsed - 300) / 2700) * 100
  )

  // ── Camera error screen ───────────────────────────────────────────────────
  if (cameraError) {
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

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-[#0a0a0f] flex flex-col overflow-hidden">

      {/* ── TOP BAR ───────────────────────────────────────────────────── */}
      <header className="h-14 flex items-center justify-between px-6 bg-[#0d0d18] border-b border-[#1e1e2e] shrink-0">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
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
          <span className="text-[13px] text-gray-500">
            Welcome back,{' '}
            <span className="text-white font-semibold">{userName}</span>
          </span>
          <button
            onClick={endWorkout}
            className="px-4 py-1.5 border border-red-500/60 text-red-400 text-[12px] font-semibold rounded-lg hover:bg-red-500/10 transition-all"
          >
            End Workout
          </button>
        </div>
      </header>

      {/* ── COLUMNS ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
        <aside className="w-[22%] shrink-0 flex flex-col gap-3 p-4 border-r border-[#1e1e2e] overflow-y-auto">

          {/* Rep Counter */}
          <div className="card-surface p-5 flex flex-col items-center">
            <span className="text-[10.5px] font-bold tracking-[0.15em] uppercase text-gray-500 mb-3">
              Reps
            </span>

            <div
              className="font-black text-white leading-none select-none transition-transform duration-150"
              style={{
                fontSize: 88,
                letterSpacing: -5,
                transform: repPulse ? 'scale(1.14)' : 'scale(1)',
                color:     repPulse ? '#3b82f6'    : '#ffffff',
                textShadow: repPulse ? '0 0 30px rgba(59,130,246,0.7)' : 'none',
                transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1), color 0.2s, text-shadow 0.2s',
              }}
            >
              {String(reps).padStart(2, '0')}
            </div>

            {/* Exercise badge */}
            <div className="mt-3 h-7 flex items-center">
              {detectedExercise ? (
                <span className="px-3 py-1 text-[11px] font-bold tracking-wide uppercase rounded-full bg-blue-600/15 border border-blue-500/30 text-blue-400">
                  {detectedExercise}
                </span>
              ) : (
                <span className="px-3 py-1 text-[11px] font-medium tracking-wide rounded-full bg-[#1e1e2e] text-gray-600 animate-pulse">
                  Detecting…
                </span>
              )}
            </div>

            {/* Demo controls */}
            <button
              onClick={addRep}
              className="mt-4 w-full py-2 rounded-lg text-[12px] font-bold bg-blue-600/15 border border-blue-500/25 text-blue-400 hover:bg-blue-600/25 transition-colors"
            >
              + Rep (Demo)
            </button>
            <button
              onClick={completeSet}
              disabled={reps === 0}
              className="mt-2 w-full py-2 rounded-lg text-[12px] font-bold bg-green-600/10 border border-green-500/20 text-green-400 hover:bg-green-600/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ✓ Complete Set
            </button>
          </div>

          {/* Phase Toggle */}
          <div className="card-surface p-4">
            <span className="block text-[10.5px] font-bold tracking-[0.15em] uppercase text-gray-500 mb-3">
              Phase
            </span>
            <div className="flex rounded-lg overflow-hidden border border-[#1e1e2e]">
              {(['warmup', 'main'] as Phase[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPhase(p)}
                  className={[
                    'flex-1 py-2.5 text-[11px] font-bold tracking-[0.08em] uppercase transition-all',
                    phase === p
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#0f0f1a] text-gray-500 hover:text-gray-300',
                  ].join(' ')}
                >
                  {p === 'warmup' ? 'Warm-Up' : 'Main'}
                </button>
              ))}
            </div>
          </div>

          {/* Completed Sets */}
          <div className="card-surface p-4 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10.5px] font-bold tracking-[0.15em] uppercase text-gray-500">
                Sets
              </span>
              <span className="text-[11px] font-black text-blue-400">{sets.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {sets.length === 0 ? (
                <div className="py-6 text-center text-gray-700 text-[12px]">
                  No sets yet
                </div>
              ) : (
                sets.map((s, i) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-[#0f0f1a] border border-[#1e1e2e]"
                  >
                    <div>
                      <div className="text-[12px] font-semibold text-white">
                        Set {i + 1} · {s.exercise}
                      </div>
                      <div className="text-[11px] text-gray-600 font-mono mt-0.5">{fmt(s.timestamp)}</div>
                    </div>
                    <div className="text-blue-400 font-black text-[15px]">{s.reps}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* ── CENTER COLUMN ───────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col p-4 gap-3 min-w-0 overflow-hidden">

          {/* Video feed */}
          <div
            className="relative flex-1 rounded-xl overflow-hidden bg-[#050508] min-h-0"
            style={
              isDanger
                ? { boxShadow: '0 0 0 3px #ef4444, 0 0 48px rgba(239,68,68,0.28)' }
                : { boxShadow: '0 0 0 1px #1e1e2e' }
            }
          >
            {/* Camera loading state */}
            {!cameraReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#050508] z-10">
                <div className="w-10 h-10 border-2 border-blue-600/30 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-gray-600 text-[13px]">Initializing camera…</span>
              </div>
            )}

            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
            />

            {/* Risk Gauge — centered over video */}
            <RiskGauge score={riskScore} />

            {/* Exercise detection pill — bottom center */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
              <div className="px-4 py-2 bg-black/65 backdrop-blur-md rounded-full border border-white/[0.07] text-[13px] font-medium whitespace-nowrap">
                {isDetecting ? (
                  <span className="text-gray-400">🔍 Detecting exercise…</span>
                ) : (
                  <span className="text-green-400">✅ {detectedExercise} detected</span>
                )}
              </div>
            </div>

            {/* Danger pulsing border overlay */}
            {isDanger && (
              <div
                className="absolute inset-0 rounded-xl pointer-events-none"
                style={{ boxShadow: 'inset 0 0 0 3px #ef4444', animation: 'glowDanger 0.6s ease-in-out infinite alternate' }}
              />
            )}
          </div>

          {/* Timer + Phase Progress */}
          <div className="card-surface px-5 py-4 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                <span className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-gray-500">
                  Elapsed
                </span>
                <span className="font-mono text-[22px] font-black text-white text-glow-blue">
                  {fmt(elapsed)}
                </span>
              </div>
              <span className="text-[11px] text-gray-600">
                {phase === 'warmup' ? '5:00 warm-up target' : '45:00 workout target'}
              </span>
            </div>

            <div className="w-full h-[5px] rounded-full bg-[#1e1e2e] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-linear"
                style={{
                  width: `${phaseProgress}%`,
                  background: 'linear-gradient(90deg, #1d4ed8 0%, #3b82f6 60%, #60a5fa 100%)',
                }}
              />
            </div>
          </div>
        </main>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────── */}
        <aside className="w-[22%] shrink-0 flex flex-col p-4 gap-3 border-l border-[#1e1e2e] overflow-hidden">
          <span className="text-[10.5px] font-bold tracking-[0.15em] uppercase text-gray-500 shrink-0">
            Live Transcript
          </span>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-2.5 min-h-0 pr-0.5">
            {transcript.length === 0 && (
              <div className="card-surface p-5 text-center mt-2">
                <div className="text-3xl mb-3">🎙️</div>
                <div className="text-[12px] text-gray-600 leading-relaxed">
                  AI coaching tips will appear here as you work out
                </div>
              </div>
            )}

            {transcript.map((msg, i) => {
              const isLatest = i === transcript.length - 1
              const cardStyle: CSSProperties = {
                background: '#13131f',
                borderRadius: 10,
                border: '1px solid',
                borderColor: isLatest ? 'rgba(59,130,246,0.35)' : '#1e1e2e',
                borderLeftWidth: isLatest ? 3 : 1,
                borderLeftColor: isLatest ? '#3b82f6' : '#1e1e2e',
                opacity: isLatest ? 1 : 0.62,
                boxShadow: isLatest ? '0 0 24px rgba(59,130,246,0.08)' : 'none',
                padding: '10px 12px',
                transition: 'opacity 0.4s ease',
              }
              return (
                <div key={msg.id} style={cardStyle}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className="w-[7px] h-[7px] rounded-full shrink-0"
                      style={{ background: MSG_DOT[msg.type] }}
                    />
                    <span className="text-[10.5px] text-gray-500 font-mono">{fmt(msg.timestamp)}</span>
                  </div>
                  <p className="text-[12px] text-gray-300 leading-[1.55]">{msg.text}</p>
                </div>
              )
            })}
            <div ref={transcriptEndRef} />
          </div>

          {/* Voice toggle */}
          <button
            onClick={toggleVoice}
            className={[
              'w-full py-3 rounded-xl border text-[13px] font-semibold transition-all shrink-0',
              voiceEnabled
                ? 'bg-blue-600/15 border-blue-500/35 text-blue-400 hover:bg-blue-600/25'
                : 'bg-[#13131f] border-[#1e1e2e] text-gray-500 hover:text-gray-300 hover:border-[#2e2e3e]',
            ].join(' ')}
          >
            {voiceEnabled ? '🔊 Voice On' : '🔇 Voice Off'}
          </button>
        </aside>
      </div>
    </div>
  )
}
