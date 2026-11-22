import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { getJson } from '../../../shared/api/http'
import { useSession } from '../../../shared/auth/session'

const siteListSchema = z.object({ sites: z.array(z.string().min(1).max(120)).max(500) })

/** Existing evidence-backed scopes only. Never constructs a new site from arbitrary input. */
export function useSiteScope() {
  const session = useSession()
  const [choice, setChoice] = useState('')
  const canChoose = session.data?.role === 'admin'
  const query = useQuery({
    queryKey: ['sites'],
    queryFn: ({ signal }) => getJson('/api/v1/sites', siteListSchema, signal),
    enabled: canChoose, staleTime: 60_000, retry: false,
  })
  const choices = useMemo(() => query.data?.sites ?? [], [query.data?.sites])
  const siteId = canChoose
    ? choices.includes(choice) ? choice : choices.includes('lan') ? 'lan' : choices[0] ?? ''
    : session.data?.siteId ?? ''
  return { siteId, canChoose, choices, setChoice, isLoading: query.isPending && canChoose,
    isError: query.isError, role: session.data?.role ?? null }
}
