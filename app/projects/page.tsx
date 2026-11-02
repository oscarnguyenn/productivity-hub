import { ProjectsView } from "@/components/projects/projects-view"
import { sampleDashboard } from "@/lib/data/sample"

export default function ProjectsPage() {
  return (
    <ProjectsView
      projects={sampleDashboard.projects}
      tasks={sampleDashboard.tasks}
    />
  )
}