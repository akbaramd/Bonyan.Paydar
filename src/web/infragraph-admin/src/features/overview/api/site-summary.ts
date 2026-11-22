import { z } from 'zod'
import { getJson } from '../../../shared/api/http'

export const siteSummarySchema = z.object({
  siteId: z.string(), registeredAssets: z.number().int().nonnegative(),
  freshReportedObservations: z.number().int().nonnegative(),
  scannedHosts: z.number().int().nonnegative(),
  respondingNow: z.number().int().nonnegative(),
  scanActive: z.boolean(),
  lastSweepAtUtc: z.string().nullable(),
  observedAtUtc: z.string(),
  status: z.enum(['unverified-no-active-monitoring', 'active-ipv4-probing']),
})

export function getSiteSummary(siteId: string, signal?: AbortSignal) {
  return getJson(`/api/v1/overview/summary?siteId=${encodeURIComponent(siteId)}`,
    siteSummarySchema, signal)
}