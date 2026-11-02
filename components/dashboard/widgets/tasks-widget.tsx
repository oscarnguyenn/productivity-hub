import { widgetMeta } from "@/lib/dashboard-layout"
import { formatDueDate } from "@/lib/format"
import type { Priority, Task } from "@/lib/types"
import { WidgetFrame } from "@/components/dashboard/widget-frame"
import { cn } from "@/lib/utils"

const priorityClass: Record<Priority, string> = {
  high: "bg-foreground text-background",
  medium: "bg-muted text-foreground",
  low: "bg-transparent text-muted-foreground ring-1 ring-border",
}

function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <ul className="space-y-2.5">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{task.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {task.project ? `${task.project} · ` : ""}
              {formatDueDate(task.dueDate)}
            </p>
          </div>
          <span
            className={cn(
              "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
              priorityClass[task.priority]
            )}
          >
            {task.priority}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function PriorityTasksWidget({ tasks }: { tasks: Task[] }) {
  const items = tasks
    .filter((task) => task.status !== "done" && task.priority === "high")
    .slice(0, 4)

  return (
    <WidgetFrame
      title={widgetMeta["priority-tasks"].title}
      href={widgetMeta["priority-tasks"].href}
    >
      <TaskList tasks={items} />
    </WidgetFrame>
  )
}

export function UpcomingTasksWidget({ tasks }: { tasks: Task[] }) {
  const items = [...tasks]
    .filter((task) => task.status !== "done")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5)

  return (
    <WidgetFrame
      title={widgetMeta["upcoming-tasks"].title}
      href={widgetMeta["upcoming-tasks"].href}
    >
      <TaskList tasks={items} />
    </WidgetFrame>
  )
}
