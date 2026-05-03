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
 *
 * Animations are refs-driven and pushed straight to DOM styles — React only
 * re-renders on phase / session changes, so the 60fps loop has zero
 * reconciliation cost.
 */
export function BasketballFreeThrow({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [session, setSession] = useState<SessionState>(ZERO)

  // Refs — drive the animation without re-rendering React
  const ballRef  = useRef<HTMLDivElement>(null)
  const fillRef  = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const powerRef = useRef(0)
  const dirRef   = useRef(1)
  const rafRef   = useRef<number | null>(null)
  const phaseRef = useRef<Phase>('idle')
  phaseRef.current = phase

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }, [])

  const setBallTransform = useCallback((xPct: number, yPct: number, scale: number, spin: number) => {
    const el = ballRef.current
    if (!el) return
    el.style.left = `${xPct}%`
    el.style.top  = `${yPct}%`
    el.style.transform = `translate(-50%, -50%) rotate(${spin}deg) scale(${scale})`
  }, [])

  const resetBall = useCallback(() => {
    setBallTransform(50, 80, 1, 0)
  }, [setBallTransform])

  useEffect(() => { resetBall() }, [resetBall])

  const writePower = useCallback((v: number) => {
    powerRef.current = v
    if (fillRef.current) fillRef.current.style.width = `${v * 100}%`
    if (labelRef.current) labelRef.current.textContent = String(Math.round(v * 100))
  }, [])

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
      writePower(0)
      resetBall()
      setOutcome(null)
      setPhase('idle')
    }, 1100)
  }, [writePower, resetBall])

  const animateShot = useCallback((result: Outcome) => {
    stopRaf()
    setPhase('shooting')
    const startX = 50, startY = 80
    const rimX = 50, rimY = 28
    const xOff = result === 'miss' ? (Math.random() > 0.5 ? 8 : -8)
              : result === 'rim'  ? (Math.random() > 0.5 ? 2 : -2)
              : 0

    const t0 = performance.now()
    const dur = 820
    const flight = (now: number) => {
      const k = Math.min(1, (now - t0) / dur)
      const x = startX + (rimX - startX + xOff) * k
      const y = startY * (1 - k) + rimY * k - Math.sin(k * Math.PI) * 36
      const norm = Math.max(0, Math.min(1, (startY - y) / (startY - 14)))
      const scale = 1 + norm * 0.55
      setBallTransform(x, y, scale, k * 720)
      if (k < 1) {
        rafRef.current = requestAnimationFrame(flight)
      } else {
        const t1 = performance.now()
        const drop = (nn: number) => {
          const kk = Math.min(1, (nn - t1) / 520)
          const bx = result === 'rim'
            ? rimX + xOff + Math.sin(kk * Math.PI * 2) * 2
            : rimX + xOff
          const by = rimY + kk * 60
          const scale = Math.max(0.55, 1.1 - kk * 0.4)
          setBallTransform(bx, by, scale, 720 + kk * 360)
          if (kk < 1) rafRef.current = requestAnimationFrame(drop)
          else finish(result)
        }
        rafRef.current = requestAnimationFrame(drop)
      }
    }
    rafRef.current = requestAnimationFrame(flight)
  }, [stopRaf, setBallTransform, finish])

  const shoot = useCallback(() => {
    if (phaseRef.current !== 'charging') return
    stopRaf()
    const p = powerRef.current
    const result: Outcome =
      (p >= SWEET_MIN && p <= SWEET_MAX) ? 'swish' :
      (p >= CLOSE_MIN && p <= CLOSE_MAX) ? 'rim' :
      'miss'
    animateShot(result)
  }, [stopRaf, animateShot])

  const startCharge = useCallback(() => {
    if (phaseRef.current !== 'idle') return
    stopRaf()
    dirRef.current = 1
    writePower(0)
    setPhase('charging')
    const tick = () => {
      let np = powerRef.current + 0.022 * dirRef.current
      if (np >= 1) { np = 1; dirRef.current = -1 }
      if (np <= 0) { np = 0; dirRef.current = 1 }
      writePower(np)
      const lift = 80 - np * 6
      const el = ballRef.current
      if (el) el.style.top = `${lift}%`
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [stopRaf, writePower])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (phaseRef.current === 'idle') startCharge()
        else if (phaseRef.current === 'charging') shoot()
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [startCharge, shoot, onClose])

  useEffect(() => () => stopRaf(), [stopRaf])

  const handleClick = () => {
    if (phaseRef.current === 'idle') startCharge()
    else if (phaseRef.current === 'charging') shoot()
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
        animation: 'fadeIn 0.45s cubic-bezier(0.2,0.8,0.2,1)',
        overflow: 'hidden',
        cursor: phase === 'idle' || phase === 'charging' ? 'pointer' : 'default',
      }}
      onClick={!sessionDone ? handleClick : undefined}
    >
      {/* Court floor glow — lower band */}
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
        <rect x="42" y="10" width="16" height="14" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
        <rect x="46" y="14" width="8" height="6" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.25" />
        {/* Rim */}
        <ellipse cx="50" cy="28" rx="5.5" ry="1.1" fill="none" stroke="#f97316" strokeWidth="0.55" />
        <ellipse cx="50" cy="28" rx="5.5" ry="1.1" fill="none" stroke="#f97316" strokeWidth="0.22" opacity="0.6" />
        {/* Net — drape */}
        <g stroke="rgba(255,255,255,0.45)" strokeWidth="0.18" fill="none">
          <path d="M 44.8 28 L 46 36 M 46.5 28 L 47.3 36.5 M 48.2 28 L 48.5 37 M 50 28 L 50 37.2 M 51.8 28 L 51.5 37 M 53.5 28 L 52.7 36.5 M 55.2 28 L 54 36" />
          <path d="M 46 32 L 54 32 M 46.5 35 L 53.5 35" />
        </g>
        {/* Support arm to top */}
        <line x1="50" y1="10" x2="50" y2="4" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
      </svg>

      {/* Ball — position written via ref in the rAF loop */}
      <div
        ref={ballRef}
        style={{
          position: 'absolute',
          left: '50%',
          top: '80%',
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, #f59e0b, #b45309)',
          boxShadow: '0 0 26px rgba(245,158,11,0.45), inset -5px -5px 10px rgba(0,0,0,0.35)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          willChange: 'transform, top, left',
        }}
      >
        <svg viewBox="0 0 28 28" style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
          <circle cx="14" cy="14" r="13" fill="none" stroke="#7c2d12" strokeWidth="0.8" opacity="0.6" />
          <path d="M 14 1 Q 14 14 14 27" stroke="#7c2d12" strokeWidth="0.8" fill="none" opacity="0.6" />
          <path d="M 1 14 Q 14 14 27 14" stroke="#7c2d12" strokeWidth="0.8" fill="none" opacity="0.6" />
        </svg>
      </div>

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
            <span ref={labelRef} className="tnum" style={{ color: '#fff' }}>0</span>
          </div>
          <PowerBar fillRef={fillRef} />
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

      {sessionDone && phase === 'idle' && (
        <SessionSummary
          session={session}
          makePct={makePct}
          onClose={onClose}
          onAgain={() => {
            setSession(ZERO)
            setOutcome(null)
            writePower(0)
            resetBall()
          }}
        />
      )}
    </div>
  )
}

function PowerBar({ fillRef }: { fillRef: React.RefObject<HTMLDivElement | null> }) {
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
        ref={fillRef}
        style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: '0%',
          background: 'linear-gradient(90deg, #fbbf24, #f97316)',
          boxShadow: '0 0 14px rgba(249, 115, 22, 0.55)',
          willChange: 'width',
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
