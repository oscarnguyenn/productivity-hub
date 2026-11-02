"use client"

import { useCallback, useEffect, useState } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
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
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Plus,
  Printer,
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

const lowlight = createLowlight(common)
const documentMenus = ["File", "Edit", "View", "Insert", "Format", "Tools", "Extensions", "Help"] as const
const fontFamilies = ["Arial", "Georgia", "Times New Roman", "Verdana", "Courier New"]

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

type DocumentDialog = "find" | "link" | "word-count" | "help" | "extensions" | null
type MenuItem = { label: string; shortcut?: string; action: () => void; disabled?: boolean }

interface TiptapEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  readOnly?: boolean
  onNewDocument?: () => void
  title?: string
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
}: TiptapEditorProps) {
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      Placeholder.configure({ placeholder }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline hover:no-underline" },
      }),
      Image.configure({
        HTMLAttributes: { class: "max-w-full rounded-lg" },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
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

  const text = editor?.getText() ?? ""
  const wordCount = {
    characters: text.length,
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
  }

  const openLinkDialog = useCallback(() => {
    if (!editor) return
    setLinkUrl(String(editor.getAttributes("link").href ?? ""))
    setDialog("link")
    setActiveMenu(null)
  }, [editor])

  const handleLinkConfirm = useCallback(() => {
    if (!editor) return
    const url = linkUrl.trim()
    if (!url) {
      editor.chain().focus().unsetLink().run()
    } else {
      const normalizedUrl = /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`
      editor.chain().focus().setLink({ href: normalizedUrl }).run()
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

  const addTable = useCallback(() => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    setActiveMenu(null)
  }, [editor])

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
    const blob = new Blob(
      [`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${editor.getHTML()}</body></html>`],
      { type: "text/html;charset=utf-8" }
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${title.trim() || "document"}.html`
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
    editor?.chain().focus().setMark("textStyle", { fontSize: `${numericSize}pt` }).run()
  }, [editor])

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
      } else if (key === "p") {
        event.preventDefault()
        window.print()
      }
    }
    document.addEventListener("keydown", handleShortcut)
    return () => document.removeEventListener("keydown", handleShortcut)
  }, [editor, openLinkDialog])

  const menuItems: Record<(typeof documentMenus)[number], MenuItem[]> = {
    File: [
      { label: "New document", shortcut: "Ctrl+Alt+N", action: () => onNewDocument?.() },
      { label: "Download as HTML", action: downloadDocument },
      { label: "Print", shortcut: "Ctrl+P", action: () => window.print() },
    ],
    Edit: [
      { label: "Undo", shortcut: "Ctrl+Z", action: () => editor?.chain().focus().undo().run(), disabled: isReadOnly || !editor?.can().undo() },
      { label: "Redo", shortcut: "Ctrl+Y", action: () => editor?.chain().focus().redo().run(), disabled: isReadOnly || !editor?.can().redo() },
      { label: "Select all", shortcut: "Ctrl+A", action: () => editor?.commands.selectAll() },
      { label: "Find in document", shortcut: "Ctrl+F", action: () => { setDialog("find"); setActiveMenu(null) } },
    ],
    View: [
      { label: "Zoom in", action: () => setZoom((value) => Math.min(200, value + 10)) },
      { label: "Zoom out", action: () => setZoom((value) => Math.max(50, value - 10)) },
      { label: readingMode ? "Exit reading mode" : "Reading mode", action: () => setReadingMode((value) => !value) },
    ],
    Insert: [
      { label: "Link", shortcut: "Ctrl+K", action: openLinkDialog, disabled: isReadOnly },
      { label: "Image from URL", action: addImage, disabled: isReadOnly },
      { label: "Table (3 × 3)", action: addTable, disabled: isReadOnly },
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
    Extensions: [
      { label: "Manage extensions", action: () => { setDialog("extensions"); setActiveMenu(null) } },
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
    <div data-editor-revision={toolbarRevision} className="note-document-print flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/40">
      <h1 className="print-document-title hidden">{title}</h1>
      <div className="note-editor-menu flex items-center gap-0.5 border-b border-border bg-card px-3 py-1 text-sm">
        {documentMenus.map((menu) => (
          <div key={menu} className="relative">
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
          {[50, 75, 90, 100, 125, 150, 200].map((value) => <option key={value} value={value}>{value}%</option>)}
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
          onChange={(event) => {
            if (event.target.value) editor.chain().focus().setMark("textStyle", { fontFamily: event.target.value }).run()
          }}
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
          onChange={(event) => setSelectedFontSize(event.target.value)}
          onBlur={(event) => applyFontSize(event.target.value)}
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
          <MenuButton onClick={() => editor.chain().focus().toggleHighlight().run()} isActive={editor.isActive("highlight")} disabled={isReadOnly} title="Highlight">
            <Highlighter className="size-4" />
          </MenuButton>
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
          <MenuButton onClick={addImage} disabled={isReadOnly} title="Insert image from URL">
            <ImageIcon className="size-4" />
          </MenuButton>
          <MenuButton onClick={addTable} disabled={isReadOnly} title="Insert table">
            <TableIcon className="size-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().setBlockquote().run()} isActive={editor.isActive("blockquote")} disabled={isReadOnly} title="Block quote">
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
          <div className="flex items-center gap-0.5 border-l border-border pl-1">
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
          </div>
        )}
        <span className="ml-auto hidden items-center gap-2 pr-2 text-xs text-muted-foreground xl:flex">
          {wordCount.words} words · {wordCount.characters} characters
        </span>
      </div>

      <div className="note-editor-scroll min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto mb-2 flex w-full max-w-[816px] justify-between px-3 text-[10px] text-muted-foreground" aria-hidden="true">
          {Array.from({ length: 19 }, (_, index) => <span key={index}>{index + 1}</span>)}
        </div>
        <div style={{ zoom: `${zoom}%` }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => event.target === event.currentTarget && setDialog(null)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {dialog === "link" ? "Insert link" : dialog === "find" ? "Find in document" : dialog === "word-count" ? "Word count" : dialog === "help" ? "Keyboard shortcuts" : "Extensions"}
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
                <div className="rounded-lg bg-muted p-3"><strong className="block text-xl">{wordCount.words}</strong><span className="text-muted-foreground">Words</span></div>
                <div className="rounded-lg bg-muted p-3"><strong className="block text-xl">{wordCount.characters}</strong><span className="text-muted-foreground">Characters</span></div>
                <div className="rounded-lg bg-muted p-3"><strong className="block text-xl">{editor.getText().replace(/\s/g, "").length}</strong><span className="text-muted-foreground">Characters without spaces</span></div>
                <div className="rounded-lg bg-muted p-3"><strong className="block text-xl">{editor.state.doc.childCount}</strong><span className="text-muted-foreground">Paragraphs and blocks</span></div>
              </div>
            ) : dialog === "help" ? (
              <div className="space-y-2 text-sm">
                <p><kbd>Ctrl/⌘ + B</kbd> Bold</p>
                <p><kbd>Ctrl/⌘ + I</kbd> Italic</p>
                <p><kbd>Ctrl/⌘ + U</kbd> Underline</p>
                <p><kbd>Ctrl/⌘ + K</kbd> Insert link</p>
                <p><kbd>Ctrl/⌘ + Z</kbd> Undo · <kbd>Ctrl/⌘ + Shift + Z</kbd> Redo</p>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>No third-party extensions are connected. The editor includes built-in formatting, tables, links, images, and checklists.</p>
                <p>Documents are stored locally in this browser.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
