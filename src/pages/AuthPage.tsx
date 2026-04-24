import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import { getUserProfile, upsertUserDisplayName, firestoreProfileToLocal } from '../lib/firebaseHelpers'
import type { Drink } from '../components/GymScene'

const GymScene = lazy(() =>
  import('../components/GymScene').then(m => ({ default: m.GymScene })),
)

type Mode = 'signin' | 'signup'
type VendingPhase = 'idle' | 'dispensed' | 'zooming' | 'ready'
type BenchState = null | { reps: number; hits: number; done: boolean }

function BrandMark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden>
        <path
          d="M12 21s-7-4.35-9.5-9.15C.8 8.5 2.6 4.5 6.4 4.5c2 0 3.4 1 4.6 2.6C12.2 5.5 13.6 4.5 15.6 4.5c3.8 0 5.6 4 3.9 7.35C19 16.65 12 21 12 21z"
          fill="var(--accent)"
          opacity={0.9}
        />
        <circle cx={12} cy={10} r={2} fill="var(--bg)" />
      </svg>
      <span className="display" style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.005em' }}>
        IntoYour<span style={{ color: 'var(--accent)' }}>Prime</span>
      </span>
    </div>
  )
}

export function AuthPage() {
  const navigate = useNavigate()
  const [mode,     setMode]     = useState<Mode>('signin')
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  // Vending flow
  const [vending,     setVending]     = useState<VendingPhase>('idle')
  const [pickedDrink, setPickedDrink] = useState<Drink | null>(null)
  const [loginOpen,   setLoginOpen]   = useState(false)

  // Bench flow
  const [bench, setBench] = useState<BenchState>(null)

  const cameraTarget =
    bench ? 'bench' :
    vending === 'zooming' || vending === 'ready' ? 'vending' :
    'idle'

  // When a drink is dispensed, zoom then open the login modal
  useEffect(() => {
    if (vending !== 'dispensed') return
    setVending('zooming')
    const t = window.setTimeout(() => {
      setVending('ready')
      setLoginOpen(true)
    }, 1200)
    return () => window.clearTimeout(t)
  }, [vending])

  // Esc closes the modal and resets vending flow back to idle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (loginOpen) { setLoginOpen(false); setVending('idle'); setPickedDrink(null) }
      else if (bench) setBench(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loginOpen, bench])

  const canSubmit =
    email.includes('@') &&
    password.length >= 6 &&
    (mode === 'signin' || name.trim().length > 0)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setLoading(true)
    try {
      localStorage.removeItem('formAI_guest')
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() })
        if (name.trim()) {
          localStorage.setItem('formAI_profile', JSON.stringify({ name: name.trim() }))
        }
        upsertUserDisplayName(cred.user.uid, name.trim() || email, email).catch(() => {})
        navigate('/onboarding', { replace: true })
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password)
        const uid = cred.user.uid

        const cached = localStorage.getItem(`formAI_profile_${uid}`)
        if (cached) {
          localStorage.setItem('formAI_profile', cached)
          navigate('/home', { replace: true })
          return
        }

        try {
          const fp = await Promise.race([
            getUserProfile(uid),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 4000)),
          ])
          if (fp?.displayName && fp.biologicalSex) {
            const local = JSON.stringify(firestoreProfileToLocal(fp))
            localStorage.setItem('formAI_profile', local)
            localStorage.setItem(`formAI_profile_${uid}`, local)
            navigate('/home', { replace: true })
            return
          }
        } catch { /* offline */ }

        navigate('/onboarding', { replace: true })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed'
      if (msg.includes('email-already-in-use')) setError('An account with this email already exists.')
      else if (msg.includes('wrong-password') || msg.includes('invalid-credential')) setError('Incorrect email or password.')
      else if (msg.includes('user-not-found')) setError('No account found with this email.')
      else if (msg.includes('weak-password')) setError('Password must be at least 6 characters.')
      else if (msg.includes('invalid-email')) setError('Please enter a valid email address.')
      else setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const continueAsGuest = () => {
    localStorage.setItem('formAI_guest', '1')
    navigate('/onboarding', { replace: true })
  }

  const closeLogin = () => {
    setLoginOpen(false)
    setVending('idle')
    setPickedDrink(null)
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      <Suspense fallback={<SceneLoading />}>
        <GymScene
          cameraTarget={cameraTarget}
          onVendingDispensed={(drink) => {
            setPickedDrink(drink)
            setVending('dispensed')
          }}
          onBenchClicked={() => setBench({ reps: 0, hits: 0, done: false })}
        />
      </Suspense>

      {/* Brand (top-left) */}
      <div style={{ position: 'absolute', top: 28, left: 28, zIndex: 10, pointerEvents: 'none' }}>
        <BrandMark />
      </div>

      {/* Top-center hint */}
      {vending === 'idle' && !bench && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 32,
            transform: 'translateX(-50%)',
            zIndex: 10,
            pointerEvents: 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.24em',
            color: 'var(--text-2)',
            textTransform: 'uppercase',
            textAlign: 'center',
            textShadow: '0 2px 20px rgba(0,0,0,0.9)',
          }}
        >
          <div><span style={{ color: '#facc15' }}>↓</span> pick a drink to sign in <span style={{ color: '#facc15' }}>↓</span></div>
          <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-3)' }}>
            or tap the bench · press a set
          </div>
        </div>
      )}

      {/* Dispensed drink banner (during zoom) */}
      {pickedDrink && (vending === 'zooming' || vending === 'ready') && !loginOpen && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 80,
            transform: 'translateX(-50%)',
            zIndex: 10,
            pointerEvents: 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--text-2)',
            textAlign: 'center',
            textShadow: '0 2px 20px rgba(0,0,0,0.9)',
          }}
        >
          <div className="display" style={{ fontSize: 24, letterSpacing: '-0.02em', color: pickedDrink.color, marginBottom: 4 }}>
            {pickedDrink.name}
          </div>
          <div>{pickedDrink.flavor}</div>
        </div>
      )}

      {/* Footnote */}
      <div
        style={{
          position: 'absolute',
          right: 28,
          bottom: 28,
          zIndex: 10,
          pointerEvents: 'none',
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          letterSpacing: '0.2em',
          color: 'var(--text-3)',
          textTransform: 'uppercase',
        }}
      >
        v2.6 · AI coach online · 33 landmarks · 30 fps
      </div>

      {/* Bench minigame HUD */}
      {bench && (
        <BenchMinigameHUD
          state={bench}
          onUpdate={setBench}
          onClose={() => setBench(null)}
        />
      )}

      {/* Login modal */}
      {loginOpen && pickedDrink && (
        <LoginModal
          drink={pickedDrink}
          mode={mode}
          name={name} email={email} password={password}
          error={error} loading={loading} canSubmit={canSubmit}
          onClose={closeLogin}
          onNameChange={setName} onEmailChange={setEmail} onPasswordChange={setPassword}
          onSubmit={handleSubmit}
          onToggleMode={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null) }}
          onGuest={continueAsGuest}
        />
      )}
    </div>
  )
}

