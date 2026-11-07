const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const HOST_WITH_PORT = /^[a-z0-9.-]+:\d+(\/|$)/i
const EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/

// Turns what a user types into the link dialog into a usable href: bare domains get https://, emails get mailto:,
// and anything that is already a URL, in-page anchor or relative path is left alone.
export function normaliseLinkUrl(input: string): string {
  const url = input.trim()
  if (!url) return ""
  if (/^[#/?.]/.test(url)) return url
  if (HOST_WITH_PORT.test(url)) return `https://${url}`
  if (SCHEME.test(url)) return url
  if (EMAIL.test(url)) return `mailto:${url}`
  return `https://${url}`
}
