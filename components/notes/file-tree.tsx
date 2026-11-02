"use client"

import { useState } from "react"
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  Trash2,
  Edit2,
  FolderPlus,
  FilePlus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmAction } from "@/components/ui/confirm-action"
import { cn } from "@/lib/utils"
import type { FileNode } from "@/lib/types"

interface FileTreeProps {
  files: FileNode[]
  searchQuery?: string
  selectedFileId: string | null
  onSelectFile: (file: FileNode) => void
  onCreateFile: (parentId: string | null) => void
  onCreateFolder: (parentId: string | null) => void
  onRenameFile: (file: FileNode) => void
  onDeleteFile: (file: FileNode) => void
}

function FileTreeNode({
  node,
  level = 0,
  forceExpanded = false,
  selectedFileId,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onRenameFile,
  onDeleteFile,
}: {
  node: FileNode
  level?: number
  forceExpanded?: boolean
  selectedFileId: string | null
  onSelectFile: (file: FileNode) => void
  onCreateFile: (parentId: string | null) => void
  onCreateFolder: (parentId: string | null) => void
  onRenameFile: (file: FileNode) => void
  onDeleteFile: (file: FileNode) => void
}) {
  const [isRenaming, setIsRename] = useState(false)
  const [renameValue, setRenameValue] = useState(node.name)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const expanded = forceExpanded || (node.isExpanded ?? true)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelectFile(node)
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (node.type === "folder") {
      onSelectFile(node)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenuPos({ x: e.clientX, y: e.clientY })
    setShowContextMenu(true)
  }

  const handleRename = () => {
    if (renameValue.trim() && renameValue !== node.name) {
      onRenameFile({ ...node, name: renameValue.trim() })
    }
    setIsRename(false)
    setShowContextMenu(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleRename()
    if (e.key === "Escape") {
      setRenameValue(node.name)
      setIsRename(false)
    }
  }

  const handleCreateFile = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCreateFile(node.id)
    setShowContextMenu(false)
  }

  const handleCreateFolder = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCreateFolder(node.id)
    setShowContextMenu(false)
  }

  const handleDelete = () => {
    onDeleteFile(node)
    setShowContextMenu(false)
  }

  const Icon = node.type === "folder" ? Folder : FileText
  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5 rounded-md transition-colors",
          "hover:bg-muted/50",
          selectedFileId === node.id && "bg-muted text-muted-foreground",
          level > 0 && "ml-4"
        )}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {node.type === "folder" && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSelectFile(node)
            }}
            className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <Chevron className="size-4" />
          </button>
        )}
        {level > 0 && node.type === "document" && <span className="w-4" />}
        <Icon className={cn("size-4 flex-shrink-0", node.type === "folder" && "text-yellow-500")} />
        {isRenaming ? (
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            autoFocus
            className="flex-1 min-w-0 px-1 py-0.5 text-sm border border-primary rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-sm font-medium">{node.name}</span>
        )}
      </div>
      {node.type === "folder" && expanded && node.children && (
        <div className="ml-4">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              forceExpanded={forceExpanded}
              selectedFileId={selectedFileId}
              onSelectFile={onSelectFile}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onRenameFile={onRenameFile}
              onDeleteFile={onDeleteFile}
            />
          ))}
        </div>
      )}
      {showContextMenu && (
        <div
          className="fixed z-50 bg-card border border-border rounded-md shadow-lg p-1 min-w-[160px]"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
        >
          <button
            onClick={handleCreateFile}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors"
          >
            <FilePlus className="size-3.5" />
            New Document
          </button>
          <button
            onClick={handleCreateFolder}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors"
          >
            <FolderPlus className="size-3.5" />
            New Folder
          </button>
          <button
            onClick={() => {
              setIsRename(true)
              setShowContextMenu(false)
            }}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors"
          >
            <Edit2 className="size-3.5" />
            Rename
          </button>
          <ConfirmAction
            title={`Delete ${node.type === "folder" ? "folder" : "document"}?`}
            description={`Delete “${node.name}”${node.type === "folder" ? " and everything inside it" : ""}? This cannot be undone.`}
            onConfirm={handleDelete}
          >
            {(openConfirmation) => (
              <button
                onClick={openConfirmation}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-destructive"
              >
                <Trash2 className="size-3.5" />
                Delete
              </button>
            )}
          </ConfirmAction>
        </div>
      )}
    </>
  )
}

export function FileTree({
  files,
  searchQuery = "",
  selectedFileId,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onRenameFile,
  onDeleteFile,
}: FileTreeProps) {
  return (
    <div className="flex-1 overflow-y-auto p-2">
      <div className="mb-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          My Drive
        </h3>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onCreateFile(null)}
            title="New Document"
            className="h-8 w-8"
          >
            <FilePlus className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onCreateFolder(null)}
            title="New Folder"
            className="h-8 w-8"
          >
            <FolderPlus className="size-4" />
          </Button>
        </div>
      </div>
      {files.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Folder className="size-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{searchQuery ? "No matching files" : "No files or folders yet"}</p>
          {!searchQuery && <p className="text-xs mt-1">Create your first document or folder</p>}
        </div>
      ) : (
        <div>
          {files.map((file) => (
            <FileTreeNode
              key={file.id}
              node={file}
              forceExpanded={Boolean(searchQuery)}
              selectedFileId={selectedFileId}
              onSelectFile={onSelectFile}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onRenameFile={onRenameFile}
              onDeleteFile={onDeleteFile}
            />
          ))}
        </div>
      )}
    </div>
  )
}