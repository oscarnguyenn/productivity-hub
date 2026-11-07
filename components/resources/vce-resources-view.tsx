"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import {
  BookOpen,
  ChevronLeft,
  Download,
  Eye,
  File,
  FileArchive,
  FileText,
  Folder,
  Image as ImageIcon,
  LibraryBig,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmAction } from "@/components/ui/confirm-action"
import { Input } from "@/components/ui/input"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import {
  MAX_SHARED_VCE_STORAGE_BYTES,
  MAX_SHARED_VCE_FILE_BYTES,
  MAX_VCE_PERSONAL_FILE_BYTES,
  MAX_VCE_SINGLE_PUT_BYTES,
  VCE_RESOURCE_CATEGORIES,
  type VceResourceCategory,
} from "@/lib/vce-resource-constants"
import {
  sourceCategoryForPath,
  sourceSubjectForPath,
  VCE_SOURCE_CATEGORIES,
} from "@/lib/vce-source"

const BUCKET = "vce-resources"
const MAX_INDEX_DIRECTORIES = 10000
const MAX_INDEX_FILES = 50000
const RESOURCE_CATEGORIES = VCE_RESOURCE_CATEGORIES
const PAGE_SIZE = 500

type ResourceCategory = VceResourceCategory
type LibrarySection = "index" | "shared" | "personal"

interface VceResource {
  id: string
  title: string
  subject: string
  category: ResourceCategory
  file_name: string
  mime_type: string
  byte_size: number
  storage_path: string
  created_at: string
  source_path?: string | null
}

interface VceSourceEntry {
  name: string
  path: string
  kind: "directory" | "file"
  byteSize: number | null
  mimeType: string | null
  downloadUrl?: string
}

interface PreviewFile {
  fileName: string
  mimeType: string
  url: string
  resource?: VceResource
  shared?: boolean
}

interface ImportPlan {
  files: VceSourceEntry[]
  estimatedBytes: number
  unknownSizes: number
  label: string
  unavailableFolders: string[]
}

interface SubjectImportGroup {
  key: string
  category: ResourceCategory
  subject: string
  files: VceSourceEntry[]
  estimatedBytes: number
  unknownSizes: number
  oversizedFiles: VceSourceEntry[]
}

interface SubjectImportSelection {
  group: SubjectImportGroup
  existingCount: number
  pendingFiles: VceSourceEntry[]
  pendingBytes: number
  pendingUnknownSizes: number
  selectable: boolean
}

interface EditResource {
  resource: VceResource
  title: string
  subject: string
  category: ResourceCategory
}

type SupabaseBrowserClient = NonNullable<ReturnType<typeof createSupabaseBrowserClient>>

function isPreviewable(mimeType: string): boolean {
  return mimeType === "application/pdf" || mimeType.startsWith("image/")
}

function resourceIcon(resource: VceResource) {
  if (resource.mime_type.startsWith("image/")) return ImageIcon
  if (resource.mime_type === "application/pdf") return FileText
  if (resource.file_name.toLowerCase().endsWith(".zip")) return FileArchive
  return File
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function formatStorageBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1000
  let unitIndex = 0
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function fileTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").slice(0, 255) || fileName.slice(0, 255)
}

function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error) return cause.message
  if (typeof cause === "string") return cause
  if (cause && typeof cause === "object" && "message" in cause &&
      typeof cause.message === "string") {
    return cause.message
  }
  if (cause && typeof cause === "object") {
    try {
      return JSON.stringify(cause) || fallback
    } catch {
      return fallback
    }
  }
  return fallback
}

function getAllowedDownloadUrl(entry: VceSourceEntry): string {
  if (!entry.downloadUrl) throw new Error("The VCE index did not provide a file URL.")
  const url = new URL(entry.downloadUrl)
  const expectedIndexPath = `/${entry.path.split("/").map(encodeURIComponent).join("/")}`
  const isDecryptFile = url.origin === "https://api.vce-bricks.workers.dev" &&
    url.pathname === "/decrypt" &&
    url.searchParams.get("path") === `vce-bricks/${entry.path}`
  const isIndexFile = url.origin === "https://vce-bricks-index.pages.dev" &&
    url.pathname.replace(/\/+$/, "") === expectedIndexPath
  if (url.protocol !== "https:" || (!isDecryptFile && !isIndexFile)) {
    throw new Error("The VCE index returned an untrusted file URL.")
  }
  return url.toString()
}

async function readLimitedSourceFile(
  response: Response,
  mimeType: string,
  limit = MAX_VCE_SINGLE_PUT_BYTES
): Promise<Blob> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("The VCE source returned no readable file content.")

  const chunks: Blob[] = []
  let byteSize = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      byteSize += value.byteLength
      if (byteSize > limit) {
        await reader.cancel()
        throw new Error(`The source file exceeds the ${formatBytes(limit)} single-upload limit.`)
      }
      const chunk = new Uint8Array(value.byteLength)
      chunk.set(value)
      chunks.push(new Blob([chunk.buffer], { type: mimeType }))
    }
  } finally {
    reader.releaseLock()
  }
  return new Blob(chunks, { type: mimeType })
}

interface SharedResourcePayload {
  id: string
  title: string
  subject: string
  category: ResourceCategory
  fileName: string
  mimeType: string
  byteSize: number
  sourcePath?: string | null
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === "object" && "error" in body &&
        typeof body.error === "string") return body.error
  } catch {
    // Keep the HTTP status when an API response is not JSON.
  }
  return `${fallback} (HTTP ${response.status})`
}

interface PreparedR2Upload {
  multipart: boolean
  storagePath: string
  url?: string
  uploadId?: string
  partSize?: number
}

interface UploadedR2Part {
  PartNumber: number
  ETag: string
}

const MULTIPART_URL_BATCH_SIZE = 24

async function prepareSharedR2Upload(
  metadata: SharedResourcePayload,
  signal?: AbortSignal
): Promise<PreparedR2Upload> {
  const response = await fetch("/api/vce-resources/shared-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
    signal,
  })
  if (!response.ok) throw new Error(await responseError(response, "Could not prepare the R2 upload."))
  return response.json() as Promise<PreparedR2Upload>
}

async function getMultipartPartUrls(
  id: string,
  uploadId: string,
  partNumbers: number[],
  signal?: AbortSignal
): Promise<Map<number, string>> {
  const response = await fetch("/api/vce-resources/shared-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "sign-parts", id, uploadId, partNumbers }),
    signal,
  })
  if (!response.ok) throw new Error(await responseError(response, "Could not prepare the R2 multipart parts."))
  const result = await response.json() as { urls: { partNumber: number; url: string }[] }
  return new Map(result.urls.map(({ partNumber, url }) => [partNumber, url]))
}

async function completeSharedR2Upload(
  metadata: SharedResourcePayload,
  prepared: PreparedR2Upload,
  parts: UploadedR2Part[] = [],
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch("/api/vce-resources/shared-files", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      metadata,
      ...(prepared.uploadId ? { uploadId: prepared.uploadId, parts } : {}),
    }),
    signal,
  })
  if (!response.ok) {
    throw new Error(await responseError(response, `Could not add ${metadata.fileName} to the shared library.`))
  }
}

