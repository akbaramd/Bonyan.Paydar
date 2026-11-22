import { z } from 'zod'
import { getJson } from '../../../shared/api/http'

export const sitesSchema = z.object({ sites: z.array(z.string()) })
export const assetPageSchema = z.object({
  siteId: z.string(), page: z.number().int().positive(),
  pageSize: z.number().int().positive(), total: z.number().int().nonnegative(),
  items: z.array(z.object({
    id: z.string().uuid(), siteId: z.string(),
    displayName: z.string().nullable(), createdAtUtc: z.string(),
  })),
  provenance: z.literal('operator-registered-unverified'),
})
export const summarySchema = z.object({
  siteId: z.string(), registeredAssets: z.number().int().nonnegative(),
  freshReportedObservations: z.number().int().nonnegative(),
  observedAtUtc: z.string(), status: z.literal('unverified-no-active-monitoring'),
})
export type AssetPage = z.infer<typeof assetPageSchema>

export function getSites(signal?: AbortSignal) {
  return getJson('/api/v1/sites', sitesSchema, signal)
}
export function getAssets(siteId: string, search: string, page: number, signal?: AbortSignal) {
  return getJson(`/api/v1/assets?siteId=${encodeURIComponent(siteId)}&search=${encodeURIComponent(search)}&page=${page}&pageSize=25`, assetPageSchema, signal)
}
export function getSiteSummary(siteId: string, signal?: AbortSignal) {
  return getJson(`/api/v1/overview/summary?siteId=${encodeURIComponent(siteId)}`, summarySchema, signal)
}
