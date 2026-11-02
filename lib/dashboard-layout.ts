import type { WidgetColSpan, WidgetId, WidgetLayoutItem } from "@/lib/types"

export const defaultWidgetLayout: WidgetLayoutItem[] = [
  { id: "schedule", colSpan: 1, rowSpan: 2, order: 0, visible: true },
  { id: "priority-tasks", colSpan: 1, rowSpan: 1, order: 1, visible: true },
  { id: "habits", colSpan: 1, rowSpan: 1, order: 2, visible: true },
  { id: "upcoming-tasks", colSpan: 1, rowSpan: 1, order: 3, visible: true },
  { id: "projects", colSpan: 1, rowSpan: 1, order: 4, visible: true },
  { id: "goals", colSpan: 1, rowSpan: 1, order: 5, visible: true },
]

export const widgetMeta: Record<WidgetId, { title: string; href: string }> = {
  schedule: { title: "Today", href: "/calendar" },
  "priority-tasks": { title: "Priority", href: "/tasks" },
  habits: { title: "Habits", href: "/habits" },
  "upcoming-tasks": { title: "Upcoming", href: "/tasks" },
  projects: { title: "Projects", href: "/projects" },
  goals: { title: "Goals", href: "/goals" },
}

export function colSpanClass(span: WidgetColSpan) {
  switch (span) {
    case 2:
      return "lg:col-span-2"
    case 3:
      return "lg:col-span-3"
    default:
      return "lg:col-span-1"
  }
}
