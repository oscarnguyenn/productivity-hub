"use client"

import { useState, useMemo } from "react"
import {
  Filter,
  ChevronDown,
  ChevronUp,
  Plus,
  CheckSquare,
  Flag,
  Calendar,
  FolderKanban,
  Search,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatDueDate } from "@/lib/format"
import type { Task, Priority, TaskStatus, Project } from "@/lib/types"

const statusLabels: Record<TaskStatus, string> = {
  todo: "To Do",
  "in-progress": "In Progress",
  done: "Done",
}

const priorityLabels: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
}

const priorityColors: Record<Priority, string> = {
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
}

const priorityTextColors: Record<Priority, string> = {
  high: "text-red-700 dark:text-red-300",
  medium: "text-yellow-700 dark:text-yellow-300",
  low: "text-green-700 dark:text-green-300",
}

const priorityBgColors: Record<Priority, string> = {
  high: "bg-red-50 dark:bg-red-950/30",
  medium: "bg-yellow-50 dark:bg-yellow-950/30",
  low: "bg-green-50 dark:bg-green-950/30",
}

const statusColors: Record<TaskStatus, string> = {
  todo: "bg-muted",
  "in-progress": "bg-blue-500",
  done: "bg-green-500",
}

export function TasksView({
  tasks: initialTasks,
  projects,
  onAddTask,
  onToggleTask,
  onDeleteTask,
}: {
  tasks: Task[]
  projects: Project[]
  onAddTask?: (task: Omit<Task, "id">) => void
  onToggleTask?: (id: string, status: TaskStatus) => void
  onDeleteTask?: (id: string) => void
}) {
  const [tasks, setTasks] = useState(initialTasks)
  const [filter, setFilter] = useState<{
    status: TaskStatus | "all"
    priority: Priority | "all"
    project: string | "all"
    search: string
  }>({
    status: "all",
    priority: "all",
    project: "all",
    search: "",
  })
  const [sort, setSort] = useState<{
    key: "dueDate" | "priority" | "project" | "status" | "title"
    direction: "asc" | "desc"
  }>({ key: "dueDate", direction: "asc" })
  const [view, setView] = useState<"list" | "board">("list")
  const [groupBy, setGroupBy] = useState<"none" | "project" | "status" | "priority">("none")

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        if (filter.status !== "all" && task.status !== filter.status) return false
        if (filter.priority !== "all" && task.priority !== filter.priority) return false
        if (filter.project !== "all" && task.project !== filter.project) return false
        if (filter.search) {
          const search = filter.search.toLowerCase()
          if (!task.title.toLowerCase().includes(search)) return false
        }
        return true
      })
      .sort((a, b) => {
        let comparison = 0
        switch (sort.key) {
          case "dueDate":
            comparison = a.dueDate.localeCompare(b.dueDate)
            break
          case "priority": {
            const priorityOrder = { high: 3, medium: 2, low: 1 }
            comparison = priorityOrder[a.priority] - priorityOrder[b.priority]
            break
          }
          case "project":
            comparison = (a.project || "").localeCompare(b.project || "")
            break
          case "status": {
            const statusOrder = { todo: 1, "in-progress": 2, done: 3 }
            comparison = statusOrder[a.status] - statusOrder[b.status]
            break
          }
          case "title":
            comparison = a.title.localeCompare(b.title)
            break
        }
        return sort.direction === "asc" ? comparison : -comparison
      })
  }, [tasks, filter, sort])

  const groupedTasks = useMemo(() => {
    if (groupBy === "none") return { "All Tasks": filteredTasks }

    const groups = new Map<string, Task[]>()
    filteredTasks.forEach((task) => {
      let key: string
      switch (groupBy) {
        case "project":
          key = task.project || "No Project"
          break
        case "status":
          key = statusLabels[task.status]
          break
        case "priority":
          key = `${priorityLabels[task.priority]} Priority`
          break
      }
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(task)
    })
    return Object.fromEntries(groups)
  }, [filteredTasks, groupBy])

  const handleAddTask = (title: string) => {
    if (!title.trim()) return
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dueDate = tomorrow.toISOString().split("T")[0]

    const newTask: Task = {
      id: `task-${crypto.randomUUID()}`,
      title: title.trim(),
      dueDate,
      priority: "medium",
      status: "todo",
    }

    setTasks((current) => [newTask, ...current])
    onAddTask?.(newTask)
  }

  const handleToggleTask = (task: Task) => {
    const newStatus: TaskStatus = task.status === "done" ? "todo" : "done"
    setTasks((current) =>
      current.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
    )
    onToggleTask?.(task.id, newStatus)
  }

  const handleDeleteTask = (id: string) => {
    setTasks((current) => current.filter((t) => t.id !== id))
    onDeleteTask?.(id)
  }

  const clearFilters = () => {
    setFilter({ status: "all", priority: "all", project: "all", search: "" })
  }

  const hasActiveFilters =
    filter.status !== "all" ||
    filter.priority !== "all" ||
    filter.project !== "all" ||
    filter.search !== ""

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <span className="text-sm text-muted-foreground">
            {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks…"
              value={filter.search}
              onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={clearFilters} disabled={!hasActiveFilters}>
            <X className="size-3.5 mr-1.5" />
            Clear
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 border border-border rounded-lg bg-background p-1">
          {(["all", "todo", "in-progress", "done"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter((f) => ({ ...f, status }))}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                filter.status === status
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {status === "all" ? "All" : statusLabels[status]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 border border-border rounded-lg bg-background p-1">
          {(["all", "high", "medium", "low"] as const).map((priority) => {
            const isAll = priority === "all"
            const isActive = filter.priority === priority
            return (
              <button
                key={priority}
                type="button"
                onClick={() => setFilter((f) => ({ ...f, priority }))}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                  isActive
                    ? isAll
                      ? "bg-primary text-primary-foreground"
                      : `${priorityColors[priority]} text-white`
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isAll ? "Priority" : priorityLabels[priority]}
              </button>
            )
          })}
        </div>

        <select
          value={filter.project}
          onChange={(e) => setFilter((f) => ({ ...f, project: e.target.value }))}
          className="flex items-center gap-1 border border-border rounded-lg bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
          <option value="No Project">No Project</option>
        </select>

        <div className="flex-1" />

        <div className="flex items-center gap-1 border border-border rounded-lg bg-background p-1">
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => setView("list")}
            aria-label="List view"
          >
            <CheckSquare className="size-4" />
          </Button>
          <Button
            variant={view === "board" ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => setView("board")}
            aria-label="Board view"
          >
            <FolderKanban className="size-4" />
          </Button>
        </div>

        <select
          value={`${sort.key}-${sort.direction}`}
          onChange={(e) => {
            const [key, direction] = e.target.value.split("-")
            setSort({ key: key as typeof sort.key, direction: direction as "asc" | "desc" })
          }}
          className="border border-border rounded-lg bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground"
        >
          <option value="dueDate-asc">Due Date ↑</option>
          <option value="dueDate-desc">Due Date ↓</option>
          <option value="priority-desc">Priority ↓</option>
          <option value="priority-asc">Priority ↑</option>
          <option value="project-asc">Project A-Z</option>
          <option value="project-desc">Project Z-A</option>
          <option value="status-asc">Status ↑</option>
          <option value="status-desc">Status ↓</option>
          <option value="title-asc">Title A-Z</option>
          <option value="title-desc">Title Z-A</option>
        </select>

        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
          className="border border-border rounded-lg bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground"
        >
          <option value="none">No Grouping</option>
          <option value="project">Group by Project</option>
          <option value="status">Group by Status</option>
          <option value="priority">Group by Priority</option>
        </select>
      </div>

      {view === "list" ? (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {Object.entries(groupedTasks).map(([groupName, groupTasks]) => (
            <div key={groupName} className="border-b border-border last:border-0">
              {Object.keys(groupedTasks).length > 1 && (
                <div className="px-4 py-2 bg-muted/50 border-b border-border">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {groupName} ({groupTasks.length})
                  </h3>
                </div>
              )}
              <ul className="divide-y divide-border">
                {groupTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => handleToggleTask(task)}
                    onDelete={() => handleDeleteTask(task.id)}
                  />
                ))}
              </ul>
            </div>
          ))}
          {filteredTasks.length === 0 && (
            <div className="px-4 py-12 text-center text-muted-foreground">
              <CheckSquare className="size-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No tasks found</p>
              {hasActiveFilters && (
                <p className="text-xs mt-1">Try adjusting your filters</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(["todo", "in-progress", "done"] as TaskStatus[]).map((status) => {
            const statusTasks = filteredTasks.filter((t) => t.status === status)
            return (
              <div
                key={status}
                className="rounded-xl border border-border bg-card flex flex-col min-h-[400px]"
              >
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <h3 className="font-medium flex items-center gap-2">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        statusColors[status]
                      )}
                    />
                    {statusLabels[status]}
                    <span className="text-sm text-muted-foreground">
                      {statusTasks.length}
                    </span>
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {statusTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggle={() => handleToggleTask(task)}
                      onDelete={() => handleDeleteTask(task.id)}
                    />
                  ))}
                  {statusTasks.length === 0 && (
                    <div className="text-center text-muted-foreground py-8 text-sm">
                      No tasks
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="border-t border-border pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const title = prompt("Enter task title:")
            if (title) handleAddTask(title)
          }}
          className="w-full sm:w-auto"
        >
          <Plus className="size-3.5 mr-1.5" />
          Add Task
        </Button>
      </div>
    </div>
  )
}

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: Task
  onToggle: () => void
  onDelete: () => void
}) {
  const isOverdue =
    new Date(task.dueDate) < new Date() && task.status !== "done"

  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
          task.status === "done"
            ? "border-green-500 bg-green-500 text-white"
            : "border-border bg-background hover:border-primary/50"
        )}
        aria-label={task.status === "done" ? "Mark incomplete" : "Mark complete"}
      >
        {task.status === "done" && <CheckSquare className="size-3" />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium truncate",
            task.status === "done" && "line-through text-muted-foreground"
          )}
        >
          {task.title}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
          {task.project && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted">
              <FolderKanban className="size-3" />
              {task.project}
            </span>
          )}
          <span className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-full",
            priorityBgColors[task.priority],
            priorityTextColors[task.priority]
          )}>
            <Flag className="size-3" />
            {priorityLabels[task.priority]}
          </span>
          <span className={cn(
            "flex items-center gap-1",
            isOverdue && task.status !== "done" && "text-red-500"
          )}>
            <Calendar className="size-3" />
            {formatDueDate(task.dueDate)}
            {isOverdue && task.status !== "done" && " (Overdue)"}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="text-muted-foreground hover:text-destructive transition-colors p-1"
        aria-label="Delete task"
      >
        <X className="size-4" />
      </button>
    </li>
  )
}