async function uploadBlobAsMultipart(
  metadata: SharedResourcePayload,
  file: Blob,
  prepared: PreparedR2Upload,
  signal?: AbortSignal
): Promise<UploadedR2Part[]> {
  if (!prepared.uploadId || !prepared.partSize) throw new Error("Cloudflare R2 returned invalid multipart upload details.")
  const partCount = Math.ceil(file.size / prepared.partSize)
  const parts: UploadedR2Part[] = []

  for (let start = 1; start <= partCount; start += MULTIPART_URL_BATCH_SIZE) {
    const partNumbers = Array.from(
      { length: Math.min(MULTIPART_URL_BATCH_SIZE, partCount - start + 1) },
      (_, index) => start + index
    )
    const urls = await getMultipartPartUrls(metadata.id, prepared.uploadId, partNumbers, signal)
    for (const partNumber of partNumbers) {
      const url = urls.get(partNumber)
      if (!url) throw new Error(`Cloudflare R2 did not provide an upload URL for part ${partNumber}.`)
      const startOffset = (partNumber - 1) * prepared.partSize
      const part = file.slice(startOffset, Math.min(startOffset + prepared.partSize, file.size))
      const response = await fetch(url, { method: "PUT", body: part, signal })
      if (!response.ok) throw new Error(await responseError(response, `Could not upload part ${partNumber}.`))
      const etag = response.headers.get("ETag")
      if (!etag) throw new Error("R2 did not return a readable part ETag; check the bucket CORS ExposeHeaders setting.")
      parts.push({ PartNumber: partNumber, ETag: etag })
    }
  }
  return parts
}

async function uploadSharedFileToR2(
  metadata: SharedResourcePayload,
  file: Blob,
  signal?: AbortSignal
): Promise<string> {
  const prepared = await prepareSharedR2Upload(metadata, signal)
  try {
    if (prepared.multipart) {
      const parts = await uploadBlobAsMultipart(metadata, file, prepared, signal)
      await completeSharedR2Upload({ ...metadata, byteSize: file.size }, prepared, parts, signal)
    } else {
      if (!prepared.url) throw new Error("Cloudflare R2 did not return an upload URL.")
      const uploadResponse = await fetch(prepared.url, {
        method: "PUT",
        headers: { "Content-Type": metadata.mimeType },
        body: file,
        signal,
      })
      if (!uploadResponse.ok) {
        throw new Error(await responseError(uploadResponse, `Could not upload ${metadata.fileName} to R2.`))
      }
      await completeSharedR2Upload({ ...metadata, byteSize: file.size }, prepared, [], signal)
    }
  } catch (cause) {
    try {
      await removeSharedR2Files(
        [metadata.id],
        [prepared.storagePath],
        prepared.uploadId ? [{ id: metadata.id, uploadId: prepared.uploadId }] : []
      )
    } catch (cleanupCause) {
      throw new Error(
        `${errorMessage(cause, "R2 upload failed.")} Cleanup failed: ${errorMessage(cleanupCause, "could not remove incomplete R2 data.")}`
      )
    }
    throw cause
  }
  return prepared.storagePath
}

async function uploadSourceStreamAsMultipart(
  metadata: SharedResourcePayload,
  response: Response,
  signal: AbortSignal
): Promise<string> {
  const prepared = await prepareSharedR2Upload(metadata, signal)
  if (!prepared.multipart || !prepared.uploadId || !prepared.partSize) {
    throw new Error("Cloudflare R2 did not initialize a multipart upload for this large file.")
  }
  const reader = response.body?.getReader()
  if (!reader) {
    await removeSharedR2Files([], [prepared.storagePath], [{ id: metadata.id, uploadId: prepared.uploadId }])
    throw new Error("The VCE source returned no readable file content.")
  }

  let pending: Uint8Array | null = null
  let streamDone = false
  let actualSize = 0
  let partNumber = 1
  const parts: UploadedR2Part[] = []
  let urlBatch = new Map<number, string>()
  try {
    while (!streamDone || pending) {
      const partBuffers: ArrayBuffer[] = []
      let partBytes = 0
      while (partBytes < prepared.partSize && (!streamDone || pending)) {
        if (!pending) {
          const next = await reader.read()
          if (next.done) {
            streamDone = true
            break
          }
          pending = next.value
        }
        const takeBytes = Math.min(prepared.partSize - partBytes, pending.byteLength)
        const chunk = pending.slice(0, takeBytes)
        partBuffers.push(chunk.buffer)
        partBytes += takeBytes
        pending = takeBytes === pending.byteLength ? null : pending.subarray(takeBytes)
      }
      if (partBytes === 0) break
      actualSize += partBytes
      if (actualSize > MAX_SHARED_VCE_FILE_BYTES) {
        throw new Error("The source file exceeds the Cloudflare R2 10 GB app limit.")
      }

      if (!urlBatch.has(partNumber)) {
        const partNumbers = Array.from(
          { length: MULTIPART_URL_BATCH_SIZE },
          (_, index) => partNumber + index
        )
        urlBatch = await getMultipartPartUrls(metadata.id, prepared.uploadId, partNumbers, signal)
      }
      const partUrl = urlBatch.get(partNumber)
      if (!partUrl) throw new Error(`Cloudflare R2 did not provide an upload URL for part ${partNumber}.`)
      const partBlob = new Blob(partBuffers, { type: metadata.mimeType })
      const uploadResponse = await fetch(partUrl, { method: "PUT", body: partBlob, signal })
      if (!uploadResponse.ok) {
        throw new Error(await responseError(uploadResponse, `Could not upload part ${partNumber}.`))
      }
      const etag = uploadResponse.headers.get("ETag")
      if (!etag) throw new Error("R2 did not return a readable part ETag; check the bucket CORS ExposeHeaders setting.")
      parts.push({ PartNumber: partNumber, ETag: etag })
      partNumber += 1
    }
    if (actualSize === 0) throw new Error("The VCE source returned an empty large-file response.")
    await completeSharedR2Upload({ ...metadata, byteSize: actualSize }, prepared, parts, signal)
    return prepared.storagePath
  } catch (cause) {
    try {
      await removeSharedR2Files([metadata.id], [prepared.storagePath], [{ id: metadata.id, uploadId: prepared.uploadId }])
    } catch (cleanupCause) {
      throw new Error(
        `${errorMessage(cause, "R2 multipart upload failed.")} Cleanup failed: ${errorMessage(cleanupCause, "could not remove incomplete R2 data.")}`
      )
    }
    throw cause
  } finally {
    reader.releaseLock()
  }
}

async function removeSharedR2Files(
  ids: string[],
  storagePaths: string[],
  multipartUploads: { id: string; uploadId: string }[] = []
): Promise<void> {
  if (ids.length === 0 && storagePaths.length === 0 && multipartUploads.length === 0) return
  const response = await fetch("/api/vce-resources/shared-files", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, storagePaths, multipartUploads }),
  })
  if (!response.ok) {
    throw new Error(await responseError(response, "Could not remove files from Cloudflare R2."))
  }
}

function groupSourceFiles(files: VceSourceEntry[]): SubjectImportGroup[] {
  const groups = new Map<string, SubjectImportGroup>()
  for (const file of files) {
    const category = sourceCategoryForPath(file.path) as ResourceCategory
    const subject = sourceSubjectForPath(file.path)
    const key = `${category}::${subject}`
    let group = groups.get(key)
    if (!group) {
      group = { key, category, subject, files: [], estimatedBytes: 0, unknownSizes: 0, oversizedFiles: [] }
      groups.set(key, group)
    }
    group.files.push(file)
    if (file.byteSize === null) group.unknownSizes += 1
    else group.estimatedBytes += file.byteSize
    if (file.byteSize !== null && file.byteSize > MAX_SHARED_VCE_FILE_BYTES) group.oversizedFiles.push(file)
  }
  return Array.from(groups.values()).sort((left, right) =>
    right.estimatedBytes - left.estimatedBytes ||
    left.category.localeCompare(right.category) ||
    left.subject.localeCompare(right.subject)
  )
}

