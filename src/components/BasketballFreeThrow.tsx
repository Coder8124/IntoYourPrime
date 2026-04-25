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
 * Photorealistic 2D free-throw minigame. Animations are refs-driven and pushed
 * straight to DOM styles — React only re-renders on phase / session changes,
 * so the 60fps loop has zero reconciliation cost.
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

  // Initial ball placement after mount
  useEffect(() => { resetBall() }, [resetBall])

  // Render the power bar fill from a ref-only value
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
        // Drop or bounce after the arc
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
      // Lift the ball slightly while charging — sells anticipation
      const lift = 80 - np * 6
      const el = ballRef.current
      if (el) el.style.top = `${lift}%`
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [stopRaf, writePower])

  // Keyboard: Space charge/shoot, Esc close
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

  // Cleanup on unmount
  useEffect(() => () => stopRaf(), [stopRaf])

  const handleClick = () => {
    if (phaseRef.current === 'idle') startCharge()
    else if (phaseRef.current === 'charging') shoot()
  }

  const helper =
    phase === 'idle'     ? 'tap · space to charge' :
    phase === 'charging' ? 'release in the green to swish' :
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
        background: '#0a0710',
        animation: 'fadeIn 0.32s ease',
        overflow: 'hidden',
        cursor: phase === 'idle' || phase === 'charging' ? 'pointer' : 'default',
      }}
      onClick={!sessionDone ? handleClick : undefined}
    >
      <ArenaBackdrop />
      <CourtFloor />
      <Hoop />
      <SpotlightCones />

      {/* Ball — its position is updated via ref in the rAF loop */}
      <div
        ref={ballRef}
        style={{
          position: 'absolute',
          left: '50%',
          top: '80%',
          width: 70,
          height: 70,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 30% 28%, #fbbf24 0%, #f59e0b 28%, #c2410c 75%, #7c2d12 100%)',
          boxShadow:
            '0 0 26px rgba(245,158,11,0.55), inset -8px -10px 16px rgba(0,0,0,0.55), inset 4px 6px 10px rgba(255,255,255,0.18)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          willChange: 'transform, top, left',
        }}
      >
        <svg viewBox="0 0 28 28" style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
          <circle cx="14" cy="14" r="13" fill="none" stroke="rgba(124,45,18,0.65)" strokeWidth="0.7" />
          <path d="M 14 1 Q 14 14 14 27" stroke="rgba(124,45,18,0.55)" strokeWidth="0.6" fill="none" />
          <path d="M 1 14 Q 14 14 27 14" stroke="rgba(124,45,18,0.55)" strokeWidth="0.6" fill="none" />
          <path d="M 4 5 Q 14 14 24 23" stroke="rgba(124,45,18,0.45)" strokeWidth="0.45" fill="none" />
          <path d="M 24 5 Q 14 14 4 23" stroke="rgba(124,45,18,0.45)" strokeWidth="0.45" fill="none" />
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
            fontSize: 64,
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: outcome === 'swish' ? '#34d399' : outcome === 'rim' ? '#fbbf24' : '#f87171',
            textShadow: '0 0 30px currentColor',
            animation: 'fadeUp 0.32s ease',
            pointerEvents: 'none',
            zIndex: 5,
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
          background: 'rgba(15, 15, 25, 0.62)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.08)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.18em',
          color: 'rgba(255,255,255,0.78)',
          textTransform: 'uppercase',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        <div>Shots · <span className="tnum" style={{ color: '#fff' }}>{session.makes}</span> / {session.attempts} of {TOTAL_SHOTS}</div>
        <div style={{ marginTop: 4, color: session.streak >= 3 ? '#fbbf24' : 'rgba(255,255,255,0.55)' }}>
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
          background: 'rgba(15, 15, 25, 0.62)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          color: 'rgba(255,255,255,0.85)',
          cursor: 'pointer',
          fontSize: 16,
          zIndex: 5,
        }}
      >
        ×
      </button>

      {!sessionDone && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 32,
            transform: 'translateX(-50%)',
            width: 'min(440px, 86vw)',
            padding: 16,
            background: 'rgba(15, 15, 25, 0.78)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            pointerEvents: 'none',
            zIndex: 5,
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
              color: 'rgba(255,255,255,0.5)',
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

// ─────────────────────────────────────────────────────────────────────────────
// Arena pieces
// ─────────────────────────────────────────────────────────────────────────────

function ArenaBackdrop() {
  return (
    <>
      {/* Dim ceiling — fades from cool dark blue (top) to deep brown at the floor line */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to bottom, #0a0d18 0%, #0d0f1c 30%, #1a1218 50%, #281914 64%, #2a1a13 70%, transparent 71%)',
          pointerEvents: 'none',
        }}
      />
      {/* Crowd silhouette band — subtle horizontal noise far in the back */}
      <div
        style={{
          position: 'absolute',
          left: 0, right: 0,
          top: '52%',
          height: '14%',
          background:
            'repeating-linear-gradient(90deg, rgba(0,0,0,0.55) 0 4px, rgba(255,255,255,0.05) 4px 7px, rgba(0,0,0,0.55) 7px 12px)',
          maskImage: 'linear-gradient(to bottom, black 0%, transparent 95%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 95%)',
          opacity: 0.65,
          pointerEvents: 'none',
        }}
      />
      {/* A faint warm rim glow above the rim line */}
      <div
        style={{
          position: 'absolute',
          left: '50%', top: '20%',
          transform: 'translate(-50%, -50%)',
          width: '70%', height: 220,
          background:
            'radial-gradient(ellipse 60% 100% at 50% 50%, rgba(255,196,120,0.08), transparent 70%)',
          pointerEvents: 'none',
        }}
      />
    </>
  )
}

