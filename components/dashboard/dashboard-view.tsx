"use client"

import { useMemo, useState } from "react"
import { DashboardGrid } from "@/components/dashboard/dashboard-grid"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { QuickAdd } from "@/components/dashboard/quick-add"
import { GoalsWidget } from "@/components/dashboard/widgets/goals-widget"
import { HabitsWidget } from "@/components/dashboard/widgets/habits-widget"
import { ProjectsWidget } from "@/components/dashboard/widgets/projects-widget"
import { ScheduleWidget } from "@/components/dashboard/widgets/schedule-widget"
import {
  PriorityTasksWidget,
  UpcomingTasksWidget,
} from "@/components/dashboard/widgets/tasks-widget"
import type { DashboardData, QuickAddKind, WidgetId } from "@/lib/types"

export function DashboardView({ data }: { data: DashboardData }) {
  const [tasks, setTasks] = useState(data.tasks)
  const [habits, setHabits] = useState(data.habits)
  const now = useMemo(() => new Date(), [])

  function addItem(kind: QuickAddKind, title: string) {
    if (kind !== "task") return

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dueDate = tomorrow.toISOString().slice(0, 10)

    setTasks((current) => [
      {
        id: `task-${crypto.randomUUID()}`,
        title,
        dueDate,
        priority: "medium",
        status: "todo",
      },
      ...current,
    ])
  }

  function toggleHabit(id: string) {
    setHabits((current) =>
      current.map((habit) => {
        if (habit.id !== id) return habit
        const completedToday = !habit.completedToday
        const week = [...habit.week]
        week[week.length - 1] = completedToday
        return {
          ...habit,
          completedToday,
          streak: completedToday ? habit.streak + 1 : Math.max(0, habit.streak - 1),
          week,
        }
      })
    )
  }

  function renderWidget(id: WidgetId) {
    switch (id) {
      case "schedule":
        return <ScheduleWidget events={data.events} now={now} />
      case "priority-tasks":
        return <PriorityTasksWidget tasks={tasks} />
      case "upcoming-tasks":
        return <UpcomingTasksWidget tasks={tasks} />
      case "projects":
        return <ProjectsWidget projects={data.projects} />
      case "goals":
        return <GoalsWidget goals={data.goals} />
      case "habits":
        return <HabitsWidget habits={habits} onToggle={toggleHabit} />
    }
  }

  return (
    <div className="space-y-6">
      <DashboardHeader name={data.user.name} />
      <QuickAdd onAdd={addItem} />
      <DashboardGrid layout={data.layout} renderWidget={renderWidget} />
    </div>
  )
}
