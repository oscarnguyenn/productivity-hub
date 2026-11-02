import { SectionPlaceholder } from "@/components/layout/section-placeholder"
import { moduleCopy } from "@/lib/navigation"

export default function TasksPage() {
  return <SectionPlaceholder {...moduleCopy["/tasks"]} />
}
