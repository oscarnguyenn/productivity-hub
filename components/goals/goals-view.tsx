"use client"

import { useState, useMemo, useEffect, useId } from "react"
import {
  Plus,
  Target,
  Flag,
  Edit,
  Trash2,
  Check,
  Award,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmAction } from "@/components/ui/confirm-action"
import { Input } from "@/components/ui/input"
import { loadUserData, removeUserData, saveUserData } from "@/lib/user-data"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type { Goal, GoalProgressEntry } from "@/lib/types"

const horizonOrder = ["Week", "Month", "Quarter", "Semester", "Year", "Custom"]
const GOALS_STORAGE_KEY = "productivity-hub-goals-v1"

function getCurrentValue(goal: Goal): number {
  return goal.progressEntries?.length
    ? goal.progressEntries.reduce((total, entry) => total + entry.amount, 0)
    : goal.currentValue ?? 0
}

function getProgress(currentValue: number, targetValue: number): number {
  return targetValue > 0 ? Math.min(100, Math.round((currentValue / targetValue) * 100)) : 0
}

function isProgressEntry(value: unknown): value is GoalProgressEntry {
  if (!value || typeof value !== "object") return false
  const entry = value as Record<string, unknown>
  return typeof entry.id === "string" &&
    typeof entry.amount === "number" &&
    Number.isFinite(entry.amount) &&
    entry.amount > 0 &&
    typeof entry.note === "string" &&
    typeof entry.loggedAt === "string" &&
    !Number.isNaN(Date.parse(entry.loggedAt))
}

