"use client"

import { useState, useMemo, useEffect } from "react"
import {
  Plus,
  Flame,
  Target,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmAction } from "@/components/ui/confirm-action"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { formatLongDate } from "@/lib/format"
import { loadUserData, saveUserData } from "@/lib/user-data"
import { calculateStreak, getHabitCompletionRate, isCompletedOnDate, isScheduledOnDate, localDateKey } from "@/lib/habit-utils"
import type { Habit } from "@/lib/types"

const HABITS_STORAGE_KEY = "productivity-hub-habits-v1"
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function getMonday(date: Date): Date {
  const monday = new Date(date)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return monday
}

function isHabit(value: unknown): value is Habit {
  if (!value || typeof value !== "object") return false
  const habit = value as Record<string, unknown>
  return typeof habit.id === "string" &&
    typeof habit.name === "string" &&
    typeof habit.cadence === "string" &&
    typeof habit.streak === "number" &&
    typeof habit.completedToday === "boolean" &&
    Array.isArray(habit.week) &&
    habit.week.length === 7 &&
    habit.week.every((day) => typeof day === "boolean") &&
    (habit.completionDates === undefined || (
      Array.isArray(habit.completionDates) &&
      habit.completionDates.every((date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))
    ))
}

export function HabitsView({
  habits: initialHabits,
  onAddHabit,
  onToggleHabit,
  onDeleteHabit,
}: {
  habits: Habit[]
  onAddHabit?: (habit: Omit<Habit, "id">) => void
  onToggleHabit?: (id: string) => void
  onDeleteHabit?: (id: string) => void
}) {
  const [habits, setHabits] = useState(initialHabits)
  const [currentWeek, setCurrentWeek] = useState(new Date())
  const [todayKey, setTodayKey] = useState("")
  const [storageReady, setStorageReady] = useState(false)
  const [storageLoadFailed, setStorageLoadFailed] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null)
  const [newHabitName, setNewHabitName] = useState("")
  const [newHabitCadence, setNewHabitCadence] = useState("Daily")

  const weekStart = useMemo(() => {
    return getMonday(currentWeek)
  }, [currentWeek])

  const weekDates = useMemo(() => {
    const dates: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      dates.push(d)
    }
    return dates
  }, [weekStart])

  const today = todayKey ? new Date(`${todayKey}T12:00:00`) : new Date(weekStart)

  const isToday = (date: Date) => localDateKey(date) === todayKey

  const getWeekProgress = (habit: Habit) => {
    return getHabitCompletionRate(habit, weekDates, today)
  }

  const totalStreak = habits.reduce((sum, habit) =>
    sum + calculateStreak(habit.completionDates ?? [], habit.cadence, today), 0)
  const completedToday = habits.filter((habit) => isCompletedOnDate(habit, today)).length
  const totalHabits = habits.length

  useEffect(() => {
    const updateToday = () => setTodayKey(localDateKey(new Date()))
    const timerId = window.setTimeout(updateToday, 0)
    const intervalId = window.setInterval(updateToday, 60_000)
    return () => {
      window.clearTimeout(timerId)
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    let active = true
    const timerId = window.setTimeout(() => {
      void (async () => {
        const migrationToday = new Date()
        const migrationTodayKey = localDateKey(migrationToday)
        const migrationWeekStart = getMonday(migrationToday)
        const normalize = (habit: Habit): Habit => {
          const dates = (habit.completionDates ?? habit.week.flatMap((done, index) => {
            if (!done) return []
            const date = new Date(migrationWeekStart)
            date.setDate(date.getDate() + index)
            return [localDateKey(date)]
          })).filter((date) => date <= migrationTodayKey)
          if (habit.completedToday && !dates.includes(migrationTodayKey)) dates.push(migrationTodayKey)
          return {
            ...habit,
            completionDates: [...new Set(dates)],
            completedToday: dates.includes(migrationTodayKey),
            streak: calculateStreak(dates, habit.cadence, migrationToday),
          }
        }
        try {
          const saved = await loadUserData<unknown>(HABITS_STORAGE_KEY)
          if (saved !== null) {
            if (!Array.isArray(saved) || !saved.every(isHabit)) throw new Error("Saved habit data is not a valid habit list.")
            if (active) setHabits(saved.map(normalize))
          } else if (active) {
            setHabits(initialHabits.map(normalize))
          }
        } catch (error) {
          if (active) {
            setStorageLoadFailed(true)
            setStorageError(error instanceof Error ? error.message : "Could not load saved habits.")
          }
        } finally {
          if (active) setStorageReady(true)
        }
      })()
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timerId)
    }
  }, [initialHabits])

  useEffect(() => {
    if (!storageReady || storageLoadFailed) return
    const timerId = window.setTimeout(() => {
      void saveUserData(HABITS_STORAGE_KEY, habits)
        .then(() => setStorageError(null))
        .catch((error: unknown) => setStorageError(error instanceof Error ? error.message : "Could not save habits."))
    }, 100)
    return () => window.clearTimeout(timerId)
  }, [habits, storageLoadFailed, storageReady])

  const handleAddHabit = () => {
    if (!storageReady || !newHabitName.trim()) return
    const newHabit: Habit = {
      id: `habit-${crypto.randomUUID()}`,
      name: newHabitName.trim(),
      cadence: newHabitCadence,
      streak: 0,
      completedToday: false,
      week: [false, false, false, false, false, false, false],
      completionDates: [],
    }
    setHabits((current) => [newHabit, ...current])
    onAddHabit?.(newHabit)
    setNewHabitName("")
    setShowAddModal(false)
  }

  const handleToggleHabit = (habit: Habit, date: Date) => {
    const dateKey = localDateKey(date)
    if (dateKey > todayKey || !isScheduledOnDate(habit, date)) return
    const existing = new Set(habit.completionDates ?? [])
    if (existing.has(dateKey)) existing.delete(dateKey)
    else existing.add(dateKey)
    const completionDates = [...existing]
    const completedToday = existing.has(todayKey)
    setHabits((current) =>
      current.map((h) => {
        if (h.id !== habit.id) return h
        return {
          ...h,
          completedToday,
          completionDates,
          streak: calculateStreak(completionDates, h.cadence, today),
          week: weekDates.map((weekDate) => existing.has(localDateKey(weekDate))),
        }
      })
    )
    onToggleHabit?.(habit.id)
  }

  const handleDeleteHabit = (id: string) => {
    setHabits((current) => current.filter((h) => h.id !== id))
    onDeleteHabit?.(id)
  }

  const handleEditHabit = (habit: Habit) => {
    setEditingHabit(habit)
    setNewHabitName(habit.name)
    setNewHabitCadence(habit.cadence)
  }

  const handleSaveEdit = () => {
    if (!editingHabit || !newHabitName.trim()) return
    setHabits((current) =>
      current.map((h) =>
        h.id === editingHabit.id ? { ...h, name: newHabitName.trim(), cadence: newHabitCadence } : h
      )
    )
    setEditingHabit(null)
    setNewHabitName("")
  }

  const navigateWeek = (delta: number) => {
    const d = new Date(currentWeek)
    d.setDate(d.getDate() + delta * 7)
    setCurrentWeek(d)
  }

  const goToThisWeek = () => setCurrentWeek(new Date())

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Habits</h1>
          <p className="text-sm text-muted-foreground">
            {formatLongDate(weekStart)} – {weekDates[6].getDate()} {weekDates[6].toLocaleString("en-US", { month: "short" })}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="ghost" size="icon-sm" onClick={() => navigateWeek(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToThisWeek}>
            This Week
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => navigateWeek(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <Button disabled={!storageReady} onClick={() => setShowAddModal(true)}>
            <Plus className="size-3.5 mr-1.5" />
            New Habit
          </Button>
        </div>
      </div>
      {storageError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{storageError}</p>}
      {!storageReady && <p role="status" className="text-sm text-muted-foreground">Loading saved habits…</p>}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          title="Total Habits"
          value={totalHabits}
          icon={<Target className="size-5" />}
        />
        <StatCard
          title="Completed Today"
          value={`${completedToday}/${totalHabits}`}
          icon={<Check className="size-5" />}
        />
        <StatCard
          title="Total Streak"
          value={totalStreak}
          icon={<Flame className="size-5" />}
        />
        <StatCard
          title="Avg. Weekly"
          value={`${Math.round(habits.reduce((sum, h) => sum + getWeekProgress(h), 0) / (habits.length || 1))}%`}
          icon={<Calendar className="size-5" />}
        />
      </div>

      {/* Weekly Grid */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-medium">Weekly Progress</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="w-40 p-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Habit
                </th>
                {weekDates.map((date, index) => (
                  <th key={date.toISOString()} className="w-12 p-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <div className="flex flex-col items-center gap-1">
                      <span>{DAYS[index]}</span>
                      <span className={cn("text-sm font-normal", isToday(date) && "text-primary")}>
                        {date.getDate()}
                      </span>
                    </div>
                  </th>
                ))}
                <th className="w-24 p-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Progress
                </th>
              </tr>
            </thead>
            <tbody>
              {habits.map((habit) => (
                <tr key={habit.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleHabit(habit, today)}
                        disabled={!storageReady || !isScheduledOnDate(habit, today)}
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          isCompletedOnDate(habit, today)
                            ? "border-primary bg-primary text-white"
                            : "border-border bg-background hover:border-primary/50"
                        )}
                        aria-label={isCompletedOnDate(habit, today) ? "Mark incomplete today" : "Mark complete today"}
                      >
                        {isCompletedOnDate(habit, today) && <Check className="size-3.5" />}
                      </button>
                      <div>
                        <p className="font-medium text-sm">{habit.name}</p>
                        <p className="text-xs text-muted-foreground">{habit.cadence}</p>
                      </div>
                    </div>
                  </td>
                  {weekDates.map((date, index) => {
                    const done = isCompletedOnDate(habit, date)
                    return (
                    <td key={localDateKey(date)} className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleHabit(habit, date)}
                        className={cn(
                          "mx-auto size-8 rounded-full border-2 transition-colors",
                          done
                            ? "border-primary bg-primary"
                            : isToday(weekDates[index])
                            ? "border-primary/50 bg-primary/5"
                            : "border-border bg-background hover:border-primary/30"
                        )}
                        disabled={!storageReady || localDateKey(date) > todayKey || !isScheduledOnDate(habit, date)}
                        aria-label={`${habit.name}, ${date.toLocaleDateString()}, ${done ? "completed" : "mark complete"}`}
                      >
                        {done && <Check className="size-4 text-white" />}
                      </button>
                    </td>
                    )
                  })}
                  <td className="p-3 text-center">
                    <div className="w-full max-w-xs mx-auto">
                      <Progress value={getWeekProgress(habit)} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-1 text-center">
                        {getWeekProgress(habit)}%
                      </p>
                    </div>
                  </td>
                </tr>
              ))}
              {habits.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-muted-foreground">
                    <Flame className="size-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No habits yet</p>
                    <Button variant="outline" size="sm" className="mt-2" disabled={!storageReady} onClick={() => setShowAddModal(true)}>
                      Create your first habit
                    </Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Habit Cards */}
      <div className="space-y-4">
        <h3 className="font-medium">Habit Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {habits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={{ ...habit, streak: calculateStreak(habit.completionDates ?? [], habit.cadence, today) }}
              weekDates={weekDates}
              today={today}
              isToday={isToday}
              onToggle={() => handleToggleHabit(habit, today)}
              onToggleDate={(date) => handleToggleHabit(habit, date)}
              onEdit={() => handleEditHabit(habit)}
              onDelete={() => handleDeleteHabit(habit.id)}
            />
          ))}
          {habits.length === 0 && (
            <div className="col-span-full rounded-xl border-2 border-dashed border-border bg-card/50 p-12 text-center">
              <Flame className="size-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-medium mb-2">No habits yet</h3>
              <p className="text-muted-foreground mb-4">Start building habits today</p>
              <Button disabled={!storageReady} onClick={() => setShowAddModal(true)}>
                <Plus className="size-3.5 mr-1.5" />
                Create Habit
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingHabit) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-xl border border-border w-full max-w-md">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingHabit ? "Edit Habit" : "New Habit"}
              </h2>
              <Button variant="ghost" size="icon-sm" onClick={() => {
                setShowAddModal(false)
                setEditingHabit(null)
                setNewHabitName("")
              }}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <Input
                value={newHabitName}
                onChange={(e) => setNewHabitName(e.target.value)}
                placeholder="Habit name (e.g., Morning exercise)"
              />
              <select
                value={newHabitCadence}
                onChange={(e) => setNewHabitCadence(e.target.value)}
                className="w-full border border-border rounded-lg bg-background px-3 py-2 text-sm"
              >
                <option value="Daily">Daily</option>
                <option value="Weekdays">Weekdays (Mon-Fri)</option>
                <option value="Weekends">Weekends (Sat-Sun)</option>
              </select>
              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => {
                  setShowAddModal(false)
                  setEditingHabit(null)
                  setNewHabitName("")
                }}>
                  Cancel
                </Button>
                <Button onClick={editingHabit ? handleSaveEdit : handleAddHabit}>
                  {editingHabit ? "Save Changes" : "Create Habit"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string
  value: string | number
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
        </div>
        <div className="p-2 bg-muted rounded-lg">{icon}</div>
      </div>
    </div>
  )
}

