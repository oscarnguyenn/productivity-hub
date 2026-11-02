import { defaultWidgetLayout } from "@/lib/dashboard-layout"
import type { DashboardData } from "@/lib/types"

export const sampleDashboard: DashboardData = {
  user: {
    name: "Oscar",
    role: "Student",
  },
  layout: defaultWidgetLayout,
  events: [],
  tasks: [],
  projects: [],
  goals: [],
  habits: [],
  files: [],
}
