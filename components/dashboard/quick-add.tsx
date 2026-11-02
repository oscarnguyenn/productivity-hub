"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { QuickAddKind } from "@/lib/types"
import { cn } from "@/lib/utils"

const kinds: { id: QuickAddKind; label: string }[] = [
  { id: "task", label: "Task" },
  { id: "event", label: "Event" },
  { id: "note", label: "Note" },
]

export function QuickAdd({
  onAdd,
}: {
  onAdd: (kind: QuickAddKind, title: string) => void
}) {
  const [kind, setKind] = useState<QuickAddKind>("task")
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState<string | null>(null)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const value = title.trim()
    if (!value) return
    onAdd(kind, value)
    setTitle("")
    setMessage(`${kinds.find((item) => item.id === kind)?.label} captured`)
    window.setTimeout(() => setMessage(null), 1800)
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2 sm:flex-row sm:items-center"
    >
      <div className="flex gap-1 p-1">
        {kinds.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setKind(item.id)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              kind === item.id
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={`Add a ${kind}…`}
        className="border-0 bg-transparent shadow-none focus-visible:ring-0"
        aria-label={`Quick add ${kind}`}
      />
      <div className="flex items-center justify-between gap-2 px-1 sm:justify-end">
        {message ? (
          <p className="text-xs text-muted-foreground">{message}</p>
        ) : null}
        <Button type="submit" size="sm">
          <Plus data-icon="inline-start" />
          Add
        </Button>
      </div>
    </form>
  )
}
