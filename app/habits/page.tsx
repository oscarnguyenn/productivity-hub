import { HabitsView } from "@/components/habits/habits-view"
import { sampleDashboard } from "@/lib/data/sample"

export default function HabitsPage() {
  return <HabitsView habits={sampleDashboard.habits} />
}