"use client"

import { useMemo, useState, useEffect } from "react"
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
import { calculateStreak, localDateKey } from "@/lib/habit-utils"
import { loadUserData, saveUserData } from "@/lib/user-data"
import type { DashboardData, QuickAddKind, WidgetId } from "@/lib/types"

const TASKS_STORAGE_KEY = "productivity-hub-tasks-v1"
const HABITS_STORAGE_KEY = "productivity-hub-habits-v1"

function isTask(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const task = value as Record<string, unknown>
  return typeof task.id === "string" &&
    typeof task.title === "string" &&
    (task.status === "todo" || task.status === "in-progress" || task.status === "done")
}

function isHabit(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const habit = value as Record<string, unknown>
  return typeof habit.id === "string" &&
    typeof habit.name === "string" &&
    typeof habit.cadence === "string" &&
    Array.isArray(habit.week) &&
    habit.week.length === 7 &&
    habit.week.every((day) => typeof day === "boolean") &&
    (habit.completionDates === undefined || (
      Array.isArray(habit.completionDates) &&
      habit.completionDates.every((date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))
    ))
}

export function DashboardView({ data }: { data: DashboardData }) {
  const [tasks, setTasks] = useState(data.tasks)
  const [habits, setHabits] = useState(data.habits)
  const [storageReady, setStorageReady] = useState(false)
  const [storageLoadFailed, setStorageLoadFailed] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const now = useMemo(() => new Date(), [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [savedTasks, savedHabits] = await Promise.all([
          loadUserData<unknown>(TASKS_STORAGE_KEY),
          loadUserData<unknown>(HABITS_STORAGE_KEY),
        ])
        if (savedTasks !== null && (!Array.isArray(savedTasks) || !savedTasks.every(isTask))) throw new Error("Saved task data is not a valid task list.")
        if (savedHabits !== null && (!Array.isArray(savedHabits) || !savedHabits.every(isHabit))) throw new Error("Saved habit data is not a valid habit list.")
        if (active) {
          if (savedTasks !== null) setTasks(savedTasks)
          if (savedHabits !== null) setHabits(savedHabits)
          else setHabits(data.habits.map((habit) => {
            const todayKey = localDateKey(now)
            const dates = [...(habit.completionDates ?? habit.week.flatMap((done, index) => {
              if (!done) return []
              const date = new Date(now)
              date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + index)
              return [localDateKey(date)]
            }))].filter((date) => date <= todayKey)
            if (habit.completedToday && !dates.includes(todayKey)) dates.push(todayKey)
            return { ...habit, completionDates: [...new Set(dates)] }
          }))
        }
      } catch (error) {
        if (active) {
          setStorageLoadFailed(true)
          setStorageError(error instanceof Error ? error.message : "Could not load dashboard data.")
        }
      } finally {
        if (active) setStorageReady(true)
      }
    })()
    return () => { active = false }
  }, [data.habits, now])

  useEffect(() => {
    if (!storageReady || storageLoadFailed) return
    const timer = window.setTimeout(() => {
      void Promise.all([
        saveUserData(TASKS_STORAGE_KEY, tasks),
        saveUserData(HABITS_STORAGE_KEY, habits),
      ]).then(() => setStorageError(null))
        .catch((error: unknown) => setStorageError(error instanceof Error ? error.message : "Could not save dashboard data."))
    }, 100)
    return () => window.clearTimeout(timer)
  }, [habits, storageLoadFailed, storageReady, tasks])

  function addItem(kind: QuickAddKind, title: string) {
    if (!storageReady || storageLoadFailed || kind !== "task") return

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dueDate = localDateKey(tomorrow)

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
    if (!storageReady || storageLoadFailed) return
    const todayKey = localDateKey(new Date())
    const today = new Date(`${todayKey}T12:00:00`)
    setHabits((current) =>
      current.map((habit) => {
        if (habit.id !== id) return habit
        const dates = new Set(habit.completionDates ?? [])
        if (dates.has(todayKey)) dates.delete(todayKey)
        else dates.add(todayKey)
        const completionDates = [...dates].sort()
        const completedToday = dates.has(todayKey)
        return {
          ...habit,
          completedToday,
          completionDates,
          streak: calculateStreak(completionDates, habit.cadence, today),
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
      {storageError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {storageError}
        </p>
      )}
      <DashboardHeader name={data.user.name} />
      <QuickAdd onAdd={addItem} />
      <DashboardGrid layout={data.layout} renderWidget={renderWidget} />
    </div>
  )
}
