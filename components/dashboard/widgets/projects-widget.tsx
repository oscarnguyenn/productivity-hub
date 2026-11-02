import { Progress } from "@/components/ui/progress"
import { WidgetFrame } from "@/components/dashboard/widget-frame"
import { widgetMeta } from "@/lib/dashboard-layout"
import { formatDueDate } from "@/lib/format"
import type { Project } from "@/lib/types"

export function ProjectsWidget({ projects }: { projects: Project[] }) {
  return (
    <WidgetFrame title={widgetMeta.projects.title} href={widgetMeta.projects.href}>
      <ul className="space-y-4">
        {projects.map((project) => (
          <li key={project.id} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-medium">{project.name}</p>
              <span className="text-xs tabular-nums text-muted-foreground">
                {project.progress}%
              </span>
            </div>
            <Progress value={project.progress} />
            <p className="text-xs text-muted-foreground">
              Due {formatDueDate(project.dueDate)}
            </p>
          </li>
        ))}
      </ul>
    </WidgetFrame>
  )
}
