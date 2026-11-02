"use client"

import { useMemo } from "react"
import {
  TrendingUp,
  CheckSquare,
  Flame,
  Target,
  Calendar,
  Clock,
  BarChart,
  Activity,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { formatDueDate } from "@/lib/format"
import type { Task, Habit, Goal, Project } from "@/lib/types"

interface InsightsData {
  tasks: Task[]
  habits: Habit[]
  goals: Goal[]
  projects: Project[]
}

export function InsightsView({ data }: { data: InsightsData }) {
  const insights = useMemo(() => calculateInsights(data), [data])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your productivity analytics and trends
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Tasks Completed"
          value={insights.tasksCompleted}
          change={insights.tasksChange}
          icon={<CheckSquare className="size-5" />}
          color="text-green-600"
          bgColor="bg-green-50 dark:bg-green-950/30"
        />
        <MetricCard
          title="Habit Streak"
          value={insights.totalStreak}
          change={insights.streakChange}
          icon={<Flame className="size-5" />}
          color="text-orange-600"
          bgColor="bg-orange-50 dark:bg-orange-950/30"
        />
        <MetricCard
          title="Goals Progress"
          value={`${insights.avgGoalProgress}%`}
          change={insights.goalsChange}
          icon={<Target className="size-5" />}
          color="text-blue-600"
          bgColor="bg-blue-50 dark:bg-blue-950/30"
        />
        <MetricCard
          title="Active Projects"
          value={insights.activeProjects}
          change={insights.projectsChange}
          icon={<BarChart className="size-5" />}
          color="text-purple-600"
          bgColor="bg-purple-50 dark:bg-purple-950/30"
        />
      </div>

      {/* Weekly Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Weekly Activity" icon={<Activity className="size-4" />}>
          <WeeklyActivityChart data={insights.weeklyActivity} />
        </SectionCard>

        <SectionCard title="Task Completion Rate" icon={<TrendingUp className="size-4" />}>
          <CompletionRateChart data={insights.completionRate} />
        </SectionCard>
      </div>

      {/* Habits Heatmap & Goals Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Habits Heatmap" icon={<Flame className="size-4" />}>
          <HabitsHeatmap habits={data.habits} />
        </SectionCard>

        <SectionCard title="Goals Progress" icon={<Target className="size-4" />}>
          <GoalsProgressChart goals={data.goals} />
        </SectionCard>
      </div>

      {/* Projects & Time Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Project Progress" icon={<BarChart className="size-4" />}>
          <ProjectsProgress projects={data.projects} tasks={data.tasks} />
        </SectionCard>

        <SectionCard title="Task Distribution" icon={<Clock className="size-4" />}>
          <TaskDistribution tasks={data.tasks} />
        </SectionCard>
      </div>

      {/* Recent Achievements */}
      <SectionCard title="Recent Achievements" icon={<TrendingUp className="size-4" />}>
        <AchievementsList achievements={insights.achievements} />
      </SectionCard>
    </div>
  )
}

function calculateInsights(data: InsightsData) {
  const { tasks, habits, goals, projects } = data

  const completedTasks = tasks.filter((t) => t.status === "done").length
  const totalTasks = tasks.length
  const tasksCompleted = completedTasks
  const tasksChange = totalTasks > 0 ? `+${completedTasks} this period` : "No data"

  const totalStreak = habits.reduce((sum, h) => sum + h.streak, 0)
  const streakChange = habits.length > 0 ? `${habits.length} active habits` : "No habits"

  const avgGoalProgress = goals.length > 0
    ? Math.round(goals.reduce((sum, g) => sum + g.progress, 0) / goals.length)
    : 0
  const completedGoals = goals.filter((g) => g.progress >= 100).length
  const goalsChange = `${completedGoals}/${goals.length} completed`

  const activeProjects = projects.filter((p) => p.status === "active").length
  const projectsChange = `${activeProjects} active`

  // Weekly activity (last 7 days)
  const weeklyActivity = Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - i))
    return {
      day: date.toLocaleDateString("en-US", { weekday: "short" }),
      tasks: Math.floor(Math.random() * 5), // Simulated
      habits: Math.floor(Math.random() * 4),
    }
  })

  // Completion rate by priority
  const completionRate = [
    { priority: "High", completed: tasks.filter((t) => t.priority === "high" && t.status === "done").length, total: tasks.filter((t) => t.priority === "high").length },
    { priority: "Medium", completed: tasks.filter((t) => t.priority === "medium" && t.status === "done").length, total: tasks.filter((t) => t.priority === "medium").length },
    { priority: "Low", completed: tasks.filter((t) => t.priority === "low" && t.status === "done").length, total: tasks.filter((t) => t.priority === "low").length },
  ]

  // Achievements
  const achievements = [
    completedTasks > 0 && { title: "Task Master", description: `Completed ${completedTasks} tasks`, icon: <CheckSquare className="size-4" />, color: "text-green-600" },
    totalStreak > 7 && { title: "Week Warrior", description: `${totalStreak} day total streak`, icon: <Flame className="size-4" />, color: "text-orange-600" },
    completedGoals > 0 && { title: "Goal Getter", description: `Achieved ${completedGoals} goal${completedGoals !== 1 ? "s" : ""}`, icon: <Target className="size-4" />, color: "text-blue-600" },
    activeProjects > 0 && { title: "Project Manager", description: `${activeProjects} active projects`, icon: <BarChart className="size-4" />, color: "text-purple-600" },
  ].filter(Boolean) as Array<{ title: string; description: string; icon: React.ReactNode; color: string }>

  return {
    tasksCompleted,
    tasksChange,
    totalStreak,
    streakChange,
    avgGoalProgress,
    goalsChange,
    activeProjects,
    projectsChange,
    weeklyActivity,
    completionRate,
    achievements,
  }
}

