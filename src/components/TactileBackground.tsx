import { useCallback, useEffect, useRef, useState } from 'react'

type Pulse = { id: number; x: number; y: number }

const PARTICLE_COUNT = 42
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(REDUCED_MOTION_QUERY)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export function TactileBackground({ interactive = true }: { interactive?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const orbRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<SVGSVGElement>(null)
  const scanRef = useRef<HTMLDivElement>(null)
  const particlesRef = useRef<SVGSVGElement>(null)

  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const [pulses, setPulses] = useState<Pulse[]>([])
  const reducedMotion = useReducedMotion()

  // Single rAF loop — mutate DOM attrs/transforms directly to keep React out of the
  // hot path. Orb, rings, particles, scan line all update from one `t`.
  useEffect(() => {
    if (reducedMotion) return
    let raf = 0
    const start = performance.now()

    const particleEls: SVGCircleElement[] = []
    if (particlesRef.current) {
      particleEls.push(...Array.from(particlesRef.current.querySelectorAll('circle')))
    }

    const tick = (now: number) => {
      const t = (now - start) / 1000
      const { x: mx, y: my } = mouseRef.current

      if (gridRef.current) {
        gridRef.current.style.transform =
          `translate(${(mx - 0.5) * -22}px, ${(my - 0.5) * -22}px)`
      }

      if (scanRef.current) {
        scanRef.current.style.transform = `translate3d(0, ${Math.sin(t * 0.35) * 240}px, 0)`
      }

      if (orbRef.current) {
        const s = 1 + Math.sin(t * 1.2) * 0.035
        orbRef.current.style.transform =
          `translate(calc(-50% + ${(mx - 0.5) * 18}px), calc(-50% + ${(my - 0.5) * 18}px)) scale(${s})`
      }

      if (ringRef.current) {
        ringRef.current.style.transform =
          `translate(calc(-50% + ${(mx - 0.5) * 10}px), calc(-50% + ${(my - 0.5) * 10}px))`
      }

      for (let i = 0; i < particleEls.length; i++) {
        const el = particleEls[i]
        const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + t * 0.16
        const radius = 18 + Math.sin(t * 0.75 + i * 0.5) * 1.8
        const cx = 50 + (mx - 0.5) * 8 + Math.cos(angle) * radius
        const cy = 50 + (my - 0.5) * 8 + Math.sin(angle) * radius
        const op = 0.25 + 0.55 * ((Math.sin(t * 1.8 + i) + 1) / 2)
        el.setAttribute('cx', cx.toFixed(2))
        el.setAttribute('cy', cy.toFixed(2))
        el.setAttribute('opacity', op.toFixed(3))
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reducedMotion])

  const onMove = useCallback((e: React.MouseEvent) => {
    if (!rootRef.current) return
    const r = rootRef.current.getBoundingClientRect()
    mouseRef.current = {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    }
  }, [])

  const onClick = useCallback((e: React.MouseEvent) => {
    if (!rootRef.current || reducedMotion) return
    const r = rootRef.current.getBoundingClientRect()
    const id = performance.now()
    const next: Pulse = {
      id,
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    }
    setPulses(p => [...p.slice(-4), next])
    window.setTimeout(() => setPulses(p => p.filter(x => x.id !== id)), 1400)
  }, [reducedMotion])

  return (
    <div
      ref={rootRef}
      onMouseMove={interactive ? onMove : undefined}
      onClick={interactive ? onClick : undefined}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
      aria-hidden="true"
    >
      {/* Vignette — gently darken the corners so the form card pops */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 85% 70% at 50% 50%, transparent 40%, rgba(0,0,0,0.65) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Reactive grid */}
      <div
        ref={gridRef}
        className="grid-bg"
        style={{
          position: 'absolute',
          inset: '-4%',
          transition: reducedMotion ? 'none' : 'transform 0.4s cubic-bezier(0.2, 0.7, 0.2, 1)',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, black, transparent)',
          opacity: 0.55,
        }}
      />

      {/* Scan line */}
      <div
        ref={scanRef}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: 1.5,
          background:
            'linear-gradient(90deg, transparent, rgba(var(--accent-rgb), 0.55), transparent)',
          pointerEvents: 'none',
          filter: 'blur(0.4px)',
        }}
      />

      {/* Particle cloud */}
      <svg
        ref={particlesRef}
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
          <circle
            key={i}
            cx={50}
            cy={50}
            r={0.22}
            fill="var(--accent)"
            opacity={0.5}
            style={{ filter: 'drop-shadow(0 0 2px currentColor)' }}
          />
        ))}
      </svg>

      {/* Core orb — dual radial gradient, soft blur */}
      <div
        ref={orbRef}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 380,
          height: 380,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background: `
            radial-gradient(circle at 35% 30%, rgba(var(--accent-rgb), 0.55), transparent 52%),
            radial-gradient(circle at 65% 70%, rgba(var(--accent-2-rgb), 0.45), transparent 62%),
            radial-gradient(circle, rgba(var(--accent-rgb), 0.08), transparent 78%)
          `,
          filter: 'blur(3px)',
          pointerEvents: 'none',
          willChange: reducedMotion ? undefined : 'transform',
        }}
      />

      {/* Orbit rings + tick marks */}
      <svg
        ref={ringRef}
        viewBox="0 0 400 400"
        width={440}
        height={440}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          color: 'var(--accent)',
          willChange: reducedMotion ? undefined : 'transform',
        }}
      >
        <circle
          cx={200} cy={200} r={125}
          fill="none" stroke="currentColor" strokeWidth={0.7}
          opacity={0.65} strokeDasharray="2 6"
          style={{
            transformOrigin: '200px 200px',
            animation: reducedMotion ? undefined : 'spinCw 32s linear infinite',
          }}
        />
        <circle
          cx={200} cy={200} r={162}
          fill="none" stroke="currentColor" strokeWidth={0.45}
          opacity={0.4} strokeDasharray="1 10"
          style={{
            transformOrigin: '200px 200px',
            animation: reducedMotion ? undefined : 'spinCcw 48s linear infinite',
          }}
        />
        <circle
          cx={200} cy={200} r={192}
          fill="none" stroke="currentColor" strokeWidth={0.45}
          opacity={0.25}
        />
        {Array.from({ length: 48 }).map((_, i) => {
          const a = (i / 48) * Math.PI * 2
          const r1 = 197
          const r2 = i % 4 === 0 ? 205 : 200
          return (
            <line
              key={i}
              x1={200 + Math.cos(a) * r1}
              y1={200 + Math.sin(a) * r1}
              x2={200 + Math.cos(a) * r2}
              y2={200 + Math.sin(a) * r2}
              stroke="currentColor"
              strokeWidth={i % 4 === 0 ? 1.2 : 0.6}
              opacity={i % 4 === 0 ? 0.72 : 0.3}
            />
          )
        })}
      </svg>

      {/* Click ripples */}
      {pulses.map(p => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x * 100}%`,
            top: `${p.y * 100}%`,
            width: 44,
            height: 44,
            border: '1.5px solid var(--accent)',
            borderRadius: '50%',
            animation: 'ringPulse 1.4s cubic-bezier(0.2, 0.7, 0.2, 1) forwards',
            pointerEvents: 'none',
            boxShadow: '0 0 20px rgba(var(--accent-rgb), 0.45)',
          }}
        />
      ))}

      {/* Corner HUD brackets */}
      {(['tl', 'tr', 'bl', 'br'] as const).map(c => {
        const top = c[0] === 't' ? 28 : undefined
        const left = c[1] === 'l' ? 28 : undefined
        const bottom = c[0] === 'b' ? 28 : undefined
        const right = c[1] === 'r' ? 28 : undefined
        const bt = c[0] === 't'
        const bl = c[1] === 'l'
        return (
          <div
            key={c}
            style={{
              position: 'absolute',
              top,
              left,
              bottom,
              right,
              width: 20,
              height: 20,
              borderTop:    bt ? '1.5px solid var(--accent)' : undefined,
              borderBottom: !bt ? '1.5px solid var(--accent)' : undefined,
              borderLeft:   bl ? '1.5px solid var(--accent)' : undefined,
              borderRight:  !bl ? '1.5px solid var(--accent)' : undefined,
              opacity: 0.7,
              pointerEvents: 'none',
            }}
          />
        )
      })}

      {/* Status read-out */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 'calc(50% + 240px)',
          transform: 'translateX(-50%)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--text-3)',
          textAlign: 'center',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{ color: 'var(--accent)' }}>· NEURAL LINK STABLE ·</div>
        <div style={{ marginTop: 4, color: 'var(--text-4)' }}>move · tap · awaiting input</div>
      </div>
    </div>
  )
}
