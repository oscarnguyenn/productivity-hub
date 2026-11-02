"use client"

import { useState, useCallback, useMemo } from "react"
import {
  Plus,
  Search,
  Folder,
  FileText,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Settings,
  Info,
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

function findParent(nodes: FileNode[], id: string, parent: FileNode | null = null): FileNode | null {
  for (const node of nodes) {
    if (node.id === id) return parent
    if (node.children) {
      const found = findParent(node.children, id, node)
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

function moveNode(nodes: FileNode[], nodeId: string, newParentId: string | null): FileNode[] {
  // First, remove the node from its current location
  let nodeToMove: FileNode | null = null
  const withoutNode = removeNode(nodes, nodeId)

  // Find the node to move
  const findNodeToMove = (n: FileNode[]): FileNode | null => {
    for (const node of n) {
      if (node.id === nodeId) return node
      if (node.children) {
        const found = findNodeToMove(node.children)
        if (found) return found
      }
    }
    return null
  }
  nodeToMove = findNodeToMove(nodes)

  if (!nodeToMove) return nodes

  // Add to new parent
  return addNodeToParent(withoutNode, newParentId, { ...nodeToMove, parentId: newParentId })
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
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showNewFileDialog, setShowNewFileDialog] = useState(false)
  const [newFileName, setNewFileName] = useState("")
  const [newFileType, setNewFileType] = useState<"folder" | "document">("document")
  const [newFileParentId, setNewFileParentId] = useState<string | null>(null)

  const selectedFile = useMemo(() => findNode(files, selectedFileId || ""), [files, selectedFileId])

  const handleSelectFile = useCallback((file: FileNode) => {
    if (file.type === "document") {
      setSelectedFileId(file.id)
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
    }
    setShowNewFileDialog(false)
    setNewFileName("")
  }, [newFileName, newFileType, newFileParentId])

  const handleRenameFile = useCallback((file: FileNode) => {
    setFiles((current) => updateNode(current, file.id, { name: file.name }))
  }, [])

  const handleDeleteFile = useCallback((file: FileNode) => {
    if (!confirm(`Delete "${file.name}"?`)) return
    setFiles((current) => removeNode(current, file.id))
    if (selectedFileId === file.id) {
      setSelectedFileId(null)
    }
  }, [selectedFileId])

  const handleContentChange = useCallback((content: string) => {
    if (!selectedFile) return
    setFiles((current) => updateNode(current, selectedFile.id, { content }))
  }, [selectedFile])

  const handleSaveDashboard = useCallback(() => {
    onUpdateDashboard?.({ files })
  }, [files, onUpdateDashboard])

  // Auto-save on file changes
  // In a real app, you'd debounce this and save to localStorage or a backend

  return (
    <div className="flex h-[calc(100vh-200px)] flex-col bg-background">
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
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => handleCreateFile(null)}>
            <Plus className="size-3.5 mr-1.5" />
            New Document
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleSaveDashboard} title="Save">
            <Settings className="size-4" />
          </Button>
        </div>
      </div>

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
            files={files}
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
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Last edited: {new Date(selectedFile.updatedAt).toLocaleString()}
                  </span>
                  <Button variant="ghost" size="icon-sm" title="Document info">
                    <Info className="size-4" />
                  </Button>
                </div>
              </div>

              {/* Editor */}
              <div className="flex-1 flex p-4 overflow-hidden">
                <TiptapEditor
                  content={selectedFile.content || ""}
                  onChange={handleContentChange}
                  placeholder="Start writing your document..."
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