import { useCallback, useEffect, useRef, useState } from 'react'

const TOTAL_SHOTS = 5
const SWEET_MIN = 0.62
const SWEET_MAX = 0.74
const CLOSE_MIN = 0.55
const CLOSE_MAX = 0.82

type Phase = 'idle' | 'charging' | 'shooting' | 'result'
type Outcome = 'swish' | 'rim' | 'miss'

type SessionState = {
  attempts: number
  makes: number
  swishes: number
  streak: number
  bestStreak: number
}

const ZERO: SessionState = { attempts: 0, makes: 0, swishes: 0, streak: 0, bestStreak: 0 }

/**
 * 2D free-throw minigame — opened when the user clicks the basketball-room
 * door in the gym scene. Hold space / click to charge, release in the green
 * sweet spot to swish.
 */
export function BasketballFreeThrow({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [power, setPower] = useState(0)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [ball, setBall] = useState({ x: 50, y: 78, scale: 1, visible: true, spin: 0 })
  const [session, setSession] = useState<SessionState>(ZERO)

  const rafRef = useRef<number | null>(null)
  const dirRef = useRef(1)

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }, [])

  // Power oscillator while charging
  useEffect(() => {
    if (phase !== 'charging') return
    const tick = () => {
      setPower(p => {
        let np = p + 0.022 * dirRef.current
        if (np >= 1) { np = 1; dirRef.current = -1 }
        if (np <= 0) { np = 0; dirRef.current = 1 }
        return np
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [phase])

  const finish = useCallback((result: Outcome) => {
    setOutcome(result)
    setSession(s => {
      const made = result !== 'miss'
      const swish = result === 'swish'
      const streak = made ? s.streak + 1 : 0
      return {
        attempts: s.attempts + 1,
        makes: s.makes + (made ? 1 : 0),
        swishes: s.swishes + (swish ? 1 : 0),
        streak,
        bestStreak: Math.max(s.bestStreak, streak),
      }
    })
    setPhase('result')
    window.setTimeout(() => {
      setBall({ x: 50, y: 78, scale: 1, visible: true, spin: 0 })
      setPower(0)
      setOutcome(null)
      setPhase('idle')
    }, 1200)
  }, [])

  const shoot = useCallback(() => {
    if (phase !== 'charging') return
    stop()
    const p = power
    const result: Outcome =
      (p >= SWEET_MIN && p <= SWEET_MAX) ? 'swish' :
      (p >= CLOSE_MIN && p <= CLOSE_MAX) ? 'rim' :
      'miss'

    setPhase('shooting')

    // Animate ball flight from (50, 78) → rim near (50, 26), with parabolic arc
    const startX = 50, startY = 78
    const rimX = 50, rimY = 26
    const xOff = result === 'miss' ? (Math.random() > 0.5 ? 8 : -8)
              : result === 'rim'  ? (Math.random() > 0.5 ? 2 : -2)
              : 0
    const t0 = performance.now()
    const dur = 850
    const animate = (now: number) => {
      const k = Math.min(1, (now - t0) / dur)
      const x = startX + (rimX - startX + xOff) * k
      const y = startY * (1 - k) + rimY * k - Math.sin(k * Math.PI) * 36
      // Scale up at apex (closer to camera)
      const norm = Math.max(0, Math.min(1, (startY - y) / (startY - 18)))
      const scale = 1 + norm * 0.5
      setBall({ x, y, scale, visible: true, spin: k * 720 })
      if (k < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        // Drop or bounce after the arc
        const t1 = performance.now()
        const drop = (nn: number) => {
          const kk = Math.min(1, (nn - t1) / 500)
          const bx = result === 'rim'
            ? rimX + xOff + Math.sin(kk * Math.PI * 2) * 2
            : rimX + xOff
          const by = rimY + kk * 60
          setBall({ x: bx, y: by, scale: 1.1 - kk * 0.4, visible: true, spin: 720 + kk * 360 })
          if (kk < 1) rafRef.current = requestAnimationFrame(drop)
          else finish(result)
        }
        rafRef.current = requestAnimationFrame(drop)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
  }, [phase, power, stop, finish])

  const startCharge = useCallback(() => {
    if (phase !== 'idle') return
    dirRef.current = 1
    setPower(0)
    setPhase('charging')
  }, [phase])

  // Keyboard: Space = charge / shoot, Esc = close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (phase === 'idle') startCharge()
        else if (phase === 'charging') shoot()
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, startCharge, shoot, onClose])

  // Cleanup
  useEffect(() => () => stop(), [stop])

  const handleClick = () => {
    if (phase === 'idle') startCharge()
    else if (phase === 'charging') shoot()
  }

  const helper =
    phase === 'idle'     ? 'tap · space to charge' :
    phase === 'charging' ? 'release to shoot' :
    phase === 'shooting' ? 'ball in flight…' :
    outcome === 'swish'  ? '✓ swish' :
    outcome === 'rim'    ? '~ rim and in' :
    '✗ missed'

  const makePct = session.attempts > 0 ? Math.round((session.makes / session.attempts) * 100) : 0
  const sessionDone = session.attempts >= TOTAL_SHOTS

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'linear-gradient(180deg, #0e1020 0%, #1a1530 100%)',
        animation: 'fadeIn 0.32s ease',
        overflow: 'hidden',
        cursor: phase === 'idle' || phase === 'charging' ? 'pointer' : 'default',
      }}
      onClick={!sessionDone ? handleClick : undefined}
    >
      {/* Court floor glow */}
      <div
        style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          height: '36%',
          background: 'linear-gradient(180deg, transparent, rgba(245,158,11,0.08) 60%, rgba(245,158,11,0.16) 100%)',
        }}
      />

      {/* Free-throw line */}
      <div
        style={{
          position: 'absolute',
          left: '20%', right: '20%',
          bottom: '24%',
          height: 1,
          background: 'rgba(245,158,11,0.45)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '50%', bottom: '24%',
          transform: 'translate(-50%, 50%)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.22em',
          color: 'rgba(255,255,255,0.55)',
          textTransform: 'uppercase',
          background: '#0e1020',
          padding: '0 10px',
          pointerEvents: 'none',
        }}
      >
        Free throw · 15 ft
      </div>

      {/* Hoop SVG (top, anchored at x=50%) */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        {/* Backboard */}
        <rect x="42" y="10" width="16" height="14" fill="none" stroke="#ffffff66" strokeWidth="0.3" />
        <rect x="46" y="14" width="8" height="6" fill="none" stroke="#ffffff44" strokeWidth="0.25" />
        {/* Rim */}
        <ellipse cx="50" cy="26" rx="5.5" ry="1.1" fill="none" stroke="#f97316" strokeWidth="0.6" />
        <ellipse cx="50" cy="26" rx="5.5" ry="1.1" fill="none" stroke="#f97316" strokeWidth="0.25" opacity="0.6" />
        {/* Net */}
        <g stroke="#ffffff66" strokeWidth="0.18" fill="none">
          <path d="M 44.8 26 L 46 34 M 46.5 26 L 47.3 34.5 M 48.2 26 L 48.5 35 M 50 26 L 50 35.2 M 51.8 26 L 51.5 35 M 53.5 26 L 52.7 34.5 M 55.2 26 L 54 34" />
          <path d="M 46 30 L 54 30 M 46.5 33 L 53.5 33" />
        </g>
        {/* Support arm */}
        <line x1="50" y1="10" x2="50" y2="4" stroke="#ffffff66" strokeWidth="0.4" />
      </svg>

      {/* Ball */}
      {ball.visible && (
        <div
          style={{
            position: 'absolute',
            left: `${ball.x}%`,
            top: `${ball.y}%`,
            width: `${64 * ball.scale}px`,
            height: `${64 * ball.scale}px`,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 30% 30%, #f59e0b, #b45309)',
            boxShadow: `0 0 ${24 + ball.scale * 14}px rgba(245,158,11,${0.4 + (ball.scale - 1) * 0.5}), inset -5px -5px 10px rgba(0,0,0,0.35)`,
            transform: `translate(-50%, -50%) rotate(${ball.spin}deg)`,
            pointerEvents: 'none',
            transition: phase === 'idle' || phase === 'charging' ? 'top 0.12s linear' : 'none',
          }}
        >
          <svg viewBox="0 0 28 28" style={{ width: '100%', height: '100%' }}>
            <circle cx="14" cy="14" r="13" fill="none" stroke="#7c2d12" strokeWidth="0.8" opacity="0.6" />
            <path d="M 14 1 Q 14 14 14 27" stroke="#7c2d12" strokeWidth="0.8" fill="none" opacity="0.6" />
            <path d="M 1 14 Q 14 14 27 14" stroke="#7c2d12" strokeWidth="0.8" fill="none" opacity="0.6" />
          </svg>
        </div>
      )}

      {/* Result flash */}
      {phase === 'result' && outcome && (
        <div
          className="display"
          style={{
            position: 'absolute',
            left: '50%', top: '14%',
            transform: 'translate(-50%, -50%)',
            fontSize: 60,
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: outcome === 'swish' ? '#34d399' : outcome === 'rim' ? '#fbbf24' : '#f87171',
            textShadow: '0 0 30px currentColor',
            animation: 'fadeUp 0.32s ease',
            pointerEvents: 'none',
          }}
        >
          {outcome === 'swish' ? 'SWISH' : outcome === 'rim' ? 'IN!' : 'MISS'}
        </div>
      )}

      {/* Score HUD top-left */}
      <div
        style={{
          position: 'absolute',
          left: 28, top: 28,
          padding: '10px 16px',
          borderRadius: 14,
          background: 'rgba(15, 15, 25, 0.55)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.06)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.18em',
          color: 'rgba(255,255,255,0.7)',
          textTransform: 'uppercase',
          pointerEvents: 'none',
        }}
      >
        <div>Shots · <span className="tnum" style={{ color: '#fff' }}>{session.makes}</span> / {session.attempts} of {TOTAL_SHOTS}</div>
        <div style={{ marginTop: 4, color: session.streak >= 3 ? '#fbbf24' : 'rgba(255,255,255,0.5)' }}>
          Streak · <span className="tnum">{session.streak}</span> · best <span className="tnum">{session.bestStreak}</span>
        </div>
      </div>

      {/* Close button top-right */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        aria-label="Close"
        style={{
          position: 'absolute',
          top: 28, right: 28,
          width: 36, height: 36,
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(15, 15, 25, 0.55)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          color: 'rgba(255,255,255,0.85)',
          cursor: 'pointer',
          fontSize: 16,
        }}
      >
        ×
      </button>

      {/* Power meter (bottom-center) */}
      {!sessionDone && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 32,
            transform: 'translateX(-50%)',
            width: 'min(420px, 86vw)',
            padding: 16,
            background: 'rgba(15, 15, 25, 0.7)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            pointerEvents: 'none',
          }}
        >
          <div
            className="mono"
            style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 10.5, letterSpacing: '0.22em',
              color: 'rgba(255,255,255,0.6)',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            <span>Power</span>
            <span className="tnum" style={{ color: '#fff' }}>{Math.round(power * 100)}</span>
          </div>
          <PowerBar power={power} />
          <div
            className="mono"
            style={{
              marginTop: 8,
              fontSize: 10,
              letterSpacing: '0.2em',
              color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase',
              textAlign: 'center',
            }}
          >
            {helper}
          </div>
        </div>
      )}

      {/* End-of-session summary */}
      {sessionDone && phase === 'idle' && (
        <SessionSummary
          session={session}
          makePct={makePct}
          onClose={onClose}
          onAgain={() => setSession(ZERO)}
        />
      )}
    </div>
  )
}

