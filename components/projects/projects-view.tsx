"use client"

import { useState, useMemo, useEffect } from "react"
import {
  Plus,
  FolderKanban,
  Target,
  Calendar,
  Edit,
  Trash2,
  List,
  Columns3,
  LayoutGrid,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmAction } from "@/components/ui/confirm-action"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { formatDueDate, isDateBeforeToday } from "@/lib/format"
import { loadUserData, saveUserData } from "@/lib/user-data"
import type { Project, Task } from "@/lib/types"

const PROJECTS_STORAGE_KEY = "productivity-hub-projects-v1"
const TASKS_STORAGE_KEY = "productivity-hub-tasks-v1"

const statusConfig = {
  active: { label: "Active", color: "bg-green-500", bg: "bg-green-50 dark:bg-green-950/30", text: "text-green-700 dark:text-green-300" },
  paused: { label: "Paused", color: "bg-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/30", text: "text-yellow-700 dark:text-yellow-300" },
} as const

type ProjectStatus = "active" | "paused"
type ProjectViewMode = "grid" | "list" | "board"

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function getDefaultDueDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return localDateKey(date)
}

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false
  const project = value as Record<string, unknown>
  return typeof project.id === "string" &&
    typeof project.name === "string" &&
    (project.status === "active" || project.status === "paused") &&
    typeof project.progress === "number" &&
    typeof project.dueDate === "string"
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") return false
  const task = value as Record<string, unknown>
  return typeof task.id === "string" &&
    typeof task.title === "string" &&
    (task.status === "todo" || task.status === "in-progress" || task.status === "done") &&
    (task.project === undefined || typeof task.project === "string")
}

