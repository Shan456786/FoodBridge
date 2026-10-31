import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  THEME_KEY,
  writeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/preferences'

interface ThemeState {
  /** What the user chose. */
  theme: ThemePreference
  /** What is actually shown (System resolved against the OS setting). */
  resolved: ResolvedTheme
  setTheme: (theme: ThemePreference) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readThemePreference)
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readThemePreference()))

  // Keep <html> in sync (index.html already applied it before first paint).
  useEffect(() => {
    applyTheme(resolved)
  }, [resolved])

  // Follow OS changes while on "System".
  useEffect(() => {
    if (theme !== 'system') return
    let mq: MediaQueryList
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)')
    } catch {
      return
    }
    const onChange = () => {
      applyTheme(resolveTheme('system'), { animate: true })
      setResolved(resolveTheme('system'))
    }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [theme])

  // Another tab changed the preference.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_KEY) return
      const next = readThemePreference()
      setThemeState(next)
      setResolved(resolveTheme(next))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setTheme = useCallback((next: ThemePreference) => {
    writeThemePreference(next)
    const r = resolveTheme(next)
    applyTheme(r, { animate: true })
    setThemeState(next)
    setResolved(r)
  }, [])

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
