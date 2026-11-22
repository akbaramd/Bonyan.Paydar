import { z } from 'zod'
import { getJson } from '../../../shared/api/http'

export const incidentPageSchema = z.object({
  siteId: z.string(), page: z.number().int().positive(),
  pageSize: z.number().int().positive(), total: z.number().int().nonnegative(),
  provenance: z.literal('operator-reported-unverified'),
  automatedDetection: z.literal(false),
  items: z.array(z.object({
    id: z.string().uuid(), siteId: z.string(), title: z.string(),
    description: z.string().nullable(),
    severity: z.enum(['low','medium','high','critical']),
    status: z.enum(['open','acknowledged','resolved']),
    origin: z.literal('operator-reported'), createdBy: z.string(),
    acknowledgedBy: z.string().nullable(), resolvedBy: z.string().nullable(),
    createdAtUtc: z.string(), updatedAtUtc: z.string(),
  })),
})
export type IncidentPage = z.infer<typeof incidentPageSchema>
export type IncidentStatus = 'open' | 'acknowledged' | 'resolved'
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical'

export function getIncidents(siteId: string, page: number, status: IncidentStatus | 'all',
  signal?: AbortSignal) {
  const filter = status === 'all' ? '' : `&status=${status}`
  return getJson(`/api/v1/incidents?siteId=${encodeURIComponent(siteId)}&page=${page}&pageSize=25${filter}`,
    incidentPageSchema, signal)
}
