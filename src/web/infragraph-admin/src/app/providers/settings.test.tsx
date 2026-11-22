import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsProvider } from '../../shared/preferences/settings'
import { useSettings } from '../../shared/preferences/settings-context'

function Controls() {
  const { theme, density, setTheme, setDensity } = useSettings()
  return <div>
    <output data-testid="theme">{theme}</output>
    <output data-testid="density">{density}</output>
    <button onClick={() => setTheme('light')}>set light</button>
    <button onClick={() => setDensity('comfortable')}>set comfortable</button>
  </div>
}

afterEach(() => { localStorage.clear(); document.documentElement.dataset.theme = 'dark';document.documentElement.dataset.density = 'compact' })

describe('Theme and density preferences', () => {
  it('switches CSS theme and density without changing text direction', () => {
    render(<SettingsProvider><Controls /></SettingsProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'set light' }))
    fireEvent.click(screen.getByRole('button', { name: 'set comfortable' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.dataset.density).toBe('comfortable')
    expect(localStorage.getItem('ig-density')).toBe('comfortable')
  })
})