function PowerBar({ power }: { power: number }) {
  return (
    <div
      style={{
        position: 'relative',
        height: 14,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 7,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: `${SWEET_MIN * 100}%`,
          width: `${(SWEET_MAX - SWEET_MIN) * 100}%`,
          top: 0, bottom: 0,
          background: 'rgba(52, 211, 153, 0.28)',
          borderLeft: '1px solid rgba(52, 211, 153, 0.85)',
          borderRight: '1px solid rgba(52, 211, 153, 0.85)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: `${power * 100}%`,
          background: 'linear-gradient(90deg, #fbbf24, #f97316)',
          boxShadow: '0 0 14px rgba(249, 115, 22, 0.55)',
          transition: 'width 0.02s linear',
        }}
      />
    </div>
  )
}

function SessionSummary({
  session,
  makePct,
  onClose,
  onAgain,
}: {
  session: SessionState
  makePct: number
  onClose: () => void
  onAgain: () => void
}) {
  const grade =
    makePct >= 80 ? 'COLD-BLOODED' :
    makePct >= 60 ? 'BUCKETS' :
    makePct >= 40 ? 'WORK NEEDED' :
    'BRICKLAYER'
  const gradeColor =
    makePct >= 80 ? '#34d399' :
    makePct >= 60 ? '#fbbf24' :
    makePct >= 40 ? '#f97316' :
    '#f87171'
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(5, 4, 10, 0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.22s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(420px, 92vw)',
          padding: 28,
          background: 'var(--surface)',
          border: '1px solid var(--border-2)',
          borderRadius: 'var(--radius-lg)',
          textAlign: 'center',
          boxShadow: '0 32px 80px -20px rgba(0,0,0,0.8)',
        }}
        className="animate-fade-up"
      >
        <span className="badge" style={{ color: gradeColor }}>Range complete</span>
        <div
          className="display"
          style={{
            fontSize: 44, fontWeight: 500, lineHeight: 1.05,
            marginTop: 22,
            color: gradeColor,
            textShadow: '0 0 20px currentColor',
          }}
        >
          {grade}
        </div>
        <div
          className="mono"
          style={{
            marginTop: 12,
            fontSize: 11,
            letterSpacing: '0.22em',
            color: 'var(--text-3)',
            textTransform: 'uppercase',
          }}
        >
          <span className="tnum" style={{ color: 'var(--text)' }}>{session.makes}</span> / {session.attempts} · {makePct}%
          {session.bestStreak > 0 && (
            <> · best streak <span className="tnum" style={{ color: 'var(--text)' }}>{session.bestStreak}</span></>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button
            type="button"
            onClick={onAgain}
            className="btn btn-primary"
            style={{ flex: 1, padding: '12px 18px' }}
          >
            Run it back
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost"
            style={{ flex: 1, padding: '12px 18px' }}
          >
            Back to gym
          </button>
        </div>
      </div>
    </div>
  )
}