function TaskCard({
  task,
  onToggle,
  onDelete,
}: {
  task: Task
  onToggle: () => void
  onDelete: () => void
}) {
  const isOverdue =
    new Date(task.dueDate) < new Date() && task.status !== "done"

  return (
    <div
      className={cn(
        "p-3 rounded-lg border border-border bg-background transition-shadow hover:shadow-sm",
        task.status === "done" && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            "text-sm font-medium flex-1 pr-2",
            task.status === "done" && "line-through text-muted-foreground"
          )}
        >
          {task.title}
        </p>
        <button
          type="button"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
          aria-label="Delete task"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {task.project && (
        <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1">
          <FolderKanban className="size-3" />
          {task.project}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={cn(
          "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
          priorityBgColors[task.priority],
          priorityTextColors[task.priority]
        )}>
          <Flag className="size-2.5" />
          {priorityLabels[task.priority]}
        </span>
        <span className={cn(
          "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-muted-foreground bg-muted",
          isOverdue && task.status !== "done" && "text-red-500 bg-red-50 dark:bg-red-950/30"
        )}>
          <Calendar className="size-2.5" />
          {formatDueDate(task.dueDate)}
        </span>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "mt-3 w-full text-sm font-medium rounded-lg py-1.5 transition-colors",
          task.status === "done"
            ? "bg-green-500 text-white hover:bg-green-600"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
      >
        {task.status === "done" ? "Mark Incomplete" : "Mark Complete"}
      </button>
    </div>
  )
}