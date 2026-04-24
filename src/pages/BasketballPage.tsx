import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { usePoseDetection } from '../hooks/usePoseDetection'
import { useShotDetector } from '../hooks/useShotDetector'
import { useBallDetector, scoreArcFromTrajectory } from '../hooks/useBallDetector'
import type { BallPos } from '../hooks/useBallDetector'
import { scoreShot } from '../lib/beefScore'
import { saveBasketballShot } from '../lib/basketballShots'
import type { Handedness, Shot, ShotWindow } from '../types/basketball'

function scoreColor(v: number): string {
  if (v >= 85) return '#22c55e'
  if (v >= 70) return '#eab308'
  if (v >= 50) return '#f97316'
  return '#ef4444'
}

const MAX_SHOTS = 20

// Draw ball position and trajectory trail on a canvas
function drawBallOverlay(
  canvas: HTMLCanvasElement,
  ballPos: BallPos | null,
  trajectory: BallPos[],
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const w = canvas.width
  const h = canvas.height
  const now = Date.now()

  // Draw trajectory trail (last 30 positions, fading out)
  const recent = trajectory.filter(p => now - p.ts < 1200).slice(-30)
  if (recent.length > 1) {
    for (let i = 1; i < recent.length; i++) {
      const alpha = (i / recent.length) * 0.6
      const prev = recent[i - 1]
      const cur  = recent[i]
      // Mirror x because video is mirrored
      const x1 = (1 - prev.x) * w
      const y1 = prev.y * h
      const x2 = (1 - cur.x) * w
      const y2 = cur.y * h
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.strokeStyle = `rgba(251,146,60,${alpha})`
      ctx.lineWidth = 2.5
      ctx.stroke()
    }
  }

  // Draw ball circle
  if (ballPos) {
    const bx = (1 - ballPos.x) * w
    const by = ballPos.y * h
    const br = Math.max(14, ballPos.r * Math.min(w, h))

    // Outer glow
    ctx.beginPath()
    ctx.arc(bx, by, br + 6, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(251,146,60,0.25)'
    ctx.lineWidth = 4
    ctx.stroke()

    // Ball circle
    ctx.beginPath()
    ctx.arc(bx, by, br, 0, Math.PI * 2)
    ctx.strokeStyle = '#f97316'
    ctx.lineWidth = 2.5
    ctx.stroke()

    // Center dot
    ctx.beginPath()
    ctx.arc(bx, by, 3, 0, Math.PI * 2)
    ctx.fillStyle = '#fb923c'
    ctx.fill()
  }
}

export default function BasketballPage() {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const ballCanvas = useRef<HTMLCanvasElement>(null)

  const [uid, setUid] = useState<string | null>(null)
  const [handedness, setHandedness] = useState<Handedness>(() => {
    const stored = localStorage.getItem('basketball:handedness')
    return stored === 'left' ? 'left' : 'right'
  })
  const [shots, setShots] = useState<Shot[]>([])

  const { landmarks, isTracking, isLoading, error, startCamera, stopCamera } =
    usePoseDetection(videoRef, canvasRef)

  const { ballPos, modelReady, modelLoading, getTrajectory, clearTrajectory } =
    useBallDetector(videoRef)

  // Keep ball canvas in sync with video dimensions
  useEffect(() => {
    const video = videoRef.current
    const bc = ballCanvas.current
    if (!bc || !video) return
    const sync = () => {
      if (video.videoWidth) {
        bc.width  = video.videoWidth
        bc.height = video.videoHeight
      }
    }
    video.addEventListener('loadedmetadata', sync)
    sync()
    return () => video.removeEventListener('loadedmetadata', sync)
  }, [])

  // Redraw ball overlay on every ballPos change
  useEffect(() => {
    const bc = ballCanvas.current
    if (!bc) return
    drawBallOverlay(bc, ballPos, getTrajectory())
  }, [ballPos, getTrajectory])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUid(u?.uid ?? null))
    return unsub
  }, [])

  useEffect(() => {
    void startCamera()
    return () => stopCamera()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onShot = useCallback((window: ShotWindow) => {
    const beef = scoreShot(window)

    // Attempt to score ball arc from trajectory
    const traj = getTrajectory()
    const arc = scoreArcFromTrajectory(traj) ?? undefined
    if (arc !== undefined) beef.arc = arc
    clearTrajectory()

    const shot: Shot = {
      id: `local-${Date.now()}`,
      timestamp: Date.now(),
      handedness: window.handedness,
      context: window.context,
      beef,
    }
    setShots(prev => [shot, ...prev].slice(0, MAX_SHOTS))
    if (uid) {
      const { id: _id, ...shotWithoutId } = shot
      void saveBasketballShot(uid, shotWithoutId)
    }
  }, [uid, getTrajectory, clearTrajectory])

  const { phase } = useShotDetector(landmarks, handedness, onShot)

  function toggleHandedness() {
    setHandedness(h => {
      const next: Handedness = h === 'right' ? 'left' : 'right'
      localStorage.setItem('basketball:handedness', next)
      return next
    })
  }

  const phaseColor =
    phase === 'RELEASED' ? '#22c55e' :
    phase === 'LOADED'   ? '#eab308' :
    '#6b7280'

  const latestShot = shots[0] ?? null
  const latestNote = latestShot
    ? (latestShot.beef.notes[0] ?? 'Solid shot — repeat it.')
    : null

  return (
    <div className="min-h-screen bg-[#05050a] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#111119]">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-gray-400 hover:text-white transition-colors text-sm">
            &larr; Back
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">🏀 Shooting Form</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Ball tracker status */}
          <div className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full"
            style={modelReady
              ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }
              : { background: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.2)', color: '#6b7280' }
            }>
            {modelLoading ? '⏳ Loading ball tracker…' : modelReady ? '● Ball tracked' : '○ No ball tracker'}
          </div>
          <button
            onClick={toggleHandedness}
            style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', border: '1px solid #2a2a4a' }}
            className="px-4 py-1.5 rounded-full text-sm font-medium text-gray-200 hover:text-white transition-colors"
          >
            {handedness === 'right' ? 'Right hand' : 'Left hand'}
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 p-4">
        {/* Camera column */}
        <div className="flex flex-col gap-3">
          <div className="relative w-full overflow-hidden rounded-2xl bg-[#050508]"
            style={{ aspectRatio: '16/9', border: '1px solid #111119' }}>
            <video
              ref={videoRef}
              autoPlay playsInline muted
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            {/* Pose skeleton canvas */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full"
              style={{ transform: 'scaleX(-1)' }}
            />
            {/* Ball tracking canvas (no scaleX — we mirror x ourselves in drawBallOverlay) */}
            <canvas
              ref={ballCanvas}
              className="absolute inset-0 h-full w-full"
            />

            {/* Loading / not tracking overlay */}
            {(isLoading || !isTracking) && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#050508]/80">
                <div className="rounded-2xl px-6 py-5 max-w-xs text-center"
                  style={{ background: 'linear-gradient(135deg, #0d0d1a 0%, #111127 100%)', border: '1px solid #1e1e3a' }}>
                  <p className="text-white font-semibold mb-2">
                    {isLoading ? 'Starting camera…' : 'Ready to track'}
                  </p>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Stand perpendicular to the camera — shooting arm facing it.
                    Back up so your full body is in frame.
                  </p>
                </div>
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="absolute top-3 left-3 z-20 px-3 py-1.5 rounded-lg text-xs text-red-300"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                {error}
              </div>
            )}

            {/* Phase pill */}
            <div className="absolute top-3 right-3 z-20 px-3 py-1 rounded-full text-xs font-semibold tracking-wider"
              style={{ background: 'rgba(5,5,10,0.7)', border: `1px solid ${phaseColor}55`, color: phaseColor }}>
              {phase}
            </div>

            {/* Ball detected indicator */}
            {ballPos && (
              <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                style={{ background: 'rgba(249,115,22,0.2)', border: '1px solid rgba(249,115,22,0.4)', color: '#fb923c' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse inline-block" />
                Ball detected
              </div>
            )}

            {/* Latest shot banner */}
            {latestShot && latestNote && (
              <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3"
                style={{ background: 'linear-gradient(to top, rgba(5,5,10,0.92) 0%, rgba(5,5,10,0.0) 100%)' }}>
                <p className="text-sm text-gray-300 flex-1 pr-4 leading-tight">{latestNote}</p>
                <div className="flex items-center gap-2 shrink-0">
                  {latestShot.beef.arc !== undefined && (
                    <div className="text-center">
                      <span className="text-[10px] text-orange-400 font-bold block">ARC</span>
                      <span className="text-lg font-bold tabular-nums" style={{ color: scoreColor(latestShot.beef.arc) }}>
                        {latestShot.beef.arc}
                      </span>
                    </div>
                  )}
                  <div className="text-center">
                    <span className="text-[10px] text-gray-500 font-bold block">FORM</span>
                    <span className="text-2xl font-bold tabular-nums" style={{ color: scoreColor(latestShot.beef.overall) }}>
                      {latestShot.beef.overall}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="text-[11px] text-gray-600 leading-relaxed px-1">
            {modelReady
              ? 'Orange circle tracks the ball. Arc score appears after each shot when the ball is visible.'
              : 'Ball tracker loading in background — pose-based BEEF scores available immediately.'}
          </div>
        </div>

        {/* Shot list column */}
        <div>
          <div className="rounded-2xl bg-[#0a0a14] border border-[#111119] p-3 space-y-2 max-h-[70vh] overflow-y-auto">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest px-1 pb-1">
              Recent shots
            </p>
            {shots.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-center">
                <p className="text-gray-600 text-sm leading-relaxed">
                  Take your first shot — scores will appear here.
                </p>
              </div>
            ) : (
              shots.map(shot => <ShotRow key={shot.id} shot={shot} />)
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ShotRow({ shot }: { shot: Shot }) {
  const { beef, context } = shot
  const isMovement = context === 'movement'
  const hasArc = beef.arc !== undefined

  return (
    <div className="rounded-xl p-3"
      style={{ background: 'linear-gradient(135deg, #0d0d1a 0%, #0f0f20 100%)', border: '1px solid #1a1a2e' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={isMovement
            ? { background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid rgba(234,179,8,0.25)' }
            : { background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)' }
          }>
          {isMovement ? 'Pull-up' : 'Set'}
        </span>
        <span className="text-2xl font-bold tabular-nums" style={{ color: scoreColor(beef.overall) }}>
          {beef.overall}
        </span>
      </div>

      {/* BEEF + optional Arc grid */}
      <div className={`grid gap-1 ${hasArc ? 'grid-cols-5' : 'grid-cols-4'}`}>
        {([
          { label: 'B', value: beef.balance },
          { label: 'E', value: beef.eyes },
          { label: 'E', value: beef.elbow },
          { label: 'F', value: beef.followThrough },
          ...(hasArc ? [{ label: '⌒', value: beef.arc! }] : []),
        ] as Array<{ label: string; value: number }>).map(({ label, value }, i) => (
          <div key={i} className="flex flex-col items-center rounded-lg py-1.5"
            style={{
              background: label === '⌒' ? 'rgba(249,115,22,0.06)' : 'rgba(255,255,255,0.03)',
              border: label === '⌒' ? '1px solid rgba(249,115,22,0.2)' : '1px solid #1e1e30',
            }}>
            <span className="text-[10px] font-semibold mb-0.5"
              style={{ color: label === '⌒' ? '#fb923c' : '#6b7280' }}>{label}</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: scoreColor(value) }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {hasArc && (
        <p className="text-[10px] text-orange-500/60 mt-1.5 px-0.5">
          {beef.arc! >= 70 ? '↑ Good arc height' : beef.arc! >= 40 ? '↑ Moderate arc — try to lift higher' : '↗ Flat shot — add more arc for better percentage'}
        </p>
      )}
    </div>
  )
}
