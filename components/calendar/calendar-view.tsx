"use client"

import { useState, useMemo } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Plus,
  Sun,
  Moon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  formatLongDate,
  formatDueDate,
  timeToMinutes,
  greetingForHour,
} from "@/lib/format"
import type { CalendarEvent, EventType } from "@/lib/types"

const typeLabel: Record<EventType, string> = {
  class: "Class",
  focus: "Focus",
  meeting: "Meeting",
  personal: "Personal",
}

const typeColor: Record<EventType, string> = {
  class: "bg-blue-500",
  focus: "bg-purple-500",
  meeting: "bg-orange-500",
  personal: "bg-green-500",
}

const typeTextColor: Record<EventType, string> = {
  class: "text-blue-700 dark:text-blue-300",
  focus: "text-purple-700 dark:text-purple-300",
  meeting: "text-orange-700 dark:text-orange-300",
  personal: "text-green-700 dark:text-green-300",
}

const typeBgColor: Record<EventType, string> = {
  class: "bg-blue-50 dark:bg-blue-950/30",
  focus: "bg-purple-50 dark:bg-purple-950/30",
  meeting: "bg-orange-50 dark:bg-orange-950/30",
  personal: "bg-green-50 dark:bg-green-950/30",
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const DAYS_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

export function CalendarView({
  events,
  onAddEvent,
}: {
  events: CalendarEvent[]
  onAddEvent?: (date: Date) => void
}) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<"week" | "month">("week")

  const startOfWeek = useMemo(() => {
    const d = new Date(currentDate)
    d.setDate(d.getDate() - d.getDay())
    d.setHours(0, 0, 0, 0)
    return d
  }, [currentDate])

  const endOfWeek = useMemo(() => {
    const d = new Date(startOfWeek)
    d.setDate(d.getDate() + 6)
    d.setHours(23, 59, 59, 999)
    return d
  }, [startOfWeek])

  const weekDays = useMemo(() => {
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek)
      d.setDate(d.getDate() + i)
      days.push(d)
    }
    return days
  }, [startOfWeek])

  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startDay = firstDay.getDay()
    const daysInMonth = lastDay.getDate()

    const days: (Date | null)[] = []
    for (let i = 0; i < startDay; i++) {
      days.push(null)
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i))
    }
    return days
  }, [currentDate])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    events.forEach((event) => {
      const key = event.date
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(event)
    })
    return map
  }, [events])

  function getEventsForDay(date: Date) {
    const key = date.toISOString().split("T")[0]
    return eventsByDay.get(key) || []
  }

  function formatTime(timeStr: string) {
    const [hours, minutes] = timeStr.split(":").map(Number)
    const period = hours >= 12 ? "PM" : "AM"
    const displayHours = hours % 12 || 12
    return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`
  }

  function isToday(date: Date) {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  function isCurrentMonth(date: Date | null) {
    if (!date) return false
    return date.getMonth() === currentDate.getMonth()
  }

  function goToToday() {
    setCurrentDate(new Date())
  }

  function navigateWeek(delta: number) {
    const d = new Date(currentDate)
    d.setDate(d.getDate() + delta * 7)
    setCurrentDate(d)
  }

  function navigateMonth(delta: number) {
    const d = new Date(currentDate)
    d.setMonth(d.getMonth() + delta)
    setCurrentDate(d)
  }

  if (view === "month") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {currentDate.toLocaleString("en-US", { month: "long", year: "numeric" })}
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={() => navigateMonth(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={goToToday}>
              Today
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => navigateMonth(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border">
            {DAYS.map((day) => (
              <div key={day} className="p-2 text-center text-xs font-medium text-muted-foreground">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((day, index) => {
              if (!day) {
                return <div key={index} className="min-h-[100px] p-2" />
              }
              const dayEvents = getEventsForDay(day)
              const today = isToday(day)
              const currentMonth = isCurrentMonth(day)

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "relative min-h-[100px] p-2 border-r border-border last:border-r-0",
                    today && "bg-accent/50",
                    !currentMonth && "text-muted-foreground/50"
                  )}
                  onClick={() => onAddEvent?.(day)}
                >
                  <span
                    className={cn(
                      "text-sm font-medium",
                      today && "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center"
                    )}
                  >
                    {day.getDate()}
                  </span>
                  <div className="mt-1 space-y-1 max-h-[80px] overflow-hidden">
                    {dayEvents.slice(0, 3).map((event) => (
                      <div
                        key={event.id}
                        className={cn(
                          "text-xs px-1.5 py-0.5 rounded truncate cursor-pointer",
                          typeBgColor[event.type],
                          typeTextColor[event.type]
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {formatTime(event.start)} {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-xs text-muted-foreground">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          {formatLongDate(startOfWeek)} – {weekDays[6].getDate()} {weekDays[6].toLocaleString("en-US", { month: "short" })}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => navigateWeek(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={goToToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => navigateWeek(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-[auto_1fr] border-b border-border">
          <div className="w-20 p-2 text-center text-xs font-medium text-muted-foreground border-r border-border" />
          <div className="grid grid-cols-7">
            {weekDays.map((day, index) => (
              <div
                key={day.toISOString()}
                className={cn(
                  "p-2 text-center border-r border-border last:border-r-0",
                  isToday(day) && "bg-accent/50"
                )}
              >
                <p className="text-xs text-muted-foreground">{DAYS[index]}</p>
                <p
                  className={cn(
                    "font-medium",
                    isToday(day) && "text-primary"
                  )}
                >
                  {day.getDate()}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[auto_1fr]">
          <div className="w-20 border-r border-border">
            {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
              <div key={hour} className="h-16 border-b border-border/50 last:border-0 px-1 text-xs text-muted-foreground text-right pt-1">
                {hour === 0 ? "12a" : hour < 12 ? `${hour}a` : hour === 12 ? "12p" : `${hour - 12}p`}
              </div>
            ))}
          </div>

          <div className="relative grid grid-cols-7">
            {weekDays.map((day, dayIndex) => {
              const dayEvents = getEventsForDay(day)
              const today = isToday(day)

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "relative border-r border-border last:border-r-0 min-h-[600px]",
                    today && "bg-accent/30"
                  )}
                >
                  {dayEvents.map((event) => {
                    const start = timeToMinutes(event.start)
                    const end = timeToMinutes(event.end)
                    const top = (start / (24 * 60)) * 100
                    const height = ((end - start) / (24 * 60)) * 100

                    return (
                      <div
                        key={event.id}
                        className={cn(
                          "absolute left-1 right-1 rounded-md px-2 py-1 text-xs font-medium cursor-pointer transition-shadow hover:shadow-md z-10",
                          typeColor[event.type],
                          "text-white"
                        )}
                        style={{ top: `${top}%`, height: `${height}%` }}
                      >
                        <p className="truncate">{event.title}</p>
                        <p className="opacity-80">{formatTime(event.start)}–{formatTime(event.end)}</p>
                        {event.location && <p className="opacity-70 truncate">{event.location}</p>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}