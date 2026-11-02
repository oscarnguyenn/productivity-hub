import { TasksView } from "@/components/tasks/tasks-view"
import { sampleDashboard } from "@/lib/data/sample"

export default function TasksPage() {
  return (
    <TasksView
      tasks={sampleDashboard.tasks}
      projects={sampleDashboard.projects}
    />
  )
}