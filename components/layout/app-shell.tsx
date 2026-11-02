"use client"

import { useEffect, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Menu, X } from "lucide-react"
import { AuthProvider, useAuth } from "@/components/auth/auth-provider"
import { LoginPanel } from "@/components/auth/login-panel"
import { Button } from "@/components/ui/button"
import { Sidebar } from "@/components/layout/sidebar"
import { applyAppearance, getStoredColorTheme, type ThemeMode } from "@/lib/theme"

function LoadingScreen() {
  return <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">Loading your account…</div>
}

function AppContent({ children }: { children: ReactNode }) {
  const { configured, loading, user, profile, error, signOut } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  useEffect(() => {
    const storedMode = window.localStorage.getItem("theme")
    const mode: ThemeMode =
      storedMode === "light" || storedMode === "dark" || storedMode === "system"
        ? storedMode
        : "system"
    applyAppearance(mode, getStoredColorTheme())

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const updateSystemTheme = () => {
      if (mode === "system") applyAppearance("system", getStoredColorTheme())
    }
    mediaQuery.addEventListener("change", updateSystemTheme)
    return () => mediaQuery.removeEventListener("change", updateSystemTheme)
  }, [])

  useEffect(() => {
    if (configured && user && profile?.is_active && pathname === "/login") {
      router.replace("/")
    }
  }, [configured, pathname, profile?.is_active, router, user])

  if (loading) return <LoadingScreen />

  if (!configured && process.env.NODE_ENV !== "development") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-4">
        <section className="max-w-lg rounded-xl border border-border bg-card p-6">
          <h1 className="text-xl font-semibold">Account setup required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Authentication is not enabled. Configure the Supabase public URL and publishable key, then apply the migration described in <code>SUPABASE_SETUP.md</code>.
          </p>
        </section>
      </main>
    )
  }

  if (configured && (!user || !profile)) return <LoginPanel />

  if (configured && profile && !profile.is_active) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-4">
        <section className="max-w-lg rounded-xl border border-border bg-card p-6">
          <h1 className="text-xl font-semibold">Account disabled</h1>
          <p className="mt-2 text-sm text-muted-foreground">An administrator has disabled access to this account.</p>
          <Button className="mt-4" onClick={() => void signOut()}>Sign out</Button>
        </section>
      </main>
    )
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/20"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-50 h-full w-60 shadow-sm">
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b border-border px-4 md:justify-end md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X /> : <Menu />}
            </Button>
            <span className="text-sm font-medium">Hub</span>
          </div>
          <div className="flex items-center gap-3">
            {profile ? <span className="hidden text-sm text-muted-foreground sm:inline">{profile.username}</span> : null}
            {configured ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSignOutError(null)
                  void signOut().catch((cause: unknown) => setSignOutError(cause instanceof Error ? cause.message : "Could not sign out."))
                }}
              >
                Sign out
              </Button>
            ) : null}
          </div>
        </header>
        {(signOutError || (configured && error)) && (
          <p role="alert" className="px-6 pt-3 text-sm text-destructive">{signOutError ?? error}</p>
        )}
        {!configured && (
          <p role="status" className="mx-4 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200 md:mx-6">
            Local preview only — Supabase is not configured, so authentication and cross-device sync are unavailable.
          </p>
        )}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AppContent>{children}</AppContent>
    </AuthProvider>
  )
}
