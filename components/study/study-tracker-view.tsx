"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import {
  ArrowLeft,
  BookOpenCheck,
  CalendarDays,
  Check,
  Clock3,
  Download,
  FilePlus2,
  Plus,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmAction } from "@/components/ui/confirm-action"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { loadUserData, removeUserData, saveUserData } from "@/lib/user-data"

const STORAGE_KEY = "productivity-hub-sac-tracker-v1"
const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30]
const ASSESSMENT_TYPES = [
  { value: "sac", label: "SAC" },
  { value: "practice", label: "Practice SAC" },
  { value: "exam1", label: "Exam 1" },
  { value: "exam2", label: "Exam 2" },
] as const

type AssessmentType = (typeof ASSESSMENT_TYPES)[number]["value"]
type TrackerSection = "assessments" | "exams" | "mistakes" | "focus"

interface Mistake {
  id: string
  text: string
  reviewCount: number
  nextReviewAt: string | null
  reviewedAt: string | null
  tags?: string[]
  photoDataUrl?: string | null
}

interface Assessment {
  id: string
  name: string
  type: AssessmentType
  date: string
  score: number
  total: number
  mistakes: Mistake[]
}

interface StudySubject {
  id: string
  name: string
  unit: "u12" | "u34"
  color: string
  scoreThresholds?: { great: number; middle: number }
  examDates: Partial<Record<AssessmentType, string>>
  assessments: Assessment[]
}

interface StudySession {
  id: string
  subjectId: string
  intention: string
  durationSeconds: number
  startedAt: string
  completed: boolean
}

interface StudyTimer {
  subjectId: string | null
  intention: string
  mode: "stopwatch" | "countdown"
  goalMinutes: number
  elapsedSeconds: number
  startedAt: string | null
  sessionStartedAt: string | null
}

interface TrackerData {
  subjects: StudySubject[]
  sessions: StudySession[]
  timer: StudyTimer
}

const emptyTrackerData: TrackerData = {
  subjects: [],
  sessions: [],
  timer: {
    subjectId: null,
    intention: "",
    mode: "stopwatch",
    goalMinutes: 25,
    elapsedSeconds: 0,
    startedAt: null,
    sessionStartedAt: null,
  },
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function makeId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function isMistake(value: unknown): value is Mistake {
  if (!isRecord(value)) return false
  return typeof value.id === "string" &&
    typeof value.text === "string" &&
    typeof value.reviewCount === "number" &&
    Number.isInteger(value.reviewCount) &&
    value.reviewCount >= 0 &&
    (value.nextReviewAt === null || (typeof value.nextReviewAt === "string" && !Number.isNaN(Date.parse(value.nextReviewAt)))) &&
    (value.reviewedAt === null || (typeof value.reviewedAt === "string" && !Number.isNaN(Date.parse(value.reviewedAt)))) &&
    (value.tags === undefined || (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string"))) &&
    (value.photoDataUrl === undefined || value.photoDataUrl === null ||
      (typeof value.photoDataUrl === "string" && value.photoDataUrl.startsWith("data:image/") && value.photoDataUrl.length <= 700000))
}

function isAssessment(value: unknown): value is Assessment {
  if (!isRecord(value)) return false
  return typeof value.id === "string" &&
    typeof value.name === "string" &&
    ASSESSMENT_TYPES.some((item) => item.value === value.type) &&
    typeof value.date === "string" &&
    typeof value.score === "number" &&
    Number.isFinite(value.score) &&
    typeof value.total === "number" &&
    Number.isFinite(value.total) &&
    value.total > 0 &&
    value.score >= 0 &&
    value.score <= value.total &&
    Array.isArray(value.mistakes) &&
    value.mistakes.every(isMistake)
}

function isSubject(value: unknown): value is StudySubject {
  if (!isRecord(value)) return false
  return typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.unit === "u12" || value.unit === "u34") &&
    typeof value.color === "string" &&
    (value.scoreThresholds === undefined || (
      isRecord(value.scoreThresholds) &&
      typeof value.scoreThresholds.great === "number" &&
      typeof value.scoreThresholds.middle === "number" &&
      value.scoreThresholds.middle >= 0 &&
      value.scoreThresholds.great <= 100 &&
      value.scoreThresholds.middle < value.scoreThresholds.great
    )) &&
    isRecord(value.examDates) &&
    Object.values(value.examDates).every((date) => date === undefined || (typeof date === "string" && !Number.isNaN(Date.parse(date)))) &&
    Array.isArray(value.assessments) &&
    value.assessments.every(isAssessment)
}

function isStudySession(value: unknown): value is StudySession {
  if (!isRecord(value)) return false
  return typeof value.id === "string" &&
    typeof value.subjectId === "string" &&
    typeof value.intention === "string" &&
    typeof value.durationSeconds === "number" &&
    Number.isFinite(value.durationSeconds) &&
    value.durationSeconds >= 0 &&
    typeof value.startedAt === "string" &&
    !Number.isNaN(Date.parse(value.startedAt)) &&
    typeof value.completed === "boolean"
}

function isTrackerData(value: unknown): value is TrackerData {
  if (!isRecord(value) || !Array.isArray(value.subjects) || !value.subjects.every(isSubject) ||
      !Array.isArray(value.sessions) || !value.sessions.every(isStudySession) || !isRecord(value.timer)) return false
  const timer = value.timer
  return (timer.subjectId === null || typeof timer.subjectId === "string") &&
    typeof timer.intention === "string" &&
    (timer.mode === "stopwatch" || timer.mode === "countdown") &&
    typeof timer.goalMinutes === "number" &&
    Number.isFinite(timer.goalMinutes) &&
    timer.goalMinutes > 0 &&
    typeof timer.elapsedSeconds === "number" &&
    Number.isFinite(timer.elapsedSeconds) &&
    timer.elapsedSeconds >= 0 &&
    (timer.startedAt === null || (typeof timer.startedAt === "string" && !Number.isNaN(Date.parse(timer.startedAt)))) &&
    (timer.sessionStartedAt === null || (typeof timer.sessionStartedAt === "string" && !Number.isNaN(Date.parse(timer.sessionStartedAt))))
}

function starterData(): TrackerData {
  const today = new Date()
  const earlier = new Date(today)
  earlier.setDate(earlier.getDate() - 3)
  const biologyId = "starter-biology"
  const englishId = "starter-english"
  return {
    subjects: [
      {
        id: biologyId,
        name: "Biology",
        unit: "u34",
        color: "#3B8A72",
        scoreThresholds: { great: 85, middle: 70 },
        examDates: {},
        assessments: [
          {
            id: "starter-biology-sac",
            name: "Cell biology SAC",
            type: "sac",
            date: localDateKey(earlier),
            score: 17,
            total: 20,
            mistakes: [
              { id: "starter-mistake-1", text: "Revisit the difference between diffusion and osmosis.", reviewCount: 0, nextReviewAt: null, reviewedAt: null },
            ],
          },
        ],
      },
      {
        id: englishId,
        name: "English",
        unit: "u34",
        color: "#7963A6",
        scoreThresholds: { great: 85, middle: 70 },
        examDates: {},
        assessments: [
          {
            id: "starter-english-practice",
            name: "Text response practice",
            type: "practice",
            date: localDateKey(today),
            score: 14,
            total: 20,
            mistakes: [],
          },
        ],
      },
    ],
    sessions: [],
    timer: { ...emptyTrackerData.timer, subjectId: biologyId },
  }
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remaining = safeSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
}

function isMistakeDue(mistake: Mistake, now: number): boolean {
  return mistake.nextReviewAt === null || now >= Date.parse(mistake.nextReviewAt)
}

function scoreTone(score: number, thresholds: { great: number; middle: number }) {
  if (score >= thresholds.great) return "text-emerald-700 dark:text-emerald-300"
  if (score >= thresholds.middle) return "text-amber-700 dark:text-amber-300"
  return "text-rose-700 dark:text-rose-300"
}

function downloadText(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function compressMistakePhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.")
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.")
  const image = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 1200 / Math.max(image.width, image.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Could not prepare the image.")
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.8, 0.65, 0.5, 0.35]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality)
      if (dataUrl.length * 0.75 <= 500 * 1024) return dataUrl
    }
    throw new Error("Image could not be compressed below 500 KB.")
  } finally {
    image.close()
  }
}

