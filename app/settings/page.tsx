import { SettingsView } from "@/components/settings/settings-view"
import { sampleDashboard } from "@/lib/data/sample"
import { defaultWidgetLayout } from "@/lib/dashboard-layout"

export default function SettingsPage() {
  return (
    <SettingsView
      user={sampleDashboard.user}
      layout={defaultWidgetLayout}
    />
  )
}