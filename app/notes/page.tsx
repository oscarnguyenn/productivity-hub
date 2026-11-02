import { NotesView } from "@/components/notes/notes-view"
import { sampleDashboard } from "@/lib/data/sample"

export default function NotesPage() {
  return <NotesView dashboardData={sampleDashboard} />
}