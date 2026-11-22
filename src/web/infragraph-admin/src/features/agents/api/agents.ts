import { z } from 'zod'
import { getJson } from '../../../shared/api/http'

export const agentPageSchema = z.object({
  siteId: z.string(), page: z.number().int().positive(),
  pageSize: z.number().int().positive(), total: z.number().int().nonnegative(),
  provenance: z.literal('registration-only-not-verified'),
  monitoring: z.literal('disabled'),
  items: z.array(z.object({
    agentId: z.string().uuid(), siteId: z.string(),
    agentVersion: z.string(), lastReceivedAtUtc: z.string().nullable(),
  })),
})
export const agentCapabilitiesSchema = z.object({
  enrollmentEnabled: z.literal(false),
  heartbeatVerified: z.literal(false),
  signedUpdatesEnabled: z.literal(false),
  status: z.literal('gateway-not-ready'),
})
export function getAgents(siteId: string, page: number, signal?: AbortSignal) {
  return getJson(`/api/v1/agents?siteId=${encodeURIComponent(siteId)}&page=${page}&pageSize=25`,
    agentPageSchema, signal)
}
export function getAgentCapabilities(signal?: AbortSignal) {
  return getJson('/api/v1/agents/capabilities', agentCapabilitiesSchema, signal)
}
