"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { saveUserData } from "@/lib/user-data"
import type { FileNode } from "@/lib/types"
import { NOTES_STORAGE_KEY } from "@/lib/notes/tree"

export type SaveStatus = "saved" | "dirty" | "saving" | "error"

const SAVE_DELAY_MS = 800
const RETRY_DELAY_MS = 10_000

// Debounced persistence. "saved" is only reported after saveUserData has resolved for the latest edit.
export function useNotesAutosave(files: FileNode[], enabled: boolean) {
  const [status, setStatus] = useState<SaveStatus>("saved")
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const filesRef = useRef(files)
  const savedRef = useRef<FileNode[] | null>(null)
  const savingRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    filesRef.current = files
  }, [files])

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }

  const saveRef = useRef<() => Promise<void>>(async () => {})

  const save = useCallback(async (): Promise<void> => {
    clearTimer()
    if (savingRef.current) return
    const snapshot = filesRef.current
    if (snapshot === savedRef.current) return
    savingRef.current = true
    if (mountedRef.current) setStatus("saving")
    try {
      await saveUserData(NOTES_STORAGE_KEY, snapshot)
      savedRef.current = snapshot
      if (!mountedRef.current) return
      setError(null)
      setSavedAt(new Date())
      if (filesRef.current === snapshot) {
        setStatus("saved")
      } else {
        setStatus("dirty")
        timerRef.current = window.setTimeout(() => void saveRef.current(), SAVE_DELAY_MS)
      }
    } catch (caught) {
      if (!mountedRef.current) return
      setError(caught instanceof Error ? caught.message : "Could not save notes.")
      setStatus("error")
      timerRef.current = window.setTimeout(() => void saveRef.current(), RETRY_DELAY_MS)
    } finally {
      savingRef.current = false
    }
  }, [])

  useEffect(() => {
    saveRef.current = save
  }, [save])

  useEffect(() => {
    if (enabled && savedRef.current === null) savedRef.current = filesRef.current
  }, [enabled])

  useEffect(() => {
    if (!enabled || savedRef.current === null || files === savedRef.current) return
    clearTimer()
    setStatus((current) => (current === "error" ? current : "dirty"))
    timerRef.current = window.setTimeout(() => void save(), SAVE_DELAY_MS)
    return clearTimer
  }, [files, enabled, save])

  useEffect(() => {
    mountedRef.current = true
    const flush = () => {
      if (filesRef.current !== savedRef.current && savedRef.current !== null) void save()
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (savedRef.current === null || (filesRef.current === savedRef.current && !savingRef.current)) return
      flush()
      event.preventDefault()
      event.returnValue = ""
    }
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flush()
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", handleVisibility)
      flush()
      mountedRef.current = false
      clearTimer()
    }
  }, [save])

  return { status, error, savedAt, retry: save }
}
