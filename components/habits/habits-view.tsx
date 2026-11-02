"use client"

import { useState, useMemo } from "react"
import {
  Plus,
  Flame,
  Target,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Edit,
  Trash2,
  RotateCcw,
  Bell,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { formatDueDate, formatLongDate } from "@/lib/format"
import type { Habit } from "@/lib/types"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

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
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null)
  const [newHabitName, setNewHabitName] = useState("")
  const [newHabitCadence, setNewHabitCadence] = useState("Daily")
  const [newHabitReminder, setNewHabitReminder] = useState("")

  const weekStart = useMemo(() => {
    const d = new Date(currentWeek)
    d.setDate(d.getDate() - d.getDay() + 1) // Monday
    d.setHours(0, 0, 0, 0)
    return d
  }, [currentWeek])

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 6)
    d.setHours(23, 59, 59, 999)
    return d
  }, [weekStart])

  const weekDates = useMemo(() => {
    const dates: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      dates.push(d)
    }
    return dates
  }, [weekStart])

  const today = useMemo(() => new Date(), [])

  const isToday = (date: Date) => date.toDateString() === today.toDateString()

  const getWeekProgress = (habit: Habit) => {
    const completed = habit.week.filter(Boolean).length
    return Math.round((completed / 7) * 100)
  }

  const totalStreak = habits.reduce((sum, h) => sum + h.streak, 0)
  const completedToday = habits.filter((h) => h.completedToday).length
  const totalHabits = habits.length

  const handleAddHabit = () => {
    if (!newHabitName.trim()) return
    const now = new Date()
    const newHabit: Habit = {
      id: `habit-${crypto.randomUUID()}`,
      name: newHabitName.trim(),
      cadence: newHabitCadence,
      streak: 0,
      completedToday: false,
      week: [false, false, false, false, false, false, false],
    }
    setHabits((current) => [newHabit, ...current])
    onAddHabit?.(newHabit)
    setNewHabitName("")
    setShowAddModal(false)
  }

  const handleToggleHabit = (habit: Habit) => {
    const completedToday = !habit.completedToday
    const week = [...habit.week]
    const todayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1 // Convert Sun=0 to Mon=0
    week[todayIndex] = completedToday

    setHabits((current) =>
      current.map((h) => {
        if (h.id !== habit.id) return h
        return {
          ...h,
          completedToday,
          streak: completedToday ? h.streak + 1 : Math.max(0, h.streak - 1),
          week,
        }
      })
    )
    onToggleHabit?.(habit.id)
  }

  const handleDeleteHabit = (id: string) => {
    if (confirm("Are you sure you want to delete this habit?")) {
      setHabits((current) => current.filter((h) => h.id !== id))
      onDeleteHabit?.(id)
    }
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
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="size-3.5 mr-1.5" />
            New Habit
          </Button>
        </div>
      </div>

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
                        onClick={() => handleToggleHabit(habit)}
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          habit.completedToday
                            ? "border-primary bg-primary text-white"
                            : "border-border bg-background hover:border-primary/50"
                        )}
                        aria-label={habit.completedToday ? "Mark incomplete" : "Mark complete"}
                      >
                        {habit.completedToday && <Check className="size-3.5" />}
                      </button>
                      <div>
                        <p className="font-medium text-sm">{habit.name}</p>
                        <p className="text-xs text-muted-foreground">{habit.cadence}</p>
                      </div>
                    </div>
                  </td>
                  {habit.week.map((done, index) => (
                    <td key={index} className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleHabit(habit)}
                        className={cn(
                          "mx-auto size-8 rounded-full border-2 transition-colors",
                          done
                            ? "border-primary bg-primary"
                            : isToday(weekDates[index])
                            ? "border-primary/50 bg-primary/5"
                            : "border-border bg-background hover:border-primary/30"
                        )}
                        disabled={weekDates[index] > today}
                        aria-label={done ? "Completed" : "Mark complete"}
                      >
                        {done && <Check className="size-4 text-white" />}
                      </button>
                    </td>
                  ))}
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
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => setShowAddModal(true)}>
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
              habit={habit}
              weekDates={weekDates}
              today={today}
              isToday={isToday}
              onToggle={() => handleToggleHabit(habit)}
              onEdit={() => handleEditHabit(habit)}
              onDelete={() => handleDeleteHabit(habit.id)}
            />
          ))}
          {habits.length === 0 && (
            <div className="col-span-full rounded-xl border-2 border-dashed border-border bg-card/50 p-12 text-center">
              <Flame className="size-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-medium mb-2">No habits yet</h3>
              <p className="text-muted-foreground mb-4">Start building habits today</p>
              <Button onClick={() => setShowAddModal(true)}>
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
                <option value="Custom">Custom schedule</option>
              </select>
              <Input
                value={newHabitReminder}
                onChange={(e) => setNewHabitReminder(e.target.value)}
                placeholder="Reminder time (optional, e.g., 07:00)"
                type="time"
              />
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
  onEdit,
  onDelete,
}: {
  habit: Habit
  weekDates: Date[]
  today: Date
  isToday: (date: Date) => boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const weekProgress = Math.round((habit.week.filter(Boolean).length / 7) * 100)
  const isOverdue = !habit.completedToday && habit.cadence === "Daily"

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
          <Button variant="ghost" size="icon-xs" onClick={onDelete} aria-label="Delete habit">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 mb-3">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full border-3 transition-colors",
            habit.completedToday
              ? "border-green-500 bg-green-500 text-white"
              : "border-border bg-background hover:border-primary/50"
          )}
          aria-label={habit.completedToday ? "Mark incomplete" : "Mark complete"}
        >
          {habit.completedToday && <Check className="size-6" />}
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
          {habit.week.map((done, index) => (
            <button
              key={index}
              type="button"
              onClick={onToggle}
              className={cn(
                "flex-1 h-2 rounded transition-colors",
                done
                  ? "bg-primary"
                  : isToday(weekDates[index])
                  ? "bg-primary/20"
                  : "bg-border"
              )}
              disabled={weekDates[index] > today}
            />
          ))}
        </div>
      </div>
    </div>
  )
}