import { GoalsView } from "@/components/goals/goals-view"
import { sampleDashboard } from "@/lib/data/sample"

export default function GoalsPage() {
  return <GoalsView goals={sampleDashboard.goals} />
}