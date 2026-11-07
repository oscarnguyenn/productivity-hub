import "server-only"

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const R2_URL_EXPIRY_SECONDS = 900
const R2_MULTIPART_URL_EXPIRY_SECONDS = 21600

let client: S3Client | null = null

function getR2Configuration() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  const bucket = process.env.CLOUDFLARE_R2_BUCKET
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Cloudflare R2 is not configured. Set the R2 account ID, access key, secret key, and bucket name on the server."
    )
  }
  return { accountId, accessKeyId, secretAccessKey, bucket }
}

function getR2Client(): S3Client {
  if (client) return client
  const { accountId, accessKeyId, secretAccessKey } = getR2Configuration()
  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
  return client
}

export async function createVceUploadUrl(key: string, mimeType: string): Promise<string> {
  const { bucket } = getR2Configuration()
  return getSignedUrl(
    getR2Client(),
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mimeType }),
    { expiresIn: R2_URL_EXPIRY_SECONDS }
  )
}

export async function createVceMultipartUpload(key: string, mimeType: string): Promise<string> {
  const { bucket } = getR2Configuration()
  const result = await getR2Client().send(
    new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: mimeType })
  )
  if (!result.UploadId) throw new Error("Cloudflare R2 did not create a multipart upload.")
  return result.UploadId
}

export async function createVceMultipartPartUrl(
  key: string,
  uploadId: string,
  partNumber: number
): Promise<string> {
  const { bucket } = getR2Configuration()
  return getSignedUrl(
    getR2Client(),
    new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: R2_MULTIPART_URL_EXPIRY_SECONDS }
  )
}

export async function completeVceMultipartUpload(
  key: string,
  uploadId: string,
  parts: CompletedPart[]
): Promise<void> {
  const { bucket } = getR2Configuration()
  await getR2Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    })
  )
}

export async function abortVceMultipartUpload(key: string, uploadId: string): Promise<void> {
  const { bucket } = getR2Configuration()
  try {
    await getR2Client().send(
      new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId })
    )
  } catch (cause) {
    if (cause && typeof cause === "object" && "name" in cause && cause.name === "NoSuchUpload") return
    throw cause
  }
}

export async function checkVceBucketReady(): Promise<void> {
  const { bucket } = getR2Configuration()
  await getR2Client().send(new HeadBucketCommand({ Bucket: bucket }))
}

export async function createVceDownloadUrl(
  key: string,
  fileName: string,
  download: boolean
): Promise<string> {
  const { bucket } = getR2Configuration()
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(download ? {
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    } : {}),
  })
  return getSignedUrl(getR2Client(), command, { expiresIn: R2_URL_EXPIRY_SECONDS })
}

export async function getVceObjectSize(key: string): Promise<number | null> {
  const { bucket } = getR2Configuration()
  const result = await getR2Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  return result.ContentLength ?? null
}

export async function deleteVceObject(key: string): Promise<void> {
  const { bucket } = getR2Configuration()
  await getR2Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}
