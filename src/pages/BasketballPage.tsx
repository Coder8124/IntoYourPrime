import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { usePoseDetection } from '../hooks/usePoseDetection'
import { useShotDetector } from '../hooks/useShotDetector'
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

export default function BasketballPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [uid, setUid] = useState<string | null>(null)
  const [handedness, setHandedness] = useState<Handedness>(() => {
    const stored = localStorage.getItem('basketball:handedness')
    return stored === 'left' ? 'left' : 'right'
  })
  const [shots, setShots] = useState<Shot[]>([])

  const { landmarks, isTracking, isLoading, error, startCamera, stopCamera } =
    usePoseDetection(videoRef, canvasRef)

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
  }, [uid])

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
          <Link
            to="/"
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            &larr; Back
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">
            🏀 Shooting Form
          </h1>
        </div>
        <button
          onClick={toggleHandedness}
          style={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            border: '1px solid #2a2a4a',
          }}
          className="px-4 py-1.5 rounded-full text-sm font-medium text-gray-200 hover:text-white transition-colors"
        >
          {handedness === 'right' ? 'Right hand' : 'Left hand'}
        </button>
      </header>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 p-4">
        {/* Camera column */}
        <div className="flex flex-col gap-3">
          <div
            className="relative w-full overflow-hidden rounded-2xl bg-[#050508]"
            style={{ aspectRatio: '16/9', border: '1px solid #111119' }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full"
              style={{ transform: 'scaleX(-1)' }}
            />

            {/* Loading / not tracking overlay */}
            {(isLoading || !isTracking) && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#050508]/80">
                <div
                  className="rounded-2xl px-6 py-5 max-w-xs text-center"
                  style={{
                    background: 'linear-gradient(135deg, #0d0d1a 0%, #111127 100%)',
                    border: '1px solid #1e1e3a',
                  }}
                >
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
              <div
                className="absolute top-3 left-3 z-20 px-3 py-1.5 rounded-lg text-xs text-red-300"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                {error}
              </div>
            )}

            {/* Phase pill */}
            <div
              className="absolute top-3 right-3 z-20 px-3 py-1 rounded-full text-xs font-semibold tracking-wider"
              style={{
                background: 'rgba(5,5,10,0.7)',
                border: `1px solid ${phaseColor}55`,
                color: phaseColor,
              }}
            >
              {phase}
            </div>

            {/* Latest shot banner */}
            {latestShot && latestNote && (
              <div
                className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3"
                style={{ background: 'linear-gradient(to top, rgba(5,5,10,0.92) 0%, rgba(5,5,10,0.0) 100%)' }}
              >
                <p className="text-sm text-gray-300 flex-1 pr-4 leading-tight">{latestNote}</p>
                <span
                  className="text-2xl font-bold tabular-nums shrink-0"
                  style={{ color: scoreColor(latestShot.beef.overall) }}
                >
                  {latestShot.beef.overall}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Shot list column */}
        <div>
          <div
            className="rounded-2xl bg-[#0a0a14] border border-[#111119] p-3 space-y-2 max-h-[70vh] overflow-y-auto"
          >
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
              shots.map(shot => (
                <ShotRow key={shot.id} shot={shot} />
              ))
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

  return (
    <div
      className="rounded-xl p-3"
      style={{ background: 'linear-gradient(135deg, #0d0d1a 0%, #0f0f20 100%)', border: '1px solid #1a1a2e' }}
    >
      <div className="flex items-center justify-between mb-2">
        {/* Context badge */}
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={
            isMovement
              ? { background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid rgba(234,179,8,0.25)' }
              : { background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)' }
          }
        >
          {isMovement ? 'Pull-up' : 'Set'}
        </span>

        {/* Overall score */}
        <span
          className="text-2xl font-bold tabular-nums"
          style={{ color: scoreColor(beef.overall) }}
        >
          {beef.overall}
        </span>
      </div>

      {/* BEEF grid */}
      <div className="grid grid-cols-4 gap-1">
        {(
          [
            { label: 'B', value: beef.balance },
            { label: 'E', value: beef.eyes },
            { label: 'E', value: beef.elbow },
            { label: 'F', value: beef.followThrough },
          ] as const
        ).map(({ label, value }, i) => (
          <div
            key={i}
            className="flex flex-col items-center rounded-lg py-1.5"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1e1e30' }}
          >
            <span className="text-[10px] font-semibold text-gray-500 mb-0.5">{label}</span>
            <span
              className="text-sm font-bold tabular-nums"
              style={{ color: scoreColor(value) }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
