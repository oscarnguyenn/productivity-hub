"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { User, SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client"

export interface UserProfile {
  id: string
  email: string
  username: string
  role: "user" | "admin"
  is_active: boolean
  created_at: string
}

interface AuthContextValue {
  configured: boolean
  loading: boolean
  user: User | null
  profile: UserProfile | null
  error: string | null
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState<string | null>(null)
  const configured = isSupabaseConfigured()

  const fetchProfile = useCallback(async (client: SupabaseClient, currentUser: User) => {
    const { data, error: profileError } = await client
      .from("profiles")
      .select("id,email,username,role,is_active,created_at")
      .eq("id", currentUser.id)
      .maybeSingle()
    if (profileError) throw profileError
    if (!data) throw new Error("Your account profile is missing. Contact the administrator.")
    setUser(currentUser)
    setProfile(data as UserProfile)
    setError(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    const client = createSupabaseBrowserClient()
    if (!client) return
    setLoading(true)
    try {
      const { data, error: sessionError } = await client.auth.getSession()
      if (sessionError) throw sessionError
      if (!data.session) {
        setUser(null)
        setProfile(null)
        setError(null)
      } else {
        await fetchProfile(client, data.session.user)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your account.")
    } finally {
      setLoading(false)
    }
  }, [fetchProfile])

  useEffect(() => {
    const client = createSupabaseBrowserClient()
    if (!client) return
    let active = true
    const loadCurrentUser = async () => {
      try {
        const { data, error: sessionError } = await client.auth.getSession()
        if (sessionError) throw sessionError
        if (data.session) {
          setUser(data.session.user)
          await fetchProfile(client, data.session.user)
        }
        else {
          setUser(null)
          setProfile(null)
          setError(null)
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load your account.")
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadCurrentUser()

    const { data: authListener } = client.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null)
        setProfile(null)
        setError(null)
        setLoading(false)
        return
      }
      setUser(session.user)
      setError(null)
      window.setTimeout(() => {
        if (active) void fetchProfile(client, session.user).catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : "Could not load your account.")
          setLoading(false)
        })
      }, 0)
    })
    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signOut = useCallback(async () => {
    const client = createSupabaseBrowserClient()
    if (!client) return
    const { error: signOutError } = await client.auth.signOut()
    if (signOutError) throw signOutError
    setUser(null)
    setProfile(null)
  }, [])

  const value = useMemo(() => ({
    configured,
    loading,
    user,
    profile,
    error,
    refreshProfile,
    signOut,
  }), [configured, error, loading, profile, refreshProfile, signOut, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider.")
  return context
}
