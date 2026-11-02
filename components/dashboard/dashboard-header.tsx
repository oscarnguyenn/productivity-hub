"use client"

import { useEffect, useState } from "react"
import { formatLongDate, greetingForHour } from "@/lib/format"

export function DashboardHeader({ name }: { name: string }) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
  }, [])

  const greeting = now ? greetingForHour(now.getHours()) : "Hello"
  const dateLabel = now ? formatLongDate(now) : "Today"

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
