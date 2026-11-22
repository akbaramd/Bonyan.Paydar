import DOMPurify from 'dompurify'

export const MAX_SVG_BYTES = 2 * 1024 * 1024

/**
 * Sanitize an untrusted SVG and return a browser-owned blob URL.
 * This is local-only and must NOT be forwarded to a server.
 * Rendered in an IMG document context, never inserted as live HTML.
 */
export async function readLocalSvg(file: File): Promise<string> {
  const validType = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
  if (!validType) throw new Error('فقط فایل SVG قابل انتخاب است.')
  if (file.size === 0 || file.size > MAX_SVG_BYTES) throw new Error('حجم SVG باید کمتر از دو مگابایت باشد.')

  const source = await file.text()
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(source)) {
    throw new Error('فایل انتخابی یک سند SVG معتبر نیست.')
  }
  // External URLs, remote font and image references are not allowed in network layout files.
  const withoutXmlNamespaces = source.replace(/\bxmlns(?::[a-z0-9_-]+)?\s*=\s*(["'])[^"']*\1/gi, '')
  if (/\b(?:https?:|file:|data:|javascript:|@import|url\s*\()/i.test(withoutXmlNamespaces)) {
    throw new Error('SVG حاوی منابع خارجی یا ارجاع ناامن است.')
  }
  const clean = DOMPurify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: false },
    FORBID_TAGS: ['script', 'foreignObject', 'image', 'use', 'style', 'animate', 'animateTransform', 'set'],
    FORBID_ATTR: ['href', 'xlink:href', 'style', 'onload', 'onclick'],
  })

  if (!clean.includes('<svg')) throw new Error('SVG پس از اعتبارسنجی خالی یا نامعتبر است.')
  const blob = new Blob([clean], { type: 'image/svg+xml' })
  return URL.createObjectURL(blob)
}