import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  if (pathname === "/api/vce-resources/catalog") {
    return NextResponse.next({ request })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return NextResponse.next({ request })

  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
      },
    },
  })

  const { data: claims } = await supabase.auth.getClaims()
  const isLoginPage = request.nextUrl.pathname === "/login"

  if (!claims?.claims && !isLoginPage) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    loginUrl.search = ""
    const redirect = NextResponse.redirect(loginUrl)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(header)
      if (value) redirect.headers.set(header, value)
    }
    return redirect
  }

  if (claims?.claims && isLoginPage) {
    const homeUrl = request.nextUrl.clone()
    homeUrl.pathname = "/"
    homeUrl.search = ""
    const redirect = NextResponse.redirect(homeUrl)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(header)
      if (value) redirect.headers.set(header, value)
    }
    return redirect
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
