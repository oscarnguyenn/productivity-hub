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
  start: string
  end: string
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

export interface DashboardData {
  user: UserProfile
  layout: WidgetLayoutItem[]
  events: CalendarEvent[]
  tasks: Task[]
  projects: Project[]
  goals: Goal[]
  habits: Habit[]
}
