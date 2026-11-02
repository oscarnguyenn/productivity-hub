import { DashboardView } from "@/components/dashboard/dashboard-view"
import { sampleDashboard } from "@/lib/data/sample"

export default function DashboardPage() {
  return <DashboardView data={sampleDashboard} />
}