function CourtFloor() {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%', pointerEvents: 'none' }}>
      {/* Hardwood gradient — warm planks */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, #6b3f1c 0%, #7e4d24 22%, #8a5a2c 45%, #6e4220 75%, #4d2d15 100%)',
          // Plank seams
          backgroundImage: `
            linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.18) 75%, rgba(0,0,0,0.5) 100%),
            repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0 80px, rgba(255,255,255,0.02) 80px 81px, rgba(0,0,0,0.0) 81px 200px),
            linear-gradient(180deg, #6b3f1c 0%, #7e4d24 22%, #8a5a2c 45%, #6e4220 75%, #4d2d15 100%)
          `,
          backgroundBlendMode: 'normal, screen, normal',
        }}
      />

      {/* Painted free-throw key (rectangle perspective) */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <defs>
          <linearGradient id="paint" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.45)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.7)" />
          </linearGradient>
        </defs>

        {/* Key (lane) — trapezoid because of perspective */}
        <polygon
          points="38,12 62,12 76,98 24,98"
          fill="rgba(220,40,40,0.18)"
          stroke="url(#paint)"
          strokeWidth="0.4"
        />

        {/* Free-throw line */}
        <line x1="38" y1="14" x2="62" y2="14" stroke="url(#paint)" strokeWidth="0.5" />

        {/* Free-throw circle (top half visible from this angle) */}
        <ellipse cx="50" cy="14" rx="13" ry="3.4" fill="none" stroke="url(#paint)" strokeWidth="0.45" />
        <ellipse cx="50" cy="14" rx="13" ry="3.4" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.18" strokeDasharray="0.8 1" />

        {/* Block markers along the lane */}
        {[28, 44, 62, 86].map((y, i) => {
          const lerp = (a: number, b: number, t: number) => a + (b - a) * t
          const u = (y - 12) / 86
          const lx = lerp(38, 24, u)
          const rx = lerp(62, 76, u)
          return (
            <g key={i}>
              <rect x={lx - 1.4} y={y} width="1.4" height="0.9" fill="rgba(255,255,255,0.7)" />
              <rect x={rx} y={y} width="1.4" height="0.9" fill="rgba(255,255,255,0.7)" />
            </g>
          )
        })}

        {/* Free-throw line text */}
        <text
          x="50"
          y="13"
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          fontSize="0.9"
          fill="rgba(255,255,255,0.55)"
          letterSpacing="0.2"
        >
          FREE THROW · 15 FT
        </text>
      </svg>

      {/* Dust haze near the floor */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 90% 35% at 50% 100%, rgba(255,200,140,0.16), transparent 65%)',
        }}
      />
    </div>
  )
}

