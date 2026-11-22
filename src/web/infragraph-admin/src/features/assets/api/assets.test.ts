import { describe, expect, it } from 'vitest'
import { assetPageSchema, sitesSchema, summarySchema } from './assets'

describe('scoped inventory API contracts', () => {
  const page = {
    siteId: 'alpha', page: 1, pageSize: 25, total: 1,
    provenance: 'operator-registered-unverified' as const,
    items: [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      siteId: 'alpha', displayName: 'SW-01', createdAtUtc: '2026-11-20T10:00:00Z',
    }],
  }
  it('parses a bounded page without claiming device health or discovery', () => {
    const result = assetPageSchema.parse(page)
    expect(result.items).toHaveLength(1)
    expect(result.provenance).toBe('operator-registered-unverified')
    expect('health' in result.items[0]).toBe(false)
  })
  it('rejects unrecognized provenance and invalid identifiers', () => {
    expect(assetPageSchema.safeParse({ ...page, provenance: 'automatically-discovered' }).success).toBe(false)
    expect(assetPageSchema.safeParse({ ...page, items: [{ ...page.items[0], id: 'not-a-uuid' }] }).success).toBe(false)
  })
  it('validates site listing and explicitly unmonitored summary', () => {
    expect(sitesSchema.parse({ sites: ['alpha'] }).sites).toEqual(['alpha'])
    const result = summarySchema.parse({
      siteId: 'alpha', registeredAssets: 3, freshReportedObservations: 2,
      observedAtUtc: '2026-11-20T10:00:00Z', status: 'unverified-no-active-monitoring',
    })
    expect(result.status).toBe('unverified-no-active-monitoring')
    expect(summarySchema.safeParse({ ...result, status: 'healthy' }).success).toBe(false)
  })
})
