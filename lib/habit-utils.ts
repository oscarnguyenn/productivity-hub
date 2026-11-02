import type { Habit } from "@/lib/types"

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function isScheduledOnDate(habit: Habit, date: Date): boolean {
  if (habit.cadence === "Weekdays") return date.getDay() > 0 && date.getDay() < 6
  if (habit.cadence === "Weekends") return date.getDay() === 0 || date.getDay() === 6
  return true
}

export function isCompletedOnDate(habit: Habit, date: Date): boolean {
  return habit.completionDates?.includes(localDateKey(date)) ?? false
}

export function getHabitCompletionRate(habit: Habit, dates: Date[], throughDate: Date): number {
  const throughKey = localDateKey(throughDate)
  const scheduledDates = dates.filter((date) =>
    localDateKey(date) <= throughKey && isScheduledOnDate(habit, date)
  )
  if (scheduledDates.length === 0) return 0
  const completed = scheduledDates.filter((date) => isCompletedOnDate(habit, date)).length
  return Math.round((completed / scheduledDates.length) * 100)
}

export function calculateStreak(completionDates: string[], cadence: string, today: Date): number {
  const completed = new Set(completionDates)
  const cursor = new Date(today)
  cursor.setHours(0, 0, 0, 0)
  if (!completed.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  for (let checked = 0; checked < 3660; checked += 1) {
    const scheduled = cadence === "Weekdays"
      ? cursor.getDay() > 0 && cursor.getDay() < 6
      : cadence === "Weekends"
        ? cursor.getDay() === 0 || cursor.getDay() === 6
        : true
    if (scheduled) {
      if (!completed.has(localDateKey(cursor))) break
      streak += 1
    }
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}