export function StudyTrackerView() {
  const [data, setData] = useState<TrackerData>(emptyTrackerData)
  const [storageReady, setStorageReady] = useState(false)
  const [storageLoadFailed, setStorageLoadFailed] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [section, setSection] = useState<TrackerSection>("assessments")
  const [showSubjectForm, setShowSubjectForm] = useState(false)
  const [subjectName, setSubjectName] = useState("")
  const [subjectUnit, setSubjectUnit] = useState<"u12" | "u34">("u34")
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null)
  const [showAssessmentForm, setShowAssessmentForm] = useState(false)
  const [assessmentName, setAssessmentName] = useState("")
  const [assessmentType, setAssessmentType] = useState<AssessmentType>("sac")
  const [assessmentDate, setAssessmentDate] = useState(localDateKey(new Date()))
  const [assessmentScore, setAssessmentScore] = useState("")
  const [assessmentTotal, setAssessmentTotal] = useState("100")
  const [mistakeText, setMistakeText] = useState("")
  const [expandedAssessmentId, setExpandedAssessmentId] = useState<string | null>(null)
  const [revealedMistakes, setRevealedMistakes] = useState<string[]>([])
  const [tick, setTick] = useState(0)
  const [timerComplete, setTimerComplete] = useState(false)

  useEffect(() => {
    let active = true
    const timerId = window.setTimeout(() => {
      void (async () => {
        try {
          const parsed = await loadUserData<unknown>(STORAGE_KEY)
          if (parsed === null) {
            if (active) setData(starterData())
          } else {
            if (!isTrackerData(parsed)) throw new Error("Saved SAC tracker data is invalid.")
            if (active) setData(parsed)
          }
        } catch (error) {
          if (active) {
            setStorageLoadFailed(true)
            setStorageError(error instanceof Error ? error.message : "Could not load the SAC tracker.")
          }
        } finally {
          if (active) setStorageReady(true)
        }
      })()
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timerId)
    }
  }, [])

  useEffect(() => {
    if (!storageReady || storageLoadFailed) return
    const timerId = window.setTimeout(() => {
      void saveUserData(STORAGE_KEY, data)
        .then(() => setStorageError(null))
        .catch((error: unknown) => setStorageError(error instanceof Error ? error.message : "Could not save the SAC tracker."))
    }, 100)
    return () => window.clearTimeout(timerId)
  }, [data, storageLoadFailed, storageReady])

  useEffect(() => {
    if (!data.timer.startedAt) return
    const timerId = window.setInterval(() => {
      const now = Date.now()
      setTick(now)
      const elapsed = data.timer.elapsedSeconds + Math.max(0, Math.floor((now - Date.parse(data.timer.startedAt!)) / 1000))
      if (data.timer.mode === "countdown" && elapsed >= data.timer.goalMinutes * 60) {
        setData((current) => current.timer.startedAt === data.timer.startedAt
          ? {
              ...current,
              timer: {
                ...current.timer,
                startedAt: null,
                elapsedSeconds: current.timer.goalMinutes * 60,
              },
            }
          : current)
        setTimerComplete(true)
      }
    }, 1000)
    return () => window.clearInterval(timerId)
  }, [data.timer.elapsedSeconds, data.timer.goalMinutes, data.timer.mode, data.timer.startedAt])

  useEffect(() => {
    const timerId = window.setTimeout(() => setTick(Date.now()), 0)
    return () => window.clearTimeout(timerId)
  }, [])

  const subjects = data.subjects
  const selectedSubject = selectedSubjectId
    ? subjects.find((subject) => subject.id === selectedSubjectId) ?? null
    : null
  const allUpcomingExams = useMemo(() => subjects.flatMap((subject) =>
    Object.entries(subject.examDates)
      .filter((entry): entry is [AssessmentType, string] => Boolean(entry[1]) && Date.parse(entry[1]) >= new Date().setHours(0, 0, 0, 0))
      .map(([type, date]) => ({ subject, type, date }))
  ).sort((a, b) => a.date.localeCompare(b.date)), [subjects])
  const dueMistakes = useMemo(() => subjects.flatMap((subject) =>
    subject.assessments.flatMap((assessment) =>
      assessment.mistakes
        .filter((mistake) => isMistakeDue(mistake, tick))
        .map((mistake) => ({ subject, assessment, mistake }))
    )
  ), [subjects, tick])
  const averageScore = useMemo(() => {
    const scores = subjects.flatMap((subject) => subject.assessments.map((assessment) => assessment.score / assessment.total))
    return scores.length ? Math.round((scores.reduce((total, score) => total + score, 0) / scores.length) * 100) : null
  }, [subjects])
  const timerElapsed = data.timer.elapsedSeconds + (data.timer.startedAt
    ? Math.max(0, Math.floor((tick - Date.parse(data.timer.startedAt)) / 1000))
    : 0)
  const timerRemaining = data.timer.mode === "countdown"
    ? Math.max(0, data.timer.goalMinutes * 60 - timerElapsed)
    : timerElapsed

  const updateSubject = (subjectId: string, update: (subject: StudySubject) => StudySubject) => {
    setData((current) => ({
      ...current,
      subjects: current.subjects.map((subject) => subject.id === subjectId ? update(subject) : subject),
    }))
  }

  const addSubject = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = subjectName.trim()
    if (!name || subjects.some((subject) => subject.name.toLowerCase() === name.toLowerCase())) return
    const subject: StudySubject = {
      id: makeId("subject"),
      name,
      unit: subjectUnit,
      color: ["#3B8A72", "#7963A6", "#B0714A", "#527A9B"][subjects.length % 4],
      examDates: {},
      assessments: [],
    }
    setData((current) => ({ ...current, subjects: [...current.subjects, subject] }))
    setSelectedSubjectId(subject.id)
    setSubjectName("")
    setShowSubjectForm(false)
    setSection("assessments")
  }

  const openNewAssessment = () => {
    setEditingAssessment(null)
    setAssessmentName("")
    setAssessmentType("sac")
    setAssessmentDate(localDateKey(new Date()))
    setAssessmentScore("")
    setAssessmentTotal("100")
    setMistakeText("")
    setShowAssessmentForm(true)
  }

  const openEditAssessment = (assessment: Assessment) => {
    setEditingAssessment(assessment)
    setAssessmentName(assessment.name)
    setAssessmentType(assessment.type)
    setAssessmentDate(assessment.date)
    setAssessmentScore(String(assessment.score))
    setAssessmentTotal(String(assessment.total))
    setMistakeText(assessment.mistakes.map((mistake) => `${mistake.text}${mistake.tags?.length ? ` ${mistake.tags.map((tag) => `#${tag}`).join(" ")}` : ""}`).join("\n"))
    setShowAssessmentForm(true)
  }

  const saveAssessment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedSubject || !assessmentName.trim()) return
    const score = Number(assessmentScore)
    const total = Number(assessmentTotal)
    if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0 || score < 0 || score > total) return
    const priorMistakes = editingAssessment?.mistakes ?? []
    const mistakes: Mistake[] = []
    for (const rawLine of mistakeText.split("\n")) {
      const line = rawLine.trim()
      if (!line) continue
      const tags = [...line.matchAll(/#([a-z0-9_-]+)/gi)].map((match) => match[1].toLowerCase())
      const text = line.replace(/#[a-z0-9_-]+/gi, "").trim()
      if (!text) continue
      const previous = priorMistakes.find((mistake) => mistake.text === text)
      mistakes.push(previous
        ? { ...previous, tags: tags.length ? tags : previous.tags ?? [] }
        : {
            id: makeId("mistake"),
            text,
            reviewCount: 0,
            nextReviewAt: null,
            reviewedAt: null,
            tags,
          })
    }
    const assessment: Assessment = {
      id: editingAssessment?.id ?? makeId("assessment"),
      name: assessmentName.trim(),
      type: assessmentType,
      date: assessmentDate,
      score,
      total,
      mistakes,
    }
    updateSubject(selectedSubject.id, (subject) => ({
      ...subject,
      assessments: editingAssessment
        ? subject.assessments.map((item) => item.id === assessment.id ? assessment : item)
        : [assessment, ...subject.assessments],
    }))
    setShowAssessmentForm(false)
    setEditingAssessment(null)
  }

  const markMistakeReviewed = (subjectId: string, assessmentId: string, mistakeId: string) => {
    updateSubject(subjectId, (subject) => ({
      ...subject,
      assessments: subject.assessments.map((assessment) => assessment.id !== assessmentId ? assessment : {
        ...assessment,
        mistakes: assessment.mistakes.map((mistake) => {
          if (mistake.id !== mistakeId) return mistake
          const interval = REVIEW_INTERVALS_DAYS[Math.min(mistake.reviewCount, REVIEW_INTERVALS_DAYS.length - 1)]
          const nextReview = new Date()
          nextReview.setDate(nextReview.getDate() + interval)
          return {
            ...mistake,
            reviewCount: mistake.reviewCount + 1,
            reviewedAt: new Date().toISOString(),
            nextReviewAt: nextReview.toISOString(),
          }
        }),
      }),
    }))
  }

  const attachMistakePhoto = async (subjectId: string, assessmentId: string, mistakeId: string, file: File) => {
    try {
      const photoDataUrl = await compressMistakePhoto(file)
      const totalPhotoCharacters = subjects.reduce((total, subject) =>
        total + subject.assessments.reduce((assessmentTotal, assessment) =>
          assessmentTotal + assessment.mistakes.reduce((mistakeTotal, mistake) => mistakeTotal + (mistake.photoDataUrl?.length ?? 0), 0), 0), 0)
      const previousPhoto = subjects
        .find((subject) => subject.id === subjectId)?.assessments
        .find((assessment) => assessment.id === assessmentId)?.mistakes
        .find((mistake) => mistake.id === mistakeId)?.photoDataUrl
      if (totalPhotoCharacters - (previousPhoto?.length ?? 0) + photoDataUrl.length > 4_600_000) {
        throw new Error("Tracker photos are near the storage limit. Remove an existing photo before adding another.")
      }
      updateSubject(subjectId, (subject) => ({
        ...subject,
        assessments: subject.assessments.map((assessment) => assessment.id !== assessmentId ? assessment : {
          ...assessment,
          mistakes: assessment.mistakes.map((mistake) => mistake.id === mistakeId ? { ...mistake, photoDataUrl } : mistake),
        }),
      }))
      setStorageError(null)
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Could not attach the image.")
    }
  }

  const removeMistakePhoto = (subjectId: string, assessmentId: string, mistakeId: string) => {
    updateSubject(subjectId, (subject) => ({
      ...subject,
      assessments: subject.assessments.map((assessment) => assessment.id !== assessmentId ? assessment : {
        ...assessment,
        mistakes: assessment.mistakes.map((mistake) => mistake.id === mistakeId ? { ...mistake, photoDataUrl: null } : mistake),
      }),
    }))
  }

  const updateExamDate = (type: AssessmentType, date: string) => {
    if (!selectedSubject) return
    updateSubject(selectedSubject.id, (subject) => {
      const examDates = { ...subject.examDates }
      if (date) examDates[type] = date
      else delete examDates[type]
      return { ...subject, examDates }
    })
  }

  const updateTimer = (updates: Partial<StudyTimer>) => {
    setData((current) => ({ ...current, timer: { ...current.timer, ...updates } }))
  }

  const startTimer = () => {
    if (!selectedSubject) return
    const startedAt = new Date().toISOString()
    updateTimer({
      subjectId: selectedSubject.id,
      startedAt,
      sessionStartedAt: data.timer.sessionStartedAt ?? startedAt,
      intention: data.timer.intention.trim(),
    })
    setTimerComplete(false)
  }

  const pauseTimer = () => {
    const elapsed = data.timer.elapsedSeconds + (data.timer.startedAt
      ? Math.max(0, Math.floor((Date.now() - Date.parse(data.timer.startedAt)) / 1000))
      : 0)
    updateTimer({ startedAt: null, elapsedSeconds: elapsed })
  }

  const finishTimer = (completed: boolean) => {
    const subjectId = data.timer.subjectId
    const startedAt = data.timer.sessionStartedAt
    if (subjectId && timerElapsed > 0 && startedAt) {
      setData((current) => ({
        ...current,
        sessions: [{
          id: makeId("study-session"),
          subjectId,
          intention: current.timer.intention,
          durationSeconds: timerElapsed,
          startedAt,
          completed,
        }, ...current.sessions],
        timer: { ...current.timer, subjectId: null, elapsedSeconds: 0, startedAt: null, sessionStartedAt: null },
      }))
    } else {
      updateTimer({ subjectId: null, elapsedSeconds: 0, startedAt: null, sessionStartedAt: null })
    }
    setTimerComplete(false)
  }

  const exportSubjectCsv = () => {
    if (!selectedSubject) return
    const rows = [
      ["Name", "Type", "Date", "Score", "Total", "Percentage"],
      ...selectedSubject.assessments.map((assessment) => [
        assessment.name,
        ASSESSMENT_TYPES.find((type) => type.value === assessment.type)?.label ?? assessment.type,
        assessment.date,
        String(assessment.score),
        String(assessment.total),
        `${Math.round((assessment.score / assessment.total) * 100)}%`,
      ]),
    ]
    const csv = rows.map((row) => row.map((field) => `"${field.replaceAll('"', '""')}"`).join(",")).join("\r\n")
    downloadText(`${selectedSubject.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-assessments.csv`, csv, "text/csv;charset=utf-8")
  }

  const exportAnki = () => {
    if (!selectedSubject) return
    const rows = selectedSubject.assessments.flatMap((assessment) =>
      assessment.mistakes.map((mistake) => [
        mistake.text,
        `${assessment.name} (${ASSESSMENT_TYPES.find((type) => type.value === assessment.type)?.label ?? assessment.type}, ${assessment.date})`,
        [selectedSubject.name, ...(mistake.tags ?? [])].join(" "),
      ])
    )
    const tsv = rows.map((row) => row.map((field) => field.replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n")
    downloadText(`${selectedSubject.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-anki.tsv`, tsv, "text/tab-separated-values;charset=utf-8")
  }

  const exportBackup = () => {
    downloadText("sac-exam-tracker-backup.json", JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data }, null, 2), "application/json")
  }

  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ""
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setStorageError("Tracker backup must be 5 MB or smaller.")
      return
    }
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const imported = isRecord(parsed) && "data" in parsed ? parsed.data : parsed
      if (!isTrackerData(imported)) throw new Error("This file is not a valid SAC tracker backup.")
      setData(imported)
      setSelectedSubjectId(imported.subjects[0]?.id ?? null)
      setStorageLoadFailed(false)
      setStorageError(null)
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Could not import the tracker backup.")
    }
  }

  const restoreStarterData = () => {
    void removeUserData(STORAGE_KEY).then(() => {
      const restored = starterData()
      setData(restored)
      setSelectedSubjectId(null)
      setStorageLoadFailed(false)
      setStorageError(null)
    }).catch((error: unknown) => setStorageError(error instanceof Error ? error.message : "Could not restore the starter tracker."))
  }

  const subjectSessions = selectedSubject
    ? data.sessions.filter((session) => session.subjectId === selectedSubject.id)
    : []
  const weeklySeconds = subjectSessions.reduce((total, session) => {
    const sessionDate = new Date(session.startedAt)
    const weekStart = new Date()
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
    return sessionDate >= weekStart ? total + session.durationSeconds : total
  }, 0)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {selectedSubject && (
              <Button variant="ghost" size="icon-sm" aria-label="All subjects" onClick={() => setSelectedSubjectId(null)}>
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <BookOpenCheck className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold">SAC & exam tracker</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Track assessment results, upcoming exams, study sessions, and the topics to revisit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedSubject && (
            <Button variant="outline" size="sm" onClick={exportSubjectCsv}>
              <Download className="size-3.5" />
              Export CSV
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportBackup}><Download className="size-3.5" />Backup</Button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-muted">
            Import backup
            <input type="file" accept=".json,application/json" onChange={importBackup} className="sr-only" />
          </label>
          <Button size="sm" onClick={() => setShowSubjectForm((open) => !open)}>
            <Plus className="size-3.5" />
            Add subject
          </Button>
        </div>
      </header>

      {storageError && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span>{storageError}</span>
          {storageLoadFailed && (
            <Button type="button" variant="outline" size="sm" onClick={restoreStarterData}>Restore sample tracker</Button>
          )}
        </div>
      )}

      {showSubjectForm && (
        <form onSubmit={addSubject} className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
          <label className="min-w-52 flex-1 space-y-1.5 text-sm">
            <span className="font-medium">Subject name</span>
            <Input required maxLength={60} value={subjectName} onChange={(event) => setSubjectName(event.target.value)} placeholder="e.g. Chemistry" />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">VCE units</span>
            <select value={subjectUnit} onChange={(event) => setSubjectUnit(event.target.value as "u12" | "u34")} className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm">
              <option value="u12">Units 1/2</option>
              <option value="u34">Units 3/4</option>
            </select>
          </label>
          <Button type="submit">Save subject</Button>
          <Button type="button" variant="outline" onClick={() => setShowSubjectForm(false)}>Cancel</Button>
        </form>
      )}

      {!storageReady ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Loading your tracker…</div>
      ) : selectedSubject ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{selectedSubject.unit === "u12" ? "Units 1/2" : "Units 3/4"}</p>
                <h2 className="mt-1 text-xl font-semibold">{selectedSubject.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedSubject.assessments.length} assessment{selectedSubject.assessments.length === 1 ? "" : "s"}
                  {" · "}
                  {selectedSubject.assessments.length
                    ? `${Math.round(selectedSubject.assessments.reduce((sum, item) => sum + item.score / item.total, 0) / selectedSubject.assessments.length * 100)}% average`
                    : "No results logged yet"}
                  {" · "} {formatDuration(weeklySeconds)} focused this week
                </p>
              </div>
              <ConfirmAction
                title="Delete subject?"
                description={`Delete ${selectedSubject.name} and its assessment, exam, and review data? This cannot be undone.`}
                onConfirm={() => {
                  setData((current) => ({
                    ...current,
                    subjects: current.subjects.filter((subject) => subject.id !== selectedSubject.id),
                    sessions: current.sessions.filter((session) => session.subjectId !== selectedSubject.id),
                    timer: current.timer.subjectId === selectedSubject.id
                      ? { ...current.timer, subjectId: null, startedAt: null, sessionStartedAt: null, elapsedSeconds: 0 }
                      : current.timer,
                  }))
                  setSelectedSubjectId(null)
                }}
              >
                {(openConfirmation) => (
                  <Button variant="outline" size="sm" onClick={openConfirmation}>
                    <Trash2 className="size-3.5" />
                    Delete subject
                  </Button>
                )}
              </ConfirmAction>
            </div>
          </section>

          <nav aria-label="Tracker sections" className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
            {([
              ["assessments", "Assessments"],
              ["exams", "Exam dates"],
              ["mistakes", `Review queue${dueMistakes.length ? ` (${dueMistakes.length})` : ""}`],
              ["focus", "Focus timer"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                aria-current={section === id ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  section === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </nav>

          {section === "assessments" && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">Assessment history</h3>
                  <p className="text-sm text-muted-foreground">Enter the mark you earned and the total available; results are compared consistently.</p>
                </div>
                <Button size="sm" onClick={openNewAssessment}>
                  <FilePlus2 className="size-3.5" />
                  Add result
                </Button>
              </div>
              <details className="rounded-lg border border-border bg-card px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium">Score color thresholds</summary>
                <div className="mt-3 flex flex-wrap gap-4">
                  {([
                    ["great", "High score at or above"],
                    ["middle", "Needs review at or above"],
                  ] as const).map(([threshold, label]) => (
                    <label key={threshold} className="flex items-center gap-2 text-sm">
                      <span>{label}</span>
                      <Input
                        type="number"
                        min={threshold === "middle" ? 0 : (selectedSubject.scoreThresholds?.middle ?? 70) + 1}
                        max={threshold === "great" ? 100 : (selectedSubject.scoreThresholds?.great ?? 85) - 1}
                        className="w-20"
                        value={selectedSubject.scoreThresholds?.[threshold] ?? (threshold === "great" ? 85 : 70)}
                        onChange={(event) => {
                          const current = selectedSubject.scoreThresholds ?? { great: 85, middle: 70 }
                          const nextValue = Math.min(100, Math.max(0, Number(event.target.value) || 0))
                          const next = threshold === "great"
                            ? { great: Math.max(nextValue, current.middle + 1), middle: current.middle }
                            : { great: current.great, middle: Math.min(nextValue, current.great - 1) }
                          updateSubject(selectedSubject.id, (subject) => ({ ...subject, scoreThresholds: next }))
                        }}
                      />
                      <span>%</span>
                    </label>
                  ))}
                </div>
              </details>
              {selectedSubject.assessments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
                  <p className="font-medium">No results yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Add your first SAC, practice result, or exam mark to see your progress.</p>
                  <Button className="mt-4" size="sm" onClick={openNewAssessment}>Add an assessment</Button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr><th className="px-4 py-3">Assessment</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Review</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[...selectedSubject.assessments].sort((a, b) => b.date.localeCompare(a.date)).map((assessment) => (
                        <tr key={assessment.id}>
                          <td className="px-4 py-3 font-medium">{assessment.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{ASSESSMENT_TYPES.find((type) => type.value === assessment.type)?.label}</td>
                          <td className="px-4 py-3 text-muted-foreground">{new Date(`${assessment.date}T00:00:00`).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            <span className={`font-semibold tabular-nums ${scoreTone(assessment.score / assessment.total * 100, selectedSubject.scoreThresholds ?? { great: 85, middle: 70 })}`}>{assessment.score}/{assessment.total}</span>
                            <span className="ml-2 text-muted-foreground">{Math.round(assessment.score / assessment.total * 100)}%</span>
                          </td>
                          <td className="px-4 py-3">
                            {assessment.mistakes.length > 0 ? (
                              <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setExpandedAssessmentId((id) => id === assessment.id ? null : assessment.id)}>
                                {assessment.mistakes.length} topic{assessment.mistakes.length === 1 ? "" : "s"}
                              </button>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEditAssessment(assessment)}>Edit</Button>
                              <ConfirmAction
                                title="Delete assessment?"
                                description={`Delete ${assessment.name} and its review notes?`}
                                onConfirm={() => updateSubject(selectedSubject.id, (subject) => ({
                                  ...subject,
                                  assessments: subject.assessments.filter((item) => item.id !== assessment.id),
                                }))}
                              >
                                {(openConfirmation) => (
                                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${assessment.name}`} onClick={openConfirmation}>
                                    <Trash2 className="size-4" />
                                  </Button>
                                )}
                              </ConfirmAction>
                            </div>
                            {expandedAssessmentId === assessment.id && (
                              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                                {assessment.mistakes.map((mistake) => (
                                  <li key={mistake.id}>
                                    {mistake.text}
                                    {mistake.photoDataUrl && (
                                      <div className="relative mt-2 h-40 w-full max-w-sm">
                                        <Image src={mistake.photoDataUrl} alt={`Reference for ${mistake.text}`} fill unoptimized sizes="(max-width: 640px) 100vw, 384px" className="rounded-md object-contain" />
                                      </div>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {selectedSubject.assessments.length > 1 && (
                <section aria-label="Assessment score graph" className="rounded-xl border border-border bg-card p-4">
                  <h4 className="text-sm font-semibold">Score trend</h4>
                  <div className="mt-3 flex h-36 items-end gap-2 overflow-x-auto border-b border-l border-border px-2">
                    {[...selectedSubject.assessments].sort((a, b) => a.date.localeCompare(b.date)).map((assessment) => {
                      const percentage = assessment.score / assessment.total * 100
                      const tone = scoreTone(percentage, selectedSubject.scoreThresholds ?? { great: 85, middle: 70 })
                      const barColor = tone.includes("emerald") ? "bg-emerald-500" : tone.includes("amber") ? "bg-amber-500" : "bg-rose-500"
                      return (
                        <div key={assessment.id} className="flex h-full min-w-14 flex-1 flex-col items-center justify-end gap-1">
                          <span className="text-[11px] tabular-nums">{Math.round(percentage)}%</span>
                          <div title={`${assessment.name}: ${Math.round(percentage)}%`} className={`w-full max-w-12 rounded-t ${barColor}`} style={{ height: `${Math.max(4, percentage)}%` }} />
                          <span className="w-full truncate text-center text-[10px] text-muted-foreground">{assessment.date.slice(5)}</span>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}
            </section>
          )}

          {section === "exams" && (
            <section className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 size-5 text-primary" />
                <div>
                  <h3 className="font-semibold">Exam and SAC dates</h3>
                  <p className="text-sm text-muted-foreground">Set dates to see a countdown and keep upcoming assessments visible.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {ASSESSMENT_TYPES.map((type) => {
                  const date = selectedSubject.examDates[type.value] ?? ""
                  const daysLeft = date ? Math.ceil((new Date(`${date}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000) : null
                  return (
                    <label key={type.value} className="space-y-1.5 rounded-lg border border-border p-3 text-sm">
                      <span className="font-medium">{type.label} date</span>
                      <Input type="date" value={date} onChange={(event) => updateExamDate(type.value, event.target.value)} />
                      {daysLeft !== null && (
                        <span className="text-xs text-muted-foreground">
                          {daysLeft < 0 ? "Date has passed" : daysLeft === 0 ? "Today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} to go`}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </section>
          )}

          {section === "mistakes" && (
            <section className="space-y-3">
              <div>
                <h3 className="font-semibold">Topics to revisit</h3>
                <p className="text-sm text-muted-foreground">Try to recall the topic before revealing it. Reviews return later using spaced intervals (1, 3, 7, 14, and 30 days).</p>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={exportAnki}><Download className="size-3.5" />Export Anki TSV</Button>
              </div>
              {dueMistakes.filter((item) => item.subject.id === selectedSubject.id).length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-8 text-center">
                  <Check className="mx-auto size-8 text-green-600" />
                  <p className="mt-2 font-medium">You’re clear for now</p>
                  <p className="text-sm text-muted-foreground">Add missed topics to an assessment to build a review queue.</p>
                </div>
              ) : dueMistakes.filter((item) => item.subject.id === selectedSubject.id).map(({ assessment, mistake }) => (
                <article key={mistake.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{assessment.name}</p>
                    {revealedMistakes.includes(mistake.id) ? (
                      <p className="mt-1">{mistake.text}</p>
                    ) : (
                      <p className="mt-1 text-muted-foreground">Recall the missed concept, then reveal it.</p>
                    )}
                    {(mistake.tags?.length ?? 0) > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">{mistake.tags?.map((tag) => <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">#{tag}</span>)}</div>
                    )}
                    {mistake.reviewCount > 0 && <p className="mt-1 text-xs text-muted-foreground">Reviewed {mistake.reviewCount} times · due now</p>}
                    {mistake.photoDataUrl && (
                      <div className="relative mt-3 h-48 w-full max-w-md overflow-hidden rounded-lg border border-border">
                        <Image src={mistake.photoDataUrl} alt={`Reference for ${mistake.text}`} fill unoptimized sizes="(max-width: 768px) 100vw, 448px" className="object-contain" />
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center rounded-md border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                        {mistake.photoDataUrl ? "Replace photo" : "Attach photo"}
                        <input
                          type="file"
                          accept="image/*"
                          aria-label={`${mistake.photoDataUrl ? "Replace" : "Attach"} photo for ${mistake.text}`}
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0]
                            event.currentTarget.value = ""
                            if (file) void attachMistakePhoto(selectedSubject.id, assessment.id, mistake.id, file)
                          }}
                        />
                      </label>
                      {mistake.photoDataUrl && <Button variant="ghost" size="sm" onClick={() => removeMistakePhoto(selectedSubject.id, assessment.id, mistake.id)}>Remove photo</Button>}
                    </div>
                  </div>
                  {revealedMistakes.includes(mistake.id) ? (
                    <Button size="sm" onClick={() => { markMistakeReviewed(selectedSubject.id, assessment.id, mistake.id); setRevealedMistakes((current) => current.filter((id) => id !== mistake.id)) }}>Reviewed</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setRevealedMistakes((current) => current.includes(mistake.id) ? current : [...current, mistake.id])}>Reveal topic</Button>
                  )}
                </article>
              ))}
            </section>
          )}

          {section === "focus" && (
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="flex items-center gap-2 font-semibold"><Clock3 className="size-4" />Study timer</h3>
                <p className="mt-1 text-sm text-muted-foreground">Choose one small intention before you start. Finish by marking whether you completed it.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(["stopwatch", "countdown"] as const).map((mode) => (
                    <Button key={mode} size="sm" variant={data.timer.mode === mode ? "secondary" : "outline"} disabled={Boolean(data.timer.startedAt)} onClick={() => updateTimer({ mode })}>
                      {mode === "stopwatch" ? "Stopwatch" : "Countdown"}
                    </Button>
                  ))}
                </div>
                {data.timer.mode === "countdown" && (
                  <label className="mt-3 block max-w-36 space-y-1 text-sm">
                    <span>Minutes</span>
                    <Input type="number" min="1" max="240" value={data.timer.goalMinutes} disabled={Boolean(data.timer.startedAt)} onChange={(event) => updateTimer({ goalMinutes: Math.min(240, Math.max(1, Number(event.target.value) || 1)) })} />
                  </label>
                )}
                <label className="mt-3 block space-y-1 text-sm">
                  <span>What will you focus on?</span>
                  <Input maxLength={120} value={data.timer.intention} disabled={Boolean(data.timer.startedAt)} onChange={(event) => updateTimer({ intention: event.target.value })} placeholder="e.g. Finish practice questions 1–5" />
                </label>
                <p aria-live="polite" className="py-6 text-center font-mono text-5xl font-semibold tabular-nums">
                  {formatDuration(data.timer.startedAt && data.timer.mode === "countdown" ? timerRemaining : timerElapsed)}
                </p>
                {data.timer.subjectId && data.timer.subjectId !== selectedSubject.id && (
                  <p className="mb-3 text-sm text-amber-700 dark:text-amber-300">The active timer belongs to {subjects.find((subject) => subject.id === data.timer.subjectId)?.name ?? "another subject"}.</p>
                )}
                {timerComplete ? (
                  <div className="space-y-3 rounded-lg bg-muted/50 p-3 text-center">
                    <p className="font-medium">Did you complete your study intention?</p>
                    <div className="flex justify-center gap-2">
                      <Button variant="outline" onClick={() => finishTimer(false)}>Not yet</Button>
                      <Button onClick={() => finishTimer(true)}>Yes, completed</Button>
                    </div>
                  </div>
                ) : data.timer.startedAt ? (
                  <div className="flex justify-center gap-2">
                    <Button variant="outline" onClick={pauseTimer}>Pause</Button>
                    <Button variant="destructive" onClick={() => { pauseTimer(); setTimerComplete(true) }}>Finish session</Button>
                  </div>
                ) : (
                  <div className="flex justify-center gap-2">
                    {data.timer.elapsedSeconds > 0 && <Button variant="outline" onClick={() => updateTimer({ elapsedSeconds: 0, sessionStartedAt: null })}>Reset</Button>}
                    <Button onClick={startTimer}>{data.timer.elapsedSeconds > 0 ? "Resume session" : "Start focused session"}</Button>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-semibold">Recent sessions</h3>
                <p className="mt-1 text-sm text-muted-foreground">This week: {formatDuration(weeklySeconds)}</p>
                {subjectSessions.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">Completed focus sessions will appear here.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-border">
                    {subjectSessions.slice(0, 8).map((session) => (
                      <li key={session.id} className="py-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{session.intention || "Focused study"}</span>
                          <span className="shrink-0 tabular-nums">{formatDuration(session.durationSeconds)}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(session.startedAt).toLocaleString()} · {session.completed ? "completed" : "not completed"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Subjects" value={String(subjects.length)} />
            <StatCard label="Assessment average" value={averageScore === null ? "—" : `${averageScore}%`} />
            <StatCard label="Topics due to review" value={String(dueMistakes.length)} />
          </section>
          {allUpcomingExams.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-semibold">Coming up</h2>
              <ul className="mt-2 divide-y divide-border">
                {allUpcomingExams.slice(0, 5).map(({ subject, type, date }) => (
                  <li key={`${subject.id}-${type}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <button className="font-medium hover:underline" onClick={() => { setSelectedSubjectId(subject.id); setSection("exams") }}>{subject.name} · {ASSESSMENT_TYPES.find((item) => item.value === type)?.label}</button>
                    <time dateTime={date} className="text-muted-foreground">{new Date(`${date}T00:00:00`).toLocaleDateString()}</time>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {subjects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
              <BookOpenCheck className="mx-auto size-10 text-muted-foreground" />
              <h2 className="mt-3 font-semibold">Add your first subject</h2>
              <p className="mt-1 text-sm text-muted-foreground">Keep SAC results, exam dates, study blocks, and revision together for each subject.</p>
              <Button className="mt-4" onClick={() => setShowSubjectForm(true)}>Add subject</Button>
            </div>
          ) : (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {subjects.map((subject) => {
                const average = subject.assessments.length
                  ? Math.round(subject.assessments.reduce((sum, assessment) => sum + assessment.score / assessment.total, 0) / subject.assessments.length * 100)
                  : null
                const subjectDueCount = subject.assessments.reduce((count, assessment) => count + assessment.mistakes.filter((mistake) => isMistakeDue(mistake, tick)).length, 0)
                return (
                  <button
                    key={subject.id}
                    type="button"
                    onClick={() => setSelectedSubjectId(subject.id)}
                    className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: subject.color }} />
                    <h2 className="mt-2 font-semibold">{subject.name}</h2>
                    <p className="text-xs text-muted-foreground">{subject.unit === "u12" ? "Units 1/2" : "Units 3/4"}</p>
                    <div className="mt-4 flex items-end justify-between gap-2">
                      <span className="text-sm text-muted-foreground">{subject.assessments.length} result{subject.assessments.length === 1 ? "" : "s"}</span>
                      <span className="text-xl font-semibold tabular-nums">{average === null ? "—" : `${average}%`}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{subjectDueCount} review topic{subjectDueCount === 1 ? "" : "s"} due</p>
                  </button>
                )
              })}
            </section>
          )}
        </div>
      )}

      {showAssessmentForm && selectedSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={saveAssessment} className="max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl">
            <div>
              <h2 className="text-lg font-semibold">{editingAssessment ? "Edit result" : "Add assessment result"}</h2>
              <p className="text-sm text-muted-foreground">Scores are checked against the maximum mark before saving.</p>
            </div>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Assessment name</span>
              <Input required maxLength={100} value={assessmentName} onChange={(event) => setAssessmentName(event.target.value)} placeholder="e.g. Unit 3 Biology SAC" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Type</span>
                <select value={assessmentType} onChange={(event) => setAssessmentType(event.target.value as AssessmentType)} className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm">
                  {ASSESSMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Date</span>
                <Input required type="date" value={assessmentDate} onChange={(event) => setAssessmentDate(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Mark earned</span>
                <Input required type="number" min="0" step="any" value={assessmentScore} onChange={(event) => setAssessmentScore(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Maximum mark</span>
                <Input required type="number" min="0.01" step="any" value={assessmentTotal} onChange={(event) => setAssessmentTotal(event.target.value)} />
              </label>
            </div>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Topics to revisit (one per line)</span>
              <textarea value={mistakeText} onChange={(event) => setMistakeText(event.target.value)} rows={4} maxLength={3000} placeholder={"e.g. Explain osmosis using water potential\nReview the final step of the calculation"} className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm" />
              <span className="text-xs text-muted-foreground">These appear in your spaced-repetition queue. Add optional tags like #unit3.</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAssessmentForm(false)}>Cancel</Button>
              <Button type="submit">{editingAssessment ? "Save changes" : "Save result"}</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
