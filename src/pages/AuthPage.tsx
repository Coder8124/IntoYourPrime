import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import { auth } from '../lib/firebase'

type Mode = 'signin' | 'signup'

export function AuthPage() {
  const navigate = useNavigate()
  const [mode,     setMode]     = useState<Mode>('signin')
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() })
        // Pre-fill profile with name from signup
        if (name.trim()) {
          const existing = JSON.parse(localStorage.getItem('formAI_profile') ?? '{}') as Record<string, unknown>
          localStorage.setItem('formAI_profile', JSON.stringify({ ...existing, name: name.trim() }))
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
      const hasProfile = Boolean(localStorage.getItem('formAI_profile'))
      navigate(hasProfile ? '/home' : '/onboarding', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed'
      // Clean up Firebase error messages
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

  return (
    <div className="min-h-screen bg-[#07070e] flex flex-col items-center justify-center px-5 text-white">
      {/* Logo */}
      <div className="mb-10 text-center">
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-400">FormIQ</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">
          {mode === 'signin' ? 'Welcome back' : 'Create account'}
        </h1>
        <p className="mt-2 text-[13px] text-gray-500">
          {mode === 'signin' ? 'Sign in to your account' : 'Start your fitness journey'}
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                className="input-dark w-full"
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input-dark w-full"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input-dark w-full"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="mt-2 w-full rounded-2xl py-4 text-[15px] font-black text-white transition-all disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              boxShadow: '0 0 32px rgba(99,102,241,0.3)',
            }}
          >
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {/* Toggle mode */}
        <p className="mt-6 text-center text-[13px] text-gray-600">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null) }}
            className="font-semibold text-blue-400 hover:text-blue-300 transition-colors"
          >
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
