import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import { getUserProfile, upsertUserDisplayName, firestoreProfileToLocal } from '../lib/firebaseHelpers'

const GymScene = lazy(() =>
  import('../components/GymScene').then(m => ({ default: m.GymScene })),
)

type Mode = 'signin' | 'signup'

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
  const [open,     setOpen]     = useState(false)

  // Esc closes the modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* 3D scene */}
      <Suspense fallback={<SceneLoading />}>
        <GymScene onVendClick={() => setOpen(true)} />
      </Suspense>

      {/* Chrome — brand + footnote */}
      <div style={{ position: 'absolute', top: 28, left: 28, zIndex: 10, pointerEvents: 'none' }}>
        <BrandMark />
      </div>
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
        <span style={{ color: '#facc15' }}>↓</span> tap the vending machine to enter{' '}
        <span style={{ color: '#facc15' }}>↓</span>
      </div>

      {/* Modal — login card appears when the vending machine is clicked */}
      {open && (
        <LoginModal
          mode={mode}
          name={name} email={email} password={password}
          error={error} loading={loading} canSubmit={canSubmit}
          onClose={() => setOpen(false)}
          onNameChange={setName} onEmailChange={setEmail} onPasswordChange={setPassword}
          onSubmit={handleSubmit}
          onToggleMode={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null) }}
          onGuest={continueAsGuest}
        />
      )}
    </div>
  )
}

function LoginModal(p: {
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
          boxShadow: '0 32px 80px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(236,72,153,0.08)',
        }}
      >
        {/* Top glow matching the vending machine's magenta */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            background:
              'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(236,72,153,0.16), transparent 72%)',
          }}
        />

        {/* Close (X) */}
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

        {/* Header row */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="badge">Dispensing access…</span>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.18em' }}>
            v2.6
          </span>
        </div>

        {/* Headline */}
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
          {p.mode === 'signin'
            ? 'Drop in your credentials — the machine takes it from here.'
            : 'New rack in town? Set up a locker.'}
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
