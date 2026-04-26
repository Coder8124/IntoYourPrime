import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BottomNav } from '../components/BottomNav'
import { useTheme } from '../contexts/ThemeContext'
import { hasApiKey } from '../lib/formAnalysis'
import { signOutUser } from '../lib/firestoreUser'
import { upsertFullUserProfile, getUserProfile } from '../lib/firebaseHelpers'
import { auth } from '../lib/firebase'
import { ALL_BADGES } from '../lib/badges'

const FT_OPTIONS  = [4, 5, 6, 7]
const IN_OPTIONS  = [0,1,2,3,4,5,6,7,8,9,10,11]

interface ProfileForm {
  name:         string
  age:          string
  weight:       string
  heightFt:     string
  heightIn:     string
  sex:          string
  fitnessLevel: string
}

function loadProfile(): ProfileForm {
  try {
    const p = JSON.parse(localStorage.getItem('formAI_profile') ?? '{}') as Record<string, unknown>
    return {
      name:         typeof p.name         === 'string' ? p.name         : '',
      age:          typeof p.age          === 'string' ? p.age          : String(p.age ?? ''),
      weight:       typeof p.weight       === 'string' ? p.weight       : String(p.weight ?? ''),
      heightFt:     typeof p.heightFt     === 'string' ? p.heightFt     : '5',
      heightIn:     typeof p.heightIn     === 'string' ? p.heightIn     : '8',
      sex:          typeof p.sex          === 'string' ? p.sex          : '',
      fitnessLevel: typeof p.fitnessLevel === 'string' ? p.fitnessLevel : 'intermediate',
    }
  } catch {
    return { name: '', age: '', weight: '', heightFt: '5', heightIn: '8', sex: '', fitnessLevel: 'intermediate' }
  }
}

