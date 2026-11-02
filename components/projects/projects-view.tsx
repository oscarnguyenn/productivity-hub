"use client"

import { useState, useMemo } from "react"
import {
  Plus,
  FolderKanban,
  Target,
  Calendar,
  TrendingUp,
  MoreHorizontal,
  Edit,
  Trash2,
  ChevronDown,
  Check,
  Flag,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { formatDueDate } from "@/lib/format"
import type { Project, Task } from "@/lib/types"

const statusConfig = {
  active: { label: "Active", color: "bg-green-500", bg: "bg-green-50 dark:bg-green-950/30", text: "text-green-700 dark:text-green-300" },
  paused: { label: "Paused", color: "bg-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/30", text: "text-yellow-700 dark:text-yellow-300" },
} as const

type ProjectStatus = "active" | "paused"

interface ProjectWithTasks extends Project {
  _tasks: Task[]
  _completedTasks: number
  _totalTasks: number
  _calculatedProgress: number
  _isOverdue: boolean
}

export function ProjectsView({
  projects: initialProjects,
  tasks,
  onAddProject,
  onUpdateProject,
  onDeleteProject,
}: {
  projects: Project[]
  tasks: Task[]
  onAddProject?: (project: Omit<Project, "id">) => void
  onUpdateProject?: (id: string, updates: Partial<Project>) => void
  onDeleteProject?: (id: string) => void
}) {
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [view, setView] = useState<"grid" | "list" | "board">("grid")
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [newProjectName, setNewProjectName] = useState("")

  const projectsWithTasks = useMemo((): ProjectWithTasks[] => {
    return projects.map((project) => {
      const projectTasks = tasks.filter((t) => t.project === project.name)
      const completedTasks = projectTasks.filter((t) => t.status === "done").length
      const totalTasks = projectTasks.length
      const calculatedProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : project.progress
      const isOverdue = new Date(project.dueDate) < new Date() && project.status === "active"
      return { ...project, _tasks: projectTasks, _completedTasks: completedTasks, _totalTasks: totalTasks, _calculatedProgress: calculatedProgress, _isOverdue: isOverdue }
    })
  }, [projects, tasks])

  const handleAddProject = () => {
    if (!newProjectName.trim()) return
    const newProject: Project = {
      id: `proj-${crypto.randomUUID()}`,
      name: newProjectName.trim(),
      status: "active",
      progress: 0,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    }
    setProjects((current) => [newProject, ...current])
    onAddProject?.(newProject)
    setNewProjectName("")
    setShowAddModal(false)
  }

  const handleUpdateProject = (id: string, updates: Partial<Project>) => {
    setProjects((current) => current.map((p) => (p.id === id ? { ...p, ...updates } : p)))
    onUpdateProject?.(id, updates)
    setEditingProject(null)
  }

  const handleDeleteProject = (id: string) => {
    if (confirm("Are you sure you want to delete this project?")) {
      setProjects((current) => current.filter((p) => p.id !== id))
      onDeleteProject?.(id)
    }
  }

  const handleStatusChange = (project: ProjectWithTasks, newStatus: ProjectStatus) => {
    const updates: Partial<Project> = { status: newStatus }
    handleUpdateProject(project.id, updates)
  }

  const handleProgressChange = (project: ProjectWithTasks, progress: number) => {
    const clampedProgress = Math.min(100, Math.max(0, progress))
    const updates: Partial<Project> = { progress: clampedProgress }
    handleUpdateProject(project.id, updates)
  }

  const activeProjects = projectsWithTasks.filter((p) => p.status === "active")
  const pausedProjects = projectsWithTasks.filter((p) => p.status === "paused")

  if (view === "board") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Projects</h1>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="size-3.5 mr-1.5" />
            New Project
          </Button>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {[
            { status: "active" as ProjectStatus, label: "Active", projects: activeProjects },
            { status: "paused" as ProjectStatus, label: "Paused", projects: pausedProjects },
          ].map((column) => (
            <div
              key={column.status}
              className="flex-shrink-0 w-80 flex flex-col bg-muted/50 rounded-xl border border-border min-h-[500px]"
            >
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      statusConfig[column.status].color
                    )}
                  />
                  <h3 className="font-medium">{column.label}</h3>
                  <span className="text-sm text-muted-foreground">{column.projects.length}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {column.projects.map((project) => (
                  <ProjectBoardCard
                    key={project.id}
                    project={project}
                    onStatusChange={(status) => handleStatusChange(project, status)}
                    onEdit={() => setEditingProject(project)}
                    onDelete={() => handleDeleteProject(project.id)}
                  />
                ))}
                {column.projects.length === 0 && (
                  <div className="text-center text-muted-foreground py-8 text-sm">
                    No projects
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (view === "list") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Projects</h1>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="size-3.5 mr-1.5" />
            New Project
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <ul className="divide-y divide-border">
            {projectsWithTasks.map((project) => (
              <ProjectListItem
                key={project.id}
                project={project}
                onStatusChange={(status) => handleStatusChange(project, status)}
                onProgressChange={(progress) => handleProgressChange(project, progress)}
                onEdit={() => setEditingProject(project)}
                onDelete={() => handleDeleteProject(project.id)}
              />
            ))}
            {projectsWithTasks.length === 0 && (
              <li className="px-4 py-12 text-center text-muted-foreground">
                <FolderKanban className="size-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No projects yet</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setShowAddModal(true)}>
                  Create your first project
                </Button>
              </li>
            )}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="size-3.5 mr-1.5" />
          New Project
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projectsWithTasks.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onStatusChange={(status) => handleStatusChange(project, status)}
            onProgressChange={(progress) => handleProgressChange(project, progress)}
            onEdit={() => setEditingProject(project)}
            onDelete={() => handleDeleteProject(project.id)}
          />
        ))}
        {projectsWithTasks.length === 0 && (
          <div className="col-span-full rounded-xl border-2 border-dashed border-border bg-card/50 p-12 text-center">
            <FolderKanban className="size-16 mx-auto mb-4 opacity-30" />
            <h3 className="text-lg font-medium mb-2">No projects yet</h3>
            <p className="text-muted-foreground mb-4">Create your first project to get started</p>
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="size-3.5 mr-1.5" />
              Create Project
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function ProjectCard({
  project,
  onStatusChange,
  onProgressChange,
  onEdit,
  onDelete,
}: {
  project: ProjectWithTasks
  onStatusChange: (status: ProjectStatus) => void
  onProgressChange: (progress: number) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const status = project.status
  const config = statusConfig[status]
  const isOverdue = project._isOverdue

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{project.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", config.bg, config.text)}>
              {config.label}
            </span>
            {isOverdue && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300">
                Overdue
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" onClick={onEdit} aria-label="Edit project">
            <Edit className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={onDelete} aria-label="Delete project">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-between">
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium tabular-nums">{project._calculatedProgress}%</span>
            </div>
            <Progress value={project._calculatedProgress} />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <Target className="size-3.5" />
              {project._completedTasks}/{project._totalTasks} tasks
            </span>
            <span className={cn("flex items-center gap-1 font-medium", isOverdue ? "text-red-500" : "text-muted-foreground")}>
              <Calendar className="size-3.5" />
              {formatDueDate(project.dueDate)}
            </span>
          </div>
        </div>

        <div className="pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Status:</span>
            <select
              value={project.status}
              onChange={(e) => onStatusChange(e.target.value as ProjectStatus)}
              className="flex-1 text-sm border border-border rounded-lg bg-background px-2 py-1"
            >
              {Object.entries(statusConfig).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProjectListItem({
  project,
  onStatusChange,
  onProgressChange,
  onEdit,
  onDelete,
}: {
  project: ProjectWithTasks
  onStatusChange: (status: ProjectStatus) => void
  onProgressChange: (progress: number) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const status = project.status
  const config = statusConfig[status]
  const isOverdue = project._isOverdue

  return (
    <li className="px-4 py-4 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium truncate">{project.name}</h3>
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", config.bg, config.text)}>
              {config.label}
            </span>
            {isOverdue && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300">
                Overdue
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Target className="size-3.5" />
              {project._completedTasks}/{project._totalTasks} tasks
            </span>
            <span className={cn("flex items-center gap-1", isOverdue ? "text-red-500" : "")}>
              <Calendar className="size-3.5" />
              {formatDueDate(project.dueDate)}
            </span>
          </div>
        </div>

        <div className="w-40 flex-shrink-0">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium tabular-nums">{project._calculatedProgress}%</span>
          </div>
          <Progress value={project._calculatedProgress} className="h-1.5" />
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit project">
            <Edit className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete project">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </li>
  )
}

function ProjectBoardCard({
  project,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  project: ProjectWithTasks
  onStatusChange: (status: ProjectStatus) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const isOverdue = project._isOverdue

  return (
    <div className="p-3 rounded-lg border border-border bg-background">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium truncate flex-1">{project.name}</h4>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" onClick={onEdit} aria-label="Edit project">
            <Edit className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={onDelete} aria-label="Delete project">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-2 mb-3">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium tabular-nums">{project._calculatedProgress}%</span>
          </div>
          <Progress value={project._calculatedProgress} className="h-1.5" />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Target className="size-3" />
            {project._completedTasks}/{project._totalTasks}
          </span>
          <span className={cn("flex items-center gap-1", isOverdue ? "text-red-500" : "")}>
            <Calendar className="size-3" />
            {formatDueDate(project.dueDate)}
          </span>
        </div>
      </div>

      <div className="pt-2 border-t border-border">
        <select
          value={project.status}
          onChange={(e) => onStatusChange(e.target.value as ProjectStatus)}
          className="w-full text-xs border border-border rounded bg-background px-2 py-1"
        >
          {Object.entries(statusConfig).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}