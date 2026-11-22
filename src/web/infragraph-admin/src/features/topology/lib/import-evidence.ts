import { z } from 'zod'

// This is a user-supplied export, not authenticated collection from a device.
// Never trust the source protocol to imply verified LLDP/CDP adjacency.
const key = (limit: number) => z.string().trim().min(1).max(limit)
  .refine(value => ![...value].some(char => {
    const code = char.charCodeAt(0)
    return code < 32 || code === 127
  }), 'Control characters are forbidden')
const port = z.union([key(80), z.literal(''), z.null()]).optional()
const link = z.object({
  sourceKey: key(160),
  targetKey: key(160),
  sourcePort: port,
  targetPort: port,
  protocol: z.enum(['LLDP', 'CDP', 'MANUAL']),
  observedAtUtc: z.iso.datetime({ offset: true }),
  ttlSeconds: z.number().int().min(1).max(86_400),
}).strict().refine(item => item.sourceKey !== item.targetKey, 'A node cannot link to itself')
const importSchema = z.array(link).min(1).max(1000)

export type ImportedLink = {
  siteId: string
  sourceKey: string
  targetKey: string
  sourcePort: string | null
  targetPort: string | null
  protocol: 'LLDP' | 'CDP' | 'MANUAL'
  observedAtUtc: string
  ttlSeconds: number
}

export function parseEvidenceExport(text: string, siteId: string, now = new Date()): ImportedLink[] {
  if (!siteId.trim() || siteId.length > 120) throw new Error('شناسه سایت معتبر نیست.')
  if (text.length > 262_144) throw new Error('فایل نباید بیش از ۲۵۶ کیلوبایت باشد.')
  let unknown: unknown
  try {
    unknown = JSON.parse(text) as unknown
  } catch { throw new Error('ساختار JSON معتبر نیست.') }
  const result = importSchema.safeParse(unknown)
  if (!result.success) throw new Error('ساختار لینک‌ها، زمان مشاهده یا محدوده داده نامعتبر است.')
  return result.data.map(item => {
    const capturedAt = Date.parse(item.observedAtUtc)
    if (!Number.isFinite(capturedAt) || capturedAt > now.getTime() ||
        capturedAt < now.getTime() - 86_400_000)
      throw new Error('زمان مشاهده باید مربوط به ۲۴ ساعت گذشته باشد.')
    return {
      siteId, sourceKey: item.sourceKey, targetKey: item.targetKey,
      sourcePort: item.sourcePort || null, targetPort: item.targetPort || null,
      protocol: item.protocol, observedAtUtc: item.observedAtUtc, ttlSeconds: item.ttlSeconds,
    }
  })
}

export function evidenceBatches(rows: ImportedLink[]): ImportedLink[][] {
  const batches: ImportedLink[][] = []
  for (let i = 0; i < rows.length; i += 100) batches.push(rows.slice(i, i + 100))
  return batches
}