function Hoop() {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <defs>
        <linearGradient id="bb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <linearGradient id="bbShadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,0,0,0.0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
        </linearGradient>
        <linearGradient id="rimMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="55%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#9a3412" />
        </linearGradient>
        <linearGradient id="armMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
      </defs>

      {/* Backboard support arm (behind backboard) */}
      <rect x="49.6" y="6" width="0.8" height="6" fill="url(#armMetal)" />

      {/* Backboard with shading + red square target */}
      <rect x="38" y="10" width="24" height="14" fill="url(#bb)" stroke="rgba(15,23,42,0.6)" strokeWidth="0.18" />
      <rect x="38" y="10" width="24" height="14" fill="url(#bbShadow)" />
      <rect x="46" y="16" width="8" height="6" fill="none" stroke="#dc2626" strokeWidth="0.45" />
      <rect x="46" y="16" width="8" height="6" fill="rgba(220, 38, 38, 0.06)" />

      {/* Backboard padding band along the bottom edge */}
      <rect x="38" y="23.5" width="24" height="1" fill="#dc2626" />
      <rect x="38" y="23.5" width="24" height="1" fill="rgba(0,0,0,0.25)" />

      {/* Rim — front semi-ellipse with metallic gradient */}
      <ellipse cx="50" cy="26" rx="6" ry="1.4" fill="none" stroke="url(#rimMetal)" strokeWidth="0.55" />
      <ellipse cx="50" cy="26" rx="6" ry="1.4" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="0.18" strokeDasharray="0.4 1" />
      {/* Rim mounting bracket */}
      <rect x="49.4" y="24.6" width="1.2" height="1.6" fill="url(#rimMetal)" />
      <rect x="49.4" y="24.6" width="1.2" height="1.6" fill="rgba(0,0,0,0.3)" />
      {/* Rim hooks */}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 7) * Math.PI
        const x = 50 + Math.cos(a) * 6
        const y = 26 + Math.sin(a) * 1.4 * 0.6 + 0.1
        return <circle key={i} cx={x} cy={y} r="0.16" fill="rgba(0,0,0,0.55)" />
      })}

      {/* Net — multiple strands forming a tapered cone with horizontal binders */}
      <g stroke="rgba(255,255,255,0.7)" strokeWidth="0.18" fill="none">
        {/* Strands */}
        <path d="M 44.2 26.2 L 45.2 33.6" />
        <path d="M 45.4 26.4 L 46.0 34.4" />
        <path d="M 46.6 26.6 L 46.7 35.0" />
        <path d="M 47.8 26.7 L 47.5 35.4" />
        <path d="M 49.0 26.8 L 48.4 35.8" />
        <path d="M 50.0 26.9 L 50.0 36.0" />
        <path d="M 51.0 26.8 L 51.6 35.8" />
        <path d="M 52.2 26.7 L 52.5 35.4" />
        <path d="M 53.4 26.6 L 53.3 35.0" />
        <path d="M 54.6 26.4 L 54.0 34.4" />
        <path d="M 55.8 26.2 L 54.8 33.6" />
        {/* Horizontal binders for that woven look */}
        <path d="M 44.6 29 Q 50 29.6 55.4 29" />
        <path d="M 45.0 31.2 Q 50 31.9 55 31.2" />
        <path d="M 45.6 33.4 Q 50 34.1 54.4 33.4" />
        <path d="M 46.2 35.4 Q 50 36.1 53.8 35.4" />
      </g>
    </svg>
  )
}

function SpotlightCones() {
  return (
    <>
      {/* Two overhead spotlights — cones of warm light fall over the rim and the player */}
      {[35, 65].map((cx, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${cx}%`,
            top: 0,
            width: 380,
            height: 600,
            transform: 'translateX(-50%)',
            background:
              'radial-gradient(ellipse 50% 100% at 50% 0%, rgba(255,225,170,0.16), transparent 70%)',
            pointerEvents: 'none',
            mixBlendMode: 'screen',
          }}
        />
      ))}
      {/* Subtle ambient fog above the floor — adds depth */}
      <div
        style={{
          position: 'absolute',
          left: 0, right: 0,
          bottom: '48%',
          height: 90,
          background:
            'linear-gradient(to top, rgba(255,210,160,0.08), transparent)',
          pointerEvents: 'none',
        }}
      />
    </>
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
