"use client"

import { widgetMeta } from "@/lib/dashboard-layout"
import { timeToMinutes } from "@/lib/format"
import type { CalendarEvent, EventType } from "@/lib/types"
import { WidgetFrame } from "@/components/dashboard/widget-frame"
import { cn } from "@/lib/utils"

const typeLabel: Record<EventType, string> = {
  class: "Class",
  focus: "Focus",
  meeting: "Meeting",
  personal: "Personal",
}

export function ScheduleWidget({
  events,
  now,
}: {
  events: CalendarEvent[]
  now: Date
}) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  return (
    <WidgetFrame title={widgetMeta.schedule.title} href={widgetMeta.schedule.href}>
      <ol className="space-y-3">
        {events.map((event) => {
          const start = timeToMinutes(event.start)
          const end = timeToMinutes(event.end)
          const current = currentMinutes >= start && currentMinutes < end

          return (
            <li key={event.id} className="flex gap-3">
              <div className="w-14 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                {event.start}
              </div>
              <div
                className={cn(
                  "min-w-0 flex-1 rounded-lg border border-transparent px-2.5 py-2",
                  current && "border-border bg-muted/70"
                )}
              >
                <p className="truncate text-sm font-medium">{event.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {event.start}–{event.end}
                  {event.location ? ` · ${event.location}` : ""}
                  {` · ${typeLabel[event.type]}`}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </WidgetFrame>
  )
}
