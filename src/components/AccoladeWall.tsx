import { useCallback } from 'react'

const FEATURES: Array<{ icon: string; title: string; desc: string; tint: string }> = [
  { icon: '🎯', title: 'Real-time form coaching', desc: 'GPT-4o vision analyzes every rep through your webcam and gives instant, personalized corrections — no guessing, no waiting.', tint: '#6b8cff' },
  { icon: '🦴', title: 'Injury-risk detection',  desc: 'MediaPipe tracks 33 body landmarks at 30 fps. Knee valgus, hip sag, spine rounding — caught before they become injuries.', tint: '#f87171' },
  { icon: '🔢', title: 'Automatic rep counting', desc: 'No clicker. No wristband. Just move — the app counts your reps using pose geometry, 100% locally in your browser.',     tint: '#a78bfa' },
  { icon: '👥', title: 'Squad accountability',   desc: 'Add friends, see streaks, and let Prime Intelligence rank your squad’s training output every week.',                       tint: '#34d399' },
  { icon: '🧬', title: 'Personalized recovery',  desc: 'AI-generated cooldown stretches and weekly insights based on your session history and daily wellness logs.',                tint: '#5eead4' },
  { icon: '📊', title: 'Progress dashboard',     desc: 'Form-score trends, volume charts, streak tracking, and fatigue detection across every session you complete.',               tint: '#facc15' },
]

const STEPS = [
  { num: '01', title: 'Set up once',     desc: 'Create an account, drop in your stats, and (optionally) wire up your OpenAI key for full AI coaching.' },
  { num: '02', title: 'Open your camera', desc: 'No hardware required — any webcam works. Everything runs in the browser.' },
  { num: '03', title: 'Start moving',     desc: 'Pick an exercise, run your warmup, and get coached rep-by-rep with live risk scoring.' },
  { num: '04', title: 'Review & recover', desc: 'After your session, review form trends, log recovery, and share your stats with your squad.' },
]

const STATS = [
  { value: '33',    label: 'body landmarks tracked' },
  { value: '30fps', label: 'real-time analysis' },
  { value: '11',    label: 'supported exercises' },
  { value: '0ms',   label: 'server-side pose latency' },
]

const STACK = [
  'GPT-4o Vision', 'MediaPipe Pose', 'React 19', 'TypeScript', 'Firebase', 'Tailwind CSS', 'Web Speech API', 'Three.js',
]

