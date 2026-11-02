import type { LucideIcon } from "lucide-react"
import {
  CalendarDays,
  CheckSquare,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  LineChart,
  NotebookPen,
  Repeat,
  Settings,
  Target,
} from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export const primaryNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/habits", label: "Habits", icon: Repeat },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/insights", label: "Insights", icon: LineChart },
]

export const secondaryNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
]

export const moduleCopy: Record<
  string,
  { title: string; description: string }
> = {
  "/calendar": {
    title: "Calendar",
    description:
      "A native weekly and monthly calendar will live here. FullCalendar will be added in a later increment.",
  },
  "/tasks": {
    title: "Tasks",
    description:
      "A full task inbox with priorities, due dates, and project links will be built next.",
  },
  "/projects": {
    title: "Projects",
    description:
      "Project boards, milestones, and status tracking will live in this section.",
  },
  "/notes": {
    title: "Notes",
    description:
      "Rich-text notes with Tiptap will be added after the core dashboard is in place.",
  },
  "/habits": {
    title: "Habits",
    description:
      "Habit streaks, weekly grids, and reminders will expand from the dashboard widget.",
  },
  "/goals": {
    title: "Goals",
    description:
      "Quarterly and yearly goals with measurable progress will be managed here.",
  },
  "/insights": {
    title: "Insights",
    description:
      "Local analytics across tasks, habits, and goals will appear in this view.",
  },
  "/settings": {
    title: "Settings",
    description:
      "Profile, appearance, and persisted dashboard layout preferences will live here.",
  },
}

export const brand = {
  name: "Hub",
  mark: Gauge,
}
