import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { hasApiKey } from '../lib/formAnalysis'
import { signOutUser } from '../lib/firestoreUser'

interface ProfileForm {
  name:         string
  age:          string
  weight:       string
  fitnessLevel: string
}

function loadProfile(): ProfileForm {
  try {
    const p = JSON.parse(localStorage.getItem('formAI_profile') ?? '{}') as Record<string, unknown>
    return {
      name:         typeof p.name         === 'string' ? p.name         : '',
      age:          typeof p.age          === 'string' ? p.age          : String(p.age ?? ''),
      weight:       typeof p.weight       === 'string' ? p.weight       : String(p.weight ?? ''),
      fitnessLevel: typeof p.fitnessLevel === 'string' ? p.fitnessLevel : 'intermediate',
    }
  } catch {
    return { name: '', age: '', weight: '', fitnessLevel: 'intermediate' }
  }
}

export function ProfilePage() {
  const navigate = useNavigate()
  const [form,    setForm]    = useState<ProfileForm>(loadProfile)
  const [saved,   setSaved]   = useState(false)

  const [apiKey,      setApiKey]      = useState('')
  const [showKey,     setShowKey]     = useState(false)
  const [keyHasValue, setKeyHasValue] = useState(hasApiKey)
  const [keySaved,    setKeySaved]    = useState(false)

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setSaved(false)
  }

  const handleSaveProfile = (e: FormEvent) => {
    e.preventDefault()
    const existing = JSON.parse(localStorage.getItem('formAI_profile') ?? '{}') as Record<string, unknown>
    localStorage.setItem('formAI_profile', JSON.stringify({ ...existing, ...form }))
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
    <div className="min-h-screen bg-[#0a0a0f] px-4 py-8 text-white">
      <div className="mx-auto max-w-[480px] space-y-6">

        <div className="flex items-center gap-4">
          <Link to="/home" className="text-sm font-semibold text-blue-400 hover:text-blue-300">
            ← Home
          </Link>
          <h1 className="text-xl font-black tracking-tight">Profile</h1>
        </div>

        {/* Profile fields */}
        <div className="card-surface p-6 space-y-5">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-gray-500 uppercase">Your Info</p>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em] mb-2">Name</label>
              <input type="text" name="name" value={form.name} onChange={handleChange} className="input-dark" autoComplete="off" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em] mb-2">Age</label>
                <input type="number" name="age" value={form.age} onChange={handleChange} min="13" max="100" className="input-dark" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em] mb-2">Weight (lbs)</label>
                <input type="number" name="weight" value={form.weight} onChange={handleChange} min="50" max="500" className="input-dark" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em] mb-2">Fitness Level</label>
              <select name="fitnessLevel" value={form.fitnessLevel} onChange={handleChange} className="input-dark">
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <button type="submit" className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-sm text-white transition-colors">
              {saved ? 'Saved!' : 'Save Profile'}
            </button>
          </form>
        </div>

        {/* AI / API key */}
        <div className="card-surface p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-gray-500 uppercase">AI Settings</p>
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
              style={keyHasValue
                ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
                : { background: 'rgba(107,114,128,0.12)', color: '#6b7280' }}
            >
              {keyHasValue ? 'AI enabled' : 'No key — basic mode'}
            </span>
          </div>
          <p className="text-[12px] text-gray-500 leading-relaxed">
            {keyHasValue
              ? 'OpenAI key is saved. The app uses GPT-4o-mini for form coaching, injury risk, and personalized cooldowns.'
              : 'No API key set. Local pose-landmark scoring still works for rep counting and basic risk detection.'}
          </p>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em]">
                {keyHasValue ? 'Replace Key' : 'Add Key'}
              </label>
              <button type="button" onClick={() => setShowKey(v => !v)} className="text-[11px] text-blue-500 hover:text-blue-400 transition-colors">
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
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-sm text-white transition-colors"
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
            Key is stored only in this browser (localStorage) and sent directly to OpenAI. Never stored on any server.
          </p>
        </div>

        {/* Sign out */}
        <div className="mt-8 border-t border-[#1e1e2e] pt-6">
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
    </div>
  )
}
