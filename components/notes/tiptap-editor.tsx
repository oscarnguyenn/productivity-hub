"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import { Node as TiptapNode, mergeAttributes } from "@tiptap/core"
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics"
import katex from "katex"
import "katex/dist/katex.min.css"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Link from "@tiptap/extension-link"
import Image from "@tiptap/extension-image"
import { Table } from "@tiptap/extension-table"
import { TableRow } from "@tiptap/extension-table-row"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight"
import Highlight from "@tiptap/extension-highlight"
import Underline from "@tiptap/extension-underline"
import TextAlign from "@tiptap/extension-text-align"
import { TextStyle } from "@tiptap/extension-text-style"
import { Color } from "@tiptap/extension-color"
import { common, createLowlight } from "lowlight"
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CheckSquare,
  ChevronDown,
  Code,
  Download,
  Maximize2,
  Minimize2,
  Highlighter,
  FileText,
  FileUp,
  IndentDecrease,
  IndentIncrease,
  Sigma,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Plus,
  Printer,
  Paintbrush,
  Quote,
  Redo,
  Search,
  Strikethrough,
  Table as TableIcon,
  Type,
  Underline as UnderlineIcon,
  Undo,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { NOTE_LINK_PREFIX } from "@/lib/notes/content"
import { buildHtmlDocument, safeFileName } from "@/lib/notes/export-html"
import { normaliseLinkUrl } from "@/lib/notes/link-url"
import { computeTextStats, formatTextStats } from "@/lib/notes/text-stats"
import type { DocumentEntry } from "@/lib/notes/tree"
import { DocumentPicker } from "./notes-dialogs"

const lowlight = createLowlight(common)
const documentMenus = ["File", "Edit", "View", "Insert", "Format", "Tools", "Help"] as const
const MAX_IMAGE_BYTES = 1_500_000
const MAX_ATTACHMENT_BYTES = 3_000_000

const Attachment = TiptapNode.create({
  name: "attachment",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      name: { default: "file" },
      size: { default: 0 },
      type: { default: "" },
      data: { default: "" },
    }
  },
  parseHTML() {
    return [{ tag: "div[data-attachment]" }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const { name, size, type, data } = node.attrs
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-attachment": "true", class: "note-attachment" }),
      ["a", { href: data, "data-attachment-link": "true", "data-type": type, download: name }, `📎 ${name}`],
      ["span", {}, ` ${(Number(size) / 1024).toFixed(0)} KB${type === "application/pdf" ? " · PDF (click to open)" : ""}`],
    ]
  },
})

function dataUrlToBlobUrl(dataUrl: string) {
  const [meta, body = ""] = dataUrl.split(",")
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? "application/octet-stream"
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: mime }))
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"))
    reader.readAsDataURL(file)
  })
}

type MathDialogState = { kind: "inline" | "block"; pos: number | null; latex: string }

function renderLatex(latex: string, displayMode: boolean) {
  try {
    return { html: katex.renderToString(latex || "\\;", { displayMode, throwOnError: true }), error: null }
  } catch (error) {
    return { html: "", error: error instanceof Error ? error.message : "Invalid LaTeX" }
  }
}
const fontFamilies = ["Arial", "Georgia", "Times New Roman", "Verdana", "Courier New"]
const highlightColors = [
  { name: "Yellow", value: "#fff176" },
  { name: "Lime", value: "#c5e1a5" },
  { name: "Mint", value: "#a7f3d0" },
  { name: "Cyan", value: "#a5f3fc" },
  { name: "Sky blue", value: "#bae6fd" },
  { name: "Lavender", value: "#ddd6fe" },
  { name: "Pink", value: "#fbcfe8" },
  { name: "Rose", value: "#fecaca" },
  { name: "Orange", value: "#fed7aa" },
  { name: "Gold", value: "#fde68a" },
  { name: "Light gray", value: "#e5e7eb" },
  { name: "White", value: "#ffffff" },
]
const cellColors = [
  { name: "No fill", value: "" },
  { name: "Light gray", value: "#f1f5f9" },
  { name: "Slate", value: "#cbd5e1" },
  { name: "Red", value: "#fecaca" },
  { name: "Orange", value: "#fed7aa" },
  { name: "Yellow", value: "#fef08a" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Teal", value: "#99f6e4" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Indigo", value: "#c7d2fe" },
  { name: "Violet", value: "#ddd6fe" },
  { name: "Pink", value: "#fbcfe8" },
]
const MAX_TABLE_CELLS = 2500
const ZOOM_LEVELS = [50, 75, 90, 100, 125, 150, 200]

function withCellBackground(extension: typeof TableCell | typeof TableHeader) {
  return extension.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        backgroundColor: {
          default: null,
          parseHTML: (element) => element.style.backgroundColor || null,
          renderHTML: (attributes) =>
            attributes.backgroundColor
              ? { style: `background-color: ${attributes.backgroundColor}` }
              : {},
        },
      }
    },
  })
}

const StyledText = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontFamily: {
        default: null,
        parseHTML: (element) => element.style.fontFamily || null,
        renderHTML: (attributes) =>
          attributes.fontFamily ? { style: `font-family: ${attributes.fontFamily}` } : {},
      },
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attributes) =>
          attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
      },
    }
  },
})

const defaultContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [] }],
}

type DocumentDialog = "find" | "link" | "word-count" | "help" | null
type MenuItem = { label: string; shortcut?: string; action: () => void; disabled?: boolean }

