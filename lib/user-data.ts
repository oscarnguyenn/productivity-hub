import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client"

const LEGACY_OWNER_KEY = "productivity-hub-legacy-data-owner"

export async function loadUserData<T = unknown>(key: string): Promise<T | null> {
  if (!isSupabaseConfigured()) {
    const saved = window.localStorage.getItem(key)
    return saved === null ? null : JSON.parse(saved) as T
  }

  const supabase = createSupabaseBrowserClient()
  if (!supabase) throw new Error("Supabase client is unavailable.")
  const { data: userResult, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!userResult.user) throw new Error("Sign in to load your data.")

  const { data, error } = await supabase
    .from("user_data")
    .select("payload")
    .eq("key", key)
    .maybeSingle()
  if (error) throw error
  if (data) return data.payload as T

  let legacyOwner = window.localStorage.getItem(LEGACY_OWNER_KEY)
  if (legacyOwner === null) {
    window.localStorage.setItem(LEGACY_OWNER_KEY, userResult.user.id)
    legacyOwner = userResult.user.id
  }
  if (legacyOwner !== userResult.user.id) return null

  const legacyValue = window.localStorage.getItem(key)
  if (legacyValue === null) return null
  const parsed = JSON.parse(legacyValue) as T
  await saveUserData(key, parsed)
  window.localStorage.removeItem(key)
  return parsed
}

export async function saveUserData(key: string, value: unknown): Promise<void> {
  if (!isSupabaseConfigured()) {
    window.localStorage.setItem(key, JSON.stringify(value))
    return
  }

  const supabase = createSupabaseBrowserClient()
  if (!supabase) throw new Error("Supabase client is unavailable.")
  const { data: userResult, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!userResult.user) throw new Error("Sign in to save your data.")

  const { error } = await supabase
    .from("user_data")
    .upsert(
      { user_id: userResult.user.id, key, payload: value },
      { onConflict: "user_id,key" }
    )
  if (error) throw error
}

export async function removeUserData(key: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    window.localStorage.removeItem(key)
    return
  }

  const supabase = createSupabaseBrowserClient()
  if (!supabase) throw new Error("Supabase client is unavailable.")
  const { data: userResult, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!userResult.user) throw new Error("Sign in to remove your data.")

  const { error } = await supabase.from("user_data").delete().eq("key", key)
  if (error) throw error
}
