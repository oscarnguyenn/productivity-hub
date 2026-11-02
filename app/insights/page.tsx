import { InsightsView } from "@/components/insights/insights-view"
import { sampleDashboard } from "@/lib/data/sample"

export default function InsightsPage() {
  return <InsightsView data={sampleDashboard} />
}