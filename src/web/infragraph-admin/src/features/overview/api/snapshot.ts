import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { getJson } from '../../../shared/api/http'

export const snapshotSchema = z.object({
  product: z.string(),
  environment: z.string(),
  stage: z.string(),
  serverTimeUtc: z.iso.datetime({ offset: true }),
  registeredAssets: z.number().int().nonnegative(),
  activeIncidents: z.number().int().nonnegative(),
})

export type SystemSnapshot = z.infer<typeof snapshotSchema>

export function useSystemSnapshot() {
  return useQuery({
    queryKey: ['system', 'snapshot', 'v1'] as const,
    queryFn: ({ signal }) => getJson('/api/v1/system/snapshot', snapshotSchema, signal),
    refetchInterval: 30_000,
    staleTime: 10_000,
  })
}
