import { describe, expect, it } from 'vitest'
import { filterDemoAssets, generateDemoAssets } from './demo-assets'

describe('Synthetic data isolation / filtering', () => {
  it('generates uniquely identifiable demo rows, not Agent records', () => {
    const rows = generateDemoAssets(12_000)
    expect(rows).toHaveLength(12_000)
    expect(new Set(rows.map((r) => r.id)).size).toBe(12_000)
    expect(rows[0].id).toMatch(/^demo-asset-/)
    expect(rows.at(-1)?.id).toBe('demo-asset-12000')
  })

  it('combines site, status and text filter without changing original dataset', () => {
    const rows = generateDemoAssets(12_000)
    const filtered = filterDemoAssets(rows, 'server', 'دیتاسنتر شمال', 'healthy')
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.every((r) => r.type === 'Server' && r.site === 'دیتاسنتر شمال' && r.status === 'healthy')).toBe(true)
    expect(rows).toHaveLength(12_000)
  })

  it('returns zero rows for a nonmatching search', () => {
    expect(filterDemoAssets(generateDemoAssets(100), 'no-such-device', 'all', 'all')).toEqual([])
  })
})