async function fetchResourcePages<T>(
  supabase: SupabaseBrowserClient,
  table: "vce_resources" | "vce_shared_resources",
  select: string
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function importSourceFile(
  supabase: SupabaseBrowserClient,
  entry: VceSourceEntry,
  signal: AbortSignal
): Promise<{ imported: boolean; id?: string; storagePath?: string }> {
  const id = globalThis.crypto.randomUUID()
  const storagePath = `shared/${id}`
  const { data: existing, error: existingError } = await supabase
    .from("vce_shared_resources")
    .select("id")
    .eq("source_path", entry.path)
    .maybeSingle()
  if (existingError) throw new Error(`Could not check ${entry.name}: ${existingError.message}`)
  if (existing) return { imported: false }

  const response = await fetch(getAllowedDownloadUrl(entry), { signal })
  if (!response.ok) throw new Error(`The VCE source returned HTTP ${response.status}.`)
  const contentLengthHeader = response.headers.get("content-length")
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader)
  const expectedSize = contentLength !== null && Number.isSafeInteger(contentLength) && contentLength >= 0
    ? contentLength
    : entry.byteSize
  if (expectedSize === null) throw new Error(`${entry.name} has no reliable size information and cannot be safely imported.`)
  if (expectedSize > MAX_SHARED_VCE_FILE_BYTES) {
    throw new Error(`${entry.name} exceeds the 10 GB shared-library per-file limit.`)
  }
  const mimeType = (
    response.headers.get("content-type")?.split(";")[0] ||
    entry.mimeType ||
    "application/octet-stream"
  ).trim().slice(0, 255)
  if (mimeType.toLowerCase().startsWith("text/html")) {
    throw new Error(`The VCE source did not return a file for ${entry.name}.`)
  }

  const fileName = entry.path.split("/").pop() ?? entry.name
  const metadata: SharedResourcePayload = {
    id,
    title: fileTitle(fileName),
    subject: sourceSubjectForPath(entry.path),
    category: sourceCategoryForPath(entry.path) as ResourceCategory,
    fileName: fileName.slice(0, 255),
    mimeType,
    byteSize: expectedSize,
    sourcePath: entry.path,
  }
  try {
    if (expectedSize > MAX_VCE_SINGLE_PUT_BYTES) {
      await uploadSourceStreamAsMultipart(metadata, response, signal)
    } else {
      const file = await readLimitedSourceFile(response, mimeType, MAX_VCE_SINGLE_PUT_BYTES)
      await uploadSharedFileToR2({ ...metadata, byteSize: file.size }, file, signal)
    }
  } catch (uploadError) {
    if (errorMessage(uploadError, "").includes("Cleanup failed:")) throw uploadError
    const { data: racedImport, error: lookupError } = await supabase
      .from("vce_shared_resources")
      .select("id")
      .eq("source_path", entry.path)
      .maybeSingle()
    if (lookupError) throw new Error(`Could not verify ${entry.name}: ${lookupError.message}`)
    if (racedImport) return { imported: false }
    throw uploadError
  }
  return { imported: true, id, storagePath }
}

