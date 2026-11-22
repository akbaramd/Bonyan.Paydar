import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { SettingsContext, type Theme, type Density } from './settings-context'

function readSetting<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const saved = window.localStorage.getItem(key)
    return allowed.find((value) => value === saved) ?? fallback
  } catch {
    return fallback
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => readSetting('ig-theme', ['dark', 'light'], 'dark'))
  const [density, setDensity] = useState<Density>(() => readSetting('ig-density', ['compact', 'comfortable'], 'compact'))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { window.localStorage.setItem('ig-theme', theme) } catch { /* storage may be disabled */ }
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.density = density
    try { window.localStorage.setItem('ig-density', density) } catch { /* storage may be disabled */ }
  }, [density])

  const value = useMemo(() => ({ theme, density, setTheme, setDensity }), [theme, density])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
