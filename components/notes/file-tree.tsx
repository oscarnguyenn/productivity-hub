"use client"

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react"
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FilePlus,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { FileNode } from "@/lib/types"

export interface FileTreeActions {
  onOpen: (node: FileNode) => void
  onToggleFolder: (node: FileNode) => void
  onCreateFile: (parentId: string | null) => void
  onCreateFolder: (parentId: string | null) => void
  onRename: (node: FileNode, name: string) => void
  onDuplicate: (node: FileNode) => void
  onToggleFavourite: (node: FileNode) => void
  onMove: (node: FileNode) => void
  onExport: (node: FileNode) => void
  onDelete: (node: FileNode) => void
  onDrop: (dragId: string, targetParentId: string | null, beforeId: string | null) => void
}

type DropMode = "before" | "after" | "into"

interface DragState {
  dragId: string | null
  overId: string | null
  mode: DropMode | null
}

interface MenuState {
  node: FileNode
  x: number
  y: number
}

const DRAG_TYPE = "application/x-productivity-hub-note"
const IDLE_DRAG: DragState = { dragId: null, overId: null, mode: null }

interface SharedProps {
  selectedId: string | null
  renamingId: string | null
  drag: DragState
  setDrag: (state: DragState) => void
  setRenamingId: (id: string | null) => void
  openMenu: (node: FileNode, x: number, y: number) => void
  actions: FileTreeActions
}

function NodeRow({
  node,
  level,
  nextSiblingId,
  selectedId,
  renamingId,
  drag,
  setDrag,
  setRenamingId,
  openMenu,
  actions,
}: SharedProps & { node: FileNode; level: number; nextSiblingId: string | null }) {
  const isFolder = node.type === "folder"
  const expanded = node.isExpanded ?? true
  const renaming = renamingId === node.id
  const [renameValue, setRenameValue] = useState(node.name)
  const Icon = isFolder ? (expanded ? FolderOpen : Folder) : FileText

  const startRename = () => {
    setRenameValue(node.name)
    setRenamingId(node.id)
  }

  const commitRename = () => {
    const name = renameValue.trim()
    if (name && name !== node.name) actions.onRename(node, name)
    setRenamingId(null)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (renaming || event.target !== event.currentTarget) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      if (isFolder) actions.onToggleFolder(node)
      else actions.onOpen(node)
    } else if (event.key === "F2") {
      startRename()
    } else if (event.key === "Delete") {
      actions.onDelete(node)
    } else if (event.key === "ArrowRight" && isFolder && !expanded) {
      actions.onToggleFolder(node)
    } else if (event.key === "ArrowLeft" && isFolder && expanded) {
      actions.onToggleFolder(node)
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const rows = Array.from(
        event.currentTarget.closest("[role=tree]")?.querySelectorAll<HTMLElement>("[role=treeitem]") ?? []
      )
      const index = rows.indexOf(event.currentTarget)
      rows[index + (event.key === "ArrowDown" ? 1 : -1)]?.focus()
    }
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!drag.dragId || drag.dragId === node.id) return
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientY - rect.top) / rect.height
    const mode: DropMode = isFolder
      ? ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "into"
      : ratio < 0.5 ? "before" : "after"
    if (drag.overId !== node.id || drag.mode !== mode) setDrag({ ...drag, overId: node.id, mode })
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const dragId = event.dataTransfer.getData(DRAG_TYPE) || drag.dragId
    const mode = drag.mode
    setDrag(IDLE_DRAG)
    if (!dragId || dragId === node.id || !mode) return
    if (mode === "into") actions.onDrop(dragId, node.id, null)
    else if (mode === "before") actions.onDrop(dragId, node.parentId, node.id)
    else actions.onDrop(dragId, node.parentId, nextSiblingId)
  }

  const dropping = drag.overId === node.id
  return (
    <div
      role="treeitem"
      aria-selected={selectedId === node.id}
      aria-expanded={isFolder ? expanded : undefined}
      aria-level={level + 1}
      tabIndex={0}
      draggable={!renaming}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, node.id)
        event.dataTransfer.effectAllowed = "move"
        setDrag({ dragId: node.id, overId: null, mode: null })
      }}
      onDragEnd={() => setDrag(IDLE_DRAG)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      onClick={() => (isFolder ? actions.onToggleFolder(node) : actions.onOpen(node))}
      onDoubleClick={startRename}
      onContextMenu={(event) => {
        event.preventDefault()
        openMenu(node, event.clientX, event.clientY)
      }}
      style={{ paddingLeft: 6 + level * 14 }}
      className={cn(
        "group relative flex min-h-8 cursor-pointer items-center gap-1 rounded-md pr-1 text-sm outline-none transition-colors",
        "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50",
        selectedId === node.id && "bg-muted font-medium",
        drag.dragId === node.id && "opacity-40",
        dropping && drag.mode === "into" && "bg-primary/10 ring-1 ring-primary/40",
        dropping && drag.mode === "before" && "before:absolute before:inset-x-1 before:top-0 before:h-0.5 before:bg-primary",
        dropping && drag.mode === "after" && "after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:bg-primary"
      )}
    >
      {isFolder ? (
        expanded
          ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      {renaming ? (
        <input
          autoFocus
          aria-label={`Rename ${node.name}`}
          value={renameValue}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setRenameValue(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === "Enter") commitRename()
            if (event.key === "Escape") setRenamingId(null)
          }}
          className="min-w-0 flex-1 rounded border border-ring bg-background px-1 py-0.5 text-sm outline-none"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{node.name || "Untitled"}</span>
      )}
      {node.isFavourite && !renaming && <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />}
      {!renaming && (
        <button
          type="button"
          aria-label={`Actions for ${node.name}`}
          onClick={(event) => {
            event.stopPropagation()
            const rect = event.currentTarget.getBoundingClientRect()
            openMenu(node, rect.left, rect.bottom + 4)
          }}
          className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <MoreHorizontal className="size-4" />
        </button>
      )}
    </div>
  )
}

