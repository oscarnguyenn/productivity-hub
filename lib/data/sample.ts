import { defaultWidgetLayout } from "@/lib/dashboard-layout"
import type { CalendarEvent, DashboardData, FileNode } from "@/lib/types"

function localDateKey(offset = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function documentContent(title: string, paragraphs: string[]) {
  return JSON.stringify({
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] },
      ...paragraphs.map((text) => ({
        type: "paragraph",
        content: [{ type: "text", text }],
      })),
    ],
  })
}

const createdAt = new Date().toISOString()

const studyFolder: FileNode = {
  id: "sample-folder-study",
  name: "Study plans",
  type: "folder",
  parentId: null,
  createdAt,
  updatedAt: createdAt,
  isExpanded: true,
  children: [
    {
      id: "sample-note-weekly-plan",
      name: "Weekly study plan",
      type: "document",
      parentId: "sample-folder-study",
      createdAt,
      updatedAt: createdAt,
      content: documentContent("A calmer, clearer week", [
        "Use this page to turn a busy week into a small set of manageable blocks.",
        "Monday · Review lecture notes and list the questions to bring to class.",
        "Wednesday · Protect one focused study session, then take a proper break.",
        "Friday · Wrap up open tasks and choose the first step for next week.",
      ]),
    },
    {
      id: "sample-note-reading-list",
      name: "Reading list",
      type: "document",
      parentId: "sample-folder-study",
      createdAt,
      updatedAt: createdAt,
      content: documentContent("Reading list", [
        "A running place for articles, chapters, and ideas worth revisiting.",
        "Add a short note beside each item so the useful detail is easy to find later.",
      ]),
    },
  ],
}

const welcomeNote: FileNode = {
  id: "sample-note-welcome",
  name: "Welcome to your workspace",
  type: "document",
  parentId: null,
  createdAt,
  updatedAt: createdAt,
  content: JSON.stringify({
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Make this space yours" }] },
      { type: "paragraph", content: [{ type: "text", text: "This sample document is editable. Try the formatting toolbar, insert a table, color a cell, or highlight a sentence." }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "A few things to try" }] },
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Select a phrase and apply a highlight color." }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Insert a table, choose its dimensions, and shade a cell." }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Open Focus view for a centered, distraction-free page." }] }] },
        ],
      },
    ],
  }),
}

const sampleEvents: CalendarEvent[] = [
  { id: "sample-event-lecture", title: "Design lecture", date: localDateKey(), start: "09:00", end: "10:30", type: "class", location: "Studio 2" },
  { id: "sample-event-focus", title: "Focused study", date: localDateKey(), start: "11:00", end: "12:00", type: "focus" },
  { id: "sample-event-lunch", title: "Lunch break", date: localDateKey(), start: "12:30", end: "13:15", type: "personal" },
  { id: "sample-event-review", title: "Weekly review", date: localDateKey(1), start: "15:00", end: "15:45", type: "meeting", location: "Library" },
]

export const sampleDashboard: DashboardData = {
  user: {
    name: "Oscar",
    role: "Student",
  },
  layout: defaultWidgetLayout,
  events: sampleEvents,
  tasks: [
    { id: "sample-task-notes", title: "Review lecture notes", project: "Design course", dueDate: localDateKey(), priority: "high", status: "todo" },
    { id: "sample-task-reading", title: "Read the next chapter", project: "Design course", dueDate: localDateKey(1), priority: "medium", status: "in-progress" },
    { id: "sample-task-plan", title: "Plan the week ahead", dueDate: localDateKey(2), priority: "low", status: "todo" },
  ],
  projects: [
    { id: "sample-project-course", name: "Design course", status: "active", progress: 42, dueDate: localDateKey(21) },
    { id: "sample-project-portfolio", name: "Personal portfolio", status: "active", progress: 68, dueDate: localDateKey(35) },
  ],
  goals: [
    { id: "sample-goal-study", title: "Build a steady study rhythm", horizon: "This month", progress: 55, target: "4 focused sessions each week" },
    { id: "sample-goal-portfolio", title: "Finish portfolio draft", horizon: "This quarter", progress: 35, target: "Publish 3 polished projects" },
  ],
  habits: [
    { id: "sample-habit-reading", name: "Read for 20 minutes", cadence: "Daily", streak: 4, completedToday: false, week: [true, true, false, true, true, false, false] },
    { id: "sample-habit-walk", name: "Take a screen break walk", cadence: "Daily", streak: 2, completedToday: true, week: [true, false, true, true, false, true, true] },
  ],
  files: [welcomeNote, studyFolder],
}
