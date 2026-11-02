"use client"

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { timeToMinutes } from "@/lib/format"
import type { CalendarEvent, EventType } from "@/lib/types"

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const HOUR_HEIGHT = 64
const GRID_HEIGHT = 24 * HOUR_HEIGHT
const STORAGE_KEY = "productivity-hub-calendar-events-v1"

const eventColors: Record<EventType, { card: string; badge: string }> = {
  class: {
    card: "border-blue-300 bg-blue-100 text-blue-950 dark:border-blue-800 dark:bg-blue-950/70 dark:text-blue-100",
    badge: "bg-blue-500",
  },
  focus: {
    card: "border-violet-300 bg-violet-100 text-violet-950 dark:border-violet-800 dark:bg-violet-950/70 dark:text-violet-100",
    badge: "bg-violet-500",
  },
  meeting: {
    card: "border-orange-300 bg-orange-100 text-orange-950 dark:border-orange-800 dark:bg-orange-950/70 dark:text-orange-100",
    badge: "bg-orange-500",
  },
  personal: {
    card: "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-100",
    badge: "bg-emerald-500",
  },
}

const EVENT_TYPES: EventType[] = ["class", "focus", "meeting", "personal"]

type EventDraft = Omit<CalendarEvent, "id">
type CalendarViewMode = "week" | "month"
type InteractionMode = "move" | "resize"

interface EventInteraction {
  eventId: string
  pointerId: number
  mode: InteractionMode
  originX: number
  originY: number
  initialStart: number
  initialEnd: number
  previewDate: string
  previewStart: number
  previewEnd: number
}

function dateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function isDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00`)
  return !Number.isNaN(date.getTime()) && dateKey(date) === value
}

function isTimeString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false
  const hours = Number(value.slice(0, 2))
  const minutes = Number(value.slice(3, 5))
  return hours < 24 && minutes < 60
}

function minutesToTime(minutes: number): string {
  const bounded = Math.max(0, Math.min(23 * 60 + 59, minutes))
  const hours = Math.floor(bounded / 60)
  const remaining = bounded % 60
  return `${String(hours).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number)
  const period = hours >= 12 ? "PM" : "AM"
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${period}`
}

function formatDateHeading(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString("en-US", options)
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!value || typeof value !== "object") return false
  const event = value as Record<string, unknown>
  return (
    typeof event.id === "string" &&
    typeof event.title === "string" &&
    typeof event.date === "string" &&
    isDateString(event.date) &&
    isTimeString(event.start) &&
    isTimeString(event.end) &&
    timeToMinutes(event.end as string) > timeToMinutes(event.start as string) &&
    EVENT_TYPES.includes(event.type as EventType) &&
    (event.location === undefined || typeof event.location === "string")
  )
}

function createEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function makeDraft(date: Date, startMinutes = 9 * 60): EventDraft {
  const start = Math.max(0, Math.min(23 * 60, Math.round(startMinutes / 15) * 15))
  return {
    title: "",
    date: dateKey(date),
    start: minutesToTime(start),
    end: minutesToTime(Math.min(23 * 60 + 59, start + 60)),
    type: "class",
    location: "",
  }
}

export function CalendarView({
  events: initialEvents,
}: {
  events: CalendarEvent[]
}) {
  const [events, setEvents] = useState(initialEvents)
  const [storageReady, setStorageReady] = useState(false)
  const [storageLoadFailed, setStorageLoadFailed] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<CalendarViewMode>("week")
  const [draft, setDraft] = useState<EventDraft | null>(null)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [interaction, setInteraction] = useState<EventInteraction | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const suppressClickRef = useRef(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY)
        if (saved !== null) {
          const parsed: unknown = JSON.parse(saved)
          if (!Array.isArray(parsed) || !parsed.every(isCalendarEvent)) {
            throw new Error("Saved calendar data is not a valid event list.")
          }
          setEvents(parsed)
        }
      } catch (error) {
        setStorageLoadFailed(true)
        setStorageError(
          error instanceof Error ? error.message : "Could not load saved calendar events."
        )
      } finally {
        setStorageReady(true)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!storageReady || storageLoadFailed) return
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
        setStorageError(null)
      } catch (error) {
        setStorageError(
          error instanceof Error ? error.message : "Could not save calendar events."
        )
      }
    }, 100)
    return () => window.clearTimeout(timer)
  }, [events, storageLoadFailed, storageReady])

  const weekDays = useMemo(() => {
    const start = new Date(currentDate)
    start.setDate(start.getDate() - start.getDay())
    start.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start)
      day.setDate(start.getDate() + index)
      return day
    })
  }, [currentDate])

  const monthDays = useMemo(() => {
    const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const last = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
    const days: (Date | null)[] = []
    for (let index = 0; index < first.getDay(); index++) days.push(null)
    for (let day = 1; day <= last.getDate(); day++) {
      days.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))
    }
    while (days.length % 7 !== 0) days.push(null)
    return days
  }, [currentDate])

  const editingEvent = events.find((event) => event.id === editingEventId) ?? null
  const displayedEvents = events.map((event) => {
    if (interaction?.eventId !== event.id) return event
    return {
      ...event,
      date: interaction.previewDate,
      start: minutesToTime(interaction.previewStart),
      end: minutesToTime(interaction.previewEnd),
    }
  })

  function navigate(delta: number) {
    setCurrentDate((date) => {
      const next = new Date(date)
      if (view === "week") next.setDate(next.getDate() + delta * 7)
      else {
        const dayOfMonth = next.getDate()
        next.setDate(1)
        next.setMonth(next.getMonth() + delta)
        next.setDate(Math.min(dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()))
      }
      return next
    })
  }

  function goToToday() {
    setCurrentDate(new Date())
  }

  function isToday(date: Date) {
    return dateKey(date) === dateKey(new Date())
  }

  function openNewEvent(date: Date, startMinutes = 9 * 60) {
    setValidationError(null)
    setEditingEventId(null)
    setDraft(makeDraft(date, startMinutes))
  }

  function openEvent(event: CalendarEvent) {
    setValidationError(null)
    setEditingEventId(event.id)
    setDraft({
      title: event.title,
      date: event.date,
      start: event.start,
      end: event.end,
      type: event.type,
      location: event.location ?? "",
    })
  }

  function closeDialog() {
    setDraft(null)
    setEditingEventId(null)
    setValidationError(null)
  }

  function saveEvent() {
    if (!draft || !draft.title.trim()) return
    if (!isDateString(draft.date)) {
      setValidationError("Choose a valid date.")
      return
    }
    if (!isTimeString(draft.start) || !isTimeString(draft.end)) {
      setValidationError("Choose a valid start and end time.")
      return
    }
    const startMinutes = timeToMinutes(draft.start)
    const endMinutes = timeToMinutes(draft.end)
    if (endMinutes <= startMinutes) {
      setValidationError("An event must end after it starts.")
      return
    }
    const event: CalendarEvent = {
      ...draft,
      id: editingEventId ?? createEventId(),
      title: draft.title.trim(),
      location: draft.location?.trim() || undefined,
    }
    setEvents((current) =>
      editingEventId
        ? current.map((item) => (item.id === editingEventId ? event : item))
        : [...current, event]
    )
    setValidationError(null)
    closeDialog()
  }

  function deleteEvent() {
    if (!editingEventId) return
    setEvents((current) => current.filter((event) => event.id !== editingEventId))
    closeDialog()
  }

  function addFromGrid(date: Date, event: ReactMouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const minutes = ((event.clientY - bounds.top) / HOUR_HEIGHT) * 60
    openNewEvent(date, Math.floor(minutes / 15) * 15)
  }

  function beginInteraction(
    event: ReactPointerEvent<HTMLElement>,
    calendarEvent: CalendarEvent,
    mode: InteractionMode
  ) {
    event.preventDefault()
    event.stopPropagation()
    gridRef.current?.setPointerCapture(event.pointerId)
    const start = timeToMinutes(calendarEvent.start)
    const end = timeToMinutes(calendarEvent.end)
    setInteraction({
      eventId: calendarEvent.id,
      pointerId: event.pointerId,
      mode,
      originX: event.clientX,
      originY: event.clientY,
      initialStart: start,
      initialEnd: end,
      previewDate: calendarEvent.date,
      previewStart: start,
      previewEnd: end,
    })
  }

  function updateInteraction(event: ReactPointerEvent<HTMLElement>) {
    if (!interaction || interaction.pointerId !== event.pointerId) return
    const verticalDelta = event.clientY - interaction.originY
    const minuteDelta = Math.round((verticalDelta / HOUR_HEIGHT) * 4) * 15
    const moved = Math.abs(event.clientX - interaction.originX) > 3 || Math.abs(verticalDelta) > 3
    if (moved) suppressClickRef.current = true

    if (interaction.mode === "resize") {
      const previewEnd = Math.max(
        interaction.initialStart + 15,
        Math.min(23 * 60 + 59, interaction.initialEnd + minuteDelta)
      )
      setInteraction({ ...interaction, previewEnd })
      return
    }

    const bounds = gridRef.current?.getBoundingClientRect()
    if (!bounds) return
    const dayWidth = bounds.width / 7
    const dayIndex = Math.max(
      0,
      Math.min(6, Math.floor((event.clientX - bounds.left) / dayWidth))
    )
    const targetDate = weekDays[dayIndex]
    const duration = interaction.initialEnd - interaction.initialStart
    const previewStart = Math.max(
      0,
      Math.min(23 * 60 + 59 - duration, interaction.initialStart + minuteDelta)
    )
    setInteraction({
      ...interaction,
      previewDate: dateKey(targetDate),
      previewStart,
      previewEnd: previewStart + duration,
    })
  }

  function finishInteraction(event: ReactPointerEvent<HTMLElement>) {
    if (!interaction || interaction.pointerId !== event.pointerId) return
    const finished = interaction
    setEvents((current) =>
      current.map((item) =>
        item.id === finished.eventId
          ? {
              ...item,
              date: finished.previewDate,
              start: minutesToTime(finished.previewStart),
              end: minutesToTime(finished.previewEnd),
            }
          : item
      )
    )
    setInteraction(null)
  }

  function eventCard(event: CalendarEvent, compact = false) {
    const displayEvent =
      interaction?.eventId === event.id
        ? {
            ...event,
            date: interaction.previewDate,
            start: minutesToTime(interaction.previewStart),
            end: minutesToTime(interaction.previewEnd),
          }
        : event

    if (compact) {
      return (
        <button
          key={event.id}
          type="button"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation()
            openEvent(event)
          }}
          className={cn(
            "w-full truncate rounded px-1.5 py-0.5 text-left text-xs",
            eventColors[event.type].card
          )}
        >
          {formatTime(event.start)} {event.title}
        </button>
      )
    }

    const start = timeToMinutes(displayEvent.start)
    const end = timeToMinutes(displayEvent.end)
    const top = (start / 60) * HOUR_HEIGHT
    const height = Math.max(24, ((end - start) / 60) * HOUR_HEIGHT)
    return (
      <div
        key={event.id}
        role="button"
        tabIndex={0}
        onClick={(clickEvent) => {
          clickEvent.stopPropagation()
          if (interaction) return
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
          }
          openEvent(event)
        }}
        onKeyDown={(keyEvent) => {
          if (keyEvent.key === "Enter" || keyEvent.key === " ") openEvent(event)
        }}
        onPointerDown={(pointerEvent) =>
          beginInteraction(pointerEvent, event, "move")
        }
        onPointerMove={updateInteraction}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        className={cn(
          "absolute z-10 flex cursor-grab flex-col overflow-hidden rounded-md border px-2 py-1 text-left text-xs shadow-sm active:cursor-grabbing",
          "touch-none select-none hover:shadow-md",
          eventColors[event.type].card
        )}
        style={{
          top,
          height,
          left: "4px",
          right: "4px",
        }}
        title={`${event.title}: ${formatTime(event.start)}–${formatTime(event.end)}. Drag to move or pull the bottom handle to resize.`}
      >
        <span className="truncate font-semibold">{event.title}</span>
        <span className="truncate opacity-75">
          {formatTime(displayEvent.start)}–{formatTime(displayEvent.end)}
        </span>
        {event.location && <span className="truncate opacity-70">{event.location}</span>}
        <button
          type="button"
          aria-label={`Resize ${event.title}`}
          data-resize-handle
          onPointerDown={(pointerEvent) =>
            beginInteraction(pointerEvent, event, "resize")
          }
          onPointerMove={updateInteraction}
          onPointerUp={finishInteraction}
          onPointerCancel={finishInteraction}
          onClick={(clickEvent) => clickEvent.stopPropagation()}
          className="absolute inset-x-1 bottom-0 flex h-2 cursor-ns-resize items-center justify-center"
        >
          <span className="h-0.5 w-7 rounded-full bg-current opacity-40" />
        </button>
      </div>
    )
  }

  const heading =
    view === "week"
      ? `${formatDateHeading(weekDays[0], { month: "long", day: "numeric" })} – ${formatDateHeading(
          weekDays[6],
          { month: "long", day: "numeric", year: "numeric" }
        )}`
      : formatDateHeading(currentDate, { month: "long", year: "numeric" })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarDays className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Schedule builder</h1>
            <p className="text-sm text-muted-foreground">{heading}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
            <Button variant="ghost" size="icon-sm" aria-label="Previous period" onClick={() => navigate(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToToday}>Today</Button>
            <Button variant="ghost" size="icon-sm" aria-label="Next period" onClick={() => navigate(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex rounded-lg border border-border bg-card p-0.5">
            {(["week", "month"] as const).map((mode) => (
              <Button
                key={mode}
                variant={view === mode ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView(mode)}
              >
                {mode === "week" ? "Week" : "Month"}
              </Button>
            ))}
          </div>
          <Button onClick={() => openNewEvent(currentDate)}>
            <Plus className="size-4" />
            Add event
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-xs text-muted-foreground">
        {EVENT_TYPES.map((type) => (
          <span key={type} className="inline-flex items-center gap-1.5 capitalize">
            <span className={cn("size-2 rounded-full", eventColors[type].badge)} />
            {type}
          </span>
        ))}
        <span className="ml-auto">Drag events to move · Pull the bottom edge to stretch</span>
        {storageError && <span className="w-full text-destructive">{storageError}</span>}
      </div>

      {view === "week" ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border">
                <div className="border-r border-border" />
                {weekDays.map((day, index) => (
                  <button
                    key={dateKey(day)}
                    type="button"
                    onClick={() => openNewEvent(day)}
                    className={cn(
                      "border-r border-border px-2 py-3 text-center last:border-r-0 hover:bg-muted/40",
                      isToday(day) && "bg-primary/5"
                    )}
                  >
                    <span className="block text-xs text-muted-foreground">{DAYS[index]}</span>
                    <span
                      className={cn(
                        "mt-1 inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold",
                        isToday(day) && "bg-primary text-primary-foreground"
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-[56px_minmax(0,1fr)]">
                <div className="border-r border-border">
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div
                      key={hour}
                      className="relative h-16 border-b border-border/70 pr-2 text-right text-[11px] text-muted-foreground"
                    >
                      <span className="relative -top-2">
                        {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  ref={gridRef}
                  className="relative grid grid-cols-7 overflow-y-auto"
                  style={{ height: "min(72vh, 760px)" }}
                  onPointerMove={updateInteraction}
                  onPointerUp={finishInteraction}
                  onPointerCancel={finishInteraction}
                >
                  {weekDays.map((day) => {
                    const dayKey = dateKey(day)
                    return (
                      <div
                        key={dayKey}
                        className={cn(
                          "relative border-r border-border last:border-r-0",
                          isToday(day) && "bg-primary/[0.025]"
                        )}
                        style={{
                          height: GRID_HEIGHT,
                          backgroundImage:
                            "repeating-linear-gradient(to bottom, transparent 0, transparent 63px, var(--border) 63px, var(--border) 64px)",
                        }}
                        onClick={(event) => addFromGrid(day, event)}
                      >
                        {displayedEvents
                          .filter((event) => event.date === dayKey)
                          .map((event) => eventCard(event))}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-7 border-b border-border">
            {DAYS.map((day) => (
              <div key={day} className="p-3 text-center text-xs font-medium text-muted-foreground">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((day, index) => (
              <div
                key={day ? dateKey(day) : `blank-${index}`}
                className="min-h-28 border-b border-r border-border p-2 last:border-r-0"
                onClick={() => day && openNewEvent(day)}
              >
                {day && (
                  <>
                    <span className={cn(
                      "mb-1 inline-flex size-7 items-center justify-center rounded-full text-sm",
                      isToday(day) && "bg-primary font-semibold text-primary-foreground"
                    )}>
                      {day.getDate()}
                    </span>
                    <div className="space-y-1">
                      {displayedEvents
                        .filter((event) => event.date === dateKey(day))
                        .slice(0, 3)
                        .map((event) => eventCard(event, true))}
                      {displayedEvents.filter((event) => event.date === dateKey(day)).length > 3 && (
                        <p className="px-1 text-xs text-muted-foreground">
                          +{displayedEvents.filter((event) => event.date === dateKey(day)).length - 3} more
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => event.target === event.currentTarget && closeDialog()}>
          <div role="dialog" aria-modal="true" aria-labelledby="event-dialog-title" className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 id="event-dialog-title" className="text-lg font-semibold">
                  {editingEventId ? "Edit event" : "Create event"}
                </h2>
                <p className="text-sm text-muted-foreground">Set the event details and time block.</p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={closeDialog}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm sm:col-span-2">
                <span className="font-medium">Title</span>
                <Input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="e.g. Studio workshop" />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Date</span>
                <Input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Category</span>
                <select
                  value={draft.type}
                  onChange={(event) => setDraft({ ...draft, type: event.target.value as EventType })}
                  className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                >
                  {EVENT_TYPES.map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Starts</span>
                <Input type="time" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Ends</span>
                <Input type="time" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm sm:col-span-2">
                <span className="font-medium">Location</span>
                <Input value={draft.location ?? ""} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Optional" />
              </label>
            </div>
            {validationError && <p role="alert" className="mt-3 text-sm text-destructive">{validationError}</p>}
            <div className="mt-6 flex items-center justify-between gap-2">
              {editingEvent ? (
                <Button variant="destructive" onClick={deleteEvent}>
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button onClick={saveEvent} disabled={!draft.title.trim()}>Save event</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