function SceneLoading() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
      }}
    >
      <div className="mono" style={{ fontSize: 11, letterSpacing: '0.22em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
        · booting basement ·
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Bench minigame — hold-to-lift, release in the sweet spot
// ───────────────────────────────────────────────────────────────────────────

const BENCH_TARGET_REPS = 5
const SWEET_MIN = 0.72
const SWEET_MAX = 0.92
const LIFT_MS = 1400   // ms from 0 → 1 at a steady hold

function BenchMinigameHUD({
  state,
  onUpdate,
  onClose,
}: {
  state: NonNullable<BenchState>
  onUpdate: (s: NonNullable<BenchState>) => void
  onClose: () => void
}) {
  const [power, setPower]     = useState(0)
  const [holding, setHolding] = useState(false)
  const [lastRep, setLastRep] = useState<'hit' | 'miss' | null>(null)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)
  const stateRef = useRef(state)
  stateRef.current = state

  // Drive the scene-side barbell
  useEffect(() => {
    ;(window as unknown as { __benchLift?: number }).__benchLift = power
  }, [power])
  useEffect(() => {
    // Cleanup on unmount
    return () => {
      (window as unknown as { __benchLift?: number }).__benchLift = 0
    }
  }, [])

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }, [])

  const release = useCallback(() => {
    if (!holding) return
    stop()
    const p = power
    const hit = p >= SWEET_MIN && p <= SWEET_MAX
    const cur = stateRef.current
    const nextReps = cur.reps + 1
    const nextHits = cur.hits + (hit ? 1 : 0)
    setLastRep(hit ? 'hit' : 'miss')
    onUpdate({
      reps: nextReps,
      hits: nextHits,
      done: nextReps >= BENCH_TARGET_REPS,
    })
    setHolding(false)
    // Drop the bar back to zero over ~200ms via a decay loop
    const t0 = performance.now()
    const decay = () => {
      const k = Math.min(1, (performance.now() - t0) / 200)
      setPower(p0 => p0 * (1 - k))
      if (k < 1) rafRef.current = requestAnimationFrame(decay)
    }
    rafRef.current = requestAnimationFrame(decay)
  }, [holding, power, onUpdate, stop])

  const startHold = useCallback(() => {
    if (state.done || holding) return
    stop()
    setHolding(true)
    setLastRep(null)
    startRef.current = performance.now()
    const tick = () => {
      const k = Math.min(1, (performance.now() - startRef.current) / LIFT_MS)
      setPower(k)
      if (k < 1) rafRef.current = requestAnimationFrame(tick)
      else {
        // Held too long — auto-miss
        release()
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [state.done, holding, release, stop])

  // Keyboard controls (Space) + global mouse-up safety (so releasing outside HUD still counts)
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      e.preventDefault()
      if (!holding) startHold()
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      if (holding) release()
    }
    const onMouseUp = () => { if (holding) release() }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [holding, startHold, release])

  if (state.done) {
    return <BenchSummary state={state} onClose={onClose} />
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 32,
        transform: 'translateX(-50%)',
        zIndex: 20,
        width: 'min(560px, 92vw)',
        padding: 22,
        background: 'color-mix(in oklab, var(--surface) 92%, transparent)',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--radius-lg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 32px 80px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(34,211,238,0.12)',
      }}
      className="animate-fade-up"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span className="badge" style={{ color: '#22d3ee' }}>Press a set</span>
        <span className="mono" style={{ fontSize: 11, letterSpacing: '0.22em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
          rep <span className="tnum" style={{ color: 'var(--text)' }}>{state.reps}</span> / {BENCH_TARGET_REPS}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 26, height: 26,
            borderRadius: 999,
            border: '1px solid var(--border-2)',
            background: 'transparent',
            color: 'var(--text-3)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          ×
        </button>
      </div>

      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); startHold() }}
        onTouchStart={(e) => { e.preventDefault(); startHold() }}
        onMouseUp={release}
        onTouchEnd={release}
        style={{
          width: '100%',
          padding: 0,
          background: 'transparent',
          border: 0,
          cursor: holding ? 'grabbing' : 'grab',
        }}
      >
        <PowerMeter power={power} />
      </button>

      <div
        className="mono"
        style={{
          marginTop: 10,
          fontSize: 10.5,
          letterSpacing: '0.2em',
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>{holding ? '· hold …' : 'hold space / click to lift'}</span>
        <span>release in the <span style={{ color: '#22d3ee' }}>green</span></span>
      </div>

      {/* Rep dots + result */}
      <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
        {Array.from({ length: BENCH_TARGET_REPS }).map((_, i) => {
          const done = i < state.reps
          const isHit = done && i < state.hits
          return (
            <div
              key={i}
              style={{
                width: 16, height: 16,
                borderRadius: 4,
                background: done
                  ? (isHit ? '#22d3ee' : 'rgba(239,68,68,0.8)')
                  : 'rgba(255,255,255,0.06)',
                border: '1px solid ' + (done ? 'transparent' : 'var(--border)'),
                boxShadow: done && isHit ? '0 0 10px rgba(34,211,238,0.6)' : 'none',
              }}
            />
          )
        })}
        {lastRep && (
          <span
            className="display"
            style={{
              marginLeft: 10,
              fontSize: 16,
              letterSpacing: '-0.01em',
              color: lastRep === 'hit' ? '#22d3ee' : '#ef4444',
              textShadow: '0 0 12px currentColor',
            }}
          >
            {lastRep === 'hit' ? 'CLEAN' : 'GRIND'}
          </span>
        )}
      </div>
    </div>
  )
}

