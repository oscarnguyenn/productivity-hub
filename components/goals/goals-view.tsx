"use client"

import { useState, useMemo } from "react"
import {
  Plus,
  Target,
  TrendingUp,
  Calendar,
  Flag,
  MoreHorizontal,
  Edit,
  Trash2,
  ChevronDown,
  Check,
  Award,
  ArrowUpRight,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { formatDueDate } from "@/lib/format"
import type { Goal } from "@/lib/types"

const horizonOrder = ["Week", "Month", "Quarter", "Semester", "Year", "Custom"]

export function GoalsView({
  goals: initialGoals,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
}: {
  goals: Goal[]
  onAddGoal?: (goal: Omit<Goal, "id">) => void
  onUpdateGoal?: (id: string, updates: Partial<Goal>) => void
  onDeleteGoal?: (id: string) => void
}) {
  const [goals, setGoals] = useState(initialGoals)
  const [view, setView] = useState<"grid" | "list">("grid")
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all")
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [newGoalTitle, setNewGoalTitle] = useState("")
  const [newGoalHorizon, setNewGoalHorizon] = useState("Quarter")
  const [newGoalTarget, setNewGoalTarget] = useState("")
  const [newGoalProgress, setNewGoalProgress] = useState(0)

  const filteredGoals = useMemo(() => {
    return goals
      .filter((goal) => {
        if (filter === "active") return goal.progress < 100
        if (filter === "completed") return goal.progress >= 100
        return true
      })
      .sort((a, b) => {
        // Sort by horizon order, then by progress
        const horizonA = horizonOrder.indexOf(a.horizon)
        const horizonB = horizonOrder.indexOf(b.horizon)
        if (horizonA !== horizonB) return horizonA - horizonB
        return b.progress - a.progress
      })
  }, [goals, filter])

  const activeGoals = goals.filter((g) => g.progress < 100)
  const completedGoals = goals.filter((g) => g.progress >= 100)
  const totalProgress = goals.length > 0
    ? Math.round(goals.reduce((sum, g) => sum + g.progress, 0) / goals.length)
    : 0

  const handleAddGoal = () => {
    if (!newGoalTitle.trim()) return
    const newGoal: Goal = {
      id: `goal-${crypto.randomUUID()}`,
      title: newGoalTitle.trim(),
      horizon: newGoalHorizon,
      progress: newGoalProgress,
      target: newGoalTarget.trim(),
    }
    setGoals((current) => [newGoal, ...current])
    onAddGoal?.(newGoal)
    setNewGoalTitle("")
    setNewGoalTarget("")
    setNewGoalProgress(0)
    setShowAddModal(false)
  }

  const handleUpdateGoal = (id: string, updates: Partial<Goal>) => {
    setGoals((current) => current.map((g) => (g.id === id ? { ...g, ...updates } : g)))
    onUpdateGoal?.(id, updates)
    setEditingGoal(null)
  }

  const handleDeleteGoal = (id: string) => {
    if (confirm("Are you sure you want to delete this goal?")) {
      setGoals((current) => current.filter((g) => g.id !== id))
      onDeleteGoal?.(id)
    }
  }

  const handleProgressChange = (goal: Goal, progress: number) => {
    const clamped = Math.min(100, Math.max(0, progress))
    handleUpdateGoal(goal.id, { progress: clamped })
  }

  const getHorizonColor = (horizon: string) => {
    const colors: Record<string, string> = {
      Week: "bg-purple-500",
      Month: "bg-blue-500",
      Quarter: "bg-orange-500",
      Semester: "bg-green-500",
      Year: "bg-red-500",
      Custom: "bg-gray-500",
    }
    return colors[horizon] || "bg-gray-500"
  }

  const getHorizonBg = (horizon: string) => {
    const colors: Record<string, string> = {
      Week: "bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300",
      Month: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300",
      Quarter: "bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300",
      Semester: "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300",
      Year: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300",
      Custom: "bg-gray-50 dark:bg-gray-950/30 text-gray-700 dark:text-gray-300",
    }
    return colors[horizon] || "bg-gray-50 dark:bg-gray-950/30 text-gray-700 dark:text-gray-300"
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Goals</h1>
          <p className="text-sm text-muted-foreground">
            {goals.length} goal{goals.length !== 1 ? "s" : ""} • {activeGoals.length} active • {completedGoals.length} completed
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="size-3.5 mr-1.5" />
          New Goal
        </Button>
      </div>

      {/* Overall Progress */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-muted-foreground">Overall Progress</p>
            <p className="text-2xl font-bold">{totalProgress}%</p>
          </div>
          <div className="w-48">
            <Progress value={totalProgress} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold">{goals.length}</p>
            <p className="text-xs text-muted-foreground">Total Goals</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold text-green-600">{completedGoals.length}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold text-blue-600">{activeGoals.length}</p>
            <p className="text-xs text-muted-foreground">In Progress</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 border border-border rounded-lg bg-background p-1">
        {(["all", "active", "completed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Goals */}
      {view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onProgressChange={(progress) => handleProgressChange(goal, progress)}
              onEdit={() => {
                setEditingGoal(goal)
                setNewGoalTitle(goal.title)
                setNewGoalHorizon(goal.horizon)
                setNewGoalTarget(goal.target)
                setNewGoalProgress(goal.progress)
              }}
              onDelete={() => handleDeleteGoal(goal.id)}
              getHorizonColor={getHorizonColor}
              getHorizonBg={getHorizonBg}
            />
          ))}
          {filteredGoals.length === 0 && (
            <div className="col-span-full rounded-xl border-2 border-dashed border-border bg-card/50 p-12 text-center">
              <Target className="size-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-medium mb-2">No goals yet</h3>
              <p className="text-muted-foreground mb-4">Set your first goal to start tracking progress</p>
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="size-3.5 mr-1.5" />
                Create Goal
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <ul className="divide-y divide-border">
            {filteredGoals.map((goal) => (
              <GoalListItem
                key={goal.id}
                goal={goal}
                onProgressChange={(progress) => handleProgressChange(goal, progress)}
                onEdit={() => {
                  setEditingGoal(goal)
                  setNewGoalTitle(goal.title)
                  setNewGoalHorizon(goal.horizon)
                  setNewGoalTarget(goal.target)
                  setNewGoalProgress(goal.progress)
                }}
                onDelete={() => handleDeleteGoal(goal.id)}
                getHorizonColor={getHorizonColor}
                getHorizonBg={getHorizonBg}
              />
            ))}
            {filteredGoals.length === 0 && (
              <li className="px-4 py-12 text-center text-muted-foreground">
                <Target className="size-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No goals found</p>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant={view === "grid" ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={() => setView("grid")}
          aria-label="Grid view"
        >
          <div className="grid grid-cols-2 gap-1">
            <div className="h-2 bg-muted rounded" />
            <div className="h-2 bg-muted rounded" />
            <div className="h-2 bg-muted rounded" />
            <div className="h-2 bg-muted rounded" />
          </div>
        </Button>
        <Button
          variant={view === "list" ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={() => setView("list")}
          aria-label="List view"
        >
          <div className="flex flex-col gap-1">
            <div className="h-2 bg-muted rounded w-3/4" />
            <div className="h-2 bg-muted rounded w-3/4" />
            <div className="h-2 bg-muted rounded w-3/4" />
            <div className="h-2 bg-muted rounded w-3/4" />
          </div>
        </Button>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingGoal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-xl border border-border w-full max-w-md">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingGoal ? "Edit Goal" : "New Goal"}
              </h2>
              <Button variant="ghost" size="icon-sm" onClick={() => {
                setShowAddModal(false)
                setEditingGoal(null)
                setNewGoalTitle("")
                setNewGoalTarget("")
                setNewGoalProgress(0)
              }}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <Input
                value={newGoalTitle}
                onChange={(e) => setNewGoalTitle(e.target.value)}
                placeholder="Goal title (e.g., Run a marathon)"
              />
              <select
                value={newGoalHorizon}
                onChange={(e) => setNewGoalHorizon(e.target.value)}
                className="w-full border border-border rounded-lg bg-background px-3 py-2 text-sm"
              >
                <option value="Week">Week</option>
                <option value="Month">Month</option>
                <option value="Quarter">Quarter</option>
                <option value="Semester">Semester</option>
                <option value="Year">Year</option>
                <option value="Custom">Custom</option>
              </select>
              <Input
                value={newGoalTarget}
                onChange={(e) => setNewGoalTarget(e.target.value)}
                placeholder="Target (e.g., 42.2 km, $10,000, 100 books)"
              />
              <div>
                <label className="block text-sm font-medium mb-2">Progress: {newGoalProgress}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={newGoalProgress}
                  onChange={(e) => setNewGoalProgress(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => {
                  setShowAddModal(false)
                  setEditingGoal(null)
                  setNewGoalTitle("")
                  setNewGoalTarget("")
                  setNewGoalProgress(0)
                }}>
                  Cancel
                </Button>
                <Button onClick={editingGoal ? () => handleUpdateGoal(editingGoal.id, {
                  title: newGoalTitle,
                  horizon: newGoalHorizon,
                  target: newGoalTarget,
                  progress: newGoalProgress,
                }) : handleAddGoal}>
                  {editingGoal ? "Save Changes" : "Create Goal"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function GoalCard({
  goal,
  onProgressChange,
  onEdit,
  onDelete,
  getHorizonColor,
  getHorizonBg,
}: {
  goal: Goal
  onProgressChange: (progress: number) => void
  onEdit: () => void
  onDelete: () => void
  getHorizonColor: (horizon: string) => string
  getHorizonBg: (horizon: string) => string
}) {
  const isCompleted = goal.progress >= 100
  const horizonColor = getHorizonColor(goal.horizon)
  const horizonBg = getHorizonBg(goal.horizon)

  return (
    <div className={cn(
      "rounded-xl border border-border bg-card p-4 flex flex-col h-full transition-shadow hover:shadow-md",
      isCompleted && "ring-2 ring-green-500/50"
    )}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", horizonBg)}>
          {goal.horizon}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" onClick={onEdit} aria-label="Edit goal">
            <Edit className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={onDelete} aria-label="Delete goal">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <h3 className={cn("font-medium mb-3", isCompleted && "line-through text-muted-foreground")}>
        {goal.title}
      </h3>

      <div className="flex-1 flex flex-col justify-between">
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium tabular-nums">{goal.progress}%</span>
            </div>
            <Progress value={goal.progress} />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <Flag className="size-3.5" />
              {goal.target}
            </span>
            {isCompleted && (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                <Check className="size-3.5" />
                Completed
              </span>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="100"
              value={goal.progress}
              onChange={(e) => onProgressChange(Number(e.target.value))}
              className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              disabled={isCompleted}
            />
            {isCompleted && (
              <Award className="size-5 text-yellow-500 shrink-0" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function GoalListItem({
  goal,
  onProgressChange,
  onEdit,
  onDelete,
  getHorizonColor,
  getHorizonBg,
}: {
  goal: Goal
  onProgressChange: (progress: number) => void
  onEdit: () => void
  onDelete: () => void
  getHorizonColor: (horizon: string) => string
  getHorizonBg: (horizon: string) => string
}) {
  const isCompleted = goal.progress >= 100
  const horizonBg = getHorizonBg(goal.horizon)

  return (
    <li className={cn("px-4 py-4 hover:bg-muted/50 transition-colors", isCompleted && "opacity-60")}>
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h4 className={cn("font-medium truncate", isCompleted && "line-through text-muted-foreground")}>
              {goal.title}
            </h4>
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", horizonBg)}>
              {goal.horizon}
            </span>
            {isCompleted && (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium text-sm">
                <Check className="size-3.5" />
                Completed
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Target: {goal.target}</p>
        </div>

        <div className="w-40 flex-shrink-0">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium tabular-nums">{goal.progress}%</span>
          </div>
          <Progress value={goal.progress} className="h-1.5" />
        </div>

        <div className="flex items-center gap-1">
          <input
            type="range"
            min="0"
            max="100"
            value={goal.progress}
            onChange={(e) => onProgressChange(Number(e.target.value))}
            className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary max-w-xs"
            disabled={isCompleted}
          />
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit goal">
            <Edit className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete goal">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </li>
  )
}