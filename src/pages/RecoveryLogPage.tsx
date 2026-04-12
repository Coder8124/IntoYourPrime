import { useNavigate } from 'react-router-dom'

export function RecoveryLogPage() {
  const navigate = useNavigate()

  return (
    <div className="relative min-h-screen bg-[#0a0a0f] flex items-center justify-center overflow-hidden">
      {/* Subtle grid bg */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="grid-bg absolute inset-0" />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, #0a0a0f 80%)' }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-[420px] px-6 animate-fade-in">
        {/* Icon */}
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 text-3xl"
          style={{
            background: 'linear-gradient(135deg, #166534 0%, #22c55e 100%)',
            boxShadow: '0 0 48px rgba(34,197,94,0.35)',
          }}
        >
          🌱
        </div>

        <h1 className="text-3xl font-black text-white mb-3 tracking-tight">
          Recovery
        </h1>

        <p className="text-gray-400 text-[14px] leading-relaxed mb-2">
          AI-powered recovery protocols, sleep optimization, and muscle soreness tracking
          are coming soon.
        </p>
        <p className="text-gray-600 text-[13px] mb-10">
          Your workout data has been saved.
        </p>

        {/* Placeholder feature cards */}
        <div className="w-full space-y-3 mb-10">
          {[
            { icon: '💤', title: 'Sleep Analysis',        desc: 'Optimize recovery with sleep tracking' },
            { icon: '🧊', title: 'Soreness Mapping',      desc: 'Track muscle groups for smart scheduling' },
            { icon: '🥗', title: 'Nutrition Suggestions', desc: 'Post-workout macro recommendations' },
          ].map(card => (
            <div key={card.title} className="card-surface flex items-center gap-4 px-5 py-4 text-left opacity-50">
              <span className="text-2xl">{card.icon}</span>
              <div>
                <div className="text-[13px] font-semibold text-white">{card.title}</div>
                <div className="text-[12px] text-gray-500">{card.desc}</div>
              </div>
              <span className="ml-auto text-[10px] font-bold tracking-widest text-gray-600 uppercase">
                Soon
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate('/workout')}
          className="px-8 py-3.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white text-[14px] btn-glow-blue transition-all"
        >
          ← Back to Training
        </button>
      </div>
    </div>
  )
}
