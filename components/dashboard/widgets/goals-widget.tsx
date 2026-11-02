import { Progress } from "@/components/ui/progress"
import { WidgetFrame } from "@/components/dashboard/widget-frame"
import { widgetMeta } from "@/lib/dashboard-layout"
import type { Goal } from "@/lib/types"

export function GoalsWidget({ goals }: { goals: Goal[] }) {
  return (
    <WidgetFrame title={widgetMeta.goals.title} href={widgetMeta.goals.href}>
      <ul className="space-y-4">
        {goals.map((goal) => (
          <li key={goal.id} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium">{goal.title}</p>
              <span className="shrink-0 text-xs text-muted-foreground">{goal.horizon}</span>
            </div>
            <Progress value={goal.progress} />
            <p className="text-xs text-muted-foreground">{goal.target}</p>
          </li>
        ))}
      </ul>
    </WidgetFrame>
  )
}
