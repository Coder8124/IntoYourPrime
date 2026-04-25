import { Link, useLocation } from 'react-router-dom'

const TABS = [
  { to: '/home',     label: 'Home',     icon: '🏠' },
  { to: '/workout',  label: 'Workout',  icon: '💪' },
  { to: '/programs', label: 'Programs', icon: '📋' },
  { to: '/progress', label: 'Progress', icon: '📈' },
  { to: '/profile',  label: 'Profile',  icon: '👤' },
]

export function BottomNav() {
  const { pathname } = useLocation()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around px-2 pb-safe"
      style={{
        background: 'rgba(7,7,14,0.95)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        paddingTop: '8px',
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      }}
    >
      {TABS.map(tab => {
        const active = pathname === tab.to || (tab.to !== '/home' && pathname.startsWith(tab.to))
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all"
            style={active
              ? { color: '#60a5fa', background: 'rgba(96,165,250,0.1)' }
              : { color: '#4b5563' }
            }
          >
            <span className="text-[18px] leading-none">{tab.icon}</span>
            <span className="text-[10px] font-semibold tracking-wide">{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