function PowerMeter({ power }: { power: number }) {
  return (
    <div
      style={{
        position: 'relative',
        height: 18,
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {/* Sweet spot */}
      <div
        style={{
          position: 'absolute',
          left: `${SWEET_MIN * 100}%`,
          width: `${(SWEET_MAX - SWEET_MIN) * 100}%`,
          top: 0, bottom: 0,
          background: 'rgba(34,211,238,0.22)',
          borderLeft: '1px solid rgba(34,211,238,0.8)',
          borderRight: '1px solid rgba(34,211,238,0.8)',
        }}
      />
      {/* Fill */}
      <div
        style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: `${power * 100}%`,
          background: 'linear-gradient(90deg, #f59e0b, #ec4899)',
          boxShadow: '0 0 14px rgba(236,72,153,0.55)',
          transition: 'width 0.02s linear',
        }}
      />
    </div>
  )
}

function BenchSummary({
  state,
  onClose,
}: {
  state: NonNullable<BenchState>
  onClose: () => void
}) {
  const pct = Math.round((state.hits / state.reps) * 100)
  const grade = pct >= 80 ? 'PRIMED' : pct >= 60 ? 'SOLID' : pct >= 40 ? 'GRINDER' : 'REBUILD'
  const gradeColor = pct >= 80 ? '#22d3ee' : pct >= 60 ? '#34d399' : pct >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(5,4,10,0.78)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
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
        <span className="badge" style={{ color: gradeColor }}>Set complete</span>
        <div className="display" style={{ fontSize: 56, fontWeight: 500, lineHeight: 1, marginTop: 22, color: gradeColor, textShadow: '0 0 20px currentColor' }}>
          {grade}
        </div>
        <div className="mono" style={{ marginTop: 10, fontSize: 11, letterSpacing: '0.22em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
          <span className="tnum" style={{ color: 'var(--text)' }}>{state.hits}</span> / {state.reps} clean · {pct}%
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-ghost"
          style={{ marginTop: 24, width: '100%', padding: '12px 18px' }}
        >
          Back to the floor
        </button>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Login modal (post-dispense)
// ───────────────────────────────────────────────────────────────────────────

function LoginModal(p: {
  drink: Drink
  mode: Mode
  name: string; email: string; password: string
  error: string | null; loading: boolean; canSubmit: boolean
  onClose: () => void
  onNameChange: (v: string) => void
  onEmailChange: (v: string) => void
  onPasswordChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  onToggleMode: () => void
  onGuest: () => void
}) {
  return (
    <div
      onClick={p.onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at center, rgba(5,4,10,0.35), rgba(5,4,10,0.82))',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.28s ease',
      }}
    >
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={p.onSubmit}
        className="animate-fade-up"
        style={{
          width: 'min(420px, 92vw)',
          position: 'relative',
          background: 'color-mix(in oklab, var(--surface) 90%, transparent)',
          border: '1px solid var(--border-2)',
          borderRadius: 'var(--radius-lg)',
          padding: 30,
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          boxShadow: `0 32px 80px -20px rgba(0,0,0,0.8), 0 0 0 1px ${p.drink.color}26`,
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            background: `radial-gradient(ellipse 90% 50% at 50% 0%, ${p.drink.color}28, transparent 72%)`,
          }}
        />

        <button
          type="button"
          onClick={p.onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 28,
            height: 28,
            borderRadius: 999,
            border: '1px solid var(--border-2)',
            background: 'transparent',
            color: 'var(--text-3)',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ×
        </button>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            className="badge"
            style={{
              background: `${p.drink.color}14`,
              borderColor: `${p.drink.color}4d`,
              color: p.drink.color,
            }}
          >
            {p.drink.name} poured
          </span>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.18em' }}>
            v2.6
          </span>
        </div>

        <h1
          className="display"
          style={{
            position: 'relative',
            marginTop: 22,
            fontSize: 30,
            fontWeight: 500,
            lineHeight: 1.1,
            color: 'var(--text)',
          }}
        >
          {p.mode === 'signin' ? 'Step onto the platform.' : 'Claim your prime.'}
        </h1>
        <p
          style={{
            position: 'relative',
            marginTop: 8,
            fontSize: 13.5,
            lineHeight: 1.55,
            color: 'var(--text-2)',
          }}
        >
          Pay with credentials. The machine takes it from here.
        </p>

        <div style={{ position: 'relative', marginTop: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {p.mode === 'signup' && (
            <Field label="Display name">
              <input
                className="field"
                type="text"
                value={p.name}
                onChange={e => p.onNameChange(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                autoFocus
              />
            </Field>
          )}

          <Field label="Email">
            <input
              className="field"
              type="email"
              value={p.email}
              onChange={e => p.onEmailChange(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              autoFocus={p.mode === 'signin'}
            />
          </Field>

          <Field label="Password">
            <input
              className="field"
              type="password"
              value={p.password}
              onChange={e => p.onPasswordChange(e.target.value)}
              placeholder="••••••••"
              autoComplete={p.mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={6}
            />
          </Field>
        </div>

        {p.error && (
          <div
            role="alert"
            style={{
              marginTop: 14,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(248, 113, 113, 0.08)',
              border: '1px solid rgba(248, 113, 113, 0.3)',
              fontSize: 12.5,
              color: '#fca5a5',
            }}
          >
            {p.error}
          </div>
        )}

        <button
          type="submit"
          disabled={!p.canSubmit || p.loading}
          className="btn btn-primary pulse-glow"
          style={{ marginTop: 18, width: '100%', padding: '14px 18px', fontSize: 14 }}
        >
          {p.loading ? 'Please wait…' : p.mode === 'signin' ? 'Sign in →' : 'Create account →'}
        </button>

        <div style={{ margin: '18px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span className="mono" style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--text-4)', textTransform: 'uppercase' }}>
            or
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <button
          type="button"
          onClick={p.onGuest}
          disabled={p.loading}
          className="btn btn-ghost"
          style={{ width: '100%', padding: '12px 18px' }}
        >
          Continue as guest
        </button>

        <p
          style={{
            marginTop: 18,
            textAlign: 'center',
            fontSize: 12.5,
            color: 'var(--text-3)',
          }}
        >
          {p.mode === 'signin' ? "No account yet? " : 'Have an account? '}
          <button
            type="button"
            onClick={p.onToggleMode}
            style={{
              background: 'transparent',
              border: 0,
              padding: 0,
              color: 'var(--accent)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {p.mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span
        className="mono"
        style={{
          display: 'block',
          marginBottom: 6,
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--text-3)',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}
