"use client"

import { useState, type FormEvent } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function LoginPanel() {
  const { error: accountError, user, signOut } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const supabase = createSupabaseBrowserClient()
    if (!supabase) return
    setPending(true)
    setMessage(null)
    setFormError(null)
    try {
      if (isSignUp) {
        const normalizedUsername = username.trim().toLowerCase()
        if (!/^[a-z0-9._-]{3,30}$/.test(normalizedUsername)) {
          throw new Error("Username must be 3–30 characters using letters, numbers, dots, underscores, or hyphens.")
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { username: normalizedUsername } },
        })
        if (error) throw error
        if (!data.session) {
          setMessage("Check your email to confirm the new account, then sign in.")
        } else {
          setMessage("Account created. Your administrator must activate your admin access.")
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      }
      setPassword("")
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not complete sign-in.")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-semibold text-primary">Productivity Hub</p>
          <h1 className="mt-2 text-2xl font-semibold">{isSignUp ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to access your private tasks, notes, calendar, and study tracker.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {isSignUp && (
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Username</span>
              <Input required minLength={3} maxLength={30} pattern="[a-zA-Z0-9._-]+" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
          )}
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Email</span>
            <Input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Password</span>
            <Input required type="password" minLength={8} autoComplete={isSignUp ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {(formError || accountError) && (
            <p role="alert" className="text-sm text-destructive">{formError ?? accountError}</p>
          )}
          {message && <p role="status" className="text-sm text-primary">{message}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
          </Button>
        </form>
        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-primary underline-offset-4 hover:underline"
          onClick={() => { setIsSignUp((value) => !value); setFormError(null); setMessage(null) }}
        >
          {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
        </button>
        {user && (
          <button
            type="button"
            className="mt-3 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => void signOut().catch((cause: unknown) => setFormError(cause instanceof Error ? cause.message : "Could not sign out."))}
          >
            Sign out of this account
          </button>
        )}
      </section>
    </main>
  )
}