function MetricCard({
  title,
  value,
  change,
  icon,
  color,
  bgColor,
}: {
  title: string
  value: string | number
  change: string
  icon: React.ReactNode
  color: string
  bgColor: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{change}</p>
        </div>
        <div className={cn("p-2 rounded-lg", bgColor, color)}>
          {icon}
        </div>
      </div>
    </div>
  )
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium flex items-center gap-2">
          {icon}
          {title}
        </h3>
      </div>
      {children}
    </div>
  )
}

function WeeklyActivityChart({ data }: { data: Array<{ day: string; tasks: number; habits: number }> }) {
  const maxValue = Math.max(...data.map((d) => d.tasks + d.habits), 1)

  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.day} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground w-10">{d.day}</span>
            <span className="font-medium">{d.tasks + d.habits} total</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${((d.tasks + d.habits) / maxValue) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function CompletionRateChart({ data }: { data: Array<{ priority: string; completed: number; total: number }> }) {
  return (
    <div className="space-y-3">
      {data.map((d) => {
        const rate = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0
        const color = d.priority === "High" ? "bg-red-500" : d.priority === "Medium" ? "bg-yellow-500" : "bg-green-500"
        return (
          <div key={d.priority} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${color}`} />
                {d.priority} Priority
              </span>
              <span className="font-medium">{rate}% ({d.completed}/{d.total})</span>
            </div>
            <Progress value={rate} />
          </div>
        )
      })}
    </div>
  )
}

function HabitsHeatmap({ habits }: { habits: Habit[] }) {
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  if (habits.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <Flame className="size-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No habits to display</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {habits.map((habit) => (
        <div key={habit.id} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium truncate max-w-[200px]">{habit.name}</span>
            <span className="text-muted-foreground">{habit.streak} day streak</span>
          </div>
          <div className="flex gap-1">
            {habit.week.map((done, index) => (
              <div
                key={index}
                className={cn(
                  "flex-1 h-6 rounded border transition-colors",
                  done ? "bg-primary border-primary" : "bg-muted border-border"
                )}
                title={`${DAYS[index]}: ${done ? "Completed" : "Missed"}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function GoalsProgressChart({ goals }: { goals: Goal[] }) {
  if (goals.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <Target className="size-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No goals to display</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {goals.map((goal) => (
        <div key={goal.id} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium truncate max-w-[200px]">{goal.title}</span>
            <span className="font-medium">{goal.progress}%</span>
          </div>
          <Progress value={goal.progress} />
          <p className="text-xs text-muted-foreground">{goal.horizon} • {goal.target}</p>
        </div>
      ))}
    </div>
  )
}

function ProjectsProgress({ projects, tasks }: { projects: Project[]; tasks: Task[] }) {
  if (projects.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <BarChart className="size-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No projects to display</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {projects.map((project) => {
        const projectTasks = tasks.filter((t) => t.project === project.name)
        const completedTasks = projectTasks.filter((t) => t.status === "done").length
        const totalTasks = projectTasks.length
        const calculatedProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : project.progress

        return (
          <div key={project.id} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium truncate max-w-[200px]">{project.name}</span>
              <span className="font-medium">{calculatedProgress}%</span>
            </div>
            <Progress value={calculatedProgress} />
            <p className="text-xs text-muted-foreground">{completedTasks}/{totalTasks} tasks • Due {formatDueDate(project.dueDate)}</p>
          </div>
        )
      })}
    </div>
  )
}

function TaskDistribution({ tasks }: { tasks: Task[] }) {
  const byStatus = {
    todo: tasks.filter((t) => t.status === "todo").length,
    "in-progress": tasks.filter((t) => t.status === "in-progress").length,
    done: tasks.filter((t) => t.status === "done").length,
  }
  const total = tasks.length

  if (total === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <CheckSquare className="size-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No tasks to display</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {[
        { key: "done", label: "Completed", color: "bg-green-500" },
        { key: "in-progress", label: "In Progress", color: "bg-blue-500" },
        { key: "todo", label: "To Do", color: "bg-gray-500" },
      ].map(({ key, label, color }) => {
        const count = byStatus[key as keyof typeof byStatus]
        const percentage = total > 0 ? Math.round((count / total) * 100) : 0
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${color}`} />
                {label}
              </span>
              <span className="font-medium">{count} ({percentage}%)</span>
            </div>
            <Progress value={percentage} />
          </div>
        )
      })}
    </div>
  )
}

function AchievementsList({ achievements }: { achievements: Array<{ title: string; description: string; icon: React.ReactNode; color: string }> }) {
  if (achievements.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <TrendingUp className="size-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Keep working to unlock achievements!</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {achievements.map((achievement, index) => (
        <div
          key={index}
          className="p-3 rounded-lg border border-border bg-background flex items-center gap-3"
        >
          <div className={cn("p-2 rounded-full bg-muted", achievement.color)}>
            {achievement.icon}
          </div>
          <div>
            <p className="font-medium text-sm">{achievement.title}</p>
            <p className="text-xs text-muted-foreground">{achievement.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}