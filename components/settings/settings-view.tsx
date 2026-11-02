"use client"

import { useState, useEffect } from "react"
import {
  User,
  Palette,
  LayoutDashboard,
  Bell,
  Database,
  Shield,
  Key,
  Moon,
  Sun,
  Monitor,
  Save,
  RotateCcw,
  Trash2,
  Download,
  Upload,
  ChevronUp,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmAction } from "@/components/ui/confirm-action"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { AccountManagement } from "@/components/auth/account-management"
import { useAuth } from "@/components/auth/auth-provider"
import type { UserProfile, WidgetLayoutItem } from "@/lib/types"
import { defaultWidgetLayout, widgetMeta } from "@/lib/dashboard-layout"
import { applyAppearance, colorThemes, getStoredColorTheme, type ColorTheme, type ThemeMode } from "@/lib/theme"
import { loadUserData, saveUserData } from "@/lib/user-data"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

const BACKUP_DATA_KEYS = [
  "productivity-hub-tasks-v1",
  "productivity-hub-calendar-events-v1",
  "productivity-hub-notes-files-v1",
  "productivity-hub-goals-v1",
  "productivity-hub-projects-v1",
  "productivity-hub-habits-v1",
  "productivity-hub-sac-tracker-v1",
] as const
const EMPTY_BACKUP_DATA = {
  "productivity-hub-tasks-v1": [],
  "productivity-hub-calendar-events-v1": [],
  "productivity-hub-notes-files-v1": [],
  "productivity-hub-goals-v1": [],
  "productivity-hub-projects-v1": [],
  "productivity-hub-habits-v1": [],
  "productivity-hub-sac-tracker-v1": {
    subjects: [],
    sessions: [],
    timer: { subjectId: null, intention: "", mode: "stopwatch", goalMinutes: 25, elapsedSeconds: 0, startedAt: null, sessionStartedAt: null },
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function getInitialTheme(): ThemeMode {
  if (typeof window !== "undefined") {
    return (localStorage.getItem("theme") as "light" | "dark" | "system" | null) || "system"
  }
  return "system"
}

export function SettingsView({
  user: initialUser,
  layout: initialLayout,
  onUpdateUser,
  onUpdateLayout,
}: {
  user: UserProfile
  layout: WidgetLayoutItem[]
  onUpdateUser?: (user: Partial<UserProfile>) => void
  onUpdateLayout?: (layout: WidgetLayoutItem[]) => void
}) {
  const { profile: authProfile, configured } = useAuth()
  const [user, setUser] = useState(initialUser)
  const [layout, setLayout] = useState(initialLayout)
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [colorTheme, setColorTheme] = useState<ColorTheme>(getStoredColorTheme)
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    reminders: true,
    weeklyDigest: false,
  })
  const [activeTab, setActiveTab] = useState<"profile" | "appearance" | "dashboard" | "notifications" | "data" | "security">("profile")
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [dataStatus, setDataStatus] = useState<string | null>(null)

  useEffect(() => {
    applyAppearance(theme, colorTheme)
    localStorage.setItem("theme", theme)
    localStorage.setItem("color-theme", colorTheme)
  }, [theme, colorTheme])

  const handleSaveProfile = () => {
    setSaveStatus("saving")
    onUpdateUser?.(user)
    setTimeout(() => setSaveStatus("saved"), 500)
    setTimeout(() => setSaveStatus("idle"), 2000)
  }

  const handleResetLayout = () => {
    setLayout(defaultWidgetLayout)
    onUpdateLayout?.(defaultWidgetLayout)
  }

  const handleSaveLayout = () => {
    setSaveStatus("saving")
    onUpdateLayout?.(layout)
    setTimeout(() => setSaveStatus("saved"), 500)
    setTimeout(() => setSaveStatus("idle"), 2000)
  }

  const handleExportData = async () => {
    try {
      const modules = await Promise.all(BACKUP_DATA_KEYS.map(async (key) => [
        key,
        await loadUserData(key) ?? EMPTY_BACKUP_DATA[key],
      ] as const))
      const data = {
        format: "productivity-hub-backup",
        version: 3,
        user: { name: user.name },
        layout,
        theme,
        colorTheme,
        notifications,
        modules: Object.fromEntries(modules),
        exportedAt: new Date().toISOString(),
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `productivity-hub-backup-${new Date().toISOString().split("T")[0]}.json`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setDataStatus("Backup downloaded.")
    } catch (error) {
      setDataStatus(error instanceof Error ? error.message : "Could not export your data.")
    }
  }

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 30 * 1024 * 1024) {
      setDataStatus("Backup must be 30 MB or smaller.")
      event.target.value = ""
      return
    }
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const data: unknown = JSON.parse(String(e.target?.result ?? ""))
        if (!isRecord(data)) throw new Error("This file is not a valid Productivity Hub backup.")
        if (data.modules !== undefined) {
          const moduleData = data.modules
          const legacyKeys = BACKUP_DATA_KEYS.filter((key) =>
            key !== "productivity-hub-projects-v1" && key !== "productivity-hub-habits-v1"
          )
          if (!isRecord(moduleData) || !legacyKeys.every((key) => key in moduleData)) {
            throw new Error("Backup must include tasks, calendar, notes, goals, and study tracker data.")
          }
          if (Object.keys(moduleData).some((key) => !BACKUP_DATA_KEYS.includes(key as typeof BACKUP_DATA_KEYS[number]))) {
            throw new Error("Backup contains unsupported data sections.")
          }
          const modules = { ...EMPTY_BACKUP_DATA, ...moduleData }
          for (const key of BACKUP_DATA_KEYS.slice(0, -1)) {
            if (!Array.isArray(modules[key])) throw new Error(`Backup section ${key} is invalid.`)
          }
          const studyData = modules["productivity-hub-sac-tracker-v1"]
          if (!isRecord(studyData) || !Array.isArray(studyData.subjects) || !Array.isArray(studyData.sessions) || !isRecord(studyData.timer)) {
            throw new Error("Backup study tracker data is invalid.")
          }
          if (configured) {
            const supabase = createSupabaseBrowserClient()
            if (!supabase) throw new Error("Supabase client is unavailable.")
            const { error } = await supabase.rpc("restore_user_data", { backup: modules })
            if (error) throw error
          } else {
            for (const key of BACKUP_DATA_KEYS) await saveUserData(key, modules[key])
          }
        }
        const importedUser = data.user
        if (isRecord(importedUser) && typeof importedUser.name === "string") {
          setUser((current) => ({ ...current, name: importedUser.name as string }))
        }
        if (Array.isArray(data.layout)) setLayout(data.layout as WidgetLayoutItem[])
        if (data.theme === "light" || data.theme === "dark" || data.theme === "system") setTheme(data.theme)
        if (typeof data.colorTheme === "string" && colorThemes.some((item) => item.id === data.colorTheme)) setColorTheme(data.colorTheme as ColorTheme)
        if (isRecord(data.notifications)) setNotifications((current) => ({ ...current, ...data.notifications as Partial<typeof current> }))
        setDataStatus("Backup imported. Reload the page to refresh your data.")
      } catch (error) {
        setDataStatus(error instanceof Error ? `Import failed: ${error.message}` : "Import failed. Check the file format and your account permissions, then try again.")
      }
    }
    reader.onerror = () => setDataStatus("Could not read the selected backup file.")
    reader.readAsText(file)
    event.target.value = ""
  }

  const handleClearLocalData = async () => {
    try {
      await Promise.all(BACKUP_DATA_KEYS.map((key) => saveUserData(key, EMPTY_BACKUP_DATA[key])))
      BACKUP_DATA_KEYS.forEach((key) => window.localStorage.removeItem(key))
      for (const key of [
      "theme",
      "color-theme",
      ]) window.localStorage.removeItem(key)
      window.location.reload()
    } catch (error) {
      setDataStatus(error instanceof Error ? error.message : "Could not clear saved data.")
    }
  }

  const tabs = [
    { id: "profile", label: "Profile", icon: <User className="size-4" /> },
    { id: "appearance", label: "Appearance", icon: <Palette className="size-4" /> },
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="size-4" /> },
    { id: "notifications", label: "Notifications", icon: <Bell className="size-4" /> },
    { id: "data", label: "Data", icon: <Database className="size-4" /> },
    { id: "security", label: "Security", icon: <Shield className="size-4" /> },
  ] as const

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account, preferences, and data
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="lg:w-48 flex-shrink-0">
          <nav className="space-y-1 rounded-xl border border-border bg-card p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeTab === "profile" && (
            <SettingsSection title="Profile" description="Update your personal information">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <Input
                      value={user.name}
                      onChange={(e) => setUser((u) => ({ ...u, name: e.target.value }))}
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Account role</label>
                    <p className="flex h-8 items-center rounded-md border border-input bg-muted px-2.5 text-sm" aria-label="Account role">
                      {authProfile?.role === "admin" ? "Administrator" : configured ? "User" : user.role}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSaveProfile} disabled={saveStatus === "saving"}>
                    {saveStatus === "saving" && <RotateCcw className="size-4 mr-2 animate-spin" />}
                    {saveStatus === "saved" ? (
                      <>
                        <Save className="size-4 mr-2" />
                        Saved
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
              </div>
            </SettingsSection>
          )}

          {activeTab === "appearance" && (
            <div className="space-y-6">
              <SettingsSection title="Theme" description="Choose your preferred color scheme">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    { value: "light", label: "Light", icon: <Sun className="size-5" />, desc: "Always use light mode" },
                    { value: "dark", label: "Dark", icon: <Moon className="size-5" />, desc: "Always use dark mode" },
                    { value: "system", label: "System", icon: <Monitor className="size-5" />, desc: "Match system preference" },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTheme(option.value)}
                      className={cn(
                        "p-4 rounded-xl border-2 transition-all text-left",
                        theme === option.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg bg-muted", theme === option.value && "bg-primary/10")}>
                          {option.icon}
                        </div>
                        <div>
                          <p className="font-medium">{option.label}</p>
                          <p className="text-xs text-muted-foreground">{option.desc}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </SettingsSection>

              <SettingsSection title="Color palette" description="Choose an accent palette for the entire workspace">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {colorThemes.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={colorTheme === option.id}
                      onClick={() => setColorTheme(option.id)}
                      className={cn(
                        "rounded-xl border-2 p-3 text-left transition-colors",
                        colorTheme === option.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <span className="mb-3 flex gap-1.5" aria-hidden="true">
                        {option.colors.map((color) => (
                          <span key={color} className="size-6 rounded-full border border-black/10" style={{ backgroundColor: color }} />
                        ))}
                      </span>
                      <span className="block text-sm font-medium">{option.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>
                    </button>
                  ))}
                </div>
              </SettingsSection>

              <SettingsSection title="Density" description="Adjust the spacing and size of UI elements">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {["comfortable", "compact", "condensed"].map((density) => (
                    <button
                      key={density}
                      type="button"
                      className={cn(
                        "p-4 rounded-xl border-2 transition-all text-left",
                        "border-border hover:border-primary/50"
                      )}
                    >
                      <p className="font-medium capitalize">{density}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {density === "comfortable" && "More spacing, larger touch targets"}
                        {density === "compact" && "Balanced spacing"}
                        {density === "condensed" && "Tight spacing, more content"}
                      </p>
                    </button>
                  ))}
                </div>
              </SettingsSection>
            </div>
          )}

          {activeTab === "dashboard" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Widget Layout</h3>
                  <p className="text-sm text-muted-foreground">Drag to reorder, toggle visibility</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleResetLayout}>
                  <RotateCcw className="size-3.5 mr-1.5" />
                  Reset to Default
                </Button>
              </div>

              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <ul className="divide-y divide-border">
                  {layout.map((item, index) => (
                    <li key={item.id} className="flex items-center justify-between p-4 hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground text-lg">⋮⋮</span>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.visible}
                            onChange={(e) => {
                              setLayout((current) =>
                                current.map((l, i) => (i === index ? { ...l, visible: e.target.checked } : l))
                              )
                            }}
                            className="rounded border-border"
                          />
                          <span className="font-medium">{widgetMeta[item.id]?.title || item.id}</span>
                          <span className="text-xs text-muted-foreground">({item.colSpan} col)</span>
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon-sm" onClick={() => {
                          if (index > 0) {
                            setLayout((current) => {
                              const next = [...current]
                              ;[next[index], next[index - 1]] = [next[index - 1], next[index]]
                              return next
                            })
                          }
                        }} disabled={index === 0} aria-label="Move up">
                          <ChevronUp className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => {
                          if (index < layout.length - 1) {
                            setLayout((current) => {
                              const next = [...current]
                              ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
                              return next
                            })
                          }
                        }} disabled={index === layout.length - 1} aria-label="Move down">
                          <ChevronDown className="size-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveLayout} disabled={saveStatus === "saving"}>
                  {saveStatus === "saving" && <RotateCcw className="size-4 mr-2 animate-spin" />}
                  {saveStatus === "saved" ? (
                    <>
                      <Save className="size-4 mr-2" />
                      Saved
                    </>
                  ) : (
                    "Save Layout"
                  )}
                </Button>
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="space-y-6">
              <SettingsSection title="Email Notifications" description="Receive updates via email">
                <div className="space-y-3">
                  {[
                    { key: "email", label: "Email notifications", desc: "Receive important updates via email" },
                    { key: "weeklyDigest", label: "Weekly digest", desc: "Get a summary of your week every Monday" },
                  ].map((item) => (
                    <label key={item.key} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                      <div>
                        <p className="font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifications[item.key as keyof typeof notifications]}
                        onChange={(e) => setNotifications((n) => ({ ...n, [item.key]: e.target.checked }))}
                        className="rounded border-border"
                      />
                    </label>
                  ))}
                </div>
              </SettingsSection>

              <SettingsSection title="Push Notifications" description="Browser notifications for reminders">
                <div className="space-y-3">
                  {[
                    { key: "push", label: "Push notifications", desc: "Allow browser notifications" },
                    { key: "reminders", label: "Task reminders", desc: "Get reminded about upcoming tasks" },
                  ].map((item) => (
                    <label key={item.key} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                      <div>
                        <p className="font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifications[item.key as keyof typeof notifications]}
                        onChange={(e) => setNotifications((n) => ({ ...n, [item.key]: e.target.checked }))}
                        className="rounded border-border"
                      />
                    </label>
                  ))}
                </div>
              </SettingsSection>
            </div>
          )}

          {activeTab === "data" && (
            <div className="space-y-6">
              {dataStatus && <p role="status" className="text-sm text-muted-foreground">{dataStatus}</p>}
              <SettingsSection title="Export Data" description="Download a backup of all your data">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <Download className="size-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Export Backup</p>
                    <p className="text-sm text-muted-foreground">
                      Download a JSON backup containing your saved tasks, calendar, notes, goals, projects, habits, study tracker, and preferences.
                    </p>
                  </div>
                  <Button onClick={handleExportData}>
                    <Download className="size-3.5 mr-1.5" />
                    Export Data
                  </Button>
                </div>
              </SettingsSection>

              <SettingsSection title="Import Data" description="Restore from a previous backup">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <Upload className="size-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Import Backup</p>
                    <p className="text-sm text-muted-foreground">
                      Restore a full backup to this account. This replaces the saved task, calendar, notes, goals, projects, habits, and tracker data.
                    </p>
                  </div>
                  <label className="cursor-pointer">
                    <Button variant="outline">
                      <Upload className="size-3.5 mr-1.5" />
                      Choose File
                    </Button>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportData}
                      className="sr-only"
                    />
                  </label>
                </div>
              </SettingsSection>

              <SettingsSection title="Danger Zone" description="Irreversible actions">
                <div className="flex items-center justify-between p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30">
                  <div>
                    <p className="font-medium text-red-700 dark:text-red-300">Clear All Data</p>
                    <p className="text-sm text-red-600 dark:text-red-400">
                      Replace your saved tasks, calendar events, notes, goals, and study tracker with empty data.
                    </p>
                  </div>
                  <ConfirmAction
                    title="Clear saved data?"
                    description="This replaces your saved tasks, calendar events, notes, goals, and study tracker data with empty data for this account. This cannot be undone."
                    confirmLabel="Clear account data"
                    confirmationText="DELETE"
                    onConfirm={handleClearLocalData}
                  >
                    {(openConfirmation) => (
                      <Button variant="destructive" onClick={openConfirmation}>
                        <Trash2 className="size-3.5 mr-1.5" />
                        Clear Everything
                      </Button>
                    )}
                  </ConfirmAction>
                </div>
              </SettingsSection>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-6">
              <SettingsSection title="Authentication" description="Manage your sign-in methods">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <Key className="size-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Password</p>
                        <p className="text-xs text-muted-foreground">Last changed: Never (demo)</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Change</Button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <Shield className="size-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Two-Factor Authentication</p>
                        <p className="text-xs text-muted-foreground">Not enabled</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Enable</Button>
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection title="Sessions" description="Manage your active sessions">
                <div className="space-y-3">
                  <div className="p-3 rounded-lg border border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Monitor className="size-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Current Session</p>
                          <p className="text-xs text-muted-foreground">Chrome on Windows • Active now</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-700 dark:text-green-300">
                        This Device
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Only one active session (demo)</p>
                </div>
              </SettingsSection>
              <AccountManagement />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-6">
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      {children}
    </div>
  )
}