interface TiptapEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  readOnly?: boolean
  onNewDocument?: () => void
  title?: string
  focusMode?: boolean
  onToggleFocus?: () => void
  documents?: DocumentEntry[]
  recentIds?: string[]
  currentDocumentId?: string
  onNavigateToDocument?: (id: string) => void
  onExportMarkdown?: () => void
  onSave?: () => void
}

function MenuButton({
  onClick,
  isActive,
  disabled,
  children,
  title,
}: {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  children: React.ReactNode
  title: string
}) {
  return (
    <Button
      type="button"
      variant={isActive ? "secondary" : "ghost"}
      size="icon-sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      className={cn("h-8 w-8", isActive && "text-primary")}
    >
      {children}
    </Button>
  )
}

function getDocumentContent(content: string) {
  if (!content) return defaultContent
  try {
    return JSON.parse(content)
  } catch {
    return defaultContent
  }
}

export function TiptapEditor({
  content,
  onChange,
  placeholder = "Start writing...",
  readOnly = false,
  onNewDocument,
  title = "Untitled document",
  focusMode = false,
  onToggleFocus,
  documents = [],
  recentIds = [],
  currentDocumentId,
  onNavigateToDocument,
  onExportMarkdown,
  onSave,
}: TiptapEditorProps) {
  const [mathDialog, setMathDialog] = useState<MathDialogState | null>(null)
  const [docPickerOpen, setDocPickerOpen] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fontSizeEditedRef = useRef(false)
  const navigateRef = useRef(onNavigateToDocument)
  useEffect(() => {
    navigateRef.current = onNavigateToDocument
  }, [onNavigateToDocument])
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DocumentDialog>(null)
  const [linkUrl, setLinkUrl] = useState("")
  const [findQuery, setFindQuery] = useState("")
  const [findMessage, setFindMessage] = useState("")
  const [zoom, setZoom] = useState(100)
  const [readingMode, setReadingMode] = useState(false)
  const [spellcheckEnabled, setSpellcheckEnabled] = useState(true)
  const [selectedFontSize, setSelectedFontSize] = useState("12")
  const [toolbarRevision, setToolbarRevision] = useState(0)
  const [showTableDialog, setShowTableDialog] = useState(false)
  const [tableSizeError, setTableSizeError] = useState<string | null>(null)
  const [tableRows, setTableRows] = useState("3")
  const [tableColumns, setTableColumns] = useState("3")
  const [showHighlightPalette, setShowHighlightPalette] = useState(false)
  const [showCellPalette, setShowCellPalette] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      Placeholder.configure({ placeholder }),
      Link.configure({
        openOnClick: false,
        protocols: [{ scheme: "note" }],
        HTMLAttributes: { class: "text-primary underline hover:no-underline" },
      }),
      Image.configure({
        allowBase64: true,
        HTMLAttributes: { class: "max-w-full rounded-lg" },
        resize: { enabled: true, minWidth: 50, minHeight: 50, alwaysPreserveAspectRatio: true },
      }),
      InlineMath.configure({
        katexOptions: { throwOnError: false },
        onClick: (node, pos) => setMathDialog({ kind: "inline", pos, latex: String(node.attrs.latex ?? "") }),
      }),
      BlockMath.configure({
        katexOptions: { throwOnError: false },
        onClick: (node, pos) => setMathDialog({ kind: "block", pos, latex: String(node.attrs.latex ?? "") }),
      }),
      Attachment,
      Table.configure({ resizable: true, cellMinWidth: 96, handleWidth: 8 }),
      TableRow,
      withCellBackground(TableCell),
      withCellBackground(TableHeader),
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Highlight.configure({ multicolor: true }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      StyledText,
      Color.configure({ types: ["textStyle"] }),
    ],
    content: getDocumentContent(content),
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert mx-auto min-h-[720px] max-w-[816px] bg-white px-16 py-14 text-zinc-900 shadow-sm focus:outline-none dark:bg-zinc-950 dark:text-zinc-100",
        spellcheck: "true",
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement
        const anchor = target.closest("a")
        if (anchor?.hasAttribute("data-attachment-link")) {
          event.preventDefault()
          const data = anchor.getAttribute("href") ?? ""
          if (data.startsWith("data:")) {
            const url = dataUrlToBlobUrl(data)
            if (anchor.getAttribute("data-type") === "application/pdf") {
              window.open(url, "_blank", "noopener")
            } else {
              const link = document.createElement("a")
              link.href = url
              link.download = anchor.getAttribute("download") ?? "file"
              link.click()
            }
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
          }
          return true
        }
        const href = anchor?.getAttribute("href") ?? ""
        if (href.startsWith(NOTE_LINK_PREFIX)) {
          event.preventDefault()
          navigateRef.current?.(href.slice(NOTE_LINK_PREFIX.length))
          return true
        }
        if (anchor && (event.ctrlKey || event.metaKey) && /^(https?:|mailto:|tel:)/i.test(href)) {
          window.open(href, "_blank", "noopener,noreferrer")
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(JSON.stringify(currentEditor.getJSON()))
      setToolbarRevision((revision) => revision + 1)
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      const currentSize = String(currentEditor.getAttributes("textStyle").fontSize ?? "")
      if (currentSize) setSelectedFontSize(String(Number.parseFloat(currentSize) || 12))
      setToolbarRevision((revision) => revision + 1)
    },
    editable: !readOnly,
  })

  const isReadOnly = readOnly || readingMode

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!isReadOnly)
    editor.view.dom.setAttribute("spellcheck", String(spellcheckEnabled))
  }, [editor, isReadOnly, spellcheckEnabled])

  const stats = computeTextStats(editor?.getText({ blockSeparator: "\n" }) ?? "")

  const openLinkDialog = useCallback(() => {
    if (!editor) return
    setLinkUrl(String(editor.getAttributes("link").href ?? ""))
    setDialog("link")
    setActiveMenu(null)
  }, [editor])

  const handleLinkConfirm = useCallback(() => {
    if (!editor) return
    const url = normaliseLinkUrl(linkUrl)
    if (!url) {
      editor.chain().focus().unsetLink().run()
    } else if (editor.state.selection.empty && !editor.isActive("link")) {
      editor.chain().focus().insertContent({ type: "text", text: url.replace(/^mailto:/i, ""), marks: [{ type: "link", attrs: { href: url } }] }).run()
    } else {
      editor.chain().focus().setLink({ href: url }).run()
    }
    setLinkUrl("")
    setDialog(null)
  }, [editor, linkUrl])

  const addImage = useCallback(() => {
    if (!editor) return
    const url = window.prompt("Enter an image URL")
    if (url?.trim()) editor.chain().focus().setImage({ src: url.trim() }).run()
    setActiveMenu(null)
  }, [editor])

  const uploadImages = useCallback(async (fileList: FileList | null) => {
    if (!editor) return
    setUploadError(null)
    for (const file of Array.from(fileList ?? [])) {
      if (!file.type.startsWith("image/")) {
        setUploadError(`${file.name} is not an image.`)
        continue
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setUploadError(`${file.name} is larger than ${(MAX_IMAGE_BYTES / 1e6).toFixed(1)} MB. Images are stored inside the note, so use a smaller file or an image URL.`)
        continue
      }
      try {
        editor.chain().focus().setImage({ src: await readAsDataUrl(file), alt: file.name }).run()
      } catch {
        setUploadError(`Could not read ${file.name}.`)
      }
    }
    if (imageInputRef.current) imageInputRef.current.value = ""
  }, [editor])

  const uploadAttachments = useCallback(async (fileList: FileList | null) => {
    if (!editor) return
    setUploadError(null)
    for (const file of Array.from(fileList ?? [])) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setUploadError(`${file.name} is larger than ${(MAX_ATTACHMENT_BYTES / 1e6).toFixed(0)} MB. Attachments are stored inside the note in this browser, so large files aren't supported.`)
        continue
      }
      try {
        const data = await readAsDataUrl(file)
        editor.chain().focus().insertContent({ type: "attachment", attrs: { name: file.name, size: file.size, type: file.type, data } }).run()
      } catch {
        setUploadError(`Could not read ${file.name}.`)
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [editor])

  const pickImage = useCallback(() => {
    document.getElementById("note-image-input")?.click()
  }, [])
  const pickFile = useCallback(() => {
    document.getElementById("note-file-input")?.click()
  }, [])

  const openMathDialog = useCallback((kind: "inline" | "block") => {
    setMathDialog({ kind, pos: null, latex: "" })
    setActiveMenu(null)
  }, [])

  const applyMath = useCallback(() => {
    if (!editor || !mathDialog) return
    const latex = mathDialog.latex.trim()
    const { kind, pos } = mathDialog
    if (!latex) {
      if (pos !== null) {
        if (kind === "inline") editor.chain().focus().deleteInlineMath({ pos }).run()
        else editor.chain().focus().deleteBlockMath({ pos }).run()
      }
    } else if (pos === null) {
      if (kind === "inline") editor.chain().focus().insertInlineMath({ latex }).run()
      else editor.chain().focus().insertBlockMath({ latex }).run()
    } else if (kind === "inline") {
      editor.chain().focus().updateInlineMath({ latex, pos }).run()
    } else {
      editor.chain().focus().updateBlockMath({ latex, pos }).run()
    }
    setMathDialog(null)
  }, [editor, mathDialog])

  const linkToDocument = useCallback((doc: { id: string; name: string }) => {
    if (!editor) return
    const href = `${NOTE_LINK_PREFIX}${doc.id}`
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent({ type: "text", text: doc.name || "Untitled", marks: [{ type: "link", attrs: { href } }] }).run()
    } else {
      editor.chain().focus().setLink({ href }).run()
    }
    setDocPickerOpen(false)
  }, [editor])

  const openTableDialog = useCallback(() => {
    setTableSizeError(null)
    setShowTableDialog(true)
    setActiveMenu(null)
  }, [])

  const insertTable = useCallback(() => {
    const rows = Number(tableRows)
    const cols = Number(tableColumns)
    if (!editor || !Number.isSafeInteger(rows) || !Number.isSafeInteger(cols) || rows < 1 || cols < 1) {
      setTableSizeError("Enter a whole number greater than zero for rows and columns.")
      return
    }
    if (rows * cols > MAX_TABLE_CELLS) {
      setTableSizeError(`Tables are limited to ${MAX_TABLE_CELLS.toLocaleString()} cells to keep editing responsive.`)
      return
    }
    if (!editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()) {
      setTableSizeError("The table could not be inserted at the current cursor position.")
      return
    }
    setShowTableDialog(false)
    setTableSizeError(null)
  }, [editor, tableColumns, tableRows])

  const findNextMatch = useCallback(() => {
    if (!editor || !findQuery.trim()) {
      setFindMessage("Enter text to find.")
      return
    }
    const query = findQuery.toLocaleLowerCase()
    const matches: number[] = []
    editor.state.doc.descendants((node, position) => {
      if (!node.isText || !node.text) return
      const text = node.text.toLocaleLowerCase()
      let offset = 0
      while (offset < text.length) {
        const index = text.indexOf(query, offset)
        if (index < 0) break
        matches.push(position + index)
        offset = index + query.length
      }
    })
    if (matches.length === 0) {
      setFindMessage("No matches found.")
      return
    }
    const currentPosition = editor.state.selection.to
    const nextPosition = matches.find((position) => position >= currentPosition) ?? matches[0]
    editor.chain().focus().setTextSelection({
      from: nextPosition,
      to: nextPosition + findQuery.length,
    }).run()
    setFindMessage(`${matches.length} match${matches.length === 1 ? "" : "es"}`)
  }, [editor, findQuery])

  const downloadDocument = useCallback(() => {
    if (!editor) return
    const blob = new Blob([buildHtmlDocument(title, editor.getHTML())], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = safeFileName(title, "html")
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setActiveMenu(null)
  }, [editor, title])

  const toggleSpellcheck = useCallback(() => {
    setSpellcheckEnabled((enabled) => !enabled)
    setActiveMenu(null)
  }, [])

  const applyFontSize = useCallback((size: string) => {
    const numericSize = Number(size)
    if (!Number.isInteger(numericSize) || numericSize < 8 || numericSize > 96) return
    setSelectedFontSize(String(numericSize))
    fontSizeEditedRef.current = false
    editor?.chain().focus().setMark("textStyle", { fontSize: `${numericSize}pt` }).run()
  }, [editor])

  const applyFontFamily = useCallback((family: string) => {
    if (!editor) return
    const chain = editor.chain().focus()
    if (family) chain.setMark("textStyle", { fontFamily: family }).run()
    else chain.setMark("textStyle", { fontFamily: null }).removeEmptyTextStyle().run()
  }, [editor])

  const stepZoom = useCallback((direction: 1 | -1) => {
    setZoom((value) => {
      const index = ZOOM_LEVELS.findIndex((level) => level >= value)
      if (direction > 0) return ZOOM_LEVELS.find((level) => level > value) ?? value
      return ZOOM_LEVELS[Math.max(0, (index < 0 ? ZOOM_LEVELS.length : index) - 1)]
    })
  }, [])

  useEffect(() => {
    if (!editor) return
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !editor.view.dom.contains(event.target as Node)) return
      const key = event.key.toLowerCase()
      if (key === "k") {
        event.preventDefault()
        openLinkDialog()
      } else if (key === "f") {
        event.preventDefault()
        setDialog("find")
      } else if (key === "s") {
        event.preventDefault()
        onSave?.()
      } else if (key === "p") {
        event.preventDefault()
        window.print()
      }
    }
    document.addEventListener("keydown", handleShortcut)
    return () => document.removeEventListener("keydown", handleShortcut)
  }, [editor, onSave, openLinkDialog])

  const dialogOpen = dialog !== null || mathDialog !== null || showTableDialog
  useEffect(() => {
    if (!dialogOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      setDialog(null)
      setMathDialog(null)
      setShowTableDialog(false)
      editor?.commands.focus()
    }
    document.addEventListener("keydown", handleEscape, true)
    return () => document.removeEventListener("keydown", handleEscape, true)
  }, [dialogOpen, editor])

  const menuItems: Record<(typeof documentMenus)[number], MenuItem[]> = {
    File: [
      { label: "New document", shortcut: "Ctrl+Alt+N", action: () => onNewDocument?.() },
      { label: "Download as HTML", action: downloadDocument },
      { label: "Export as Markdown", action: () => onExportMarkdown?.(), disabled: !onExportMarkdown },
      { label: "Print / save as PDF", shortcut: "Ctrl+P", action: () => window.print() },
    ],
    Edit: [
      { label: "Undo", shortcut: "Ctrl+Z", action: () => editor?.chain().focus().undo().run(), disabled: isReadOnly || !editor?.can().undo() },
      { label: "Redo", shortcut: "Ctrl+Y", action: () => editor?.chain().focus().redo().run(), disabled: isReadOnly || !editor?.can().redo() },
      { label: "Select all", shortcut: "Ctrl+A", action: () => editor?.commands.selectAll() },
      { label: "Find in document", shortcut: "Ctrl+F", action: () => { setDialog("find"); setActiveMenu(null) } },
    ],
    View: [
      { label: "Zoom in", action: () => stepZoom(1) },
      { label: "Zoom out", action: () => stepZoom(-1) },
      { label: readingMode ? "Exit reading mode" : "Reading mode", action: () => setReadingMode((value) => !value) },
      { label: focusMode ? "Exit focus view" : "Focus view", action: () => onToggleFocus?.() },
    ],
    Insert: [
      { label: "Link", shortcut: "Ctrl+K", action: openLinkDialog, disabled: isReadOnly },
      { label: "Link to document…", action: () => setDocPickerOpen(true), disabled: isReadOnly || documents.length === 0 },
      { label: "Image from URL", action: addImage, disabled: isReadOnly },
      { label: "Upload image…", action: pickImage, disabled: isReadOnly },
      { label: "Attach file / PDF…", action: pickFile, disabled: isReadOnly },
      { label: "Inline math", action: () => openMathDialog("inline"), disabled: isReadOnly },
      { label: "Math block", action: () => openMathDialog("block"), disabled: isReadOnly },
      { label: "Insert table…", action: openTableDialog, disabled: isReadOnly },
      { label: "Checklist", action: () => editor?.chain().focus().toggleTaskList().run(), disabled: isReadOnly },
      { label: "Horizontal line", action: () => editor?.chain().focus().setHorizontalRule().run(), disabled: isReadOnly },
    ],
    Format: [
      { label: "Normal text", action: () => editor?.chain().focus().setParagraph().run(), disabled: isReadOnly },
      { label: "Heading 1", action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), disabled: isReadOnly },
      { label: "Heading 2", action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), disabled: isReadOnly },
      { label: "Heading 3", action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), disabled: isReadOnly },
      { label: "Bulleted list", action: () => editor?.chain().focus().toggleBulletList().run(), disabled: isReadOnly },
      { label: "Numbered list", action: () => editor?.chain().focus().toggleOrderedList().run(), disabled: isReadOnly },
      { label: "Clear formatting", action: () => editor?.chain().focus().unsetAllMarks().clearNodes().run(), disabled: isReadOnly },
    ],
    Tools: [
      { label: "Word count", action: () => { setDialog("word-count"); setActiveMenu(null) } },
      { label: spellcheckEnabled ? "Turn off spellcheck" : "Turn on spellcheck", action: toggleSpellcheck },
    ],
    Help: [
      { label: "Keyboard shortcuts", action: () => { setDialog("help"); setActiveMenu(null) } },
    ],
  }

  if (!editor) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading document editor…</div>
  }

  const headingValue = editor.isActive("heading", { level: 1 })
    ? "1"
    : editor.isActive("heading", { level: 2 })
      ? "2"
      : editor.isActive("heading", { level: 3 })
        ? "3"
        : ""

  return (
    <div data-editor-revision={toolbarRevision} className="note-document-print flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-muted/40">
      <h1 className="print-document-title hidden">{title}</h1>
      <div className="note-editor-menu flex flex-wrap items-center gap-0.5 border-b border-border bg-card px-3 py-1 text-sm">
        {documentMenus.map((menu) => (
          <div key={menu} className="relative shrink-0">
            <Button
              type="button"
              variant={activeMenu === menu ? "secondary" : "ghost"}
              size="sm"
              aria-expanded={activeMenu === menu}
              onClick={() => setActiveMenu((current) => current === menu ? null : menu)}
            >
              {menu}
              <ChevronDown className="size-3 opacity-60" />
            </Button>
            {activeMenu === menu && (
              <div className="absolute left-0 top-full z-30 mt-1 min-w-56 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
                {menuItems[menu].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => {
                      item.action()
                      setActiveMenu(null)
                    }}
                    className="flex w-full items-center justify-between gap-5 rounded px-2.5 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <span className="text-xs text-muted-foreground">{item.shortcut}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" title="Download document" onClick={downloadDocument}>
            <Download className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" title="Print document" onClick={() => window.print()}>
            <Printer className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={focusMode ? "Exit focus view" : "Open focus view"}
            aria-label={focusMode ? "Exit focus view" : "Open focus view"}
            onClick={onToggleFocus}
          >
            {focusMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </div>
      </div>

      <div className="note-editor-toolbar flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 px-2 py-1.5">
        <div className="flex items-center gap-0.5 border-r border-border pr-1">
          <MenuButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (Ctrl+Z)">
            <Undo className="size-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (Ctrl+Y)">
            <Redo className="size-4" />
          </MenuButton>
        </div>
        <label className="sr-only" htmlFor="document-zoom">Zoom</label>
        <select
          id="document-zoom"
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="h-8 rounded-md bg-transparent px-1.5 text-xs hover:bg-muted"
          aria-label="Zoom"
        >
          {ZOOM_LEVELS.map((value) => <option key={value} value={value}>{value}%</option>)}
        </select>
        <select
          value={headingValue}
          onChange={(event) => {
            const level = Number(event.target.value)
            if (level) editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()
            else editor.chain().focus().setParagraph().run()
          }}
          disabled={isReadOnly}
          className="h-8 max-w-36 rounded-md bg-transparent px-1.5 text-xs hover:bg-muted"
          aria-label="Text style"
        >
          <option value="">Normal text</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
        <select
          value={String(editor.getAttributes("textStyle").fontFamily ?? "")}
          onChange={(event) => applyFontFamily(event.target.value)}
          disabled={isReadOnly}
          className="h-8 w-28 rounded-md bg-transparent px-1.5 text-xs hover:bg-muted"
          aria-label="Font family"
        >
          <option value="">Arial</option>
          {fontFamilies.map((font) => <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>)}
        </select>
        <input
          type="number"
          min={8}
          max={96}
          value={selectedFontSize}
          onChange={(event) => {
            fontSizeEditedRef.current = true
            setSelectedFontSize(event.target.value)
          }}
          onBlur={(event) => {
            if (fontSizeEditedRef.current) applyFontSize(event.target.value)
          }}
          onKeyDown={(event) => event.key === "Enter" && applyFontSize(event.currentTarget.value)}
          disabled={isReadOnly}
          className="h-8 w-14 rounded-md border border-border bg-background px-1.5 text-center text-xs"
          aria-label="Font size"
        />
        <div className="flex items-center gap-0.5 border-l border-border pl-1">
          <MenuButton onClick={() => applyFontSize(String(Math.max(8, Number(selectedFontSize) - 1)))} disabled={isReadOnly} title="Decrease font size">
            <Minus className="size-3.5" />
          </MenuButton>
          <MenuButton onClick={() => applyFontSize(String(Math.min(96, Number(selectedFontSize) + 1)))} disabled={isReadOnly} title="Increase font size">
            <Plus className="size-3.5" />
          </MenuButton>
        </div>
        <div className="flex items-center gap-0.5 border-l border-border pl-1">
          <MenuButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive("bold")} disabled={isReadOnly} title="Bold (Ctrl+B)">
            <Bold className="size-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive("italic")} disabled={isReadOnly} title="Italic (Ctrl+I)">
            <Italic className="size-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive("underline")} disabled={isReadOnly} title="Underline (Ctrl+U)">
            <UnderlineIcon className="size-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive("strike")} disabled={isReadOnly} title="Strikethrough">
            <Strikethrough className="size-4" />
          </MenuButton>
          <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-muted" title="Text color">
            <span className="relative flex size-4 items-center justify-center text-sm font-bold after:absolute after:bottom-0 after:h-1 after:w-4 after:bg-primary">A</span>
            <input
              type="color"
              aria-label="Text color"
              disabled={isReadOnly}
              onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
              className="sr-only"
            />
          </label>
          <div className="relative">
            <Button
              type="button"
              variant={editor.isActive("highlight") || showHighlightPalette ? "secondary" : "ghost"}
              size="icon-sm"
              disabled={isReadOnly}
              title="Highlight color"
              aria-label="Choose highlight color"
              aria-expanded={showHighlightPalette}
              onClick={() => setShowHighlightPalette((visible) => !visible)}
              className="h-8 w-8"
            >
              <Highlighter className="size-4" />
            </Button>
            {showHighlightPalette && (
              <div className="absolute left-0 top-full z-30 mt-1 grid w-40 grid-cols-4 gap-1 rounded-lg border border-border bg-popover p-2 shadow-lg">
                {highlightColors.map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    aria-label={`${color.name} highlight`}
                    title={`${color.name} highlight`}
                    onClick={() => {
                      editor.chain().focus().setHighlight({ color: color.value }).run()
                      setShowHighlightPalette(false)
                    }}
                    className="size-7 rounded border border-border hover:ring-2 hover:ring-primary"
                    style={{ backgroundColor: color.value }}
                  />
                ))}
                <label className="col-span-4 mt-1 flex items-center justify-between rounded px-1 py-1 text-xs hover:bg-muted">
                  Custom highlight color
                  <input
                    type="color"
                    aria-label="Custom highlight color"
                    onChange={(event) => {
                      editor.chain().focus().setHighlight({ color: event.target.value }).run()
                      setShowHighlightPalette(false)
                    }}
                    className="size-6 cursor-pointer border-0 bg-transparent p-0"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().unsetHighlight().run()
                    setShowHighlightPalette(false)
                  }}
                  className="col-span-4 mt-1 rounded px-2 py-1 text-left text-xs hover:bg-muted"
                >
                  Remove highlight
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 border-l border-border pl-1">
          <MenuButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive("bulletList")} disabled={isReadOnly} title="Bulleted list">
            <List className="size-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive("orderedList")} disabled={isReadOnly} title="Numbered list">
            <ListOrdered className="size-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().toggleTaskList().run()} isActive={editor.isActive("taskList")} disabled={isReadOnly} title="Checklist">
            <CheckSquare className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={() => (editor.isActive("taskItem") ? editor.chain().focus().sinkListItem("taskItem") : editor.chain().focus().sinkListItem("listItem")).run()}
            disabled={isReadOnly || !(editor.can().sinkListItem("listItem") || editor.can().sinkListItem("taskItem"))}
            title="Indent list item (Tab)"
          >
            <IndentIncrease className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={() => (editor.isActive("taskItem") ? editor.chain().focus().liftListItem("taskItem") : editor.chain().focus().liftListItem("listItem")).run()}
            disabled={isReadOnly || !(editor.can().liftListItem("listItem") || editor.can().liftListItem("taskItem"))}
            title="Outdent list item (Shift+Tab)"
          >
            <IndentDecrease className="size-4" />
          </MenuButton>
        </div>
        <div className="flex items-center gap-0.5 border-l border-border pl-1">
          <MenuButton onClick={() => editor.chain().focus().setTextAlign("left").run()} isActive={editor.isActive({ textAlign: "left" })} disabled={isReadOnly} title="Align left">
            <AlignLeft className="size-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().setTextAlign("center").run()} isActive={editor.isActive({ textAlign: "center" })} disabled={isReadOnly} title="Align center">
            <AlignCenter className="size-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().setTextAlign("right").run()} isActive={editor.isActive({ textAlign: "right" })} disabled={isReadOnly} title="Align right">
            <AlignRight className="size-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().setTextAlign("justify").run()} isActive={editor.isActive({ textAlign: "justify" })} disabled={isReadOnly} title="Justify">
            <AlignJustify className="size-4" />
          </MenuButton>
        </div>
        <div className="flex items-center gap-0.5 border-l border-border pl-1">
          <MenuButton onClick={openLinkDialog} isActive={editor.isActive("link")} disabled={isReadOnly} title="Insert or edit link (Ctrl+K)">
            <LinkIcon className="size-4" />
          </MenuButton>
          <MenuButton onClick={() => setDocPickerOpen(true)} disabled={isReadOnly || documents.length === 0} title="Link to another document">
            <FileText className="size-4" />
          </MenuButton>
          <MenuButton onClick={pickImage} disabled={isReadOnly} title="Upload image">
            <ImageIcon className="size-4" />
          </MenuButton>
          <MenuButton onClick={pickFile} disabled={isReadOnly} title="Attach file or PDF">
            <FileUp className="size-4" />
          </MenuButton>
          <MenuButton onClick={() => openMathDialog("inline")} disabled={isReadOnly} title="Insert math (LaTeX)">
            <Sigma className="size-4" />
          </MenuButton>
          <MenuButton onClick={openTableDialog} disabled={isReadOnly} title="Insert table">
            <TableIcon className="size-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive("blockquote")} disabled={isReadOnly} title="Block quote">
            <Quote className="size-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} isActive={editor.isActive("codeBlock")} disabled={isReadOnly} title="Code block">
            <Code className="size-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} disabled={isReadOnly} title="Clear formatting">
            <Type className="size-4" />
          </MenuButton>
        </div>
        {editor.isActive("table") && (
          <div className="relative flex items-center gap-0.5 border-l border-border pl-1">
            <MenuButton onClick={() => editor.chain().focus().addRowAfter().run()} title="Add table row">
              <Plus className="size-3.5" />
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().deleteRow().run()} title="Delete table row">
              <X className="size-3.5" />
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().addColumnAfter().run()} title="Add table column">
              <Plus className="size-3.5 rotate-90" />
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete table column">
              <X className="size-3.5" />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().toggleHeaderRow().run()}
              title="Toggle header row"
            >
              <TableIcon className="size-3.5" />
            </MenuButton>
            <MenuButton onClick={() => editor.chain().focus().deleteTable().run()} title="Delete table">
              <X className="size-3.5 text-destructive" />
            </MenuButton>
            <Button
              type="button"
              variant={showCellPalette ? "secondary" : "ghost"}
              size="icon-sm"
              title="Cell background color"
              aria-label="Choose cell background color"
              aria-expanded={showCellPalette}
              onClick={() => setShowCellPalette((visible) => !visible)}
              className="h-8 w-8"
            >
              <Paintbrush className="size-3.5" />
            </Button>
            {showCellPalette && (
              <div className="absolute left-0 top-full z-30 mt-1 grid w-44 grid-cols-4 gap-1 rounded-lg border border-border bg-popover p-2 shadow-lg">
                {cellColors.map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    aria-label={`${color.name} cell fill`}
                    title={`${color.name} cell fill`}
                    onClick={() => {
                      editor.chain().focus().setCellAttribute("backgroundColor", color.value || null).run()
                      setShowCellPalette(false)
                    }}
                    className="size-7 rounded border border-border hover:ring-2 hover:ring-primary"
                    style={{ backgroundColor: color.value || "transparent" }}
                  >
                    {color.value ? null : <X className="mx-auto size-4 text-muted-foreground" />}
                  </button>
                ))}
                <label className="col-span-4 mt-1 flex items-center justify-between rounded px-1 py-1 text-xs hover:bg-muted">
                  Custom cell color
                  <input
                    type="color"
                    aria-label="Custom cell background color"
                    onChange={(event) => {
                      editor.chain().focus().setCellAttribute("backgroundColor", event.target.value).run()
                      setShowCellPalette(false)
                    }}
                    className="size-6 cursor-pointer border-0 bg-transparent p-0"
                  />
                </label>
              </div>
            )}
          </div>
        )}
        <span className="ml-auto hidden items-center gap-2 pr-2 text-xs text-muted-foreground md:flex">
          {formatTextStats(stats)}
        </span>
      </div>

      <div className="note-editor-scroll min-h-0 flex-1 overflow-auto p-5">
        {uploadError && (
          <div role="alert" className="mx-auto mb-3 flex max-w-[816px] items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {uploadError}
            <button type="button" aria-label="Dismiss" onClick={() => setUploadError(null)}><X className="size-4" /></button>
          </div>
        )}
        <input id="note-image-input" ref={imageInputRef} type="file" accept="image/*" multiple hidden aria-label="Upload image" onChange={(event) => void uploadImages(event.target.files)} />
        <input id="note-file-input" ref={fileInputRef} type="file" multiple hidden aria-label="Attach file" onChange={(event) => void uploadAttachments(event.target.files)} />
        <div style={{ zoom: `${zoom}%` }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      <DocumentPicker
        open={docPickerOpen}
        title="Link to document"
        docs={documents.filter((entry) => entry.node.id !== currentDocumentId)}
        recentIds={recentIds}
        onSelect={linkToDocument}
        onClose={() => setDocPickerOpen(false)}
      />
      {mathDialog && (() => {
        const preview = renderLatex(mathDialog.latex, mathDialog.kind === "block")
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => event.target === event.currentTarget && setMathDialog(null)}>
            <div role="dialog" aria-modal="true" aria-label="Edit math" className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
              <h2 className="mb-3 text-lg font-semibold">{mathDialog.pos === null ? "Insert" : "Edit"} {mathDialog.kind === "block" ? "math block" : "inline math"}</h2>
              <div className="mb-3 flex gap-2 text-sm">
                {(["inline", "block"] as const).map((kind) => (
                  <label key={kind} className="flex items-center gap-1">
                    <input type="radio" name="math-kind" disabled={mathDialog.pos !== null} checked={mathDialog.kind === kind} onChange={() => setMathDialog({ ...mathDialog, kind })} />
                    {kind === "inline" ? "Inline" : "Block"}
                  </label>
                ))}
              </div>
              <textarea
                autoFocus
                value={mathDialog.latex}
                onChange={(event) => setMathDialog({ ...mathDialog, latex: event.target.value })}
                onKeyDown={(event) => (event.ctrlKey || event.metaKey) && event.key === "Enter" && applyMath()}
                rows={3}
                spellCheck={false}
                aria-label="LaTeX"
                placeholder="e.g. \frac{a}{b} + \sqrt{x^2+1}"
                className="w-full rounded-md border border-border bg-background p-2 font-mono text-sm"
              />
              <div className="mt-3 min-h-14 overflow-x-auto rounded-md bg-muted p-3 text-center" aria-label="Preview">
                {preview.error ? <p className="text-left text-xs text-destructive">{preview.error}</p> : <span dangerouslySetInnerHTML={{ __html: preview.html }} />}
              </div>
              <div className="mt-4 flex justify-between gap-2">
                <p className="text-xs text-muted-foreground">Ctrl+Enter to apply. Clear the text to delete an existing formula.</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setMathDialog(null)}>Cancel</Button>
                  <Button onClick={applyMath} disabled={Boolean(preview.error)}>Apply</Button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => event.target === event.currentTarget && setDialog(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="document-dialog-title" className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="document-dialog-title" className="text-lg font-semibold">
                {dialog === "link" ? "Insert link" : dialog === "find" ? "Find in document" : dialog === "word-count" ? "Word count" : "Keyboard shortcuts"}
              </h2>
              <Button variant="ghost" size="icon-sm" aria-label="Close dialog" onClick={() => setDialog(null)}>
                <X className="size-4" />
              </Button>
            </div>
            {dialog === "link" ? (
              <div className="space-y-3">
                <label className="block space-y-1.5 text-sm">
                  <span>Link URL</span>
                  <Input
                    autoFocus
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && handleLinkConfirm()}
                    placeholder="https://example.com"
                  />
                </label>
                <div className="flex justify-end gap-2">
                  {editor.isActive("link") && (
                    <Button variant="outline" onClick={() => { editor.chain().focus().unsetLink().run(); setLinkUrl(""); setDialog(null) }}>
                      Remove link
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
                  <Button onClick={handleLinkConfirm}>Apply</Button>
                </div>
              </div>
            ) : dialog === "find" ? (
              <div className="space-y-3">
                <label className="block space-y-1.5 text-sm">
                  <span>Find text</span>
                  <Input
                    autoFocus
                    value={findQuery}
                    onChange={(event) => setFindQuery(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && findNextMatch()}
                    placeholder="Text to find"
                  />
                </label>
                {findMessage && <p role="status" className="text-sm text-muted-foreground">{findMessage}</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialog(null)}>Close</Button>
                  <Button onClick={findNextMatch}><Search className="size-4" />Find next</Button>
                </div>
              </div>
            ) : dialog === "word-count" ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-muted p-3"><strong className="block text-xl">{stats.words}</strong><span className="text-muted-foreground">Words</span></div>
                <div className="rounded-lg bg-muted p-3"><strong className="block text-xl">{stats.characters}</strong><span className="text-muted-foreground">Characters</span></div>
                <div className="rounded-lg bg-muted p-3"><strong className="block text-xl">{stats.charactersNoSpaces}</strong><span className="text-muted-foreground">Characters without spaces</span></div>
                <div className="rounded-lg bg-muted p-3"><strong className="block text-xl">{editor.state.doc.childCount}</strong><span className="text-muted-foreground">Paragraphs and blocks</span></div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <p><kbd>Ctrl/⌘ + B</kbd> Bold · <kbd>Ctrl/⌘ + I</kbd> Italic · <kbd>Ctrl/⌘ + U</kbd> Underline</p>
                <p><kbd>Ctrl/⌘ + K</kbd> Insert link · <kbd>Ctrl/⌘ + F</kbd> Find</p>
                <p><kbd>Ctrl/⌘ + Z</kbd> Undo · <kbd>Ctrl/⌘ + Shift + Z</kbd> Redo</p>
                <p><kbd>Tab</kbd> / <kbd>Shift + Tab</kbd> Indent / outdent list item</p>
                <p><kbd>$$…$$</kbd> inline math · <kbd>$$$…$$$</kbd> math block (or Insert → Math)</p>
                <p><kbd>Alt + O</kbd> Quick switcher · <kbd>Esc</kbd> Exit focus mode</p>
              </div>
            )}
          </div>
        </div>
      )}
      {showTableDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => event.target === event.currentTarget && setShowTableDialog(false)}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="table-dialog-title" className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <h2 id="table-dialog-title" className="mb-1 text-lg font-semibold">Insert table</h2>
            <p className="mb-4 text-sm text-muted-foreground">Choose any number of rows and columns. You can add or remove them later.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-sm">
                <span>Rows</span>
                <Input type="number" min="1" max={MAX_TABLE_CELLS} step="1" value={tableRows} onChange={(event) => { setTableRows(event.target.value); setTableSizeError(null) }} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span>Columns</span>
                <Input type="number" min="1" max={MAX_TABLE_CELLS} step="1" value={tableColumns} onChange={(event) => { setTableColumns(event.target.value); setTableSizeError(null) }} />
              </label>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{tableRows || "0"} × {tableColumns || "0"} cells · Maximum {MAX_TABLE_CELLS.toLocaleString()}</p>
            {tableSizeError && <p role="alert" className="mt-2 text-sm text-destructive">{tableSizeError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTableDialog(false)}>Cancel</Button>
              <Button
                onClick={insertTable}
                disabled={!Number.isSafeInteger(Number(tableRows)) || !Number.isSafeInteger(Number(tableColumns)) || Number(tableRows) < 1 || Number(tableColumns) < 1 || Number(tableRows) * Number(tableColumns) > MAX_TABLE_CELLS}
              >
                Insert table
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
