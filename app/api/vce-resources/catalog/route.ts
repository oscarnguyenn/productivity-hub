import { NextResponse, type NextRequest } from "next/server"
import { getVceSourceListing, VceSourceError } from "@/lib/vce-source"

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path") ?? ""
  try {
    const entries = await getVceSourceListing(path)
    return NextResponse.json({
      path,
      entries: entries.map((entry) => ({
        name: entry.name,
        path: entry.path,
        kind: entry.kind,
        byteSize: entry.byteSize,
        mimeType: entry.mimeType,
        ...(entry.downloadUrl ? { downloadUrl: entry.downloadUrl } : {}),
      })),
    })
  } catch (cause) {
    if (cause instanceof VceSourceError) {
      return NextResponse.json({ error: cause.message }, { status: cause.status })
    }
    return NextResponse.json({ error: "Could not load this VCE index folder." }, { status: 500 })
  }
}
