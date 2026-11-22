import { describe, expect, it } from 'vitest'
import { evidenceBatches, parseEvidenceExport } from './import-evidence'

const now = new Date('2026-11-20T10:00:00.000Z')
const valid = {
  sourceKey: ' Core ', targetKey: 'Access',
  sourcePort: 'Gi1', targetPort: 'Gi2',
  protocol: 'LLDP', observedAtUtc: '2026-11-20T09:59:00.000Z', ttlSeconds: 3600,
}
function input(value: unknown) { return JSON.stringify(value) }

describe('authorized offline topology evidence import', () => {
  it('normalizes site-bound evidence without implying verified discovery', () => {
    expect(parseEvidenceExport(input([valid]), 'alpha', now)).toEqual([{
      siteId: 'alpha', sourceKey: 'Core', targetKey: 'Access',
      sourcePort: 'Gi1', targetPort: 'Gi2',
      protocol: 'LLDP', observedAtUtc: valid.observedAtUtc, ttlSeconds: 3600,
    }])
  })
  it('fails closed on malformed JSON, invalid dates, cycles and injection', () => {
    expect(() => parseEvidenceExport('not-json', 'alpha', now)).toThrow()
    expect(() => parseEvidenceExport(input([valid]), '', now)).toThrow()
    expect(() => parseEvidenceExport(input([{ ...valid, targetKey: ' Core ' }]), 'alpha', now)).toThrow()
    expect(() => parseEvidenceExport(input([{ ...valid, sourcePort: 'eth0' + String.fromCharCode(10) + 'bar' }]), 'alpha', now)).toThrow()
    expect(() => parseEvidenceExport(input([{ ...valid, observedAtUtc: '2026-11-21T09:00:00Z' }]), 'alpha', now)).toThrow()
    expect(() => parseEvidenceExport(input([{ ...valid, observedAtUtc: '2026-11-18T09:00:00Z' }]), 'alpha', now)).toThrow()
    expect(() => parseEvidenceExport(input([{ ...valid, protocol: 'UNKNOWN' }]), 'alpha', now)).toThrow()
    expect(() => parseEvidenceExport(input([{ ...valid, siteId: 'other' }]), 'alpha', now)).toThrow()
    expect(() => parseEvidenceExport(input(Array.from({ length: 1001 }, () => valid)), 'alpha', now)).toThrow()
  })
  it('breaks imports into <=100 reports per server request', () => {
    const rows = Array.from({ length: 201 }, () => parseEvidenceExport(input([valid]), 'alpha', now)[0])
    expect(evidenceBatches(rows).map(batch => batch.length)).toEqual([100, 100, 1])
  })
})