function ContextMenu({
  menu,
  actions,
  onRenameRequest,
  onClose,
}: {
  menu: MenuState
  actions: FileTreeActions
  onRenameRequest: (node: FileNode) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { node } = menu
  const isFolder = node.type === "folder"

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && onClose()
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", onKey)
    window.addEventListener("blur", onClose)
    window.addEventListener("resize", onClose)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("blur", onClose)
      window.removeEventListener("resize", onClose)
    }
  }, [onClose])

  const item = (label: string, icon: React.ReactNode, onSelect: () => void, danger = false) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onClose()
        onSelect()
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
        danger && "text-destructive"
      )}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 200)), top: Math.max(8, Math.min(menu.y, window.innerHeight - 320)) }}
      className="fixed z-50 w-48 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      {isFolder && item("New document", <FilePlus className="size-3.5" />, () => actions.onCreateFile(node.id))}
      {isFolder && item("New subfolder", <FolderPlus className="size-3.5" />, () => actions.onCreateFolder(node.id))}
      {!isFolder && item(node.isFavourite ? "Remove favourite" : "Add to favourites", <Star className="size-3.5" />, () => actions.onToggleFavourite(node))}
      {item("Rename", <Pencil className="size-3.5" />, () => onRenameRequest(node))}
      {item("Duplicate", <Copy className="size-3.5" />, () => actions.onDuplicate(node))}
      {item("Move to…", <FolderInput className="size-3.5" />, () => actions.onMove(node))}
      {!isFolder && item("Export Markdown", <Download className="size-3.5" />, () => actions.onExport(node))}
      <div className="my-1 h-px bg-border" />
      {item("Delete", <Trash2 className="size-3.5" />, () => actions.onDelete(node), true)}
    </div>
  )
}

function Level({ nodes, level, ...shared }: SharedProps & { nodes: FileNode[]; level: number }) {
  return (
    <>
      {nodes.map((node, index) => (
        <div key={node.id}>
          <NodeRow node={node} level={level} nextSiblingId={nodes[index + 1]?.id ?? null} {...shared} />
          {node.type === "folder" && (node.isExpanded ?? true) && (
            node.children?.length ? (
              <div role="group">
                <Level nodes={node.children} level={level + 1} {...shared} />
              </div>
            ) : (
              <p style={{ paddingLeft: 30 + level * 14 }} className="py-1 text-xs text-muted-foreground">Empty folder</p>
            )
          )}
        </div>
      ))}
    </>
  )
}

export function FileTree({ files, selectedId, actions }: { files: FileNode[]; selectedId: string | null; actions: FileTreeActions }) {
  const [drag, setDrag] = useState<DragState>(IDLE_DRAG)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  return (
    <div
      role="tree"
      aria-label="Documents and folders"
      className="min-h-24 pb-6"
      onDragOver={(event) => {
        if (!drag.dragId) return
        event.preventDefault()
        if (drag.overId !== null) setDrag({ ...drag, overId: null, mode: null })
      }}
      onDrop={(event) => {
        event.preventDefault()
        const dragId = event.dataTransfer.getData(DRAG_TYPE) || drag.dragId
        setDrag(IDLE_DRAG)
        if (dragId) actions.onDrop(dragId, null, null)
      }}
    >
      <Level
        nodes={files}
        level={0}
        selectedId={selectedId}
        renamingId={renamingId}
        drag={drag}
        setDrag={setDrag}
        setRenamingId={setRenamingId}
        openMenu={(node, x, y) => setMenu({ node, x, y })}
        actions={actions}
      />
      {menu && (
        <ContextMenu
          menu={menu}
          actions={actions}
          onRenameRequest={(node) => setRenamingId(node.id)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
