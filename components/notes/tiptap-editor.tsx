"use client"

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
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  CheckSquare,
  Highlighter,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Type,
  MoreHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useState, useCallback, useRef, useEffect } from "react"

const lowlight = createLowlight(common)

interface TiptapEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  readOnly?: boolean
}

const defaultContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [],
    },
  ],
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
      variant={isActive ? "secondary" : "outline"}
      size="icon-sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "h-8 w-8 transition-colors",
        isActive && "bg-primary text-primary-foreground"
      )}
    >
      {children}
    </Button>
  )
}

function MenuSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="border border-border rounded-lg bg-background px-2 py-1.5 text-sm font-medium text-muted-foreground min-w-[140px] focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export function TiptapEditor({ content, onChange, placeholder = "Start writing...", readOnly = false }: TiptapEditorProps) {
  const [headingLevel, setHeadingLevel] = useState<string>("")
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const editorRef = useRef<HTMLDivElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline hover:no-underline",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "rounded-lg max-w-full h-auto",
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      TextStyle,
      Color.configure({
        types: ["textStyle"],
      }),
    ],
    content: content ? JSON.parse(content) : defaultContent,
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[400px] p-4",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(JSON.stringify(editor.getJSON()))
    },
    editable: !readOnly,
  })

  const handleHeadingChange = useCallback((level: string) => {
    if (!editor) return
    if (level === "") {
      editor.chain().focus().setParagraph().run()
    } else {
      const headingLevel = parseInt(level, 10) as 1 | 2 | 3
      editor.chain().focus().toggleHeading({ level: headingLevel }).run()
    }
    setHeadingLevel("")
  }, [editor])

  const addLink = useCallback(() => {
    if (!editor) return
    const { state } = editor
    const { from, to, empty } = state.selection

    if (empty) {
      setShowLinkDialog(true)
      return
    }

    setShowLinkDialog(true)
  }, [editor])

  const handleLinkConfirm = useCallback(() => {
    if (!editor || !linkUrl.trim()) {
      setShowLinkDialog(false)
      setLinkUrl("")
      return
    }

    editor.chain().focus().setLink({ href: linkUrl.trim() }).run()
    setShowLinkDialog(false)
    setLinkUrl("")
  }, [editor, linkUrl])

  const handleImageAdd = useCallback(() => {
    if (!editor) return
    const url = prompt("Enter image URL:")
    if (url) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }, [editor])

  const handleTableAdd = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }, [editor])

  const handleTaskListAdd = useCallback(() => {
    if (!editor) return
    editor.chain().focus().toggleTaskList().run()
  }, [editor])

  const handleCodeBlockAdd = useCallback(() => {
    if (!editor) return
    editor.chain().focus().toggleCodeBlock().run()
  }, [editor])

  const handleHighlight = useCallback(() => {
    if (!editor) return
    editor.chain().focus().toggleHighlight().run()
  }, [editor])

  const handleAlign = useCallback((alignment: "left" | "center" | "right" | "justify") => {
    if (!editor) return
    editor.chain().focus().setTextAlign(alignment).run()
  }, [editor])

  const handleClearFormatting = useCallback(() => {
    if (!editor) return
    editor.chain().focus().unsetAllMarks().run()
  }, [editor])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!editor) return

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case "b":
            e.preventDefault()
            editor.chain().focus().toggleBold().run()
            break
          case "i":
            e.preventDefault()
            editor.chain().focus().toggleItalic().run()
            break
          case "u":
            e.preventDefault()
            editor.chain().focus().toggleUnderline().run()
            break
          case "k":
            e.preventDefault()
            addLink()
            break
          case "z":
            if (!e.shiftKey) {
              e.preventDefault()
              editor.chain().focus().undo().run()
            } else {
              e.preventDefault()
              editor.chain().focus().redo().run()
            }
            break
          case "y":
            e.preventDefault()
            editor.chain().focus().redo().run()
            break
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [editor, addLink])

  if (!editor) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading editor...</div>
  }

  return (
    <div className="flex flex-col flex-1 border border-border rounded-xl bg-card overflow-hidden">
      {/* Toolbar - Google Docs style */}
      <div className="border-b border-border bg-muted/30 p-2 flex flex-wrap items-center gap-1">
        {/* Undo/Redo */}
        <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
          <MenuButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo (⌘Z)"
          >
            <Undo className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo (⌘Y)"
          >
            <Redo className="size-4" />
          </MenuButton>
        </div>

        {/* Heading selector */}
        <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
          <MenuSelect
            value={headingLevel}
            onChange={handleHeadingChange}
            disabled={readOnly}
            options={[
              { value: "", label: "Normal text" },
              { value: "1", label: "Heading 1" },
              { value: "2", label: "Heading 2" },
              { value: "3", label: "Heading 3" },
            ]}
          />
        </div>

        {/* Text formatting */}
        <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
          <MenuButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive("bold")}
            disabled={readOnly}
            title="Bold (⌘B)"
          >
            <Bold className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive("italic")}
            disabled={readOnly}
            title="Italic (⌘I)"
          >
            <Italic className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive("underline")}
            disabled={readOnly}
            title="Underline (⌘U)"
          >
            <UnderlineIcon className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive("strike")}
            disabled={readOnly}
            title="Strikethrough"
          >
            <Strikethrough className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive("code")}
            disabled={readOnly}
            title="Inline code"
          >
            <Code className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={handleHighlight}
            isActive={editor.isActive("highlight")}
            disabled={readOnly}
            title="Highlight"
          >
            <Highlighter className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={handleClearFormatting}
            disabled={readOnly}
            title="Clear formatting"
          >
            <Type className="size-4" />
          </MenuButton>
        </div>

        {/* Lists */}
        <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
          <MenuButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive("bulletList")}
            disabled={readOnly}
            title="Bullet list"
          >
            <List className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive("orderedList")}
            disabled={readOnly}
            title="Numbered list"
          >
            <ListOrdered className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={handleTaskListAdd}
            isActive={editor.isActive("taskList")}
            disabled={readOnly}
            title="Task list"
          >
            <CheckSquare className="size-4" />
          </MenuButton>
        </div>

        {/* Alignment */}
        <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
          <MenuButton
            onClick={() => handleAlign("left")}
            isActive={editor.isActive({ textAlign: "left" })}
            disabled={readOnly}
            title="Align left"
          >
            <AlignLeft className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={() => handleAlign("center")}
            isActive={editor.isActive({ textAlign: "center" })}
            disabled={readOnly}
            title="Align center"
          >
            <AlignCenter className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={() => handleAlign("right")}
            isActive={editor.isActive({ textAlign: "right" })}
            disabled={readOnly}
            title="Align right"
          >
            <AlignRight className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={() => handleAlign("justify")}
            isActive={editor.isActive({ textAlign: "justify" })}
            disabled={readOnly}
            title="Justify"
          >
            <AlignJustify className="size-4" />
          </MenuButton>
        </div>

        {/* Insert elements */}
        <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
          <MenuButton
            onClick={addLink}
            isActive={editor.isActive("link")}
            disabled={readOnly}
            title="Add link (⌘K)"
          >
            <LinkIcon className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={handleImageAdd}
            disabled={readOnly}
            title="Add image"
          >
            <ImageIcon className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={handleTableAdd}
            disabled={readOnly}
            title="Insert table"
          >
            <TableIcon className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={handleCodeBlockAdd}
            isActive={editor.isActive("codeBlock")}
            disabled={readOnly}
            title="Code block"
          >
            <Code className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().setBlockquote().run()}
            isActive={editor.isActive("blockquote")}
            disabled={readOnly}
            title="Blockquote"
          >
            <Quote className="size-4" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            disabled={readOnly}
            title="Horizontal rule"
          >
            <MoreHorizontal className="size-4" />
          </MenuButton>
        </div>

        {/* Document info */}
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{editor.storage.characterCount?.characters() || 0} characters</span>
          <span>{editor.storage.characterCount?.words() || 0} words</span>
        </div>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-auto" ref={editorRef}>
        <EditorContent editor={editor} />
      </div>

      {/* Link dialog */}
      {showLinkDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-xl border border-border w-full max-w-md p-4">
            <h3 className="text-lg font-semibold mb-4">Add Link</h3>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleLinkConfirm()}
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowLinkDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleLinkConfirm}>Apply</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}