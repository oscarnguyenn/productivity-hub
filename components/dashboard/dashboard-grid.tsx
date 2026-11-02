import type { ReactNode } from "react"
import { colSpanClass } from "@/lib/dashboard-layout"
import type { WidgetLayoutItem } from "@/lib/types"
import { cn } from "@/lib/utils"

export function DashboardGrid({
  layout,
  renderWidget,
}: {
  layout: WidgetLayoutItem[]
  renderWidget: (id: WidgetLayoutItem["id"]) => ReactNode
}) {
  const visible = [...layout]
    .filter((item) => item.visible)
    .sort((a, b) => a.order - b.order)

  return (
    <div className="grid auto-rows-[minmax(240px,auto)] grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {visible.map((item) => (
        <div
          key={item.id}
          className={cn(
            colSpanClass(item.colSpan),
            item.rowSpan === 2 && "lg:row-span-2 lg:min-h-[504px]"
          )}
        >
          {renderWidget(item.id)}
        </div>
      ))}
    </div>
  )
}
