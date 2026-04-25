import { Link, useNavigate } from 'react-router-dom'

const FEATURES = [
  {
    icon: '🎯',
    title: 'Real-Time Form Coaching',
    desc: 'GPT-4o vision analyzes every rep via your webcam and gives instant, personalized corrections — no guessing, no waiting.',
  },
  {
    icon: '🦴',
    title: 'Injury Risk Detection',
    desc: 'MediaPipe tracks 33 body landmarks at 30 fps. Knee valgus, hip sag, spine rounding — caught before they become injuries.',
  },
  {
    icon: '🔢',
    title: 'Automatic Rep Counting',
    desc: 'No clicker. No wristband. Just move — the app counts your reps using pose geometry, 100% locally in your browser.',
  },
  {
    icon: '👥',
    title: 'Squad Accountability',
    desc: 'Add friends, see each other\'s streaks and progress, and let Prime Intelligence rank your squad\'s performance weekly.',
  },
  {
    icon: '🧬',
    title: 'Personalized Recovery',
    desc: 'AI-generated cooldown stretches and weekly recovery insights based on your session history and daily wellness logs.',
  },
  {
    icon: '📊',
    title: 'Progress Dashboard',
    desc: 'Form score trends, volume charts, streak tracking, and fatigue detection across every session you complete.',
  },
]

const STEPS = [
  { num: '01', title: 'Set up once', desc: 'Create an account, add your profile stats, and optionally connect your OpenAI key for full AI coaching.' },
  { num: '02', title: 'Open your camera', desc: 'No hardware required — any webcam works. The app runs entirely in your browser.' },
  { num: '03', title: 'Start moving', desc: 'Choose an exercise, begin your warmup, and get coached rep-by-rep with real-time risk scoring.' },
  { num: '04', title: 'Review & recover', desc: 'After your session, review your form trends, log recovery, and share your stats with your squad.' },
]

const STATS = [
  { value: '33', label: 'body landmarks tracked' },
  { value: '30fps', label: 'real-time analysis' },
  { value: '11', label: 'supported exercises' },
  { value: '0ms', label: 'server-side latency for pose' },
]

function startAsGuest(navigate: ReturnType<typeof useNavigate>) {
  localStorage.setItem('formAI_guest', 'true')
  if (!localStorage.getItem('formAI_profile')) {
    localStorage.setItem('formAI_profile', JSON.stringify({
      name: 'Guest',
      age: '25',
      weight: '150',
      heightFt: '5',
      heightIn: '8',
      sex: 'other',
      fitnessLevel: 'intermediate',
    }))
  }
  navigate('/workout')
}

