export type Priority = "high" | "medium" | "low"
export type TaskStatus = "todo" | "in-progress" | "done"
export type EventType = "class" | "focus" | "personal" | "meeting"
export type QuickAddKind = "task" | "event" | "note"
export type WidgetId =
  | "schedule"
  | "upcoming-tasks"
  | "priority-tasks"
  | "projects"
  | "goals"
  | "habits"

export type WidgetColSpan = 1 | 2 | 3
export type WidgetRowSpan = 1 | 2

export interface WidgetLayoutItem {
  id: WidgetId
  colSpan: WidgetColSpan
  rowSpan: WidgetRowSpan
  order: number
  visible: boolean
}

export interface UserProfile {
  name: string
  role: string
}

export interface CalendarEvent {
  id: string
  title: string
  date: string // ISO date string (e.g., "2026-11-02")
  start: string // Time string (e.g., "09:00")
  end: string   // Time string (e.g., "10:20")
  type: EventType
  location?: string
}

export interface Task {
  id: string
  title: string
  project?: string
  dueDate: string
  priority: Priority
  status: TaskStatus
}

export interface Project {
  id: string
  name: string
  status: "active" | "paused"
  progress: number
  dueDate: string
}

export interface Goal {
  id: string
  title: string
  horizon: string
  progress: number
  target: string
}

export interface Habit {
  id: string
  name: string
  cadence: string
  streak: number
  completedToday: boolean
  week: boolean[]
}

// File system types for Google Drive-like notes
export type FileNodeType = "folder" | "document"

export interface FileNode {
  id: string
  name: string
  type: FileNodeType
  parentId: string | null
  children?: FileNode[] // Only for folders
  content?: string // Only for documents (JSON string from TipTap)
  createdAt: string
  updatedAt: string
  isExpanded?: boolean // UI state for folders
}

export interface DashboardData {
  user: UserProfile
  layout: WidgetLayoutItem[]
  events: CalendarEvent[]
  tasks: Task[]
  projects: Project[]
  goals: Goal[]
  habits: Habit[]
  files: FileNode[] // Root level files/folders
}