function HabitCard({
  habit,
  weekDates,
  today,
  isToday,
  onToggle,
  onToggleDate,
  onEdit,
  onDelete,
}: {
  habit: Habit
  weekDates: Date[]
  today: Date
  isToday: (date: Date) => boolean
  onToggle: () => void
  onToggleDate: (date: Date) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const weekProgress = getHabitCompletionRate(habit, weekDates, today)
  const completedToday = isCompletedOnDate(habit, today)

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium truncate">{habit.name}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{habit.cadence}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" onClick={onEdit} aria-label="Edit habit">
            <Edit className="size-3.5" />
          </Button>
          <ConfirmAction
            title="Delete habit?"
            description={`Delete “${habit.name}”? Its completion history will be removed.`}
            onConfirm={onDelete}
          >
            {(openConfirmation) => (
              <Button variant="ghost" size="icon-xs" onClick={openConfirmation} aria-label="Delete habit">
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </ConfirmAction>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 mb-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={!isScheduledOnDate(habit, today)}
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full border-3 transition-colors",
            completedToday
              ? "border-green-500 bg-green-500 text-white"
              : "border-border bg-background hover:border-primary/50"
          )}
          aria-label={completedToday ? "Mark incomplete today" : "Mark complete today"}
        >
          {completedToday && <Check className="size-6" />}
        </button>
        <div className="flex-1 text-right">
          <p className="text-3xl font-bold tabular-nums">{habit.streak}</p>
          <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
            <Flame className="size-3" />
            day streak
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">This week</span>
          <span className="font-medium">{weekProgress}%</span>
        </div>
        <Progress value={weekProgress} />
        <div className="flex gap-1">
          {weekDates.map((date, index) => {
            const done = isCompletedOnDate(habit, date)
            return (
            <button
              key={localDateKey(date)}
              type="button"
              onClick={() => onToggleDate(date)}
              className={cn(
                "flex-1 h-2 rounded transition-colors",
                done
                  ? "bg-primary"
                  : isToday(weekDates[index])
                  ? "bg-primary/20"
                  : "bg-border"
              )}
              disabled={localDateKey(date) > localDateKey(today) || !isScheduledOnDate(habit, date)}
              aria-label={`${habit.name}, ${date.toLocaleDateString()}, ${done ? "completed" : "mark complete"}`}
            />
            )
          })}
        </div>
      </div>
    </div>
  )
}