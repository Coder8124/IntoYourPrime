import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { usePoseDetection } from '../hooks/usePoseDetection'
import { useShotDetector } from '../hooks/useShotDetector'
import { useBallDetector, scoreArcFromTrajectory, estimateMake } from '../hooks/useBallDetector'
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

function drawBallOverlay(
  canvas: HTMLCanvasElement,
  ballPos: BallPos | null,
  trajectory: BallPos[],
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const w = canvas.width, h = canvas.height
  const now = Date.now()

  const recent = trajectory.filter(p => now - p.ts < 1200).slice(-30)
  if (recent.length > 1) {
    for (let i = 1; i < recent.length; i++) {
      const alpha = (i / recent.length) * 0.6
      const prev = recent[i - 1], cur = recent[i]
      ctx.beginPath()
      ctx.moveTo((1 - prev.x) * w, prev.y * h)
      ctx.lineTo((1 - cur.x) * w, cur.y * h)
      ctx.strokeStyle = `rgba(251,146,60,${alpha})`
      ctx.lineWidth = 2.5
      ctx.stroke()
    }
  }

  if (ballPos) {
    const bx = (1 - ballPos.x) * w
    const by = ballPos.y * h
    const br = Math.max(14, ballPos.r * Math.min(w, h))
    ctx.beginPath()
    ctx.arc(bx, by, br + 6, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(251,146,60,0.25)'
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(bx, by, br, 0, Math.PI * 2)
    ctx.strokeStyle = '#f97316'
    ctx.lineWidth = 2.5
    ctx.stroke()
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
    const video = videoRef.current, bc = ballCanvas.current
    if (!bc || !video) return
    const sync = () => { if (video.videoWidth) { bc.width = video.videoWidth; bc.height = video.videoHeight } }
    video.addEventListener('loadedmetadata', sync)
    sync()
    return () => video.removeEventListener('loadedmetadata', sync)
  }, [])

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
    const releaseTime = Date.now()
    const beef = scoreShot(window)

    const traj = getTrajectory()
    const arc = scoreArcFromTrajectory(traj) ?? undefined
    if (arc !== undefined) beef.arc = arc
    clearTrajectory()

    const shotId = `local-${releaseTime}`
    const shot: Shot = {
      id: shotId,
      timestamp: releaseTime,
      handedness: window.handedness,
      context: window.context,
      beef,
      result: modelReady ? 'unknown' : undefined,
    }
    setShots(prev => [shot, ...prev].slice(0, MAX_SHOTS))
    if (uid) {
      const { id: _id, ...shotWithoutId } = shot
      void saveBasketballShot(uid, shotWithoutId)
    }

    // After 1.8 s, check ball trajectory for make/miss
    if (modelReady) {
      setTimeout(() => {
        const postRelease = getTrajectory().filter(p => p.ts >= releaseTime - 50)
        const result = estimateMake(postRelease)
        setShots(prev => prev.map(s => s.id === shotId ? { ...s, result } : s))
      }, 1800)
    }
  }, [uid, getTrajectory, clearTrajectory, modelReady])

  const { phase } = useShotDetector(landmarks, handedness, onShot)

  function toggleHandedness() {
    setHandedness(h => {
      const next: Handedness = h === 'right' ? 'left' : 'right'
      localStorage.setItem('basketball:handedness', next)
      return next
    })
  }

  // ── Session stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = shots.length
    if (!total) return null

    const makes  = shots.filter(s => s.result === 'make').length
    const misses = shots.filter(s => s.result === 'miss').length
    const known  = makes + misses
    const makePct = known >= 2 ? Math.round((makes / known) * 100) : null

    const avgForm = Math.round(shots.reduce((s, x) => s + x.beef.overall, 0) / total)
    const bestForm = Math.max(...shots.map(s => s.beef.overall))

    const arcShots = shots.filter(s => s.beef.arc !== undefined)
    const avgArc = arcShots.length
      ? Math.round(arcShots.reduce((s, x) => s + x.beef.arc!, 0) / arcShots.length)
      : null

    // Trend: last 3 vs previous 3
    let trend: 'up' | 'down' | 'flat' | null = null
    if (shots.length >= 6) {
      const recent = shots.slice(0, 3).reduce((s, x) => s + x.beef.overall, 0) / 3
      const prev   = shots.slice(3, 6).reduce((s, x) => s + x.beef.overall, 0) / 3
      const diff = recent - prev
      trend = diff > 3 ? 'up' : diff < -3 ? 'down' : 'flat'
    }

    return { total, makes, misses, known, makePct, avgForm, bestForm, avgArc, trend }
  }, [shots])

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const phaseColor =
    phase === 'RELEASED' ? '#22c55e' :
    phase === 'LOADED'   ? '#eab308' : '#6b7280'

  const latestShot = shots[0] ?? null
  const latestNote = latestShot ? (latestShot.beef.notes[0] ?? 'Solid shot — repeat it.') : null

  return (
    <div data-accent="ember" className="min-h-screen text-white" style={{ background: 'var(--bg)' }}>

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm transition-colors" style={{ color: 'var(--text-3)' }}>&larr; Back</Link>
          <h1 className="display text-lg font-semibold tracking-tight">🏀 Shooting Form</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full"
            style={modelReady
              ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }
              : { background: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.2)', color: '#6b7280' }
            }>
            {modelLoading ? '⏳ Loading…' : modelReady ? '● Ball tracked' : '○ No tracker'}
          </div>
          <button onClick={toggleHandedness}
            style={{ background: 'var(--surface)', border: '1px solid var(--border-2)' }}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors hover:border-[color:var(--text-3)]">
            {handedness === 'right' ? 'Right hand' : 'Left hand'}
          </button>
        </div>
      </header>

      {/* Session stats bar */}
      {stats && (
        <div className="flex items-center gap-5 px-6 py-2.5 overflow-x-auto"
          style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
          <StatChip label="SHOTS" value={String(stats.total)} />
          {stats.makePct !== null && (
            <StatChip
              label="MAKE %"
              value={`${stats.makePct}%`}
              valueColor={stats.makePct >= 50 ? '#22c55e' : stats.makePct >= 35 ? '#eab308' : '#ef4444'}
              sub={`${stats.makes}/${stats.known}`}
            />
          )}
          <StatChip label="AVG FORM" value={String(stats.avgForm)} valueColor={scoreColor(stats.avgForm)} />
          <StatChip label="BEST" value={String(stats.bestForm)} valueColor={scoreColor(stats.bestForm)} />
          {stats.avgArc !== null && (
            <StatChip label="AVG ARC" value={String(stats.avgArc)} valueColor={scoreColor(stats.avgArc)} />
          )}
          {stats.trend && (
            <StatChip
              label="TREND"
              value={stats.trend === 'up' ? '↑ Improving' : stats.trend === 'down' ? '↓ Dropping' : '→ Steady'}
              valueColor={stats.trend === 'up' ? '#22c55e' : stats.trend === 'down' ? '#ef4444' : '#6b7280'}
            />
          )}
        </div>
      )}

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 p-4">

        {/* Camera */}
        <div className="flex flex-col gap-3">
          <div className="relative w-full overflow-hidden rounded-2xl bg-[#050508]"
            style={{ aspectRatio: '16/9', border: '1px solid #111119' }}>
            <video ref={videoRef} autoPlay playsInline muted
              className="absolute inset-0 h-full w-full object-cover" style={{ transform: 'scaleX(-1)' }} />
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ transform: 'scaleX(-1)' }} />
            <canvas ref={ballCanvas} className="absolute inset-0 h-full w-full" />

            {(isLoading || !isTracking) && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#050508]/80">
                <div className="rounded-2xl px-6 py-5 max-w-xs text-center"
                  style={{ background: 'linear-gradient(135deg,#0d0d1a,#111127)', border: '1px solid #1e1e3a' }}>
                  <p className="text-white font-semibold mb-2">{isLoading ? 'Starting camera…' : 'Ready to track'}</p>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Stand perpendicular to the camera — shooting arm facing it. Back up so your full body is in frame.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div className="absolute top-3 left-3 z-20 px-3 py-1.5 rounded-lg text-xs text-red-300"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                {error}
              </div>
            )}

            <div className="absolute top-3 right-3 z-20 px-3 py-1 rounded-full text-xs font-semibold tracking-wider"
              style={{ background: 'rgba(5,5,10,0.7)', border: `1px solid ${phaseColor}55`, color: phaseColor }}>
              {phase}
            </div>

            {ballPos && (
              <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                style={{ background: 'rgba(249,115,22,0.2)', border: '1px solid rgba(249,115,22,0.4)', color: '#fb923c' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse inline-block" />
                Ball detected
              </div>
            )}

            {latestShot && latestNote && (
              <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3"
                style={{ background: 'linear-gradient(to top,rgba(5,5,10,0.92),rgba(5,5,10,0))' }}>
                <div className="flex items-center gap-2 flex-1 pr-4">
                  {latestShot.result === 'make' && (
                    <span className="text-[13px] shrink-0">🟢</span>
                  )}
                  {latestShot.result === 'miss' && (
                    <span className="text-[13px] shrink-0">🔴</span>
                  )}
                  <p className="text-sm text-gray-300 leading-tight">{latestNote}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {latestShot.beef.arc !== undefined && (
                    <div className="text-center">
                      <span className="text-[10px] text-orange-400 font-bold block">ARC</span>
                      <span className="text-lg font-bold tabular-nums" style={{ color: scoreColor(latestShot.beef.arc) }}>
                        {latestShot.beef.arc}
                      </span>
                    </div>
                  )}
                  <div className="text-center">
                    <span className="mono text-[10px] font-bold block uppercase tracking-[0.18em]" style={{ color: 'var(--text-3)' }}>FORM</span>
                    <span className="display tnum text-2xl font-semibold" style={{ color: scoreColor(latestShot.beef.overall) }}>
                      {latestShot.beef.overall}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <p className="text-[11px] text-gray-600 leading-relaxed px-1">
            {modelReady
              ? 'Orange circle = ball. Arc score + make/miss appear after each shot.'
              : 'Ball tracker loading — BEEF form scores are available immediately.'}
          </p>
        </div>

        {/* Shot list */}
        <div>
          <div className="card p-3 space-y-2 max-h-[70vh] overflow-y-auto">
            <p className="mono text-[10px] font-semibold uppercase tracking-[0.18em] px-1 pb-1" style={{ color: 'var(--text-3)' }}>
              Recent shots
            </p>
            {shots.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-center">
                <p className="text-gray-600 text-sm leading-relaxed">Take your first shot — scores will appear here.</p>
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

function StatChip({
  label, value, valueColor, sub,
}: { label: string; value: string; valueColor?: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center shrink-0">
      <span className="mono text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--text-4)' }}>{label}</span>
      <span className="display tnum text-[16px] font-semibold leading-tight" style={{ color: valueColor ?? 'var(--text)' }}>
        {value}
      </span>
      {sub && <span className="mono text-[9px]" style={{ color: 'var(--text-4)' }}>{sub}</span>}
    </div>
  )
}

function ShotRow({ shot }: { shot: Shot }) {
  const { beef, context, result } = shot
  const isMovement = context === 'movement'
  const hasArc = beef.arc !== undefined

  const resultBadge =
    result === 'make'  ? { icon: '🟢', label: 'Make',    color: '#22c55e' } :
    result === 'miss'  ? { icon: '🔴', label: 'Miss',    color: '#ef4444' } :
    result === 'unknown' ? { icon: '⚪', label: 'Unknown', color: '#6b7280' } :
    null

  return (
    <div className="rounded-xl p-3"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={isMovement
              ? { background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid rgba(234,179,8,0.25)' }
              : { background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)' }
            }>
            {isMovement ? 'Pull-up' : 'Set'}
          </span>
          {resultBadge && (
            <span className="text-[11px] font-semibold" style={{ color: resultBadge.color }}>
              {resultBadge.icon} {resultBadge.label}
            </span>
          )}
        </div>
        <span className="display tnum text-2xl font-semibold" style={{ color: scoreColor(beef.overall) }}>
          {beef.overall}
        </span>
      </div>

      {/* BEEF + Arc grid */}
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
            <span className="display tnum text-sm font-semibold" style={{ color: scoreColor(value) }}>{value}</span>
          </div>
        ))}
      </div>

      {hasArc && (
        <p className="text-[10px] text-orange-500/60 mt-1.5 px-0.5">
          {beef.arc! >= 70
            ? '↑ Good arc height'
            : beef.arc! >= 40
            ? '↑ Moderate arc — try to get it higher'
            : '↗ Flat shot — more arc = better percentage'}
        </p>
      )}
    </div>
  )
}
