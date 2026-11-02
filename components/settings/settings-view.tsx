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
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { UserProfile, WidgetLayoutItem, WidgetId } from "@/lib/types"
import { defaultWidgetLayout, widgetMeta } from "@/lib/dashboard-layout"

function getInitialTheme(): "light" | "dark" | "system" {
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
  const [user, setUser] = useState(initialUser)
  const [layout, setLayout] = useState(initialLayout)
  const [theme, setTheme] = useState<"light" | "dark" | "system">(getInitialTheme)
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    reminders: true,
    weeklyDigest: false,
  })
  const [activeTab, setActiveTab] = useState<"profile" | "appearance" | "dashboard" | "notifications" | "data" | "security">("profile")
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")

  useEffect(() => {
    // Apply theme
    const root = document.documentElement
    if (theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
    localStorage.setItem("theme", theme)
  }, [theme])

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

  const handleExportData = () => {
    const data = {
      user,
      layout,
      theme,
      notifications,
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `productivity-hub-backup-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (data.user) setUser(data.user)
        if (data.layout) setLayout(data.layout)
        if (data.theme) setTheme(data.theme)
        if (data.notifications) setNotifications(data.notifications)
        alert("Data imported successfully!")
      } catch {
        alert("Invalid backup file")
      }
    }
    reader.readAsText(file)
    event.target.value = ""
  }

  const handleClearAllData = () => {
    if (confirm("Are you sure? This will delete all your data and cannot be undone.")) {
      if (confirm("This is irreversible. Type 'DELETE' to confirm.")) {
        // In a real app, this would clear localStorage, IndexedDB, etc.
        alert("All data cleared (demo only)")
      }
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
                    <label className="block text-sm font-medium mb-1">Role</label>
                    <Input
                      value={user.role}
                      onChange={(e) => setUser((u) => ({ ...u, role: e.target.value }))}
                      placeholder="Your role"
                    />
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
              <SettingsSection title="Export Data" description="Download a backup of all your data">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <Download className="size-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Export Backup</p>
                    <p className="text-sm text-muted-foreground">
                      Download a JSON file containing your profile, layout, preferences, and all data.
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
                      Select a previously exported JSON file to restore your data.
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
                      Permanently delete all your data including tasks, habits, goals, notes, and settings.
                    </p>
                  </div>
                  <Button variant="destructive" onClick={handleClearAllData}>
                    <Trash2 className="size-3.5 mr-1.5" />
                    Clear Everything
                  </Button>
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