export function VceResourcesView() {
  const personalFileInputRef = useRef<HTMLInputElement>(null)
  const sharedFileInputRef = useRef<HTMLInputElement>(null)
  const sourceAbortRef = useRef<AbortController | null>(null)
  const importDialogRef = useRef<HTMLDialogElement>(null)
  const [activeSection, setActiveSection] = useState<LibrarySection>("index")
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [resources, setResources] = useState<VceResource[]>([])
  const [sharedResources, setSharedResources] = useState<VceResource[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [category, setCategory] = useState<ResourceCategory>("Exams")
  const [subject, setSubject] = useState("")
  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<ResourceCategory | "All">("All")
  const [error, setError] = useState<string | null>(null)
  const [sharedError, setSharedError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewFile | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)
  const [sourcePath, setSourcePath] = useState("")
  const [sourceEntries, setSourceEntries] = useState<VceSourceEntry[]>([])
  const [sourceLoading, setSourceLoading] = useState(false)
  const [sourceImporting, setSourceImporting] = useState(false)
  const [sourceProgress, setSourceProgress] = useState("")
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [sourceStatus, setSourceStatus] = useState("")
  const [pendingImport, setPendingImport] = useState<ImportPlan | null>(null)
  const [excludedSubjectKeys, setExcludedSubjectKeys] = useState<string[]>([])
  const [editingResource, setEditingResource] = useState<EditResource | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    const dialog = importDialogRef.current
    if (!dialog) return
    if (pendingImport && !dialog.open) dialog.showModal()
    if (!pendingImport && dialog.open) dialog.close()
  }, [pendingImport])

  const loadLibraries = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createSupabaseBrowserClient()
      if (!supabase) throw new Error("Supabase is not configured.")
      const { data: userResult, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!userResult.user) throw new Error("Sign in to access VCE resources.")

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role,is_active")
        .eq("id", userResult.user.id)
        .maybeSingle()
      if (profileError) throw profileError
      if (!profile?.is_active) throw new Error("An active account is required to access VCE resources.")

      const [personalResult, sharedResult] = await Promise.allSettled([
        fetchResourcePages<VceResource>(
          supabase,
          "vce_resources",
          "id,title,subject,category,file_name,mime_type,byte_size,storage_path,created_at"
        ),
        fetchResourcePages<VceResource>(
          supabase,
          "vce_shared_resources",
          "id,title,subject,category,file_name,mime_type,byte_size,storage_path,created_at,source_path"
        ),
      ])
      if (personalResult.status === "rejected") throw personalResult.reason
      setUserId(userResult.user.id)
      setIsAdmin(profile.role === "admin")
      setResources(personalResult.value)
      if (sharedResult.status === "rejected") {
        setSharedResources([])
        setSharedError(
          `Could not load the shared library: ${errorMessage(sharedResult.reason, "unknown error")}. ` +
          "Apply the latest VCE shared-resources Supabase migration to enable this section."
        )
      } else {
        setSharedResources(sharedResult.value)
        setSharedError(null)
      }
      setError(null)
    } catch (cause) {
      setError(errorMessage(cause, "Could not load VCE resources."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        if (!supabase) throw new Error("Supabase is not configured.")
        const { data: userResult, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        if (!userResult.user) throw new Error("Sign in to access VCE resources.")

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role,is_active")
          .eq("id", userResult.user.id)
          .maybeSingle()
        if (profileError) throw profileError
        if (!profile?.is_active) throw new Error("An active account is required to access VCE resources.")

        const [personalResult, sharedResult] = await Promise.allSettled([
          fetchResourcePages<VceResource>(
            supabase,
            "vce_resources",
            "id,title,subject,category,file_name,mime_type,byte_size,storage_path,created_at"
          ),
          fetchResourcePages<VceResource>(
            supabase,
            "vce_shared_resources",
            "id,title,subject,category,file_name,mime_type,byte_size,storage_path,created_at,source_path"
          ),
        ])
        if (!active) return
        if (personalResult.status === "rejected") throw personalResult.reason
        setUserId(userResult.user.id)
        setIsAdmin(profile.role === "admin")
        setResources(personalResult.value)
        if (sharedResult.status === "rejected") {
          setSharedResources([])
          setSharedError(
            `Could not load the shared library: ${errorMessage(sharedResult.reason, "unknown error")}. ` +
            "Apply the latest VCE shared-resources Supabase migration to enable this section."
          )
        } else {
          setSharedResources(sharedResult.value)
          setSharedError(null)
        }
        setError(null)
      } catch (cause) {
        if (active) setError(errorMessage(cause, "Could not load VCE resources."))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const visibleResources = activeSection === "shared" ? sharedResources : resources
  const sourceImportGroups = useMemo(
    () => groupSourceFiles(pendingImport?.files ?? []),
    [pendingImport]
  )
  const filteredResources = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return visibleResources.filter((resource) => {
      if (categoryFilter !== "All" && resource.category !== categoryFilter) return false
      if (!normalizedQuery) return true
      return [resource.title, resource.subject, resource.category, resource.file_name]
        .some((value) => value.toLowerCase().includes(normalizedQuery))
    })
  }, [categoryFilter, query, visibleResources])

  const personalBytes = useMemo(
    () => resources.reduce((total, resource) => total + resource.byte_size, 0),
    [resources]
  )
  const sharedBytes = useMemo(
    () => sharedResources.reduce((total, resource) => total + resource.byte_size, 0),
    [sharedResources]
  )
  const sourceImportSelection = useMemo(() => {
    const existingPaths = new Set(
      sharedResources.flatMap((resource) => resource.source_path ? [resource.source_path] : [])
    )
    const groups: SubjectImportSelection[] = sourceImportGroups.map((group) => {
      const existingCount = group.files.filter((file) => existingPaths.has(file.path)).length
      return {
        group,
        existingCount,
        pendingFiles: group.files.filter((file) => !existingPaths.has(file.path)),
        pendingBytes: group.files
          .filter((file) => !existingPaths.has(file.path))
          .reduce((total, file) => total + (file.byteSize ?? 0), 0),
        pendingUnknownSizes: group.files
          .filter((file) => !existingPaths.has(file.path) && file.byteSize === null)
          .length,
        selectable: group.oversizedFiles.length === 0 &&
          (existingCount === 0 || existingCount === group.files.length),
      }
    })
    const selected = groups.filter(
      ({ group, selectable }) => selectable && !excludedSubjectKeys.includes(group.key)
    )
    const files = selected.flatMap(({ pendingFiles }) => pendingFiles)
    return {
      groups,
      selected: selected.map(({ group }) => group),
      files,
      estimatedBytes: files.reduce((total, file) => total + (file.byteSize ?? 0), 0),
      unknownSizes: files.filter((file) => file.byteSize === null).length,
    }
  }, [excludedSubjectKeys, sharedResources, sourceImportGroups])

  const loadSourceCatalog = async (path: string) => {
    setSourcePath(path)
    setSourceLoading(true)
    setSourceError(null)
    setSourceStatus("")
    try {
      const response = await fetch(`/api/vce-resources/catalog?${new URLSearchParams({ path })}`)
      const result = await response.json() as { entries?: VceSourceEntry[]; error?: string }
      if (!response.ok) throw new Error(result.error || "Could not load this VCE index folder.")
      setSourceEntries(result.entries ?? [])
    } catch (cause) {
      setSourceEntries([])
      setSourceError(errorMessage(cause, "Could not load this VCE index folder."))
    } finally {
      setSourceLoading(false)
    }
  }

  const prepareSourceImport = async (roots: string[], initialFiles: VceSourceEntry[] = []) => {
    if (!isAdmin || sourceImporting || !userId) return
    const controller = new AbortController()
    sourceAbortRef.current = controller
    setSourceImporting(true)
    setSourceError(null)
    setSourceStatus("")
    setSourceProgress("Scanning the index and estimating storage…")

    try {
      const directories = [...roots]
      const visited = new Set<string>()
      const sourceFiles = new Map(initialFiles.map((file) => [file.path, file]))
      const unavailableFolders: string[] = []
      let nextDirectoryIndex = 0

      const scanWorker = async () => {
        while (!controller.signal.aborted) {
          const index = nextDirectoryIndex
          nextDirectoryIndex += 1
          if (index >= directories.length) return
          const path = directories[index]
          if (visited.has(path)) continue
          visited.add(path)
          if (visited.size > MAX_INDEX_DIRECTORIES || sourceFiles.size > MAX_INDEX_FILES) {
            throw new Error("This import exceeds the safe indexing limit. Choose a smaller folder.")
          }

          setSourceProgress(`Scanning ${path}… (${visited.size} folders, ${sourceFiles.size} files found)`)
          let entries: VceSourceEntry[]
          try {
            const response = await fetch(`/api/vce-resources/catalog?${new URLSearchParams({ path })}`, {
              signal: controller.signal,
            })
            const result = await response.json() as { entries?: VceSourceEntry[]; error?: string }
            if (!response.ok) throw new Error(result.error || `Could not scan ${path}.`)
            entries = result.entries ?? []
          } catch (cause) {
            if (controller.signal.aborted) throw cause
            unavailableFolders.push(`${path}: ${errorMessage(cause, "Could not scan this folder.")}`)
            continue
          }

          for (const entry of entries) {
            if (entry.kind === "directory") {
              const sections = entry.path.split("/")
                .filter((segment) => VCE_SOURCE_CATEGORIES.some((category) => category.path === segment))
              if (new Set(sections).size !== sections.length) {
                unavailableFolders.push(`${entry.path}: repeated section link`)
                continue
              }
              directories.push(entry.path)
            } else {
              sourceFiles.set(entry.path, entry)
            }
          }
          if (sourceFiles.size > MAX_INDEX_FILES) {
            throw new Error("This import contains too many files. Choose a smaller folder.")
          }
        }
      }

      await Promise.all(Array.from({ length: 4 }, () => scanWorker()))
      if (controller.signal.aborted) return

      const sourceFilesToPlan = Array.from(sourceFiles.values())
      const alreadySharedPaths = new Set(sharedResources.map((resource) => resource.source_path).filter(Boolean))
      const filesToImport = sourceFilesToPlan.filter((file) => !alreadySharedPaths.has(file.path))
      if (filesToImport.length === 0) {
        setSourceStatus(sourceFiles.size === 0
          ? "No files were available to copy from this selection."
          : "Every file in this selection is already in the shared library.")
        if (unavailableFolders.length) {
          setSourceError(
            `Skipped ${unavailableFolders.length} unavailable or recursive folder(s): ${unavailableFolders.slice(0, 5).join(" | ")}` +
            `${unavailableFolders.length > 5 ? ` | and ${unavailableFolders.length - 5} more` : ""}`
          )
        }
        return
      }
      const estimatedBytes = filesToImport.reduce((total, file) => total + (file.byteSize ?? 0), 0)
      const unknownSizes = filesToImport.filter((file) => file.byteSize === null).length
      const rootLabel = roots.length === VCE_SOURCE_CATEGORIES.length && !initialFiles.length
        ? "the full VCE index"
        : roots.length === 1
          ? roots[0].split("/").pop() || roots[0]
          : "the selected resource"
      const plan = { files: sourceFilesToPlan, estimatedBytes, unknownSizes, label: rootLabel, unavailableFolders }
      setExcludedSubjectKeys(
        groupSourceFiles(sourceFilesToPlan)
          .filter((group) => group.oversizedFiles.length > 0)
          .map((group) => group.key)
      )
      setPendingImport(plan)
      setSourceStatus("")
    } catch (cause) {
      if (!controller.signal.aborted) {
        controller.abort()
        setSourceError(errorMessage(cause, "Could not scan the VCE index."))
      }
    } finally {
      sourceAbortRef.current = null
      setSourceImporting(false)
      setSourceProgress("")
    }
  }

  const runSourceImport = async (plan: ImportPlan) => {
    if (!isAdmin || !userId) return
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setSourceError("Supabase is not configured, so VCE resources cannot be imported.")
      return
    }
    try {
      const { data: adminResult, error: adminError } = await supabase.rpc("is_admin")
      if (adminError || !adminResult) {
        setSourceError(adminError?.message ?? "Administrator access is required to import shared resources.")
        return
      }
    } catch (cause) {
      setSourceError(errorMessage(cause, "Could not verify administrator access."))
      return
    }

    const selectedGroups = sourceImportSelection.selected
    const existingPaths = new Set(
      sharedResources.flatMap((resource) => resource.source_path ? [resource.source_path] : [])
    )
    const selectedFiles = sourceImportSelection.files
    const selectedBytes = sourceImportSelection.estimatedBytes
    const availableBytes = MAX_SHARED_VCE_STORAGE_BYTES - sharedBytes
    if (selectedFiles.length === 0) {
      setSourceError("Choose at least one complete subject that is not already in the shared library.")
      return
    }
    if (selectedBytes > availableBytes) {
      setSourceError(
        `The selected subjects total about ${formatStorageBytes(selectedBytes)}, but only ${formatStorageBytes(Math.max(availableBytes, 0))} remain under the 10 GB R2 limit. ` +
        "Leave out one or more whole subjects before copying."
      )
      return
    }
    const r2ReadyResponse = await fetch("/api/vce-resources/shared-files?ready=1", { cache: "no-store" })
    if (!r2ReadyResponse.ok) {
      setSourceError(await responseError(r2ReadyResponse, "Cloudflare R2 is not ready."))
      return
    }

    const controller = new AbortController()
    sourceAbortRef.current = controller
    setSourceImporting(true)
    setPendingImport(null)
    setSourceError(null)
    setSourceStatus("")
    let importedCount = 0
    let skippedCount = 0
    let processedCount = 0
    let failedCount = 0
    const failedSubjects: string[] = []
    try {
      for (let groupIndex = 0; groupIndex < selectedGroups.length; groupIndex += 1) {
        if (controller.signal.aborted) break
        const group = selectedGroups[groupIndex]
        const groupFiles = group.files.filter((file) => !existingPaths.has(file.path))
        if (groupFiles.length === 0) {
          skippedCount += group.files.length
          continue
        }
        const alreadyPresentCount = group.files.length - groupFiles.length
        if (alreadyPresentCount > 0) {
          failedCount += groupFiles.length
          failedSubjects.push(`${group.category} / ${group.subject}: only ${alreadyPresentCount} of ${group.files.length} files are already present; left the subject unchanged`)
          continue
        }

        const groupIds: string[] = []
        const groupStoragePaths: string[] = []
        let groupError = ""
        for (let fileIndex = 0; fileIndex < groupFiles.length; fileIndex += 1) {
          if (controller.signal.aborted) break
          const file = groupFiles[fileIndex]
          setSourceProgress(
            `Copying ${groupIndex + 1} of ${selectedGroups.length} subjects · ${group.category} / ${group.subject} · ` +
            `${fileIndex + 1} of ${groupFiles.length}: ${file.name}`
          )
          try {
            if (!file.downloadUrl) throw new Error("The VCE index did not provide a file URL.")
            const result = await importSourceFile(supabase, file, controller.signal)
            processedCount += 1
            if (result.imported && result.id && result.storagePath) {
              groupIds.push(result.id)
              groupStoragePaths.push(result.storagePath)
            } else {
              skippedCount += 1
            }
          } catch (cause) {
            if (!controller.signal.aborted) {
              groupError = `${file.path}: ${errorMessage(cause, "Import failed.")}`
              processedCount += 1
            }
            break
          }
        }

        if (controller.signal.aborted) {
          if (groupIds.length > 0 || groupStoragePaths.length > 0) {
            try {
              await removeSharedR2Files(groupIds, groupStoragePaths)
            } catch (cause) {
              failedSubjects.push(`${group.category} / ${group.subject}: cleanup failed: ${errorMessage(cause, "unknown error")}`)
            }
          }
          break
        }
        if (groupError) {
          try {
            await removeSharedR2Files(groupIds, groupStoragePaths)
            failedCount += 1
            failedSubjects.push(`${group.category} / ${group.subject}: ${groupError}; the whole subject was rolled back`)
          } catch (cause) {
            failedCount += 1
            failedSubjects.push(
              `${group.category} / ${group.subject}: ${groupError}; rollback failed: ${errorMessage(cause, "unknown error")}`
            )
          }
        } else {
          importedCount += groupIds.length
        }
      }

      if (importedCount > 0) await loadLibraries()
      const cancelled = controller.signal.aborted
      const notAttempted = selectedFiles.length - processedCount
      const summary = `${importedCount} added to shared library, ${skippedCount} already present, ${failedCount} subject(s) not copied` +
        `${notAttempted > 0 ? `, ${notAttempted} file(s) not attempted` : ""}.`
      const unavailableSummary = plan.unavailableFolders.length
        ? `Skipped ${plan.unavailableFolders.length} unavailable or recursive folder(s): ${plan.unavailableFolders.slice(0, 5).join(" | ")}` +
          `${plan.unavailableFolders.length > 5 ? ` | and ${plan.unavailableFolders.length - 5} more` : ""}`
        : ""
      const sizeLimitGroups = sourceImportGroups.filter((group) => group.oversizedFiles.length > 0)
      const sizeLimitSummary = sizeLimitGroups.length
          ? `${sizeLimitGroups.length} whole subject(s) were left out because at least one file exceeds the 10 GB shared-library per-file limit.`
        : ""
      if (failedSubjects.length) {
        const examples = failedSubjects.slice(0, 5).join(" | ")
        setSourceError(
          `${summary} ${examples}` +
          `${unavailableSummary ? ` ${unavailableSummary}` : ""}` +
          `${failedSubjects.length > 5 ? ` | and ${failedSubjects.length - 5} more` : ""}` +
          `${sizeLimitSummary ? ` ${sizeLimitSummary}` : ""}`
        )
      } else {
        setSourceError(unavailableSummary || sizeLimitSummary || null)
        setSourceStatus(cancelled ? `Import cancelled. ${summary}` : summary)
      }
    } finally {
      sourceAbortRef.current = null
      setSourceImporting(false)
      setSourceProgress("")
    }
  }

  const cancelSourceImport = () => {
    sourceAbortRef.current?.abort()
    setPendingImport(null)
  }

  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(event.target.files ?? []))
    setError(null)
  }

  const uploadFiles = async (shared: boolean) => {
    if (files.length === 0 || uploading) return
    if (shared && !isAdmin) {
      setError("Administrator access is required to add shared resources.")
      return
    }
    const fileLimitBytes = shared ? MAX_SHARED_VCE_FILE_BYTES : MAX_VCE_PERSONAL_FILE_BYTES
    const tooLarge = files.find((file) => file.size > fileLimitBytes)
    if (tooLarge) {
      setError(`${tooLarge.name} is larger than the ${formatBytes(fileLimitBytes)} per-file limit.`)
      return
    }

    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setError("Supabase is not configured, so resource uploads are unavailable.")
      return
    }

    setUploading(true)
    setError(null)
    let uploadedCount = 0
    const failedFiles: string[] = []
    try {
      const { data: userResult, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!userResult.user) throw new Error("Sign in before uploading files.")

      if (shared) {
        const { data: adminResult, error: adminError } = await supabase.rpc("is_admin")
        if (adminError || !adminResult) throw new Error(adminError?.message ?? "Administrator access required.")
      }

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        setUploadProgress(`Uploading ${index + 1} of ${files.length}: ${file.name}`)
        const id = globalThis.crypto.randomUUID()
        const mimeType = file.type || "application/octet-stream"
        if (shared) {
          const metadata: SharedResourcePayload = {
            id,
            title: fileTitle(file.name),
            subject: subject.trim() || "General",
            category,
            fileName: file.name,
            mimeType,
            byteSize: file.size,
          }
          try {
            await uploadSharedFileToR2(metadata, file)
          } catch (cause) {
            failedFiles.push(`${file.name}: ${errorMessage(cause, "R2 upload failed.")}`)
            continue
          }
        } else {
          const storagePath = `${userResult.user.id}/${id}`
          const { error: storageError } = await supabase.storage
            .from(BUCKET)
            .upload(storagePath, file, {
              cacheControl: "3600",
              contentType: mimeType,
              upsert: false,
            })
          if (storageError) {
            failedFiles.push(`${file.name}: ${storageError.message}`)
            continue
          }

          const { error: metadataError } = await supabase.from("vce_resources").insert({
            id,
            title: fileTitle(file.name),
            subject: subject.trim() || "General",
            category,
            file_name: file.name,
            mime_type: mimeType,
            byte_size: file.size,
            storage_path: storagePath,
            user_id: userResult.user.id,
          })
          if (metadataError) {
            const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([storagePath])
            failedFiles.push(
              `${file.name}: ${metadataError.message}${cleanupError ? ` (cleanup failed: ${cleanupError.message})` : ""}`
            )
            continue
          }
        }
        uploadedCount += 1
      }

      if (failedFiles.length) {
        setError(`${uploadedCount} file(s) uploaded. ${failedFiles.join(" | ")}`)
      }
      setFiles([])
      const fileInput = shared ? sharedFileInputRef.current : personalFileInputRef.current
      if (fileInput) fileInput.value = ""
      if (uploadedCount > 0) await loadLibraries()
    } catch (cause) {
      setError(errorMessage(cause, "Could not upload the selected files."))
    } finally {
      setUploading(false)
      setUploadProgress("")
    }
  }

  const openResource = async (resource: VceResource, shared: boolean, download = false) => {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setError("Supabase is not configured.")
      return
    }
    setError(null)
    setPreviewLoadingId(resource.id)
    try {
      let url: string
      if (shared) {
        const response = await fetch(
          `/api/vce-resources/shared-files?id=${encodeURIComponent(resource.id)}${download ? "&download=1" : ""}`,
          { cache: "no-store" }
        )
        if (!response.ok) throw new Error(await responseError(response, "Could not open this shared resource."))
        const result = await response.json() as { url: string }
        url = result.url
      } else {
        const { data, error: urlError } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(resource.storage_path, 300, download ? { download: resource.file_name } : undefined)
        if (urlError) throw urlError
        url = data.signedUrl
      }
      if (download) {
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = resource.file_name
        anchor.rel = "noopener"
        document.body.append(anchor)
        anchor.click()
        anchor.remove()
      } else {
        setPreview({ fileName: resource.file_name, mimeType: resource.mime_type, url, resource, shared })
      }
    } catch (cause) {
      setError(errorMessage(cause, "Could not open this resource."))
    } finally {
      setPreviewLoadingId(null)
    }
  }

  const downloadPreview = async () => {
    if (preview?.resource) {
      await openResource(preview.resource, Boolean(preview.shared), true)
      return
    }
    if (preview) {
      const anchor = document.createElement("a")
      anchor.href = preview.url
      anchor.target = "_blank"
      anchor.rel = "noopener noreferrer"
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
    }
  }

  const deleteResource = async (resource: VceResource, shared: boolean) => {
    if (deletingId) return
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setError("Supabase is not configured, so resources cannot be deleted.")
      return
    }

    setDeletingId(resource.id)
    setError(null)
    try {
      if (shared) {
        await removeSharedR2Files([resource.id], [])
      } else {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove([resource.storage_path])
        if (storageError) throw storageError

        const { error: rowError } = await supabase
          .from("vce_resources")
          .delete()
          .eq("id", resource.id)
        if (rowError) {
          throw new Error(`The file was removed, but its library record could not be deleted: ${rowError.message}`)
        }
      }
      if (shared) setSharedResources((current) => current.filter((item) => item.id !== resource.id))
      else setResources((current) => current.filter((item) => item.id !== resource.id))
      if (preview?.resource?.id === resource.id) setPreview(null)
    } catch (cause) {
      setError(errorMessage(cause, "Could not delete this resource."))
      await loadLibraries()
    } finally {
      setDeletingId(null)
    }
  }

  const saveResourceEdit = async () => {
    if (!editingResource || !isAdmin) return
    const title = editingResource.title.trim()
    const subjectValue = editingResource.subject.trim()
    if (!title || title.length > 255 || !subjectValue || subjectValue.length > 80) {
      setError("Enter a title (1-255 characters) and subject (1-80 characters).")
      return
    }
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setError("Supabase is not configured.")
      return
    }

    setSavingEdit(true)
    setError(null)
    try {
      const { data: adminResult, error: adminError } = await supabase.rpc("is_admin")
      if (adminError || !adminResult) throw new Error(adminError?.message ?? "Administrator access required.")
      const { error: updateError } = await supabase
        .from("vce_shared_resources")
        .update({ title, subject: subjectValue, category: editingResource.category })
        .eq("id", editingResource.resource.id)
      if (updateError) throw updateError
      setSharedResources((current) => current.map((item) => item.id === editingResource.resource.id
        ? { ...item, title, subject: subjectValue, category: editingResource.category }
        : item))
      setEditingResource(null)
    } catch (cause) {
      setError(errorMessage(cause, "Could not update this shared resource."))
    } finally {
      setSavingEdit(false)
    }
  }

  const renderUploadForm = (shared: boolean) => {
    const fileInputRef = shared ? sharedFileInputRef : personalFileInputRef
    return (
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-2">
          {shared ? <ShieldCheck className="size-4 text-primary" /> : <UserRound className="size-4 text-primary" />}
          <h2 className="text-base font-semibold">{shared ? "Add to shared library" : "Add to my library"}</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {shared
            ? "Shared files are visible to every signed-in active user. Only admins can manage them."
            : "These files are private to your account. Each file can be up to 50 MB."}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Library section</span>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
              value={category}
              onChange={(event) => setCategory(event.target.value as ResourceCategory)}
              disabled={uploading}
            >
              {RESOURCE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Subject (optional)</span>
            <Input
              maxLength={80}
              placeholder="e.g. Biology, English, Methods"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              disabled={uploading}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={selectFiles}
            disabled={loading || uploading}
            aria-label={`Choose files for ${shared ? "the shared" : "your personal"} VCE library`}
            className="block min-w-0 flex-1 text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted"
          />
          <Button type="button" onClick={() => void uploadFiles(shared)} disabled={files.length === 0 || loading || uploading}>
            <Upload />
            {uploading ? "Uploading…" : `Upload ${files.length || ""} ${files.length === 1 ? "file" : "files"}`}
          </Button>
        </div>
        {uploadProgress && <p role="status" className="mt-3 text-sm text-muted-foreground">{uploadProgress}</p>}
      </div>
    )
  }

  const renderResourceList = (items: VceResource[], shared: boolean) => {
    if (loading) {
      return <p className="py-8 text-center text-sm text-muted-foreground">Loading your resources…</p>
    }
    if (filteredResources.length === 0) {
      const count = shared ? sharedResources.length : resources.length
      return (
        <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center">
          <BookOpen className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-medium">{count ? "No matching resources" : "Your library is ready"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {count ? "Try another search or section." : shared
              ? "Admin-added shared resources will appear here."
              : "Upload your VCE files above to keep them together here."}
          </p>
        </div>
      )
    }
    return (
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {items.map((resource) => {
          const Icon = resourceIcon(resource)
          const isBusy = previewLoadingId === resource.id
          return (
            <li key={resource.id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={resource.title}>{resource.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {resource.category} · {resource.subject} · {formatBytes(resource.byte_size)} · {resource.file_name}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {isPreviewable(resource.mime_type) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isBusy || Boolean(previewLoadingId)}
                    onClick={() => void openResource(resource, shared)}
                  >
                    <Eye />
                    <span className="sr-only sm:not-sr-only">View</span>
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Download ${resource.file_name}`}
                  disabled={isBusy || Boolean(previewLoadingId)}
                  onClick={() => void openResource(resource, shared, true)}
                >
                  <Download />
                </Button>
                {shared && isAdmin && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Edit ${resource.title}`}
                    onClick={() => setEditingResource({
                      resource,
                      title: resource.title,
                      subject: resource.subject,
                      category: resource.category,
                    })}
                  >
                    Edit
                  </Button>
                )}
                {(!shared || isAdmin) && (
                  <ConfirmAction
                    title="Delete this resource?"
                    description={`This permanently removes "${resource.file_name}" from ${shared ? "the shared library" : "your VCE library"}.`}
                    onConfirm={() => void deleteResource(resource, shared)}
                  >
                    {(openConfirmation) => (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${resource.file_name}`}
                        disabled={deletingId === resource.id || Boolean(deletingId)}
                        onClick={openConfirmation}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    )}
                  </ConfirmAction>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">VCE resources</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Browse and preview the VCE index here, add files to your own library, or find resources shared by the admins.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Shared: {sharedResources.length} files · {formatBytes(sharedBytes)}
          {userId ? ` · My files: ${resources.length} · ${formatBytes(personalBytes)}` : ""}
        </p>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3" role="tablist" aria-label="VCE resource sections">
        {([
          ["index", "Browse index", Folder],
          ["shared", "Shared library", LibraryBig],
          ["personal", "My uploads", UserRound],
        ] as const).map(([section, label, Icon]) => (
          <button
            key={section}
            type="button"
            role="tab"
            aria-selected={activeSection === section}
            className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
              activeSection === section ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            onClick={() => {
              setActiveSection(section)
              setError(null)
            }}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {activeSection === "index" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">VCE index</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse folders and preview PDFs and images without first saving them to your Hub storage.
              </p>
            </div>
            {isAdmin && (sourceImporting ? (
              <Button type="button" variant="outline" onClick={cancelSourceImport}>Cancel scan or import</Button>
            ) : sourcePath ? (
              <Button
                type="button"
                onClick={() => void prepareSourceImport([sourcePath])}
                disabled={sourceLoading}
              >
                <Download />
                Copy folder to shared library
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void prepareSourceImport(VCE_SOURCE_CATEGORIES.map((item) => item.path))}
              >
                <Download />
                Copy full index to shared library
              </Button>
            ))}
          </div>

          {!sourcePath ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {VCE_SOURCE_CATEGORIES.map((item) => (
                <Button
                  key={item.path}
                  type="button"
                  variant="outline"
                  className="justify-start"
                  disabled={sourceImporting || sourceLoading}
                  onClick={() => void loadSourceCatalog(item.path)}
                >
                  <Folder />
                  {item.label}
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={sourceImporting || sourceLoading}
                  onClick={() => {
                    const parentPath = sourcePath.split("/").slice(0, -1).join("/")
                    if (parentPath) void loadSourceCatalog(parentPath)
                    else {
                      setSourcePath("")
                      setSourceEntries([])
                      setSourceError(null)
                      setSourceStatus("")
                    }
                  }}
                >
                  <ChevronLeft />
                  Back
                </Button>
                <p className="min-w-0 flex-1 truncate text-sm font-medium">
                  {sourcePath.split("/").map((part) => {
                    const root = VCE_SOURCE_CATEGORIES.find((item) => item.path === part)
                    return root?.label ?? part
                  }).join(" / ")}
                </p>
              </div>
              {sourceLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading index folder…</p>
              ) : sourceEntries.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  This folder is empty or unavailable.
                </p>
              ) : (
                <ul className="max-h-[min(60dvh,600px)] divide-y divide-border overflow-auto rounded-xl border border-border bg-card">
                  {sourceEntries.map((entry) => {
                    const previewable = entry.kind === "file" && isPreviewable(entry.mimeType ?? "")
                    return (
                      <li key={entry.path} className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:px-4">
                        {entry.kind === "directory" ? (
                          <Folder className="size-4 shrink-0 text-muted-foreground" />
                        ) : entry.mimeType?.startsWith("image/") ? (
                          <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        {entry.kind === "directory" ? (
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                            disabled={sourceImporting}
                            onClick={() => void loadSourceCatalog(entry.path)}
                          >
                            {entry.name}
                          </button>
                        ) : previewable ? (
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                            onClick={() => {
                              try {
                                setPreview({
                                  fileName: entry.name,
                                  mimeType: entry.mimeType ?? "application/octet-stream",
                                  url: getAllowedDownloadUrl(entry),
                                })
                              } catch (cause) {
                                setSourceError(errorMessage(cause, "Could not open this file."))
                              }
                            }}
                          >
                            {entry.name}
                          </button>
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-sm" title={entry.name}>{entry.name}</span>
                        )}
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {entry.kind === "directory" ? "Folder" : entry.byteSize !== null ? formatBytes(entry.byteSize) : "File"}
                        </span>
                        {entry.kind === "file" && !previewable && entry.downloadUrl && (
                          <a
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm hover:bg-muted"
                            href={getAllowedDownloadUrl(entry)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open or download ${entry.name}`}
                          >
                            <Download className="size-4" />
                            <span className="sr-only sm:not-sr-only">Download</span>
                          </a>
                        )}
                        {isAdmin && entry.kind === "file" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-label={`Copy ${entry.name} to shared library`}
                            disabled={sourceImporting}
                            onClick={() => void prepareSourceImport([], [entry])}
                          >
                            <LibraryBig />
                            <span className="sr-only sm:not-sr-only">Add shared</span>
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {sourceProgress && <p role="status" className="text-sm text-muted-foreground">{sourceProgress}</p>}
          {sourceStatus && <p role="status" className="text-sm text-muted-foreground">{sourceStatus}</p>}
          {sourceError && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {sourceError}
            </p>
          )}
        </div>
      )}

      {activeSection === "shared" && (
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Shared library</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Admin-managed resources available to all signed-in active accounts.
              </p>
            </div>
          </div>
            {sharedError ? (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {sharedError}
              </p>
            ) : (
              <>
                {isAdmin && renderUploadForm(true)}
                <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                className="pl-9"
                placeholder="Search title, subject, or file name"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as ResourceCategory | "All")}
              aria-label="Filter shared resources by section"
            >
              <option value="All">All sections</option>
              {RESOURCE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
              </div>
              {renderResourceList(filteredResources, true)}
            </>
          )}
        </div>
      )}

      {activeSection === "personal" && (
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <UserRound className="mt-0.5 size-4 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">My uploads</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your private resources; other accounts cannot see them.
              </p>
            </div>
          </div>
          {renderUploadForm(false)}
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search title, subject, or file name"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as ResourceCategory | "All")}
              aria-label="Filter personal resources by section"
            >
              <option value="All">All sections</option>
              {RESOURCE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          {renderResourceList(filteredResources, false)}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${preview.fileName}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreview(null)
          }}
        >
          <div className="flex h-[min(90dvh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <p className="truncate text-sm font-medium">{preview.fileName}</p>
              <div className="flex shrink-0 gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void downloadPreview()}>
                  <Download />
                  Open or download
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Close preview" onClick={() => setPreview(null)}>
                  <X />
                </Button>
              </div>
            </div>
            {preview.mimeType === "application/pdf" ? (
              <iframe
                className="min-h-0 flex-1 bg-white"
                src={preview.url}
                title={`Preview of ${preview.fileName}`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="max-h-full max-w-full object-contain" src={preview.url} alt={preview.fileName} />
              </div>
            )}
          </div>
        </div>
      )}

      {pendingImport && (
        <dialog
          ref={importDialogRef}
          className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50"
          aria-labelledby="vce-import-title"
          aria-describedby="vce-import-description"
          onCancel={(event) => {
            event.preventDefault()
            setPendingImport(null)
          }}
          onClose={() => setPendingImport(null)}
        >
          <div className="space-y-4 p-5">
            <div>
              <h2 id="vce-import-title" className="text-lg font-semibold">Choose whole subjects to copy</h2>
              <p id="vce-import-description" className="mt-1 text-sm text-muted-foreground">
                The scan found {pendingImport.files.length.toLocaleString()} files from {pendingImport.label}; the new files to copy are estimated at {formatStorageBytes(pendingImport.estimatedBytes)}.
                {" "}Choose whole subject groups to copy into Cloudflare R2. The Hub caps shared files at 10 GB total; private uploads remain in Supabase.
                {pendingImport.unknownSizes > 0
                  ? ` ${pendingImport.unknownSizes.toLocaleString()} file size(s) are unknown; actual sizes will be checked during import, and an over-limit subject will be rolled back as a whole.`
                  : ""}
              </p>
              <p className={`mt-2 text-sm font-medium ${sourceImportSelection.estimatedBytes > Math.max(0, MAX_SHARED_VCE_STORAGE_BYTES - sharedBytes) ? "text-destructive" : "text-foreground"}`}>
                Selected: {sourceImportSelection.selected.length} subject(s), {sourceImportSelection.files.length.toLocaleString()} file(s), about {formatStorageBytes(sourceImportSelection.estimatedBytes)}.
                {" "}Remaining R2 allowance: {formatStorageBytes(Math.max(0, MAX_SHARED_VCE_STORAGE_BYTES - sharedBytes))}.
                {sourceImportSelection.estimatedBytes > Math.max(0, MAX_SHARED_VCE_STORAGE_BYTES - sharedBytes)
                  ? ` Exclude whole subjects totalling at least ${formatStorageBytes(sourceImportSelection.estimatedBytes - Math.max(0, MAX_SHARED_VCE_STORAGE_BYTES - sharedBytes))}.`
                  : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                R2 server credentials and bucket CORS must be configured before copying. Scanning this list does not upload anything.
              </p>
              <div className="mt-3 max-h-[45dvh] overflow-y-auto rounded-lg border border-border">
                {sourceImportSelection.groups.map(({ group, existingCount, pendingFiles, pendingBytes, pendingUnknownSizes, selectable }) => {
                  const included = selectable && !excludedSubjectKeys.includes(group.key)
                  return (
                    <label
                      key={group.key}
                      className="flex items-start gap-3 border-b border-border p-3 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 accent-primary"
                        checked={included}
                        disabled={!selectable || sourceImporting}
                        onChange={(event) => {
                          setExcludedSubjectKeys((current) => event.target.checked
                            ? current.filter((key) => key !== group.key)
                            : [...current, group.key])
                        }}
                        aria-label={`${included ? "Include" : "Exclude"} ${group.category} ${group.subject}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <span className="font-medium">{group.category} / {group.subject}</span>
                          <span className="text-sm text-muted-foreground">
                            {pendingFiles.length.toLocaleString()} file(s) to copy · about {formatStorageBytes(pendingBytes)}
                            {pendingUnknownSizes > 0 ? ` · ${pendingUnknownSizes} unknown size(s)` : ""}
                          </span>
                        </span>
                        {existingCount > 0 && existingCount < group.files.length && (
                          <span className="mt-1 block text-xs text-destructive">
                            {existingCount} of {group.files.length} files are already in the library; this partial group is left unchanged.
                          </span>
                        )}
                        {group.oversizedFiles.length > 0 && (
                          <span className="mt-1 block text-xs text-destructive">
                            Not selectable: at least one file is over the 10 GB shared-library per-file limit ({group.oversizedFiles.slice(0, 2).map((file) => `${file.name} (${formatStorageBytes(file.byteSize ?? 0)})`).join(", ")}).
                          </span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
              {pendingImport.unavailableFolders.length > 0 && (
                <details className="mt-2 rounded-lg border border-border p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-destructive">
                    {pendingImport.unavailableFolders.length} unavailable or recursive folders were left out
                  </summary>
                  <ul className="mt-2 max-h-[20dvh] list-disc space-y-1 overflow-y-auto pl-5 text-muted-foreground">
                    {pendingImport.unavailableFolders.map((folder, index) => (
                      <li key={`${index}-${folder}`}>{folder}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPendingImport(null)} disabled={sourceImporting}>Cancel</Button>
              <Button
                type="button"
                onClick={() => void runSourceImport(pendingImport)}
                disabled={sourceImporting || sourceImportSelection.files.length === 0 ||
                  sourceImportSelection.estimatedBytes > Math.max(0, MAX_SHARED_VCE_STORAGE_BYTES - sharedBytes)}
              >
                {sourceImporting ? "Copying…" : `Copy ${sourceImportSelection.files.length.toLocaleString()} files`}
              </Button>
            </div>
          </div>
        </dialog>
      )}

      {editingResource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-shared-resource-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingEdit) setEditingResource(null)
          }}
        >
          <div className="w-full max-w-lg space-y-4 rounded-xl border border-border bg-background p-5 shadow-xl">
            <div>
              <h2 id="edit-shared-resource-title" className="text-lg font-semibold">Edit shared resource</h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">{editingResource.resource.file_name}</p>
            </div>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Display title</span>
              <Input
                maxLength={255}
                value={editingResource.title}
                onChange={(event) => setEditingResource({ ...editingResource, title: event.target.value })}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Library section</span>
                <select
                  className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                  value={editingResource.category}
                  onChange={(event) => setEditingResource({ ...editingResource, category: event.target.value as ResourceCategory })}
                >
                  {RESOURCE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Subject</span>
                <Input
                  maxLength={80}
                  value={editingResource.subject}
                  onChange={(event) => setEditingResource({ ...editingResource, subject: event.target.value })}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={savingEdit} onClick={() => setEditingResource(null)}>Cancel</Button>
              <Button type="button" disabled={savingEdit} onClick={() => void saveResourceEdit()}>
                {savingEdit ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
