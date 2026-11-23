import { z } from 'zod'
import { getJson, HttpError } from '../../../shared/api/http'

export const agentPageSchema = z.object({
  siteId: z.string(), page: z.number().int().positive(),
  pageSize: z.number().int().positive(), total: z.number().int().nonnegative(),
  provenance: z.literal('registration-only-not-verified'),
  monitoring: z.literal('disabled'),
  items: z.array(z.object({
    agentId: z.string().uuid(), siteId: z.string(),
    agentVersion: z.string(), lastReceivedAtUtc: z.string().nullable(),
    lastInventoryAtUtc: z.string().nullable(),
    revokedAtUtc: z.string().nullable(),
    evidenceStatus: z.enum(['pending', 'recent', 'stale', 'revoked']),
  })),
})
export const agentCapabilitiesSchema = z.object({
  enrollmentEnabled: z.literal(false),
  certificateApprovalEnabled: z.literal(true),
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

export type ApprovalRequest = {
  agentId: string
  installationEpoch: string
  siteId: string
  clientCertificateThumbprint: string
}

export async function approveAgent(body: ApprovalRequest): Promise<void> {
  const csrf = await getJson('/api/v1/auth/csrf', z.object({ token: z.string().min(10) }))
  const path = '/api/v1/admin/agents/approve'
  const response = await fetch(path, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf.token },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new HttpError(response.status, path)
}
export const agentInventoryDetailSchema = z.object({
  agentId: z.string().uuid(),
  siteId: z.string(),
  receivedAtUtc: z.string(),
  collectedAtUtc: z.string(),
  evidenceStatus: z.enum(['recent', 'stale']),
  provenance: z.literal('agent-self-reported'),
  inventory: z.object({
    agentId: z.string().uuid(),
    installationEpoch: z.string().uuid(),
    hostName: z.string(),
    osVersion: z.string(),
    agentVersion: z.string(),
    cpuName: z.string(),
    logicalProcessors: z.number().int(),
    ramTotalBytes: z.number().nonnegative(),
    gpus: z.array(z.object({ name: z.string(), driverVersion: z.string().nullable() })),
    disks: z.array(z.object({
      name: z.string(), totalBytes: z.number().nonnegative(),
      freeBytes: z.number().nonnegative(), fileSystem: z.string().nullable(),
    })),
    networks: z.array(z.object({
      name: z.string(), macAddress: z.string().nullable(),
      ipAddresses: z.array(z.string()), status: z.string(),
    })),
    devices: z.array(z.object({
      name: z.string(), deviceClass: z.string().nullable(), instanceId: z.string().nullable(),
    })),
    collectedAtUtc: z.string(),
  }),
})

export function getAgentInventory(agentId: string, signal?: AbortSignal) {
  return getJson(`/api/v1/agents/${encodeURIComponent(agentId)}/inventory`,
    agentInventoryDetailSchema, signal)
}