export function AccoladeWall() {
  const scrollUp = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return (
    <section
      style={{
        position: 'relative',
        background: 'var(--bg)',
        color: 'var(--text)',
        padding: '120px 24px 100px',
        overflow: 'hidden',
        borderTop: '1px solid var(--border)',
      }}
    >
      {/* Soft accent glow at the top edge */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -120,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 720,
          height: 360,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(var(--accent-rgb), 0.16), transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Section: Headline */}
      <div style={{ position: 'relative', maxWidth: 940, margin: '0 auto', textAlign: 'center' }}>
        <span className="badge" style={{ marginBottom: 18 }}>The pitch</span>
        <h2
          className="display"
          style={{
            fontSize: 'clamp(36px, 5vw, 56px)',
            fontWeight: 500,
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          A trainer in your pocket.
          <br />
          <span style={{ color: 'var(--accent)' }}>At a fraction of the cost.</span>
        </h2>
        <p
          style={{
            marginTop: 18,
            fontSize: 16,
            lineHeight: 1.6,
            color: 'var(--text-2)',
            maxWidth: 600,
            margin: '18px auto 0',
          }}
        >
          Real-time form coaching, injury-risk detection, and automatic rep counting — powered by GPT-4o vision and MediaPipe. Just a webcam and your body.
        </p>
      </div>

      {/* Section: Stats */}
      <div
        style={{
          position: 'relative',
          maxWidth: 1100,
          margin: '64px auto 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
        }}
      >
        {STATS.map((s) => (
          <div
            key={s.label}
            className="card"
            style={{
              padding: '22px 18px',
              textAlign: 'center',
            }}
          >
            <div
              className="display tnum"
              style={{
                fontSize: 36,
                fontWeight: 500,
                lineHeight: 1,
                color: 'var(--text)',
                textShadow: '0 0 24px rgba(var(--accent-rgb), 0.35)',
              }}
            >
              {s.value}
            </div>
            <div
              className="mono"
              style={{
                marginTop: 10,
                fontSize: 10,
                letterSpacing: '0.22em',
                color: 'var(--text-3)',
                textTransform: 'uppercase',
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Section: Features */}
      <div style={{ position: 'relative', maxWidth: 1100, margin: '120px auto 0' }}>
        <SectionLabel kicker="Features" title="Everything a trainer gives you." />

        <div
          style={{
            marginTop: 32,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="card"
              style={{
                padding: '24px 22px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Top corner accent in the feature's tint */}
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  top: -40,
                  right: -40,
                  width: 160,
                  height: 160,
                  borderRadius: '50%',
                  background: `radial-gradient(circle, ${f.tint}28, transparent 70%)`,
                  pointerEvents: 'none',
                }}
              />
              <div style={{ position: 'relative' }}>
                <div style={{ fontSize: 30, marginBottom: 12 }}>{f.icon}</div>
                <div
                  className="display"
                  style={{
                    fontSize: 18,
                    fontWeight: 500,
                    color: 'var(--text)',
                    marginBottom: 8,
                  }}
                >
                  {f.title}
                </div>
                <p
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    color: 'var(--text-2)',
                    margin: 0,
                  }}
                >
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section: How it works */}
      <div style={{ position: 'relative', maxWidth: 1100, margin: '120px auto 0' }}>
        <SectionLabel kicker="How it works" title="Up and running in 2 minutes." />

        <div
          style={{
            marginTop: 32,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          {STEPS.map((s) => (
            <div
              key={s.num}
              className="card"
              style={{ padding: '22px 22px' }}
            >
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  letterSpacing: '0.2em',
                  color: 'var(--accent)',
                  marginBottom: 12,
                }}
              >
                STEP {s.num}
              </div>
              <div
                className="display"
                style={{
                  fontSize: 17,
                  fontWeight: 500,
                  marginBottom: 8,
                  color: 'var(--text)',
                }}
              >
                {s.title}
              </div>
              <p
                style={{
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: 'var(--text-2)',
                  margin: 0,
                }}
              >
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Section: Built with */}
      <div style={{ position: 'relative', maxWidth: 1100, margin: '120px auto 0', textAlign: 'center' }}>
        <SectionLabel kicker="Built with" title="The good stuff." centered />
        <div
          style={{
            marginTop: 28,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          {STACK.map((s) => (
            <span
              key={s}
              className="mono"
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                border: '1px solid var(--border-2)',
                background: 'var(--surface)',
                color: 'var(--text-2)',
                fontSize: 11.5,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Section: Final CTA */}
      <div
        style={{
          position: 'relative',
          maxWidth: 720,
          margin: '120px auto 0',
          padding: '38px 32px',
          textAlign: 'center',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-2)',
          background:
            'linear-gradient(135deg, rgba(var(--accent-rgb), 0.10) 0%, rgba(var(--accent-2-rgb), 0.06) 100%)',
          boxShadow: '0 24px 60px -20px rgba(var(--accent-rgb), 0.25)',
        }}
      >
        <h3
          className="display"
          style={{
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 500,
            lineHeight: 1.1,
            margin: 0,
            color: 'var(--text)',
          }}
        >
          Ready to reach your prime?
        </h3>
        <p
          style={{
            marginTop: 14,
            fontSize: 14.5,
            color: 'var(--text-2)',
            lineHeight: 1.6,
          }}
        >
          Free to use. No hardware. No subscription. Show up and train smarter.
        </p>
        <div
          style={{
            marginTop: 24,
            display: 'flex',
            justifyContent: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={scrollUp}
            className="btn btn-primary pulse-glow"
            style={{ padding: '14px 22px', fontSize: 14 }}
          >
            ↑ Pick a drink to sign in
          </button>
          <button
            type="button"
            onClick={scrollUp}
            className="btn btn-ghost"
            style={{ padding: '14px 22px', fontSize: 14 }}
          >
            Back to the gym
          </button>
        </div>
      </div>

      {/* Footer */}
      <div
        className="mono"
        style={{
          marginTop: 60,
          textAlign: 'center',
          fontSize: 10.5,
          letterSpacing: '0.2em',
          color: 'var(--text-4)',
          textTransform: 'uppercase',
        }}
      >
        IntoYourPrime · v2.6 · Made for the floor
      </div>
    </section>
  )
}

function SectionLabel({
  kicker,
  title,
  centered = false,
}: {
  kicker: string
  title: string
  centered?: boolean
}) {
  return (
    <div style={{ textAlign: centered ? 'center' : 'left' }}>
      <span
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: '0.24em',
          color: 'var(--accent)',
          textTransform: 'uppercase',
        }}
      >
        {kicker}
      </span>
      <h3
        className="display"
        style={{
          marginTop: 10,
          fontSize: 'clamp(28px, 4vw, 40px)',
          fontWeight: 500,
          lineHeight: 1.1,
          color: 'var(--text)',
        }}
      >
        {title}
      </h3>
    </div>
  )
}