export function LandingPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-page text-white overflow-x-hidden">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.7s ease forwards; }
        .fade-up-delay-1 { animation: fadeUp 0.7s 0.15s ease forwards; opacity: 0; }
        .fade-up-delay-2 { animation: fadeUp 0.7s 0.3s ease forwards; opacity: 0; }
        .fade-up-delay-3 { animation: fadeUp 0.7s 0.45s ease forwards; opacity: 0; }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 24px rgba(59,130,246,0.4); }
          50%       { box-shadow: 0 0 48px rgba(59,130,246,0.7); }
        }
        .btn-pulse { animation: pulse-glow 2.5s ease-in-out infinite; }
      `}</style>

      {/* Nav */}
      <nav className="sticky top-0 z-20 bg-page/80 backdrop-blur border-b border-subtle px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-black text-[17px] tracking-tight text-white">IntoYour<span className="text-blue-400">Prime</span></span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/auth"
            className="text-[13px] font-semibold text-gray-400 hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            className="px-4 py-2 rounded-xl bg-accent hover:bg-accent/90 text-[13px] font-bold text-white transition-colors"
          >
            Get started free →
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-6 pt-20 pb-24 text-center overflow-hidden">
        {/* Background glow blobs */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(59,130,246,0.12) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-0 left-1/4 w-[300px] h-[300px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.08) 0%, transparent 70%)' }}
        />

        <div className="relative max-w-3xl mx-auto">
          <div className="fade-up inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 mb-6">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-[11px] font-bold text-blue-300 uppercase tracking-wider">AI-powered · runs in your browser</span>
          </div>

          <h1 className="fade-up-delay-1 text-[48px] sm:text-[64px] font-black tracking-tight leading-[1.05] mb-6">
            Your AI personal trainer.{' '}
            <span
              className="inline-block"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
            >
              No gym required.
            </span>
          </h1>

          <p className="fade-up-delay-2 text-[18px] text-gray-400 leading-relaxed max-w-xl mx-auto mb-10">
            Real-time form coaching, injury risk detection, and automatic rep counting — powered by GPT-4o vision and MediaPipe. Just a webcam and your body.
          </p>

          <div className="fade-up-delay-3 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/auth"
              className="btn-pulse px-8 py-4 rounded-2xl bg-accent hover:bg-accent/90 text-[15px] font-black text-white transition-colors w-full sm:w-auto text-center"
            >
              Start training free →
            </Link>
            <button
              type="button"
              onClick={() => startAsGuest(navigate)}
              className="px-8 py-4 rounded-2xl border border-strong text-[15px] font-semibold text-gray-400 hover:text-white hover:border-gray-500 transition-colors w-full sm:w-auto text-center"
            >
              Try without signing up
            </button>
          </div>
          <p className="text-[12px] text-gray-600 mt-3">No account needed to try · Progress saves when you sign up</p>
        </div>
      </section>

      {/* Stats bar */}
      <div className="border-y border-subtle bg-panel py-8 px-6">
        <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {STATS.map(s => (
            <div key={s.label}>
              <p className="text-[28px] font-black text-white">{s.value}</p>
              <p className="text-[11px] text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-blue-400 text-center mb-3">Features</p>
          <h2 className="text-[32px] sm:text-[40px] font-black tracking-tight text-center mb-12">
            Everything a trainer gives you.<br />
            <span className="text-gray-500">At a fraction of the cost.</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(f => (
              <div key={f.title} className="p-5 rounded-2xl bg-panel border border-subtle hover:border-strong transition-colors space-y-3">
                <span className="text-[28px]">{f.icon}</span>
                <h3 className="font-black text-[15px] text-white">{f.title}</h3>
                <p className="text-[13px] text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="px-6 py-20 bg-panel border-y border-subtle">
        <div className="max-w-3xl mx-auto">
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-blue-400 text-center mb-3">How it works</p>
          <h2 className="text-[32px] font-black tracking-tight text-center mb-12">Up and running in 2 minutes.</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {STEPS.map(s => (
              <div key={s.num} className="flex gap-4 p-5 rounded-2xl border border-subtle">
                <span className="font-black text-[28px] text-blue-600/40 leading-none shrink-0">{s.num}</span>
                <div>
                  <h3 className="font-black text-[14px] text-white mb-1">{s.title}</h3>
                  <p className="text-[13px] text-gray-500 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech stack */}
      <section className="px-6 py-16">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-gray-600 mb-6">Built with</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {['GPT-4o Vision', 'MediaPipe Pose', 'React 19', 'TypeScript', 'Firebase', 'Tailwind CSS', 'Web Speech API'].map(t => (
              <span key={t} className="px-3 py-1.5 rounded-full border border-subtle text-[12px] font-semibold text-gray-500">
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24 text-center">
        <div
          className="max-w-2xl mx-auto p-10 rounded-3xl border border-blue-500/20"
          style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.06))' }}
        >
          <h2 className="text-[36px] font-black tracking-tight mb-4">
            Ready to reach your prime?
          </h2>
          <p className="text-gray-400 text-[15px] mb-8 max-w-md mx-auto">
            Free to use. No hardware. No subscription. Just show up and train smarter.
          </p>
          <Link
            to="/auth"
            className="inline-block px-10 py-4 rounded-2xl bg-accent hover:bg-accent/90 text-[16px] font-black text-white transition-colors"
            style={{ boxShadow: '0 0 40px rgba(59,130,246,0.4)' }}
          >
            Create your account →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-subtle px-6 py-6 text-center">
        <p className="text-[12px] text-gray-700">
          IntoYourPrime · AI-powered fitness coaching
        </p>
      </footer>
    </div>
  )
}
