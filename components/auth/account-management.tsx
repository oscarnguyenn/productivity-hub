"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { useAuth, type UserProfile } from "@/components/auth/auth-provider"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { ConfirmAction } from "@/components/ui/confirm-action"
import { Input } from "@/components/ui/input"

export function AccountManagement() {
  const { profile } = useAuth()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) return
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from("profiles")
      .select("id,email,username,role,is_active,created_at")
      .order("created_at", { ascending: true })
    if (queryError) setError(queryError.message)
    else setUsers((data ?? []) as UserProfile[])
    setLoading(false)
  }, [])

  useEffect(() => {
    const timerId = window.setTimeout(() => void loadUsers(), 0)
    return () => window.clearTimeout(timerId)
  }, [loadUsers])

  const updateUser = async (userId: string, operation: "role" | "active", value: string | boolean) => {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) return
    setError(null)
    const functionName = operation === "role" ? "admin_set_user_role" : "admin_set_user_active"
    const args = operation === "role"
      ? { target_user_id: userId, target_role: value }
      : { target_user_id: userId, target_active: value }
    const { error: updateError } = await supabase.rpc(functionName, args)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await loadUsers()
  }

  const inviteUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), username: username.trim().toLowerCase() }),
      })
      const result: unknown = await response.json()
      if (!response.ok) {
        const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
          ? result.error
          : "Could not send account invitation."
        throw new Error(message)
      }
      setEmail("")
      setUsername("")
      setMessage("Invitation sent.")
      await loadUsers()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send account invitation.")
    } finally {
      setPending(false)
    }
  }

  if (profile?.role !== "admin") return null

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="font-semibold">Account administration</h2>
        <p className="text-sm text-muted-foreground">Invite users, change roles, and disable access. Changes are enforced by Supabase policies.</p>
      </div>
      <form onSubmit={inviteUser} className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Invite email</span>
          <Input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Username</span>
          <Input required minLength={3} maxLength={30} pattern="[a-zA-Z0-9._-]+" value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <Button type="submit" disabled={pending} className="self-end">{pending ? "Sending…" : "Invite user"}</Button>
      </form>
      {(error || message) && <p role={error ? "alert" : "status"} className={`text-sm ${error ? "text-destructive" : "text-primary"}`}>{error ?? message}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading accounts…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="px-3 py-2">Account</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Created</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((account) => (
                <tr key={account.id}>
                  <td className="px-3 py-2">
                    <p className="font-medium">{account.username}</p>
                    <p className="text-xs text-muted-foreground">{account.email}</p>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Role for ${account.username}`}
                      value={account.role}
                      disabled={account.id === profile.id}
                      onChange={(event) => void updateUser(account.id, "role", event.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <ConfirmAction
                      title={account.is_active ? "Disable account?" : "Enable account?"}
                      description={account.is_active
                        ? `Disable ${account.username}'s access to the Hub? Their saved data will remain private and intact.`
                        : `Restore ${account.username}'s access to the Hub?`}
                      confirmLabel={account.is_active ? "Disable account" : "Enable account"}
                      onConfirm={() => updateUser(account.id, "active", !account.is_active)}
                    >
                      {(openConfirmation) => (
                        <Button
                          size="sm"
                          variant={account.is_active ? "outline" : "destructive"}
                          disabled={account.id === profile.id}
                          onClick={openConfirmation}
                        >
                          {account.is_active ? "Active" : "Disabled"}
                        </Button>
                      )}
                    </ConfirmAction>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(account.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <p className="p-3 text-sm text-muted-foreground">No accounts found.</p>}
        </div>
      )}
    </section>
  )
}
