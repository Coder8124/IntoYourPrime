import { useState, type FormEvent, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'

const FT_OPTIONS = [4, 5, 6, 7]
const IN_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

interface ProfileForm {
  name: string
  age: string
  weight: string
  heightFt: string
  heightIn: string
  sex: string
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<ProfileForm>({
    name: '',
    age: '',
    weight: '',
    heightFt: '5',
    heightIn: '8',
    sex: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const isValid =
    form.name.trim().length > 0 &&
    form.age.length > 0 &&
    form.weight.length > 0 &&
    form.sex.length > 0

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!isValid || submitting) return
    setSubmitting(true)
    localStorage.setItem('formAI_profile', JSON.stringify(form))
    setTimeout(() => navigate('/home'), 700)
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
              style={{ fontSize: 36, letterSpacing: '-2px', lineHeight: 1 }}
            >
              F
            </span>
          </div>

          <h1 className="text-[32px] font-black text-white tracking-tight mb-3">
            Form<span className="text-blue-400">AI</span>
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
              {submitting ? 'Initializing…' : 'Begin Training →'}
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
