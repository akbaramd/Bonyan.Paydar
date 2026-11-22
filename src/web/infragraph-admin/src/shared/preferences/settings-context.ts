import { createContext, useContext } from 'react'

export type Theme = 'dark' | 'light'
export type Density = 'compact' | 'comfortable'
export type Settings = {
  theme: Theme
  density: Density
  setTheme: (theme: Theme) => void
  setDensity: (density: Density) => void
}

export const SettingsContext = createContext<Settings | null>(null)

export function useSettings(): Settings {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('SettingsProvider is missing')
  return value
}
