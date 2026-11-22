import { describe, expect, it } from 'vitest'
import { coreTokens, themes } from './tokens.generated'

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const value = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
  })
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
}
function contrastRatio(a: string, b: string) {
  const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (high + .05) / (low + .05)
}

describe('Design token contrast guarantees', () => {
  for (const [name, palette] of Object.entries(themes)) {
    it(`${name} primary and secondary text on panels meet 4.5:1 contrast`, () => {
      expect(contrastRatio(palette.text, palette.surface)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(palette.textMuted, palette.surface)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(palette.brand, palette.surface)).toBeGreaterThanOrEqual(4.5)
    })
    it(`${name} badges are readable on their semantic backgrounds`, () => {
      expect(contrastRatio(palette.success, palette.successSoft)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(palette.warning, palette.warningSoft)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(palette.danger, palette.dangerSoft)).toBeGreaterThanOrEqual(4.5)
    })
  }
  it('keeps tablet target sizes and density separate', () => {
    expect(coreTokens.layout.touchTarget).toBeGreaterThanOrEqual(44)
    expect(coreTokens.layout.comfortableRow).toBeGreaterThanOrEqual(48)
    expect(coreTokens.layout.compactRow).toBeLessThan(coreTokens.layout.comfortableRow)
  })
})
