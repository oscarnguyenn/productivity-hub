"use client"

import { useState } from "react"
import { formatLongDate, greetingForHour } from "@/lib/format"

export function DashboardHeader({ name }: { name: string }) {
  const [now] = useState<Date>(() => new Date())

  const greeting = greetingForHour(now.getHours())
  const dateLabel = formatLongDate(now)

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting}, {name}
        </h1>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
      </div>
    </div>
  )
}