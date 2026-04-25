import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme =
  | 'electric'
  | 'ember'
  | 'mint'
  | 'cottoncandy'
  | 'air'
  | 'moltengold'
  | 'light'

const STORAGE_KEY = 'formAI_theme'
const VALID: readonly Theme[] = [
  'electric', 'ember', 'mint', 'cottoncandy', 'air', 'moltengold', 'light',
] as const

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as Theme | 'dark' | null
    // Migrate the legacy 'dark' value to 'electric' (the new canonical default)
    if (v === 'dark') return 'electric'
    if (v && (VALID as readonly string[]).includes(v)) return v as Theme
  } catch { /* ignore */ }
  return 'electric'
}

const ThemeContext = createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
  /** Legacy: cycles between a dark theme and light. Existing toggle UIs still work. */
  toggleTheme: () => void
}>({
  theme: 'electric',
  setTheme: () => {},
  toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => readStored())

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* ignore */ }
  }, [theme])

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'electric' : 'light'))

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
