export const VCE_SOURCE_CATEGORIES = [
  { path: "exams", label: "Exams", category: "Exams" },
  { path: "textbooks", label: "Textbooks", category: "Textbooks" },
  { path: "miscellaneous", label: "Miscellaneous", category: "Miscellaneous" },
  { path: "contour", label: "Contour", category: "Contour" },
] as const

const INDEX_ORIGIN = "https://vce-bricks-index.pages.dev"
const DECRYPT_ORIGIN = "https://api.vce-bricks.workers.dev"
const MAX_LISTING_BYTES = 5 * 1024 * 1024

export interface VceSourceEntry {
  name: string
  path: string
  kind: "directory" | "file"
  byteSize: number | null
  mimeType: string | null
  downloadUrl?: string
}

export class VceSourceError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message)
    this.name = "VceSourceError"
  }
}

export function normalizeVceSourcePath(value: string, allowEmpty = false): string {
  if (value.length > 2048 || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new VceSourceError("The VCE source path is invalid.", 400)
  }

  const segments = value.split("/").filter(Boolean)
  if ((!allowEmpty && segments.length < 1) || segments.length > 30 ||
      segments.some((segment) => segment === "." || segment === ".." || segment.length > 255)) {
    throw new VceSourceError("The VCE source path is invalid.", 400)
  }
  if (segments.length > 0 && !VCE_SOURCE_CATEGORIES.some(({ path }) => path === segments[0])) {
    throw new VceSourceError("Only files from the supported VCE index sections can be imported.", 400)
  }
  return segments.join("/")
}

function decodeHtml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (entity, code: string) => {
    const lowerCode = code.toLowerCase()
    if (lowerCode === "amp") return "&"
    if (lowerCode === "quot") return "\""
    if (lowerCode === "apos") return "'"
    if (lowerCode === "lt") return "<"
    if (lowerCode === "gt") return ">"
    const numeric = lowerCode.startsWith("#x")
      ? Number.parseInt(lowerCode.slice(2), 16)
      : Number.parseInt(lowerCode.slice(1), 10)
    return Number.isFinite(numeric) && numeric > 0 && numeric <= 0x10ffff
      ? String.fromCodePoint(numeric)
      : entity
  })
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, "")).trim()
}

function readCell(row: string, className: string): string {
  const cells = row.matchAll(/<td\b[^>]*class=["']([^"']*)["'][^>]*>([\s\S]*?)<\/td>/gi)
  for (const cell of cells) {
    if (cell[1].split(/\s+/).includes(className)) return cell[2]
  }
  return ""
}

function parseBytes(value: string): number | null {
  const match = stripTags(value).match(/^([\d.]+)\s*([KMGT]?)(?:i?B)?$/i)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount < 0) return null
  const power = ["", "K", "M", "G", "T"].indexOf(match[2].toUpperCase())
  return Math.round(amount * 1024 ** Math.max(power, 0))
}

function pathFromIndexUrl(url: URL): string | null {
  if (url.protocol !== "https:" || url.origin !== INDEX_ORIGIN) return null
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  const path = decodedPath.replace(/^\/+|\/+$/g, "")
  try {
    return normalizeVceSourcePath(path)
  } catch {
    return null
  }
}

function entryFromRow(row: string, currentPath: string, listingUrl: URL): VceSourceEntry | null {
  const anchor = row.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
  if (!anchor) return null

  const href = decodeHtml(anchor[1]).trim()
  const name = stripTags(anchor[2])
  if (!name || name === ".." || href === "../") return null

  const typeText = stripTags(readCell(row, "t"))
  const isDirectory = typeText.toLowerCase() === "directory"
  let targetUrl: URL
  try {
    targetUrl = new URL(href, listingUrl)
  } catch {
    return null
  }

  if (isDirectory) {
    const path = pathFromIndexUrl(targetUrl)
    if (!path || path === currentPath || !path.startsWith(`${currentPath}/`)) return null
    return { name, path, kind: "directory", byteSize: null, mimeType: null }
  }

  let path: string | null = null
  let downloadUrl: string | undefined
  if (targetUrl.protocol === "https:" && targetUrl.origin === DECRYPT_ORIGIN &&
      targetUrl.pathname === "/decrypt") {
    const encryptedPath = targetUrl.searchParams.get("path")
    if (encryptedPath?.startsWith("vce-bricks/")) {
      try {
        path = normalizeVceSourcePath(encryptedPath.slice("vce-bricks/".length))
        downloadUrl = targetUrl.toString()
      } catch {
        return null
      }
    }
  } else {
    path = pathFromIndexUrl(targetUrl)
    if (path) downloadUrl = targetUrl.toString()
  }

  if (!path || !downloadUrl || !path.startsWith(`${currentPath}/`)) return null
  return {
    name,
    path,
    kind: "file",
    byteSize: parseBytes(readCell(row, "s")),
    mimeType: stripTags(readCell(row, "t")) || null,
    downloadUrl,
  }
}

export async function getVceSourceListing(directoryPath: string): Promise<VceSourceEntry[]> {
  const normalizedPath = normalizeVceSourcePath(directoryPath, true)
  const encodedPath = normalizedPath
    ? `${normalizedPath.split("/").map(encodeURIComponent).join("/")}/`
    : ""
  const listingUrl = new URL(encodedPath, `${INDEX_ORIGIN}/`)

  let response: Response
  try {
    response = await fetch(listingUrl, {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
    })
  } catch (cause) {
    throw new VceSourceError(
      cause instanceof Error ? `Could not reach the VCE index: ${cause.message}` : "Could not reach the VCE index."
    )
  }
  if (!response.ok) {
    throw new VceSourceError(
      `The VCE index returned HTTP ${response.status} for this folder.`,
      response.status === 404 ? 404 : 502
    )
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0)
  if (declaredLength > MAX_LISTING_BYTES) {
    throw new VceSourceError("The VCE index listing is too large to process.")
  }
  const html = await response.text()
  if (html.length > MAX_LISTING_BYTES) {
    throw new VceSourceError("The VCE index listing is too large to process.")
  }

  const entries: VceSourceEntry[] = []
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const entry = entryFromRow(row[1], normalizedPath, listingUrl)
    if (entry) entries.push(entry)
  }
  return entries.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1
    return left.name.localeCompare(right.name)
  })
}

export async function resolveVceSourceFile(sourcePath: string): Promise<VceSourceEntry> {
  const normalizedPath = normalizeVceSourcePath(sourcePath)
  const segments = normalizedPath.split("/")
  if (segments.length < 2) throw new VceSourceError("Choose a file inside a VCE index section.", 400)
  const fileName = segments.pop()
  const parentPath = segments.join("/")
  const listing = await getVceSourceListing(parentPath)
  const entry = listing.find((item) => item.kind === "file" && item.path === normalizedPath)
  if (!entry || !entry.downloadUrl || !fileName) {
    throw new VceSourceError("This file is no longer available in the VCE index.", 404)
  }
  return entry
}

export function sourceCategoryForPath(sourcePath: string): string {
  const root = sourcePath.split("/")[0]
  return VCE_SOURCE_CATEGORIES.find((item) => item.path === root)?.category ?? "Other"
}

export function sourceSubjectForPath(sourcePath: string): string {
  const segments = sourcePath.split("/")
  return segments.length > 2 ? segments[1].slice(0, 80) : "General"
}
