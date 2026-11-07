import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  abortVceMultipartUpload,
  checkVceBucketReady,
  completeVceMultipartUpload,
  createVceDownloadUrl,
  createVceMultipartPartUrl,
  createVceMultipartUpload,
  createVceUploadUrl,
  deleteVceObject,
  getVceObjectSize,
} from "@/lib/vce-r2"
import {
  MAX_SHARED_VCE_STORAGE_BYTES,
  MAX_SHARED_VCE_FILE_BYTES,
  MAX_VCE_SINGLE_PUT_BYTES,
  VCE_RESOURCE_CATEGORIES,
  type VceResourceCategory,
} from "@/lib/vce-resource-constants"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const R2_MULTIPART_PART_SIZE = 32 * 1024 * 1024
const MAX_MULTIPART_PARTS = 10000

interface SharedResourcePayload {
  id: string
  title: string
  subject: string
  category: VceResourceCategory
  fileName: string
  mimeType: string
  byteSize: number
  sourcePath?: string | null
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

async function getAuthorizedUser(adminOnly: boolean) {
  const supabase = await createSupabaseServerClient()
  const { data: userResult, error: userError } = await supabase.auth.getUser()
  if (userError) throw new Error(userError.message)
  if (!userResult.user) return { response: jsonError("Sign in to access shared VCE resources.", 401) }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", userResult.user.id)
    .maybeSingle()
  if (profileError) throw new Error(profileError.message)
  if (!profile?.is_active) return { response: jsonError("An active account is required.", 403) }
  if (adminOnly && profile.role !== "admin") {
    return { response: jsonError("Administrator access is required.", 403) }
  }
  return { supabase, user: userResult.user }
}

function isResourcePayload(value: unknown): value is SharedResourcePayload {
  if (!value || typeof value !== "object") return false
  const payload = value as Record<string, unknown>
  return typeof payload.id === "string" &&
    UUID_PATTERN.test(payload.id) &&
    typeof payload.title === "string" &&
    payload.title.trim().length > 0 &&
    payload.title.length <= 255 &&
    typeof payload.subject === "string" &&
    payload.subject.trim().length > 0 &&
    payload.subject.length <= 80 &&
    typeof payload.category === "string" &&
    VCE_RESOURCE_CATEGORIES.includes(payload.category as VceResourceCategory) &&
    typeof payload.fileName === "string" &&
    payload.fileName.length > 0 &&
    payload.fileName.length <= 255 &&
    typeof payload.mimeType === "string" &&
    payload.mimeType.length > 0 &&
    payload.mimeType.length <= 255 &&
    typeof payload.byteSize === "number" &&
    Number.isInteger(payload.byteSize) &&
    payload.byteSize >= 0 &&
    payload.byteSize <= MAX_SHARED_VCE_FILE_BYTES &&
    (payload.sourcePath === undefined || payload.sourcePath === null ||
      (typeof payload.sourcePath === "string" && payload.sourcePath.length <= 2048))
}

export async function GET(request: NextRequest) {
  try {
    const readyCheck = request.nextUrl.searchParams.get("ready") === "1"
    const access = await getAuthorizedUser(readyCheck)
    if ("response" in access) return access.response
    if (readyCheck) {
      await checkVceBucketReady()
      return NextResponse.json({ ready: true }, { headers: { "Cache-Control": "private, no-store" } })
    }

    const id = request.nextUrl.searchParams.get("id") ?? ""
    if (!UUID_PATTERN.test(id)) return jsonError("A valid resource ID is required.", 400)

    const { data: resource, error } = await access.supabase
      .from("vce_shared_resources")
      .select("storage_path,file_name")
      .eq("id", id)
      .maybeSingle()
    if (error) return jsonError(error.message, 500)
    if (!resource) return jsonError("This shared resource is unavailable.", 404)

    const url = await createVceDownloadUrl(
      resource.storage_path,
      resource.file_name,
      request.nextUrl.searchParams.get("download") === "1"
    )
    return NextResponse.json({ url }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (cause) {
    return jsonError(cause instanceof Error ? cause.message : "Could not open this shared resource.", 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await getAuthorizedUser(true)
    if ("response" in access) return access.response

    const body: unknown = await request.json()
    if (body && typeof body === "object" && "operation" in body &&
        body.operation === "sign-parts") {
      const requestBody = body as { id?: unknown; uploadId?: unknown; partNumbers?: unknown }
      if (typeof requestBody.id !== "string" || !UUID_PATTERN.test(requestBody.id) ||
          typeof requestBody.uploadId !== "string" || requestBody.uploadId.length === 0 ||
          requestBody.uploadId.length > 1024 || !Array.isArray(requestBody.partNumbers) ||
          requestBody.partNumbers.length === 0 || requestBody.partNumbers.length > MAX_MULTIPART_PARTS ||
          !requestBody.partNumbers.every((part) =>
            typeof part === "number" && Number.isInteger(part) && part >= 1 && part <= MAX_MULTIPART_PARTS
          )) {
        return jsonError("The multipart upload request is invalid.", 400)
      }

      const key = `shared/${requestBody.id}`
      const urls = await Promise.all(requestBody.partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await createVceMultipartPartUrl(key, requestBody.uploadId as string, partNumber as number),
      })))
      return NextResponse.json({ urls }, { headers: { "Cache-Control": "private, no-store" } })
    }

    if (!isResourcePayload(body)) return jsonError("The shared resource metadata is invalid.", 400)
    if (body.mimeType.toLowerCase().startsWith("text/html")) {
      return jsonError("HTML files cannot be added to the shared library.", 400)
    }

    const { data: usedBytes, error: usageError } = await access.supabase.rpc("vce_shared_storage_bytes")
    if (usageError) {
      return jsonError(`Could not check the shared storage limit: ${usageError.message}`, 500)
    }
    if (Number(usedBytes) + body.byteSize > MAX_SHARED_VCE_STORAGE_BYTES) {
      return jsonError("This file would exceed the 10 GB shared-library storage limit.", 409)
    }

    const storagePath = `shared/${body.id}`
    if (body.byteSize > MAX_VCE_SINGLE_PUT_BYTES) {
      const uploadId = await createVceMultipartUpload(storagePath, body.mimeType)
      return NextResponse.json({
        multipart: true,
        uploadId,
        partSize: R2_MULTIPART_PART_SIZE,
        storagePath,
      }, { headers: { "Cache-Control": "private, no-store" } })
    }
    const url = await createVceUploadUrl(storagePath, body.mimeType)
    return NextResponse.json({ multipart: false, url, storagePath }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (cause) {
    return jsonError(cause instanceof Error ? cause.message : "Could not prepare the R2 upload.", 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const access = await getAuthorizedUser(true)
    if ("response" in access) return access.response

    const body: unknown = await request.json()
    if (!body || typeof body !== "object" || !("metadata" in body)) {
      return jsonError("The shared resource upload completion is invalid.", 400)
    }
    const requestBody = body as { metadata: unknown; uploadId?: unknown; parts?: unknown }
    if (!isResourcePayload(requestBody.metadata)) return jsonError("The shared resource metadata is invalid.", 400)
    const metadata = requestBody.metadata
    const storagePath = `shared/${metadata.id}`
    if (requestBody.uploadId !== undefined) {
      if (typeof requestBody.uploadId !== "string" || requestBody.uploadId.length === 0 ||
          requestBody.uploadId.length > 1024 || !Array.isArray(requestBody.parts) ||
          requestBody.parts.length === 0 || requestBody.parts.length > MAX_MULTIPART_PARTS ||
          !requestBody.parts.every((part) => part && typeof part === "object" &&
            "PartNumber" in part && typeof part.PartNumber === "number" &&
            Number.isInteger(part.PartNumber) && part.PartNumber >= 1 &&
            "ETag" in part && typeof part.ETag === "string" && part.ETag.length > 0)) {
        return jsonError("The multipart completion request is invalid.", 400)
      }
      try {
        await completeVceMultipartUpload(
          storagePath,
          requestBody.uploadId,
          requestBody.parts as { PartNumber: number; ETag: string }[]
        )
      } catch (cause) {
        try {
          await abortVceMultipartUpload(storagePath, requestBody.uploadId)
        } catch {
          // Return the completion error; cleanup is retried by the client.
        }
        return jsonError(cause instanceof Error ? cause.message : "Could not complete the R2 multipart upload.", 500)
      }
    }
    const actualSize = await getVceObjectSize(storagePath)
    if (actualSize === null || actualSize !== metadata.byteSize) {
      await deleteVceObject(storagePath)
      return jsonError("The uploaded file size did not match its catalog metadata.", 422)
    }

    const { error } = await access.supabase.from("vce_shared_resources").insert({
      id: metadata.id,
      created_by: access.user.id,
      title: metadata.title.trim(),
      subject: metadata.subject.trim(),
      category: metadata.category,
      file_name: metadata.fileName,
      mime_type: metadata.mimeType,
      byte_size: metadata.byteSize,
      storage_path: storagePath,
      source_path: metadata.sourcePath ?? null,
    })
    if (error) {
      await deleteVceObject(storagePath)
      return jsonError(error.message, 409)
    }
    return NextResponse.json({ ok: true })
  } catch (cause) {
    return jsonError(cause instanceof Error ? cause.message : "Could not save the shared resource.", 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await getAuthorizedUser(true)
    if ("response" in access) return access.response

    const body: unknown = await request.json()
    if (!body || typeof body !== "object") return jsonError("The delete request is invalid.", 400)
    const payload = body as { ids?: unknown; storagePaths?: unknown; multipartUploads?: unknown }
    const ids = Array.isArray(payload.ids) ? payload.ids : []
    const storagePaths = Array.isArray(payload.storagePaths) ? payload.storagePaths : []
    const multipartUploads = Array.isArray(payload.multipartUploads) ? payload.multipartUploads : []
    if (!ids.every((id) => typeof id === "string" && UUID_PATTERN.test(id)) ||
        !storagePaths.every((path) => typeof path === "string" && /^shared\/[0-9a-f-]{36}$/i.test(path)) ||
        !multipartUploads.every((upload) => upload && typeof upload === "object" &&
          "id" in upload && typeof upload.id === "string" && UUID_PATTERN.test(upload.id) &&
          "uploadId" in upload && typeof upload.uploadId === "string" &&
          upload.uploadId.length > 0 && upload.uploadId.length <= 1024) ||
        (ids.length === 0 && storagePaths.length === 0 && multipartUploads.length === 0)) {
      return jsonError("The delete request contains invalid resource identifiers.", 400)
    }

    for (const upload of multipartUploads as { id: string; uploadId: string }[]) {
      await abortVceMultipartUpload(`shared/${upload.id}`, upload.uploadId)
    }
    const paths = new Set<string>(storagePaths as string[])
    if (ids.length > 0) {
      const { data, error } = await access.supabase
        .from("vce_shared_resources")
        .select("id,storage_path")
        .in("id", ids as string[])
      if (error) return jsonError(error.message, 500)
      for (const row of data ?? []) paths.add(row.storage_path)
    }

    for (const path of paths) await deleteVceObject(path)
    if (ids.length > 0) {
      const { error } = await access.supabase
        .from("vce_shared_resources")
        .delete()
        .in("id", ids as string[])
      if (error) return jsonError(error.message, 500)
    }
    return NextResponse.json({ ok: true })
  } catch (cause) {
    return jsonError(cause instanceof Error ? cause.message : "Could not remove the shared resource.", 500)
  }
}
