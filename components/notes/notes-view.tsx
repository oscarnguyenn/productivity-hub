"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import {
  Plus,
  Search,
  Folder,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  Save,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { FileTree } from "./file-tree"
import { TiptapEditor } from "./tiptap-editor"
import type { FileNode, DashboardData } from "@/lib/types"

const emptyDashboard: DashboardData = {
  user: { name: "", role: "" },
  layout: [],
  events: [],
  tasks: [],
  projects: [],
  goals: [],
  habits: [],
  files: [],
}

const NOTES_STORAGE_KEY = "productivity-hub-notes-files-v1"

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function createFileNode(name: string, type: "folder" | "document", parentId: string | null): FileNode {
  const now = new Date().toISOString()
  return {
    id: generateId(),
    name,
    type,
    parentId,
    children: type === "folder" ? [] : undefined,
    content: type === "document" ? JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [] }],
    }) : undefined,
    createdAt: now,
    updatedAt: now,
    isExpanded: true,
  }
}

function findNode(nodes: FileNode[], id: string): FileNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

function updateNode(nodes: FileNode[], id: string, updates: Partial<FileNode>): FileNode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return { ...node, ...updates, updatedAt: new Date().toISOString() }
    }
    if (node.children) {
      return { ...node, children: updateNode(node.children, id, updates) }
    }
    return node
  })
}

function removeNode(nodes: FileNode[], id: string): FileNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({
      ...node,
      children: node.children ? removeNode(node.children, id) : undefined,
    }))
}

function addNodeToParent(nodes: FileNode[], parentId: string | null, newNode: FileNode): FileNode[] {
  if (parentId === null) {
    return [...nodes, newNode]
  }
  return nodes.map((node) => {
    if (node.id === parentId && node.children) {
      return { ...node, children: [...node.children, newNode], updatedAt: new Date().toISOString() }
    }
    if (node.children) {
      return { ...node, children: addNodeToParent(node.children, parentId, newNode) }
    }
    return node
  })
}

function getNodeText(node: FileNode): string {
  if (!node.content) return ""
  try {
    const parsed: unknown = JSON.parse(node.content)
    const collectText = (value: unknown): string => {
      if (!value || typeof value !== "object") return ""
      if (Array.isArray(value)) return value.map(collectText).join(" ")
      const record = value as Record<string, unknown>
      return `${typeof record.text === "string" ? record.text : ""} ${collectText(record.content)}`
    }
    return collectText(parsed)
  } catch {
    return node.content
  }
}

function filterFileTree(nodes: FileNode[], query: string): FileNode[] {
  if (!query) return nodes
  const normalizedQuery = query.toLocaleLowerCase()
  return nodes.flatMap((node) => {
    const children = node.children ? filterFileTree(node.children, query) : undefined
    const matches =
      node.name.toLocaleLowerCase().includes(normalizedQuery) ||
      getNodeText(node).toLocaleLowerCase().includes(normalizedQuery)
    if (!matches && !children?.length) return []
    return [{ ...node, children }]
  })
}

function collectNodeIds(node: FileNode): string[] {
  return [node.id, ...(node.children?.flatMap(collectNodeIds) ?? [])]
}

function isFileNode(value: unknown): value is FileNode {
  if (!value || typeof value !== "object") return false
  const node = value as Record<string, unknown>
  const validShape =
    typeof node.id === "string" &&
    typeof node.name === "string" &&
    (node.type === "folder" || node.type === "document") &&
    (typeof node.parentId === "string" || node.parentId === null) &&
    typeof node.createdAt === "string" &&
    typeof node.updatedAt === "string" &&
    (node.content === undefined || typeof node.content === "string") &&
    (node.children === undefined ||
      (Array.isArray(node.children) && node.children.every(isFileNode)))
  if (!validShape) return false
  if (node.type === "document" && typeof node.content === "string") {
    try {
      const content: unknown = JSON.parse(node.content)
      return Boolean(content && typeof content === "object" && (content as Record<string, unknown>).type === "doc")
    } catch {
      return false
    }
  }
  return true
}

