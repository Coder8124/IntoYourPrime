import { useState, type FormEvent, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { hasApiKey } from '../lib/formAnalysis'
import { upsertFullUserProfile } from '../lib/firebaseHelpers'
import { auth } from '../lib/firebase'

const FT_OPTIONS = [4, 5, 6, 7]
const IN_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

interface ProfileForm {
  name: string
  age: string
  weight: string
  heightFt: string
  heightIn: string
  sex: string
  fitnessLevel: string
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'profile' | 'apikey'>('profile')
  const [form, setForm] = useState<ProfileForm>({
    name: '',
    age: '',
    weight: '',
    heightFt: '5',
    heightIn: '8',
    sex: '',
    fitnessLevel: 'intermediate',
  })
  const [submitting, setSubmitting] = useState(false)
  const [saveError,  setSaveError]  = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const isValid =
    form.name.trim().length > 0 &&
    form.age.length > 0 &&
    form.weight.length > 0 &&
    form.sex.length > 0

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isValid || submitting) return
    setSubmitting(true)
    setSaveError(false)

    const profileJson = JSON.stringify(form)
    localStorage.setItem('formAI_profile', profileJson)

    const uid = auth.currentUser?.uid
    if (uid) {
      localStorage.setItem(`formAI_profile_${uid}`, profileJson)
      try {
        await Promise.race([
          upsertFullUserProfile(uid, { ...form, email: auth.currentUser?.email ?? '' }),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
        ])
      } catch {
        // Save failed — profile is in localStorage, user can re-save from Profile page
        setSaveError(true)
      }
    }

    if (!hasApiKey()) {
      setSubmitting(false)
      setStep('apikey')
    } else {
      setTimeout(() => navigate('/home'), 400)
    }
  }

  const handleSaveKey = () => {
    const trimmed = apiKey.trim()
    if (trimmed) localStorage.setItem('formAI_openai_key', trimmed)
    setSubmitting(true)
    setTimeout(() => navigate('/home'), 400)
  }

  const handleSkipKey = () => {
    setSubmitting(true)
    setTimeout(() => navigate('/home'), 400)
  }

  if (step === 'apikey') {
    return (
      <div className="relative min-h-screen bg-[#0a0a0f] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="grid-bg absolute inset-0" />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 45%, transparent 20%, #0a0a0f 80%)' }} />
        </div>
        <div
          className="relative z-10 w-full max-w-[440px] px-5 py-10"
          style={{
            opacity: submitting ? 0 : 1,
            transform: submitting ? 'scale(0.96) translateY(8px)' : 'scale(1)',
            transition: 'opacity 0.4s ease, transform 0.4s ease',
          }}
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', boxShadow: '0 0 40px rgba(59,130,246,0.4)' }}>
              <span className="text-white font-black select-none" style={{ fontSize: 20, letterSpacing: '-1px' }}>IYP</span>
            </div>
            <h1 className="text-[26px] font-black text-white tracking-tight">Enable AI Coaching</h1>
            <p className="mt-2 text-center text-gray-400 text-[13px] leading-relaxed max-w-[300px]">
              Add your OpenAI API key to unlock real-time form analysis, injury risk scoring, and personalized cooldowns.
            </p>
          </div>

          <div className="card-surface p-7 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em]">OpenAI API Key</label>
                <button type="button" onClick={() => setShowKey(v => !v)} className="text-[11px] text-blue-500 hover:text-blue-400">
                  {showKey ? 'hide' : 'show'}
                </button>
              </div>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-proj-…"
                className="input-dark font-mono text-[15px] py-4"
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />
              <p className="mt-2 text-[11px] text-gray-700 leading-relaxed">
                Stored in your browser only — never sent to any server.
              </p>
            </div>

            <button
              type="button"
              onClick={handleSaveKey}
              disabled={!apiKey.trim()}
              className="w-full py-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-[17px] text-white transition-colors"
              style={{ boxShadow: '0 0 32px rgba(59,130,246,0.35)' }}
            >
              Save Key &amp; Start →
            </button>
            <button
              type="button"
              onClick={handleSkipKey}
              className="w-full py-3 rounded-xl border border-[#2e2e3e] text-[14px] font-semibold text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors"
            >
              Skip — use basic mode
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-[#0a0a0f] flex items-center justify-center overflow-hidden">

      {/* ── Animated grid background ───────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="grid-bg absolute inset-0" />
        {/* Radial fade-out overlay so grid fades toward edges */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 50% 45%, transparent 20%, #0a0a0f 80%)',
          }}
        />
        {/* Subtle blue center glow */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 50% 40% at 50% 45%, rgba(59,130,246,0.055) 0%, transparent 65%)',
          }}
        />
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div
        className="relative z-10 w-full max-w-[440px] px-5 py-10"
        style={{
          opacity: submitting ? 0 : 1,
          transform: submitting ? 'scale(0.96) translateY(8px)' : 'scale(1) translateY(0)',
          transition: 'opacity 0.45s ease, transform 0.45s ease',
        }}
      >
        {/* Logo + headline */}
        <div className="flex flex-col items-center mb-10 animate-fade-in">
          {/* Logo mark */}
          <div
            className="w-[72px] h-[72px] rounded-[22px] flex items-center justify-center mb-5"
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              boxShadow: '0 0 48px rgba(59,130,246,0.45), 0 0 90px rgba(59,130,246,0.12)',
            }}
          >
            <span
              className="text-white font-black select-none"
              style={{ fontSize: 22, letterSpacing: '-1px', lineHeight: 1 }}
            >
              IYP
            </span>
          </div>

          <h1 className="text-[32px] font-black text-white tracking-tight mb-3">
            Into<span className="text-blue-400">YourPrime</span>
          </h1>

          <p className="text-center text-gray-400 text-[13.5px] leading-relaxed max-w-[300px]">
            Your AI Personal Trainer. Real-time form coaching, injury prevention,
            and recovery optimization.
          </p>
        </div>

        {/* Form card */}
        <div className="card-surface p-7 animate-fade-in-delay">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-gray-500 uppercase mb-6">
            Create Your Profile
          </p>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>

            {/* Name */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em] mb-2">
                Full Name
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Alex Johnson"
                className="input-dark"
                autoComplete="off"
                autoFocus
              />
            </div>

            {/* Age + Weight */}
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
                  placeholder="25"
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
                  placeholder="165"
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
              <div className="grid grid-cols-2 gap-4">
                <select
                  name="heightFt"
                  value={form.heightFt}
                  onChange={handleChange}
                  className="input-dark"
                >
                  {FT_OPTIONS.map(ft => (
                    <option key={ft} value={ft}>{ft} ft</option>
                  ))}
                </select>
                <select
                  name="heightIn"
                  value={form.heightIn}
                  onChange={handleChange}
                  className="input-dark"
                >
                  {IN_OPTIONS.map(inch => (
                    <option key={inch} value={inch}>{inch} in</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Biological Sex */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-[0.1em] mb-2">
                Biological Sex
              </label>
              <select
                name="sex"
                value={form.sex}
                onChange={handleChange}
                className="input-dark"
              >
                <option value="" disabled>Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other / Prefer not to say</option>
              </select>
            </div>

            {/* Fitness level */}
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

            {saveError && (
              <p className="text-[11px] text-amber-400 text-center">
                Profile saved locally — sync it from the Profile page when online.
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!isValid || submitting}
              className={[
                'w-full py-[14px] rounded-xl font-bold text-[15px] text-white mt-2',
                'transition-all duration-200',
                isValid && !submitting
                  ? 'bg-blue-600 btn-glow-blue cursor-pointer hover:bg-blue-500'
                  : 'bg-blue-600/25 text-blue-400/40 cursor-not-allowed',
              ].join(' ')}
            >
              {submitting ? 'Saving profile…' : 'Begin Training →'}
            </button>
          </form>
        </div>

        <p className="text-center text-[12px] text-gray-700 mt-5">
          Data is stored locally — never shared.
        </p>
      </div>
    </div>
  )
}
