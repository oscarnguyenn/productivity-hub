import { CalendarView } from "@/components/calendar/calendar-view"
import { sampleDashboard } from "@/lib/data/sample"

export default function CalendarPage() {
  return <CalendarView events={sampleDashboard.events} />
}