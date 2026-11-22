import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { getJson, HttpError } from './http'

afterEach(() => vi.unstubAllGlobals())

describe('Same-origin typed API boundary', () => {
  it('validates JSON using its feature schema', async () => {
    const stub = vi.fn().mockResolvedValue(new Response(JSON.stringify({ count: 3 }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', stub)
    const data = await getJson('/api/v1/example', z.object({ count: z.number().int() }))
    expect(data.count).toBe(3)
    expect(stub).toHaveBeenCalledWith('/api/v1/example', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('rejects malformed success payloads instead of corrupting the UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"count":"bad"}', { status: 200 })))
    await expect(getJson('/api/v1/example', z.object({ count: z.number() }))).rejects.toThrow()
  })

  it('rejects unauthorized responses without exposing any server error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret credentials', { status: 401 })))
    await expect(getJson('/api/v1/example', z.object({}))).rejects.toMatchObject({ status: 401, path: '/api/v1/example' } satisfies Partial<HttpError>)
  })
})
