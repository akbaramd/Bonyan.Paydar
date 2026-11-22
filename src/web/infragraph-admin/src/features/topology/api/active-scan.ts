import { z } from 'zod'
import { getJson } from '../../../shared/api/http'

const jobSchema = z.object({
  id: z.string().uuid(), status: z.enum(['pending','running','cancelling','cancelled','failed']),
  cidrs: z.array(z.string()), intervalSeconds: z.number().int(),
  targetCount: z.number().int(), probedCount: z.number().int(),
  responsiveCount: z.number().int(), cycle: z.number().int(),
  requestedAtUtc: z.string(), startedAtUtc: z.string().nullable(),
  lastSweepAtUtc: z.string().nullable(), completedAtUtc: z.string().nullable(),
  error: z.string().nullable(),
})
export const scanEventSchema = z.object({
  id: z.number().int(), siteId: z.string(), jobId: z.string().uuid(),
  kind: z.string(), address: z.string().nullable(),
  status: z.string().nullable(), probedCount: z.number().int(),
  targetCount: z.number().int(), atUtc: z.string(),
})
export type ScanJob = z.infer<typeof jobSchema>
export type ScanEvent = z.infer<typeof scanEventSchema>
export async function getScanJobs(siteId: string, signal?: AbortSignal) {
  return getJson(`/api/v1/discovery/scans?siteId=${encodeURIComponent(siteId)}`,
    z.object({ siteId: z.string(), items: z.array(jobSchema).max(20) }), signal)
}
export async function getScanEvents(id: string, afterId = 0, signal?: AbortSignal) {
  return getJson(`/api/v1/discovery/scans/${id}/events?afterId=${afterId}`,
    z.object({ items: z.array(scanEventSchema), truncated: z.boolean() }), signal)
}
const hostScopeSchema = z.object({
  available: z.boolean(),
  capturedAtUtc: z.string().nullable(),
  candidates: z.array(z.object({
    cidr: z.string(), interfaceAlias: z.string(), adapterAddress: z.string(),
    prefixLength: z.number().int(),
  })).max(32),
})
export function getHostScopeCandidates(signal?: AbortSignal) {
  return getJson('/api/v1/discovery/host-scope-candidates', hostScopeSchema, signal)
}
