"use client"

import { WidgetFrame } from "@/components/dashboard/widget-frame"
import { widgetMeta } from "@/lib/dashboard-layout"
import { calculateStreak, isCompletedOnDate, localDateKey } from "@/lib/habit-utils"
import type { Habit } from "@/lib/types"
import { cn } from "@/lib/utils"

export function HabitsWidget({
  habits,
  onToggle,
}: {
  habits: Habit[]
  onToggle: (id: string) => void
}) {
  const today = new Date()
  const recentDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(date.getDate() - (6 - index))
    return date
  })

  return (
    <WidgetFrame title={widgetMeta.habits.title} href={widgetMeta.habits.href}>
      <ul className="space-y-3">
        {habits.map((habit) => (
          <li key={habit.id} className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onToggle(habit.id)}
              className="flex min-w-0 items-center gap-3 text-left"
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border",
                  isCompletedOnDate(habit, today)
                    ? "border-foreground bg-foreground"
                    : "border-border bg-background"
                )}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{habit.name}</span>
                <span className="text-xs text-muted-foreground">
                  {calculateStreak(habit.completionDates ?? [], habit.cadence, today)} day streak
                </span>
              </span>
            </button>
            <div className="flex gap-1">
              {recentDates.map((date) => {
                const done = isCompletedOnDate(habit, date)
                return (
                <span
                  key={`${habit.id}-${localDateKey(date)}`}
                  className={cn(
                    "size-1.5 rounded-full",
                    done ? "bg-foreground" : "bg-border"
                  )}
                />
                )
              })}
            </div>
          </li>
        ))}
      </ul>
    </WidgetFrame>
  )
}