function ProjectViewToggle({ view, setView }: { view: ProjectViewMode; setView: (view: ProjectViewMode) => void }) {
  return (
    <div role="group" aria-label="Project view" className="flex items-center rounded-lg border border-border p-0.5">
      {([
        ["grid", LayoutGrid, "Grid"],
        ["list", List, "List"],
        ["board", Columns3, "Board"],
      ] as const).map(([mode, Icon, label]) => (
        <Button key={mode} type="button" size="icon-sm" variant={view === mode ? "secondary" : "ghost"} aria-label={`${label} view`} aria-pressed={view === mode} onClick={() => setView(mode)}>
          <Icon className="size-4" />
        </Button>
      ))}
    </div>
  )
}

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
  const [projectTasks, setProjectTasks] = useState<Task[]>(tasks)
  const [storageReady, setStorageReady] = useState(false)
  const [storageLoadFailed, setStorageLoadFailed] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [view, setView] = useState<"grid" | "list" | "board">("grid")
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [newProjectName, setNewProjectName] = useState("")
  const [newProjectDueDate, setNewProjectDueDate] = useState(getDefaultDueDate)

  const projectsWithTasks = useMemo((): ProjectWithTasks[] => {
    const tasksByProject = new Map<string, Task[]>()
    for (const task of projectTasks) {
      if (!task.project) continue
      const projectTasks = tasksByProject.get(task.project) ?? []
      projectTasks.push(task)
      tasksByProject.set(task.project, projectTasks)
    }

    return projects.map((project) => {
      const projectTasks = tasksByProject.get(project.name) ?? []
      const completedTasks = projectTasks.filter((t) => t.status === "done").length
      const totalTasks = projectTasks.length
      const calculatedProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
      const isOverdue = isDateBeforeToday(project.dueDate) && project.status === "active"
      return { ...project, _tasks: projectTasks, _completedTasks: completedTasks, _totalTasks: totalTasks, _calculatedProgress: calculatedProgress, _isOverdue: isOverdue }
    })
  }, [projects, projectTasks])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [savedProjects, savedTasks] = await Promise.all([
          loadUserData<unknown>(PROJECTS_STORAGE_KEY),
          loadUserData<unknown>(TASKS_STORAGE_KEY),
        ])
        if (savedProjects !== null && (!Array.isArray(savedProjects) || !savedProjects.every(isProject))) {
          throw new Error("Saved project data is not a valid project list.")
        }
        if (savedTasks !== null && (!Array.isArray(savedTasks) || !savedTasks.every(isTask))) {
          throw new Error("Saved task data is not a valid task list.")
        }
        if (active) {
          if (savedProjects !== null) setProjects(savedProjects)
          if (savedTasks !== null) setProjectTasks(savedTasks)
        }
      } catch (error) {
        if (active) {
          setStorageLoadFailed(true)
          setStorageError(error instanceof Error ? error.message : "Could not load projects.")
        }
      } finally {
        if (active) setStorageReady(true)
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!storageReady || storageLoadFailed) return
    const timer = window.setTimeout(() => {
      void Promise.all([
        saveUserData(PROJECTS_STORAGE_KEY, projects),
        saveUserData(TASKS_STORAGE_KEY, projectTasks),
      ]).then(() => setStorageError(null))
        .catch((error: unknown) => setStorageError(error instanceof Error ? error.message : "Could not save project data."))
    }, 100)
    return () => window.clearTimeout(timer)
  }, [projects, projectTasks, storageLoadFailed, storageReady])

  const openNewProject = () => {
    if (!storageReady || storageLoadFailed) return
    setEditingProject(null)
    setNewProjectName("")
    setNewProjectDueDate(getDefaultDueDate())
    setShowAddModal(true)
  }

  const openEditProject = (project: Project) => {
    if (!storageReady || storageLoadFailed) return
    setEditingProject(project)
    setNewProjectName(project.name)
    setNewProjectDueDate(project.dueDate)
  }

  const handleAddProject = () => {
    const name = newProjectName.trim()
    if (!storageReady || storageLoadFailed || !name || !newProjectDueDate || projects.some((project) => project.name.toLowerCase() === name.toLowerCase())) return
    const newProject: Project = {
      id: `proj-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
      name,
      status: "active",
      progress: 0,
      dueDate: newProjectDueDate,
    }
    setProjects((current) => [newProject, ...current])
    onAddProject?.(newProject)
    setNewProjectName("")
    setShowAddModal(false)
  }

  const handleUpdateProject = (id: string, updates: Partial<Project>) => {
    if (!storageReady || storageLoadFailed) return
    const existing = projects.find((project) => project.id === id)
    setProjects((current) => current.map((p) => (p.id === id ? { ...p, ...updates } : p)))
    if (existing && updates.name && updates.name !== existing.name) {
      setProjectTasks((current) => current.map((task) =>
        task.project === existing.name ? { ...task, project: updates.name } : task
      ))
    }
    onUpdateProject?.(id, updates)
    setEditingProject(null)
  }

  const handleDeleteProject = (id: string) => {
    if (!storageReady || storageLoadFailed) return
    setProjects((current) => current.filter((p) => p.id !== id))
    onDeleteProject?.(id)
  }

  const handleStatusChange = (project: ProjectWithTasks, newStatus: ProjectStatus) => {
    const updates: Partial<Project> = { status: newStatus }
    handleUpdateProject(project.id, updates)
  }

  const saveProject = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!storageReady || storageLoadFailed) return
    const name = newProjectName.trim()
    if (!name || !newProjectDueDate) return
    const duplicate = projects.some((project) =>
      project.id !== editingProject?.id && project.name.toLowerCase() === name.toLowerCase()
    )
    if (duplicate) return
    if (editingProject) {
      handleUpdateProject(editingProject.id, { name, dueDate: newProjectDueDate })
    } else {
      handleAddProject()
      return
    }
    setShowAddModal(false)
  }

  const projectEditor = (showAddModal || editingProject) ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={saveProject} className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-5 shadow-xl">
        <div>
          <h2 className="text-lg font-semibold">{editingProject ? "Edit project" : "New project"}</h2>
          <p className="text-sm text-muted-foreground">Progress is calculated from completed tasks assigned to this project.</p>
        </div>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Project name</span>
          <Input required maxLength={80} value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Due date</span>
          <Input required type="date" value={newProjectDueDate} onChange={(event) => setNewProjectDueDate(event.target.value)} />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => { setShowAddModal(false); setEditingProject(null) }}>Cancel</Button>
          <Button type="submit">{editingProject ? "Save changes" : "Create project"}</Button>
        </div>
      </form>
    </div>
  ) : null
  const storageStatus = storageError ? (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {storageError}
    </p>
  ) : null

  const activeProjects = projectsWithTasks.filter((p) => p.status === "active")
  const pausedProjects = projectsWithTasks.filter((p) => p.status === "paused")

  if (view === "board") {
    return (
      <div className="space-y-4">
        {storageStatus}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Projects</h1>
          <div className="flex items-center gap-2">
            <ProjectViewToggle view={view} setView={setView} />
            <Button onClick={openNewProject}>
            <Plus className="size-3.5 mr-1.5" />
            New Project
            </Button>
          </div>
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
                    onEdit={() => openEditProject(project)}
                    onDelete={() => handleDeleteProject(project.id)}
                  />
                ))}
                {column.projects.length === 0 && (
                  <div className="text-center text-muted-foreground py-8 text-sm">
                    No projects
                  </div>
                )}
              </div>
              {projectEditor}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (view === "list") {
    return (
      <div className="space-y-4">
        {storageStatus}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Projects</h1>
          <div className="flex items-center gap-2">
            <ProjectViewToggle view={view} setView={setView} />
            <Button onClick={openNewProject}>
            <Plus className="size-3.5 mr-1.5" />
            New Project
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <ul className="divide-y divide-border">
            {projectsWithTasks.map((project) => (
              <ProjectListItem
                key={project.id}
                project={project}
                onStatusChange={(status) => handleStatusChange(project, status)}
                onEdit={() => openEditProject(project)}
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
        {projectEditor}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {storageStatus}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <div className="flex items-center gap-2">
          <ProjectViewToggle view={view} setView={setView} />
          <Button onClick={openNewProject}>
          <Plus className="size-3.5 mr-1.5" />
          New Project
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projectsWithTasks.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onStatusChange={(status) => handleStatusChange(project, status)}
            onEdit={() => openEditProject(project)}
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
      {projectEditor}
    </div>
  )
}

function ProjectCard({
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
          <ConfirmAction
            title="Delete project?"
            description={`Delete “${project.name}”? This cannot be undone.`}
            onConfirm={onDelete}
          >
            {(openConfirmation) => (
              <Button variant="ghost" size="icon-xs" onClick={openConfirmation} aria-label="Delete project">
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </ConfirmAction>
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
  onEdit,
  onDelete,
}: {
  project: ProjectWithTasks
  onStatusChange: (status: ProjectStatus) => void
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
          <ConfirmAction
            title="Delete project?"
            description={`Delete “${project.name}”? This cannot be undone.`}
            onConfirm={onDelete}
          >
            {(openConfirmation) => (
              <Button variant="ghost" size="icon-sm" onClick={openConfirmation} aria-label="Delete project">
                <Trash2 className="size-4" />
              </Button>
            )}
          </ConfirmAction>
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
          <ConfirmAction
            title="Delete project?"
            description={`Delete “${project.name}”? This cannot be undone.`}
            onConfirm={onDelete}
          >
            {(openConfirmation) => (
              <Button variant="ghost" size="icon-xs" onClick={openConfirmation} aria-label="Delete project">
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </ConfirmAction>
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