export function ProfilePage() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [form,    setForm]    = useState<ProfileForm>(loadProfile)
  const [saved,   setSaved]   = useState(false)
  const [myBadges, setMyBadges] = useState<string[]>([])

  // Sync profile from Firestore on mount so data is restored across devices
  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    getUserProfile(uid).then(profile => {
      if (!profile) return
      if (profile.badges) setMyBadges(profile.badges)
      const totalIn = Math.round((profile.heightCm ?? 168) / 2.54)
      const ft = Math.floor(totalIn / 12)
      const inches = totalIn % 12
      const lbs = Math.round((profile.weightKg ?? 70) * 2.20462)
      const restored: ProfileForm = {
        name:         profile.displayName || '',
        age:          String(profile.age ?? ''),
        weight:       String(lbs),
        heightFt:     String(Math.max(4, Math.min(7, ft))),
        heightIn:     String(inches),
        sex:          profile.biologicalSex || '',
        fitnessLevel: profile.fitnessLevel || 'intermediate',
      }
      // Firestore is source of truth — always overwrite on load
      setForm(restored)
      // Keep localStorage in sync
      const merged = JSON.stringify({ ...restored })
      localStorage.setItem('formAI_profile', merged)
      localStorage.setItem(`formAI_profile_${uid}`, merged)
    }).catch(() => {})
  }, [])

  // API key panel state
  const [apiKey,     setApiKey]     = useState('')
  const [showKey,    setShowKey]    = useState(false)
  const [keyHasValue, setKeyHasValue] = useState(hasApiKey)
  const [keySaved,   setKeySaved]   = useState(false)

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setSaved(false)
  }

  const handleSaveProfile = (e: FormEvent) => {
    e.preventDefault()
    const existing = JSON.parse(localStorage.getItem('formAI_profile') ?? '{}') as Record<string, unknown>
    const merged = JSON.stringify({ ...existing, ...form })
    localStorage.setItem('formAI_profile', merged)
    // Also cache under uid so sign-in restores the profile without hitting Firestore
    const uid   = auth.currentUser?.uid
    const email = auth.currentUser?.email ?? ''
    if (uid) {
      localStorage.setItem(`formAI_profile_${uid}`, merged)
      upsertFullUserProfile(uid, { ...form, email }).catch(() => {})
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleSaveKey = () => {
    const trimmed = apiKey.trim()
    if (trimmed) {
      localStorage.setItem('formAI_openai_key', trimmed)
    } else {
      localStorage.removeItem('formAI_openai_key')
    }
    window.location.reload()
  }

  const handleRemoveKey = () => {
    localStorage.removeItem('formAI_openai_key')
    setApiKey('')
    setKeyHasValue(false)
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2500)
  }

  return (
    <div className="min-h-screen bg-page px-4 py-8 pb-24 text-white">
      <div className="mx-auto max-w-[480px] space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/home" className="text-sm font-semibold text-accent hover:text-accent/80">
            ← Home
          </Link>
          <h1 className="text-xl font-black tracking-tight">Profile</h1>
        </div>

        {/* ── Profile fields ────────────────────────────────────────────── */}
        <div className="card-surface p-6 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-gray-500 uppercase">
              Your Info
            </p>
            {auth.currentUser?.email && (
              <p className="text-[11px] text-gray-600">{auth.currentUser.email}</p>
            )}
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em] mb-2">
                Name
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                className="input-dark"
                autoComplete="off"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em] mb-2">
                  Age
                </label>
                <input
                  type="number"
                  name="age"
                  value={form.age}
                  onChange={handleChange}
                  min="13"
                  max="100"
                  className="input-dark"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em] mb-2">
                  Weight (lbs)
                </label>
                <input
                  type="number"
                  name="weight"
                  value={form.weight}
                  onChange={handleChange}
                  min="50"
                  max="500"
                  className="input-dark"
                />
              </div>
            </div>

            {/* Height */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em] mb-2">
                Height
              </label>
              <div className="grid grid-cols-2 gap-3">
                <select name="heightFt" value={form.heightFt} onChange={handleChange} className="input-dark">
                  {FT_OPTIONS.map(ft => <option key={ft} value={ft}>{ft} ft</option>)}
                </select>
                <select name="heightIn" value={form.heightIn} onChange={handleChange} className="input-dark">
                  {IN_OPTIONS.map(i => <option key={i} value={i}>{i} in</option>)}
                </select>
              </div>
            </div>

            {/* Sex */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em] mb-2">
                Biological Sex
              </label>
              <select name="sex" value={form.sex} onChange={handleChange} className="input-dark">
                <option value="" disabled>Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other / Prefer not to say</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em] mb-2">
                Fitness Level
              </label>
              <select
                name="fitnessLevel"
                value={form.fitnessLevel}
                onChange={handleChange}
                className="input-dark"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-accent hover:bg-accent/90 font-bold text-sm text-white transition-colors"
            >
              {saved ? 'Saved!' : 'Save Profile'}
            </button>
          </form>
        </div>

        {/* ── AI / API key ──────────────────────────────────────────────── */}
        <div className="card-surface p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-gray-500 uppercase">
              AI Settings
            </p>
            {/* Status pill */}
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
              style={
                keyHasValue
                  ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
                  : { background: 'rgba(107,114,128,0.12)', color: '#6b7280' }
              }
            >
              {keyHasValue ? 'AI enabled' : 'No key — basic mode'}
            </span>
          </div>

          <p className="text-[12px] text-gray-500 leading-relaxed">
            {keyHasValue
              ? 'OpenAI key is saved. The app will use GPT-4o-mini for visual form coaching, injury risk blending, and personalized cooldowns.'
              : 'No API key set. The app uses local pose-landmark scoring only — rep counting and basic risk detection still work.'}
          </p>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em]">
                {keyHasValue ? 'Replace Key' : 'Add Key'}
              </label>
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="text-[11px] text-accent hover:text-accent/80 transition-colors"
              >
                {showKey ? 'hide' : 'show'}
              </button>
            </div>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-proj-…"
              className="input-dark font-mono text-[13px]"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSaveKey}
              disabled={!apiKey.trim()}
              className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-sm text-white transition-colors"
            >
              {keySaved ? 'Saved!' : 'Save Key'}
            </button>
            {keyHasValue && (
              <button
                type="button"
                onClick={handleRemoveKey}
                className="px-4 py-2.5 rounded-xl border border-red-900/50 text-red-400 hover:border-red-700 hover:text-red-300 font-semibold text-sm transition-colors"
              >
                Remove
              </button>
            )}
          </div>

          <p className="text-[11px] text-gray-700 leading-relaxed">
            Your key is stored only in this browser (localStorage) and sent directly to OpenAI.
            It is never stored on any server.
          </p>
        </div>

        {/* ── Badges ──────────────────────────────────────────────────────── */}
        <div className="card-surface p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-gray-500 uppercase">
              Badges ({myBadges.length}/{ALL_BADGES.length})
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {ALL_BADGES.map(b => {
              const earned = myBadges.includes(b.id)
              return (
                <div key={b.id}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-center"
                  style={{
                    background: earned ? `${b.color}15` : 'var(--surface)',
                    border: `1px solid ${earned ? b.color + '40' : 'var(--border)'}`,
                    opacity: earned ? 1 : 0.4,
                  }}>
                  <span className="text-[22px]">{earned ? b.icon : '🔒'}</span>
                  <p className="text-[10px] font-bold text-white leading-tight">{b.name}</p>
                  {earned && <p className="text-[9px] text-gray-500 leading-tight">{b.description}</p>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="card-surface p-5 flex items-center justify-between w-full text-left hover:opacity-90 transition-opacity"
        >
          <div className="flex items-center gap-3">
            <span className="text-[22px]">{theme !== 'light' ? '🌙' : '☀️'}</span>
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Appearance</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                {theme !== 'light' ? 'Dark mode — tap to switch to light' : 'Light mode — tap to switch to dark'}
              </p>
            </div>
          </div>
          {/* Toggle pill */}
          <div
            className="relative shrink-0 w-12 h-6 rounded-full transition-colors duration-200"
            style={{
              background: theme === 'light' ? 'var(--accent)' : 'var(--border-2)',
              border: '2px solid',
              borderColor: theme === 'light' ? 'var(--accent)' : 'var(--border-2)',
            }}
          >
            <span
              className="absolute top-0.5 w-4 h-4 rounded-full transition-transform duration-200"
              style={{
                background: '#ffffff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                transform: theme === 'light' ? 'translateX(24px)' : 'translateX(2px)',
              }}
            />
          </div>
        </button>

        {/* Sign out */}
        <div className="mt-8 border-t border-subtle pt-6 space-y-3">
          <Link
            to="/auth"
            className="block w-full rounded-xl border py-3 text-center text-[13px] font-semibold text-gray-400 transition hover:text-white"
            style={{ borderColor: 'var(--border-2)' }}
          >
            🏛 Visit the Gym
          </Link>
          <button
            type="button"
            onClick={async () => {
              await signOutUser()
              navigate('/auth', { replace: true })
            }}
            className="w-full rounded-xl border border-red-500/25 py-3 text-[13px] font-semibold text-red-400 transition hover:bg-red-500/10"
          >
            Sign out
          </button>
        </div>

      </div>
      <BottomNav />
    </div>
  )
}
