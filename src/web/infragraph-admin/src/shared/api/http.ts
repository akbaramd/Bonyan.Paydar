import { z } from 'zod'

export class HttpError extends Error {
  readonly status: number
  readonly path: string

  constructor(status: number, path: string) {
    super(`Request failed (${status})`)
    this.name = 'HttpError'
    this.status = status
    this.path = path
  }
}

/** Same-origin API, no hard-coded customer hostname or secret in frontend source. */
export async function getJson<T extends z.ZodType>(
  path: `/api/v1/${string}`,
  schema: T,
  signal?: AbortSignal,
): Promise<z.infer<T>> {
  const response = await fetch(path, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  })

  if (!response.ok) throw new HttpError(response.status, path)

  const json: unknown = await response.json()
  return schema.parse(json)
}
