import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { getJson, HttpError } from '../api/http'

export const meSchema = z.object({
  id: z.string().uuid(), email: z.string(), role: z.enum(['admin', 'operator', 'viewer']),
  siteId: z.string().nullable(),
})
export type Session = z.infer<typeof meSchema>
export function useSession() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: ({ signal }) => getJson('/api/v1/auth/me', meSchema, signal),
    retry: false, staleTime: 30_000, refetchInterval: 30_000, refetchOnWindowFocus: true,
  })
}
export async function csrfToken(): Promise<string> {
  const data = await getJson('/api/v1/auth/csrf', z.object({ token: z.string().min(1) }))
  return data.token
}
export async function postSecure(path: `/api/v1/${string}`, body: unknown) {
  const token = await csrfToken()
  const response = await fetch(path, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token, Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new HttpError(response.status, path)
  if (response.status === 204) return null
  return response.json() as Promise<unknown>
}
export function useSignOut() {
  const qc = useQueryClient()
  return async () => {
    await postSecure('/api/v1/auth/logout', {})
    qc.clear()
    window.location.assign('/')
  }
}
