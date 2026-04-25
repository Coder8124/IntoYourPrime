import { useState } from 'react'
import { useTheme, type Theme } from '../contexts/ThemeContext'

type Entry = { id: Theme; label: string; swatches: [string, string] }

const THEMES: Entry[] = [
  { id: 'electric',    label: 'Electric',    swatches: ['#6b8cff', '#a78bfa'] },
  { id: 'ember',       label: 'Ember',       swatches: ['#f59e0b', '#fb7185'] },
  { id: 'mint',        label: 'Mint',        swatches: ['#5eead4', '#a5f3fc'] },
  { id: 'cottoncandy', label: 'Cotton Candy',swatches: ['#f472b6', '#67e8f9'] },
  { id: 'air',         label: 'Air',         swatches: ['#38bdf8', '#a5f3fc'] },
  { id: 'moltengold',  label: 'Molten Gold', swatches: ['#fbbf24', '#f97316'] },
]

/**
 * Floating bottom-center pill that swaps the whole-app palette via the
 * shared ThemeContext (which sets <html data-theme="..."> + persists to
 * localStorage). Click the pill to expand the swatch row, click a swatch
 * to apply.
 */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)

  // If the user is on the legacy 'light' theme, fall back to 'electric' for the
  // pill display so the swatch is recognizable. (They can still pick light via
  // any in-app dark/light toggle, separate concern.)
  const displayTheme: Theme = (THEMES.some(t => t.id === theme) ? theme : 'electric')
  const current = THEMES.find(t => t.id === displayTheme) ?? THEMES[0]

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 18,
        transform: 'translateX(-50%)',
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        borderRadius: 999,
        background: 'rgba(10, 10, 16, 0.7)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 16px 40px -12px rgba(0,0,0,0.5)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={`Theme: ${current.label}. Click to change.`}
        title={`Theme: ${current.label}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px 6px 8px',
          borderRadius: 999,
          background: 'transparent',
          border: 0,
          color: 'var(--text-2)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        <Swatch swatches={current.swatches} active />
        <span>{current.label}</span>
      </button>

      {open && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 6, borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
          {THEMES.filter(t => t.id !== displayTheme).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTheme(t.id); setOpen(false) }}
              aria-label={t.label}
              title={t.label}
              style={{
                width: 26,
                height: 26,
                padding: 0,
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Swatch swatches={t.swatches} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Swatch({ swatches, active = false }: { swatches: [string, string]; active?: boolean }) {
  const [a, b] = swatches
  return (
    <span
      aria-hidden
      style={{
        width: 18,
        height: 18,
        borderRadius: 999,
        background: `conic-gradient(from 200deg, ${a} 0deg, ${b} 180deg, ${a} 360deg)`,
        boxShadow: active ? `0 0 10px ${a}88` : 'none',
        flexShrink: 0,
      }}
    />
  )
}
