import { createClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return NextResponse.json({ error: "Invitation request is too large." }, { status: 413 })
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !url) {
    return NextResponse.json({ error: "Admin invitations are not configured on the server." }, { status: 503 })
  }

  const supabase = await createSupabaseServerClient()
  const { data: claims, error: claimsError } = await supabase.auth.getClaims()
  if (claimsError || !claims?.claims?.sub) {
    return NextResponse.json({ error: "Sign in to manage accounts." }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", claims.claims.sub)
    .maybeSingle()
  if (profileError) {
    return NextResponse.json({ error: "Could not verify administrator permissions." }, { status: 500 })
  }
  if (!profile || profile.role !== "admin" || !profile.is_active) {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }
  if (!body || typeof body !== "object" || !("email" in body) || !("username" in body) ||
      typeof body.email !== "string" || typeof body.username !== "string") {
    return NextResponse.json({ error: "Email and username are required." }, { status: 400 })
  }

  const email = body.email.trim().toLowerCase()
  const username = body.username.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  }
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    return NextResponse.json({ error: "Username must be 3-30 characters and use lowercase letters, numbers, dots, underscores, or hyphens." }, { status: 400 })
  }

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { username },
    redirectTo: new URL("/login", request.url).toString(),
  })
  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 })
  }
  return NextResponse.json({ invited: true }, { status: 201 })
}
