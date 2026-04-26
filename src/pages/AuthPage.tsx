import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import { getUserProfile, upsertUserDisplayName, firestoreProfileToLocal } from '../lib/firebaseHelpers'
import { TactileBackground } from '../components/TactileBackground'
import { AccoladeWall } from '../components/AccoladeWall'

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
  const alreadySignedIn = Boolean(auth.currentUser)
  const [mode,     setMode]     = useState<Mode>('signin')
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

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
          if (fp) {
            const local = JSON.stringify(firestoreProfileToLocal(fp))
            localStorage.setItem('formAI_profile', local)
            localStorage.setItem(`formAI_profile_${uid}`, local)
            const needsOnboarding = !fp.displayName && !fp.age && !fp.heightCm
            navigate(needsOnboarding ? '/onboarding' : '/home', { replace: true })
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
    <div style={{ position: 'relative', background: 'var(--bg)', color: 'var(--text)' }}>

      {/* ── Auth hero (full viewport) ───────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          minHeight: '100vh',
          overflow: 'hidden',
        }}
      >
        <TactileBackground />

        {/* Brand (top-left) */}
        <div style={{ position: 'absolute', top: 28, left: 28, zIndex: 10 }}>
          <BrandMark />
        </div>

        {/* Footnote (bottom-right) */}
        <div
          style={{
            position: 'absolute',
            right: 28,
            bottom: 28,
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            letterSpacing: '0.2em',
            color: 'var(--text-4)',
            textTransform: 'uppercase',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          v2.6 · AI coach online · 33 landmarks · 30 fps
        </div>

        {/* Form column */}
        <div
          style={{
            position: 'relative',
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '0 clamp(20px, 5vw, 64px)',
            zIndex: 5,
          }}
        >
          {alreadySignedIn ? (
            <div
              className="animate-fade-up"
              style={{
                width: 'min(420px, 92vw)',
                position: 'relative',
                background: 'color-mix(in oklab, var(--surface) 85%, transparent)',
                border: '1px solid var(--border-2)',
                borderRadius: 'var(--radius-lg)',
                padding: 30,
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                boxShadow: '0 24px 60px -20px rgba(0,0,0,0.6)',
                textAlign: 'center',
              }}
            >
              <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 18 }}>
                You're already signed in.
              </p>
              <button
                type="button"
                onClick={() => navigate('/home')}
                className="btn btn-primary"
                style={{ width: '100%', padding: '14px 18px', fontSize: 14 }}
              >
                ← Back to app
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="animate-fade-up"
              style={{
                width: 'min(420px, 92vw)',
                position: 'relative',
                background: 'color-mix(in oklab, var(--surface) 85%, transparent)',
                border: '1px solid var(--border-2)',
                borderRadius: 'var(--radius-lg)',
                padding: 30,
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                boxShadow: '0 24px 60px -20px rgba(0,0,0,0.6)',
              }}
            >
              {/* Soft top-glow overlay */}
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 'inherit',
                  pointerEvents: 'none',
                  background:
                    'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(var(--accent-rgb), 0.14), transparent 70%)',
                }}
              />

              {/* Header row */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="badge">AI coach online</span>
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
                {mode === 'signin' ? 'Step onto the platform.' : 'Claim your prime.'}
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
                {mode === 'signin'
                  ? 'Sign in to sync your sessions, streaks, and shot scores across devices.'
                  : 'Create an account — pose coach, shot tracker, recovery log. All in.'}
              </p>

              {/* Fields */}
              <div style={{ position: 'relative', marginTop: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {mode === 'signup' && (
                  <Field label="Display name">
                    <input
                      className="field"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                    />
                  </Field>
                )}
                <Field label="Email">
                  <input
                    className="field"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </Field>
                <Field label="Password">
                  <input
                    className="field"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    minLength={6}
                  />
                </Field>
              </div>

              {error && (
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
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="btn btn-primary pulse-glow"
                style={{ marginTop: 18, width: '100%', padding: '14px 18px', fontSize: 14 }}
              >
                {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in →' : 'Create account →'}
              </button>

              <div style={{ margin: '18px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span className="mono" style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--text-4)', textTransform: 'uppercase' }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              <button
                type="button"
                onClick={continueAsGuest}
                disabled={loading}
                className="btn btn-ghost"
                style={{ width: '100%', padding: '12px 18px' }}
              >
                Continue as guest
              </button>

              <p style={{ marginTop: 18, textAlign: 'center', fontSize: 12.5, color: 'var(--text-3)' }}>
                {mode === 'signin' ? "No account yet? " : 'Have an account? '}
                <button
                  type="button"
                  onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null) }}
                  style={{ background: 'transparent', border: 0, padding: 0, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}
                >
                  {mode === 'signin' ? 'Create one' : 'Sign in'}
                </button>
              </p>
            </form>
          )}
        </div>
      </div>

      {/* ── Accolade wall (scroll down) ─────────────────────────────────── */}
      <AccoladeWall />

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