export function NotesView({
  dashboardData: initialData = emptyDashboard,
  onUpdateDashboard,
}: {
  dashboardData?: DashboardData
  onUpdateDashboard?: (data: Partial<DashboardData>) => void
}) {
  const [files, setFiles] = useState<FileNode[]>(initialData.files || [])
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [openDocumentIds, setOpenDocumentIds] = useState<string[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showNewFileDialog, setShowNewFileDialog] = useState(false)
  const [newFileName, setNewFileName] = useState("")
  const [newFileType, setNewFileType] = useState<"folder" | "document">("document")
  const [newFileParentId, setNewFileParentId] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState("")
  const [storageReady, setStorageReady] = useState(false)
  const [storageLoadFailed, setStorageLoadFailed] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)

  const selectedFile = useMemo(() => findNode(files, selectedFileId || ""), [files, selectedFileId])
  const visibleFiles = useMemo(() => filterFileTree(files, searchValue.trim()), [files, searchValue])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(NOTES_STORAGE_KEY)
        if (saved !== null) {
          const parsed: unknown = JSON.parse(saved)
          if (!Array.isArray(parsed) || !parsed.every(isFileNode)) {
            throw new Error("Saved notes data is not a valid file list.")
          }
          setFiles(parsed)
        }
      } catch (error) {
        setStorageLoadFailed(true)
        setStorageError(
          error instanceof Error ? error.message : "Could not load saved notes."
        )
      } finally {
        setStorageReady(true)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!storageReady || storageLoadFailed) return
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(files))
        onUpdateDashboard?.({ files })
        setStorageError(null)
      } catch (error) {
        setStorageError(
          error instanceof Error ? error.message : "Could not save notes."
        )
      }
    }, 150)
    return () => window.clearTimeout(timer)
  }, [files, onUpdateDashboard, storageLoadFailed, storageReady])

  const handleSelectFile = useCallback((file: FileNode) => {
    if (file.type === "document") {
      setSelectedFileId(file.id)
      setOpenDocumentIds((current) =>
        current.includes(file.id) ? current : [...current, file.id]
      )
    } else {
      // For folders, toggle expansion
      setFiles((current) => updateNode(current, file.id, { isExpanded: !file.isExpanded }))
    }
  }, [])

  const handleCreateFile = useCallback((parentId: string | null) => {
    setNewFileParentId(parentId)
    setNewFileType("document")
    setNewFileName("Untitled document")
    setShowNewFileDialog(true)
  }, [])

  const handleCreateFolder = useCallback((parentId: string | null) => {
    setNewFileParentId(parentId)
    setNewFileType("folder")
    setNewFileName("New folder")
    setShowNewFileDialog(true)
  }, [])

  const handleConfirmCreate = useCallback(() => {
    if (!newFileName.trim()) return
    const newNode = createFileNode(newFileName.trim(), newFileType, newFileParentId)
    setFiles((current) => addNodeToParent(current, newFileParentId, newNode))
    if (newFileType === "document") {
      setSelectedFileId(newNode.id)
      setOpenDocumentIds((current) => [...current, newNode.id])
    }
    setShowNewFileDialog(false)
    setNewFileName("")
  }, [newFileName, newFileType, newFileParentId])

  const handleRenameFile = useCallback((file: FileNode) => {
    setFiles((current) => updateNode(current, file.id, { name: file.name }))
  }, [])

  const handleDeleteFile = useCallback((file: FileNode) => {
    if (!confirm(`Delete "${file.name}"?`)) return
    const removedIds = collectNodeIds(file)
    setFiles((current) => removeNode(current, file.id))
    setOpenDocumentIds((current) => current.filter((id) => !removedIds.includes(id)))
    if (selectedFileId && removedIds.includes(selectedFileId)) setSelectedFileId(null)
  }, [selectedFileId])

  const handleContentChange = useCallback((content: string) => {
    if (!selectedFile) return
    setFiles((current) => updateNode(current, selectedFile.id, { content }))
  }, [selectedFile])

  const handleCloseTab = useCallback((fileId: string) => {
    const tabIndex = openDocumentIds.indexOf(fileId)
    const nextTabs = openDocumentIds.filter((id) => id !== fileId)
    setOpenDocumentIds(nextTabs)
    if (selectedFileId === fileId) {
      setSelectedFileId(nextTabs[Math.max(0, tabIndex - 1)] ?? null)
    }
  }, [openDocumentIds, selectedFileId])

  const handleOpenTab = useCallback((fileId: string) => {
    setSelectedFileId(fileId)
  }, [])

  return (
    <div className="flex h-[calc(100dvh-180px)] min-h-[480px] flex-col overflow-hidden rounded-xl border border-border bg-background">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-card">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden"
          >
            {sidebarOpen ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
          <h1 className="text-xl font-semibold">Notes</h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search in notes..."
              className="pl-9 w-64"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              aria-label="Search notes"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => handleCreateFile(null)}>
            <Plus className="size-3.5 mr-1.5" />
            New Document
          </Button>
          <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <Save className="size-3.5" />
            {storageError ? "Save failed" : storageReady ? "Saved on this device" : "Loading notes"}
          </div>
        </div>
      </div>
      {storageError && (
        <div role="status" className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {storageError}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - File Tree */}
        <aside
          className={cn(
            "w-72 flex-shrink-0 border-r border-border bg-card flex flex-col transition-all duration-200",
            !sidebarOpen && "w-0 overflow-hidden border-0"
          )}
        >
          <FileTree
            files={visibleFiles}
            searchQuery={searchValue.trim()}
            selectedFileId={selectedFileId}
            onSelectFile={handleSelectFile}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onRenameFile={handleRenameFile}
            onDeleteFile={handleDeleteFile}
          />
        </aside>

        {/* Main Editor Area */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {selectedFile && selectedFile.type === "document" ? (
            <>
              <div role="tablist" aria-label="Open documents" className="flex min-h-10 items-end gap-1 overflow-x-auto border-b border-border bg-muted/30 px-2 pt-1">
                {openDocumentIds.map((fileId) => {
                  const file = findNode(files, fileId)
                  if (!file || file.type !== "document") return null
                  const active = selectedFileId === fileId
                  return (
                    <div
                      key={file.id}
                      role="presentation"
                      className={cn(
                        "group flex max-w-56 shrink-0 items-center rounded-t-lg border border-b-0 px-2 text-sm",
                        active ? "border-border bg-card" : "border-transparent text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => handleOpenTab(file.id)}
                        className="flex h-9 min-w-0 items-center gap-2"
                      >
                        <FileText className="size-3.5 shrink-0" />
                        <span className="truncate">{file.name}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Close ${file.name}`}
                        onClick={() => handleCloseTab(file.id)}
                        className="ml-1 rounded p-1 opacity-60 hover:bg-muted hover:opacity-100"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
              {/* Document Header */}
              <div className="border-b border-border bg-card px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="size-5 text-muted-foreground" />
                  <input
                    type="text"
                    value={selectedFile.name}
                    onChange={(e) => handleRenameFile({ ...selectedFile, name: e.target.value })}
                    className="bg-transparent border-none focus:outline-none text-lg font-semibold flex-1 pr-4"
                  />
                </div>
                <span className="hidden text-xs text-muted-foreground sm:block">
                  Edited {new Date(selectedFile.updatedAt).toLocaleString()}
                </span>
              </div>

              {/* Editor */}
              <div className="flex-1 flex overflow-hidden">
                <TiptapEditor
                  key={selectedFile.id}
                  content={selectedFile.content || ""}
                  onChange={handleContentChange}
                  placeholder="Start writing your document..."
                  onNewDocument={() => handleCreateFile(null)}
                  title={selectedFile.name}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center p-8">
                <FileText className="size-24 mx-auto mb-4 opacity-20" />
                <h2 className="text-xl font-medium mb-2">No document selected</h2>
                <p className="text-sm mb-6">Select a document from the sidebar or create a new one</p>
                <div className="flex items-center justify-center gap-2">
                  <Button onClick={() => handleCreateFile(null)}>
                    <Plus className="size-3.5 mr-1.5" />
                    New Document
                  </Button>
                  <Button variant="outline" onClick={() => handleCreateFolder(null)}>
                    <Plus className="size-3.5 mr-1.5" />
                    New Folder
                  </Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Create New File/Folder Dialog */}
      {showNewFileDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-xl border border-border w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">
              {newFileType === "folder" ? "New Folder" : "New Document"}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <Input
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder={newFileType === "folder" ? "Folder name" : "Document title"}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleConfirmCreate()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <div className="flex gap-2">
                  <Button
                    variant={newFileType === "document" ? "default" : "outline"}
                    onClick={() => setNewFileType("document")}
                    className="flex-1"
                  >
                    <FileText className="size-4 mr-2" />
                    Document
                  </Button>
                  <Button
                    variant={newFileType === "folder" ? "default" : "outline"}
                    onClick={() => setNewFileType("folder")}
                    className="flex-1"
                  >
                    <Folder className="size-4 mr-2" />
                    Folder
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowNewFileDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmCreate}>Create</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}