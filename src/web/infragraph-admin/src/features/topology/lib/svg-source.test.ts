import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_SVG_BYTES, readLocalSvg } from './svg-source'

afterEach(() => vi.restoreAllMocks())

describe('Local SVG security boundary', () => {
  it('rejects non-SVG, empty and oversized files', async () => {
    await expect(readLocalSvg(new File(['hello'], 'hello.txt', { type: 'text/plain' }))).rejects.toThrow(/SVG/)
    await expect(readLocalSvg(new File([], 'empty.svg', { type: 'image/svg+xml' }))).rejects.toThrow(/مگابایت/)
    await expect(readLocalSvg(new File(['x'.repeat(MAX_SVG_BYTES + 1)], 'huge.svg', { type: 'image/svg+xml' }))).rejects.toThrow(/مگابایت/)
  })

  it('rejects remote URLs before the DOM sanitizer runs', async () => {
    const bad = new File(['<svg xmlns="http://www.w3.org/2000/svg"><image href="https://attacker.test/track"/></svg>'], 'bad.svg', { type: 'image/svg+xml' })
    await expect(readLocalSvg(bad)).rejects.toThrow(/منابع خارجی/)
  })

  it('returns a short-lived blob URL rather than using unsafe innerHTML', async () => {
    const create = vi.fn().mockReturnValue('blob:local-safe-svg')
    vi.stubGlobal('URL', { ...URL, createObjectURL: create })
    const good = new File(['<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>'], 'safe.svg', { type: 'image/svg+xml' })
    await expect(readLocalSvg(good)).resolves.toBe('blob:local-safe-svg')
    expect(create).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
})