function normalizeGoal(value: unknown): Goal | null {
  if (!value || typeof value !== "object") return null
  const goal = value as Record<string, unknown>
  if (
    typeof goal.id !== "string" ||
    typeof goal.title !== "string" ||
    typeof goal.horizon !== "string" ||
    typeof goal.target !== "string" ||
    typeof goal.progress !== "number" ||
    !Number.isFinite(goal.progress)
  ) return null

  const entries = Array.isArray(goal.progressEntries) ? goal.progressEntries : []
  if (!entries.every(isProgressEntry)) return null
  const targetValue = typeof goal.targetValue === "number" && Number.isFinite(goal.targetValue) && goal.targetValue > 0
    ? goal.targetValue
    : undefined
  const measureUnit = typeof goal.measureUnit === "string" ? goal.measureUnit.trim() : ""
  const currentValue = entries.length
    ? entries.reduce((total, entry) => total + entry.amount, 0)
    : typeof goal.currentValue === "number" && Number.isFinite(goal.currentValue)
      ? Math.max(0, goal.currentValue)
      : 0

  return {
    id: goal.id,
    title: goal.title,
    horizon: goal.horizon,
    target: goal.target,
    targetValue,
    measureUnit,
    currentValue,
    progressEntries: entries,
    progress: targetValue && measureUnit ? getProgress(currentValue, targetValue) : 0,
  }
}

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
  const [newGoalTargetValue, setNewGoalTargetValue] = useState("1")
  const [newGoalMeasureUnit, setNewGoalMeasureUnit] = useState("steps")
  const [storageReady, setStorageReady] = useState(false)
  const [storageLoadFailed, setStorageLoadFailed] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const parsed = await loadUserData<unknown>(GOALS_STORAGE_KEY)
          if (parsed !== null) {
          if (!Array.isArray(parsed)) throw new Error("Saved goal data is not a goal list.")
          const normalized = parsed.map(normalizeGoal)
          if (normalized.some((goal) => goal === null)) throw new Error("Saved goal data contains an invalid goal.")
            if (active) setGoals(normalized.filter((goal): goal is Goal => goal !== null))
          } else if (active) {
            setGoals(initialGoals.map((goal) => normalizeGoal(goal) ?? goal))
          }
        } catch (error) {
          if (active) {
            setStorageLoadFailed(true)
            setStorageError(error instanceof Error ? error.message : "Could not load saved goals.")
          }
        } finally {
          if (active) setStorageReady(true)
        }
      })()
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [initialGoals])

  useEffect(() => {
    if (!storageReady || storageLoadFailed) return
    const timer = window.setTimeout(() => {
      void saveUserData(GOALS_STORAGE_KEY, goals)
        .then(() => setStorageError(null))
        .catch((error: unknown) => setStorageError(error instanceof Error ? error.message : "Could not save goals."))
    }, 100)
    return () => window.clearTimeout(timer)
  }, [goals, storageLoadFailed, storageReady])

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
    const targetValue = Number(newGoalTargetValue)
    const measureUnit = newGoalMeasureUnit.trim()
    if (!newGoalTitle.trim() || !Number.isFinite(targetValue) || targetValue <= 0 || !measureUnit) return
    const newGoal: Goal = {
      id: `goal-${crypto.randomUUID()}`,
      title: newGoalTitle.trim(),
      horizon: newGoalHorizon,
      progress: 0,
      target: newGoalTarget.trim(),
      targetValue,
      measureUnit,
      currentValue: 0,
      progressEntries: [],
    }
    setGoals((current) => [newGoal, ...current])
    onAddGoal?.(newGoal)
    setNewGoalTitle("")
    setNewGoalTarget("")
    setNewGoalTargetValue("1")
    setNewGoalMeasureUnit("steps")
    setShowAddModal(false)
  }

  const handleUpdateGoal = (id: string, updates: Partial<Goal>) => {
    setGoals((current) => current.map((g) => (g.id === id ? { ...g, ...updates } : g)))
    onUpdateGoal?.(id, updates)
    setEditingGoal(null)
  }

  const handleDeleteGoal = (id: string) => {
    setGoals((current) => current.filter((g) => g.id !== id))
    onDeleteGoal?.(id)
  }

  const restoreStarterGoals = () => {
    void removeUserData(GOALS_STORAGE_KEY).then(() => {
      setGoals(initialGoals.map((goal) => normalizeGoal(goal) ?? goal))
      setStorageLoadFailed(false)
      setStorageError(null)
    }).catch((error: unknown) => setStorageError(error instanceof Error ? error.message : "Could not restore starter goals."))
  }

  const handleLogProgress = (goal: Goal, amount: number, note: string) => {
    if (!Number.isFinite(amount) || amount <= 0 || !goal.targetValue || !goal.measureUnit) return
    const currentValue = getCurrentValue(goal)
    const entry: GoalProgressEntry = {
      id: `goal-log-${crypto.randomUUID()}`,
      amount,
      note: note.trim(),
      loggedAt: new Date().toISOString(),
    }
    const progressEntries = [...(goal.progressEntries ?? [])]
    if (progressEntries.length === 0 && currentValue > 0) {
      progressEntries.push({
        id: `goal-log-${crypto.randomUUID()}`,
        amount: currentValue,
        note: "Starting value",
        loggedAt: new Date().toISOString(),
      })
    }
    progressEntries.push(entry)
    const nextValue = currentValue + amount
    handleUpdateGoal(goal.id, {
      currentValue: nextValue,
      progressEntries,
      progress: getProgress(nextValue, goal.targetValue),
    })
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
        {storageError && (
          <div role="status" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {storageError}
            {storageLoadFailed && (
              <Button type="button" variant="outline" size="sm" className="ml-3" onClick={restoreStarterGoals}>
                Restore starter goals
              </Button>
            )}
          </div>
        )}
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
              onLogProgress={(amount, note) => handleLogProgress(goal, amount, note)}
              onEdit={() => {
                setEditingGoal(goal)
                setNewGoalTitle(goal.title)
                setNewGoalHorizon(goal.horizon)
                setNewGoalTarget(goal.target)
                setNewGoalTargetValue(String(goal.targetValue ?? 1))
                setNewGoalMeasureUnit(goal.measureUnit || "steps")
              }}
              onDelete={() => handleDeleteGoal(goal.id)}
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
                onLogProgress={(amount, note) => handleLogProgress(goal, amount, note)}
                onEdit={() => {
                  setEditingGoal(goal)
                    setNewGoalTitle(goal.title)
                  setNewGoalHorizon(goal.horizon)
                  setNewGoalTarget(goal.target)
                  setNewGoalTargetValue(String(goal.targetValue ?? 1))
                  setNewGoalMeasureUnit(goal.measureUnit || "steps")
                }}
                onDelete={() => handleDeleteGoal(goal.id)}
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
                setNewGoalTargetValue("1")
                setNewGoalMeasureUnit("steps")
              }}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Goal</span>
                <Input
                  required
                  maxLength={120}
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  placeholder="e.g. Complete my biology revision"
                />
              </label>
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
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Measure</span>
                <Input
                  required
                  maxLength={32}
                  value={newGoalMeasureUnit}
                  onChange={(e) => setNewGoalMeasureUnit(e.target.value)}
                  placeholder="e.g. study sessions, pages, dollars"
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Target amount</span>
                <Input
                  required
                  type="number"
                  min="0.01"
                  step="any"
                  value={newGoalTargetValue}
                  onChange={(e) => setNewGoalTargetValue(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Definition of done (optional)</span>
                <Input
                  maxLength={160}
                  value={newGoalTarget}
                  onChange={(e) => setNewGoalTarget(e.target.value)}
                  placeholder="What does success look like?"
                />
              </label>
              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => {
                  setShowAddModal(false)
                  setEditingGoal(null)
                  setNewGoalTitle("")
                  setNewGoalTarget("")
                  setNewGoalTargetValue("1")
                  setNewGoalMeasureUnit("steps")
                }}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const targetValue = Number(newGoalTargetValue)
                    const measureUnit = newGoalMeasureUnit.trim()
                    if (!newGoalTitle.trim() || !Number.isFinite(targetValue) || targetValue <= 0 || !measureUnit) return
                    if (editingGoal) {
                      const currentValue = getCurrentValue(editingGoal)
                      handleUpdateGoal(editingGoal.id, {
                        title: newGoalTitle.trim(),
                        horizon: newGoalHorizon,
                        target: newGoalTarget.trim(),
                        targetValue,
                        measureUnit,
                        currentValue,
                        progress: getProgress(currentValue, targetValue),
                      })
                    } else {
                      handleAddGoal()
                    }
                  }}
                >
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
  onLogProgress,
  onEdit,
  onDelete,
  getHorizonBg,
}: {
  goal: Goal
  onLogProgress: (amount: number, note: string) => void
  onEdit: () => void
  onDelete: () => void
  getHorizonBg: (horizon: string) => string
}) {
  const isCompleted = goal.progress >= 100
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
          <ConfirmAction
            title="Delete goal?"
            description={`Delete “${goal.title}”? This cannot be undone.`}
            onConfirm={onDelete}
          >
            {(openConfirmation) => (
              <Button variant="ghost" size="icon-xs" onClick={openConfirmation} aria-label="Delete goal">
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </ConfirmAction>
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
              {goal.target || "Measurable target"}
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
          {goal.targetValue && goal.measureUnit ? (
            <>
              <p className="mb-2 text-sm text-muted-foreground">
                {getCurrentValue(goal)} / {goal.targetValue} {goal.measureUnit}
              </p>
              <GoalProgressEntryForm unit={goal.measureUnit} onLog={onLogProgress} />
              <GoalProgressHistory entries={goal.progressEntries ?? []} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Edit this goal to set a measurable target.</p>
          )}
          {isCompleted && <Award className="mt-2 size-5 text-yellow-500" />}
        </div>
      </div>
    </div>
  )
}

function GoalListItem({
  goal,
  onLogProgress,
  onEdit,
  onDelete,
  getHorizonBg,
}: {
  goal: Goal
  onLogProgress: (amount: number, note: string) => void
  onEdit: () => void
  onDelete: () => void
  getHorizonBg: (horizon: string) => string
}) {
  const horizonBg = getHorizonBg(goal.horizon)

  return (
    <li className={cn("px-4 py-4 hover:bg-muted/50 transition-colors", goal.progress >= 100 && "opacity-60")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h4 className={cn("font-medium truncate", goal.progress >= 100 && "line-through text-muted-foreground")}>
              {goal.title}
            </h4>
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", horizonBg)}>
              {goal.horizon}
            </span>
            {goal.progress >= 100 && (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium text-sm">
                <Check className="size-3.5" />
                Completed
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {goal.target || "Target"}{goal.targetValue && goal.measureUnit ? ` · ${getCurrentValue(goal)} / ${goal.targetValue} ${goal.measureUnit}` : " · Set a measurable target"}
          </p>
        </div>

        <div className="w-full flex-shrink-0 sm:w-40">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium tabular-nums">{goal.progress}%</span>
          </div>
          <Progress value={goal.progress} className="h-1.5" />
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit goal">
            <Edit className="size-4" />
          </Button>
          <ConfirmAction
            title="Delete goal?"
            description={`Delete “${goal.title}”? This cannot be undone.`}
            onConfirm={onDelete}
          >
            {(openConfirmation) => (
              <Button variant="ghost" size="icon-sm" onClick={openConfirmation} aria-label="Delete goal">
                <Trash2 className="size-4" />
              </Button>
            )}
          </ConfirmAction>
        </div>
      </div>
      {goal.targetValue && goal.measureUnit && (
        <div className="mt-3 max-w-xl">
          <GoalProgressEntryForm unit={goal.measureUnit} onLog={onLogProgress} />
          <GoalProgressHistory entries={goal.progressEntries ?? []} />
        </div>
      )}
    </li>
  )
}

function GoalProgressEntryForm({
  unit,
  onLog,
}: {
  unit: string
  onLog: (amount: number, note: string) => void
}) {
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const id = useId()

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return
    onLog(parsedAmount, note)
    setAmount("")
    setNote("")
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`${id}-amount`}>Amount of {unit} completed</label>
      <Input
        id={`${id}-amount`}
        type="number"
        min="0.01"
        step="any"
        required
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder={`Add ${unit}`}
        className="w-28"
      />
      <Input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={120}
        placeholder="What did you do? (optional)"
        aria-label="Progress note"
        className="min-w-36 flex-1"
      />
      <Button type="submit" size="sm">Log progress</Button>
    </form>
  )
}

function GoalProgressHistory({ entries }: { entries: GoalProgressEntry[] }) {
  const recentEntries = entries.slice(-3).reverse()
  if (recentEntries.length === 0) return null

  return (
    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
      {recentEntries.map((entry) => (
        <li key={entry.id} className="flex items-baseline justify-between gap-2">
          <span className="truncate">{entry.note || "Progress logged"}</span>
          <time className="shrink-0" dateTime={entry.loggedAt}>
            {new Date(entry.loggedAt).toLocaleDateString()}
          </time>
        </li>
      ))}
    </ul>
  )
}