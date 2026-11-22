import { z } from 'zod'
import { getJson } from '../../../shared/api/http'
import { graphSchema } from './graph'

export const evidencePageSchema = z.object({
  siteId: z.string(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  items: z.array(z.object({
    id: z.string().uuid(),
    siteId: z.string(),
    sourceKey: z.string(),
    targetKey: z.string(),
    sourcePort: z.string().nullable(),
    targetPort: z.string().nullable(),
    protocol: z.string(),
    observedAtUtc: z.string(),
    receivedAtUtc: z.string(),
    ttlSeconds: z.number().int(),
    retractedAtUtc: z.string().nullable(),
    source: z.string(),
    status: z.enum(['fresh', 'expired', 'retracted']),
  })),
})
export type EvidencePage = z.infer<typeof evidencePageSchema>

export function getEvidence(siteId: string, page: number, signal?: AbortSignal) {
  return getJson(`/api/v1/discovery/observations?siteId=${encodeURIComponent(siteId)}&page=${page}&pageSize=25`,
    evidencePageSchema, signal)
}
export const walkPreviewSchema = z.object({
  mode: z.literal('stored-evidence-only'),
  probedAssets: z.number().int().nonnegative(),
  skippedOutOfScope: z.number().int().nonnegative(),
  failedAssets: z.array(z.string()),
  timedOut: z.boolean(),
  graph: graphSchema,
})
export type WalkPreview = z.infer<typeof walkPreviewSchema>
