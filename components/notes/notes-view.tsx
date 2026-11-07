"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Check,
  Download,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { loadUserData } from "@/lib/user-data"
import { cn } from "@/lib/utils"
import type { DashboardData, FileNode } from "@/lib/types"
import { extractOutline, markdownToContent, toMarkdown } from "@/lib/notes/content"
import {
  NOTES_STORAGE_KEY,
  allTags,
  buildLinkIndex,
  collectIds,
  createFileNode,
  duplicateNode,
  findNode,
  flattenDocuments,
  insertNode,
  isFileNode,
  moveNode,
  normaliseTag,
  relatedDocumentIds,
  removeNode,
  searchDocuments,
  updateNode,
  type DocumentEntry,
} from "@/lib/notes/tree"
import { DetailsPanel } from "./details-panel"
import { ConfirmDialog, DocumentPicker, MoveDialog, NameDialog } from "./notes-dialogs"
import { NotesSidebar } from "./notes-sidebar"
import { TiptapEditor } from "./tiptap-editor"
import { useNotesAutosave } from "./use-notes-autosave"
import type { FileTreeActions } from "./file-tree"

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

type NameRequest = { kind: "document" | "folder"; parentId: string | null }

function findFirstDocument(nodes: FileNode[]): FileNode | null {
  for (const node of nodes) {
    if (node.type === "document") return node
    const child = node.children ? findFirstDocument(node.children) : null
    if (child) return child
  }
  return null
}

function downloadText(filename: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const safeFilename = (name: string) => (name.trim() || "document").replace(/[\\/:*?"<>|]+/g, "-")

function SaveIndicator({ status, error, onRetry }: { status: ReturnType<typeof useNotesAutosave>["status"]; error: string | null; onRetry: () => void }) {
  if (status === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        title={`${error ?? "Could not save"} — click to retry`}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
      >
        <AlertTriangle className="size-3.5" /> Save failed · Retry
      </button>
    )
  }
  return (
    <span role="status" aria-live="polite" className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
      {status === "saving" ? (
        <><Loader2 className="size-3.5 animate-spin" /> Saving…</>
      ) : status === "dirty" ? (
        <><span className="size-1.5 rounded-full bg-amber-500" /> Unsaved changes</>
      ) : (
        <><Check className="size-3.5 text-emerald-600" /> Saved</>
      )}
    </span>
  )
}

export function NotesView({
  dashboardData: initialData = emptyDashboard,
  onUpdateDashboard,
}: {
  dashboardData?: DashboardData
  onUpdateDashboard?: (data: Partial<DashboardData>) => void
}) {
  const [files, setFiles] = useState<FileNode[]>(initialData.files || [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openIds, setOpenIds] = useState<string[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [query, setQuery] = useState("")
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [nameRequest, setNameRequest] = useState<NameRequest | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null)
  const [moveTarget, setMoveTarget] = useState<FileNode | null>(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [editorRevision, setEditorRevision] = useState(0)
  const importRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef(files)
  const selectedIdRef = useRef(selectedId)
  const openIdsRef = useRef(openIds)

  useEffect(() => {
    filesRef.current = files
    selectedIdRef.current = selectedId
    openIdsRef.current = openIds
  }, [files, selectedId, openIds])

  // Another browser tab saved notes: show its work (merged with ours) and remount the editor if the open document changed.
  const handleExternalChange = useCallback((next: FileNode[]) => {
    const activeId = selectedIdRef.current
    const before = activeId ? findNode(filesRef.current, activeId) : null
    const after = activeId ? findNode(next, activeId) : null
    const remaining = openIdsRef.current.filter((id) => findNode(next, id)?.type === "document")
    filesRef.current = next
    setFiles(next)
    setOpenIds(remaining)
    if (activeId && after?.type !== "document") setSelectedId(remaining[0] ?? null)
    else if (before?.content !== after?.content) setEditorRevision((revision) => revision + 1)
  }, [])

  const autosave = useNotesAutosave(files, ready && !loadError, handleExternalChange)

  useEffect(() => {
    if (ready && !loadError) onUpdateDashboard?.({ files })
  }, [files, loadError, onUpdateDashboard, ready])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSidebarOpen(window.matchMedia("(min-width: 1024px)").matches)
      setPanelOpen(window.matchMedia("(min-width: 1280px)").matches)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const parsed = await loadUserData<unknown>(NOTES_STORAGE_KEY)
        let loaded = initialData.files || []
        if (parsed !== null) {
          if (!Array.isArray(parsed) || !parsed.every(isFileNode)) {
            throw new Error("Saved notes data is not a valid file list.")
          }
          loaded = parsed
        }
        if (!active) return
        setFiles(loaded)
        filesRef.current = loaded
        const recent = flattenDocuments(loaded)
          .map(({ node }) => node)
          .sort((a, b) => (b.lastAccessedAt ?? b.updatedAt).localeCompare(a.lastAccessedAt ?? a.updatedAt))[0]
        const first = recent ?? findFirstDocument(loaded)
        if (first) {
          setSelectedId(first.id)
          setOpenIds([first.id])
        }
        setLoadError(null)
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "Could not load saved notes.")
      } finally {
        if (active) setReady(true)
      }
    })()
    return () => {
      active = false
    }
  }, [initialData.files, loadAttempt])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const docs = useMemo(() => flattenDocuments(files), [files])
  const docsById = useMemo(() => new Map(docs.map((entry) => [entry.node.id, entry])), [docs])
  const titles = useMemo(() => new Map(docs.map(({ node }) => [node.id, node.name])), [docs])
  const deferredQuery = useDeferredValue(query)
  const results = useMemo(() => searchDocuments(docs, deferredQuery, titles), [docs, deferredQuery, titles])
  const tags = useMemo(() => allTags(docs), [docs])
  const selected = selectedId ? findNode(files, selectedId) : null
  const selectedDoc = selected?.type === "document" ? selected : null

  const recents = useMemo(
    () =>
      docs
        .filter(({ node }) => node.lastAccessedAt)
        .sort((a, b) => (b.node.lastAccessedAt ?? "").localeCompare(a.node.lastAccessedAt ?? ""))
        .slice(0, 6),
    [docs]
  )
  const favourites = useMemo(() => docs.filter(({ node }) => node.isFavourite), [docs])
  const recentIds = useMemo(() => recents.map(({ node }) => node.id), [recents])

  const linkIndex = useMemo(() => (panelOpen ? buildLinkIndex(docs) : null), [docs, panelOpen])
  const toEntries = useCallback(
    (ids: string[]) => ids.map((id) => docsById.get(id)).filter((entry): entry is DocumentEntry => Boolean(entry)),
    [docsById]
  )

  const outline = useMemo(() => (panelOpen ? extractOutline(selectedDoc?.content) : []), [panelOpen, selectedDoc?.content])

  const openDocument = useCallback((node: FileNode) => {
    if (node.type !== "document") return
    setSelectedId(node.id)
    setOpenIds((current) => (current.includes(node.id) ? current : [...current, node.id]))
    setFiles((current) => updateNode(current, node.id, { lastAccessedAt: new Date().toISOString() }, false))
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) setSidebarOpen(false)
  }, [])

  const openById = useCallback(
    (id: string) => {
      const node = findNode(filesRef.current, id)
      if (node) openDocument(node)
      else setNotice("That document no longer exists.")
    },
    [openDocument]
  )

  const requestCreate = useCallback((kind: "document" | "folder", parentId: string | null) => {
    setNameRequest({ kind, parentId })
  }, [])

  const submitName = useCallback(
    (name: string) => {
      if (!nameRequest) return
      const node = createFileNode(name, nameRequest.kind, nameRequest.parentId)
      setFiles((current) => insertNode(current, nameRequest.parentId, node))
      setNameRequest(null)
      if (node.type === "document") {
        setSelectedId(node.id)
        setOpenIds((current) => [...current, node.id])
      }
    },
    [nameRequest]
  )

  const exportMarkdown = useCallback(
    (node: FileNode) => {
      const markdown = toMarkdown(node.name, node.content, (id) => titles.get(id))
      downloadText(`${safeFilename(node.name)}.md`, markdown, "text/markdown")
    },
    [titles]
  )

  const handleImport = useCallback(async (fileList: FileList | null) => {
    const imported: FileNode[] = []
    for (const file of Array.from(fileList ?? [])) {
      const { title, content } = markdownToContent(await file.text())
      const node = createFileNode(title || file.name.replace(/\.(md|markdown|txt)$/i, ""), "document", null)
      imported.push({ ...node, content })
    }
    if (importRef.current) importRef.current.value = ""
    if (imported.length === 0) return
    setFiles((current) => imported.reduce((acc, node) => insertNode(acc, null, node), current))
    setSelectedId(imported[0].id)
    setOpenIds((current) => [...current, ...imported.map((node) => node.id)])
    setNotice(`Imported ${imported.length} document${imported.length === 1 ? "" : "s"}.`)
  }, [])

  const closeTab = useCallback(
    (id: string) => {
      const index = openIds.indexOf(id)
      const next = openIds.filter((openId) => openId !== id)
      setOpenIds(next)
      if (selectedId === id) setSelectedId(next[Math.max(0, index - 1)] ?? null)
    },
    [openIds, selectedId]
  )

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return
    const removed = new Set(collectIds(deleteTarget))
    const remaining = openIds.filter((id) => !removed.has(id))
    setFiles((current) => removeNode(current, deleteTarget.id))
    setOpenIds(remaining)
    if (selectedId && removed.has(selectedId)) {
      // Fall back to a neighbouring open tab, like closing the tab would.
      const position = openIds.slice(0, openIds.indexOf(selectedId)).filter((id) => !removed.has(id)).length
      setSelectedId(remaining[Math.max(0, position - 1)] ?? null)
    }
    setDeleteTarget(null)
  }, [deleteTarget, openIds, selectedId])

  const actions = useMemo<FileTreeActions>(
    () => ({
      onOpen: openDocument,
      onToggleFolder: (node) =>
        setFiles((current) => updateNode(current, node.id, { isExpanded: !(node.isExpanded ?? true) }, false)),
      onCreateFile: (parentId) => requestCreate("document", parentId),
      onCreateFolder: (parentId) => requestCreate("folder", parentId),
      onRename: (node, name) => setFiles((current) => updateNode(current, node.id, { name })),
      onDuplicate: (node) => {
        const result = duplicateNode(filesRef.current, node.id)
        if (!result) return
        setFiles(result.nodes)
        if (result.copy.type === "document") openDocument(result.copy)
      },
      onToggleFavourite: (node) =>
        setFiles((current) => updateNode(current, node.id, { isFavourite: !node.isFavourite }, false)),
      onMove: setMoveTarget,
      onExport: exportMarkdown,
      onDelete: setDeleteTarget,
      onDrop: (dragId, targetParentId, beforeId) => {
        const moved = moveNode(filesRef.current, dragId, targetParentId, beforeId)
        if (moved) setFiles(moved)
        else setNotice("That item can't be moved there.")
      },
    }),
    [exportMarkdown, openDocument, requestCreate]
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && focusMode) setFocusMode(false)
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "o") {
        event.preventDefault()
        setSwitcherOpen(true)
      }
      if (event.altKey && event.ctrlKey && event.key.toLowerCase() === "n") {
        event.preventDefault()
        requestCreate("document", null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [focusMode, requestCreate])

  const jumpToHeading = useCallback((index: number) => {
    const headings = document.querySelectorAll<HTMLElement>(".note-editor-scroll .ProseMirror h1, .note-editor-scroll .ProseMirror h2, .note-editor-scroll .ProseMirror h3")
    headings[index]?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const updateTags = (tagsNext: string[]) => {
    if (selectedDoc) setFiles((current) => updateNode(current, selectedDoc.id, { tags: tagsNext }))
  }

  const showSidebar = sidebarOpen && !focusMode
  const showPanel = panelOpen && !focusMode && selectedDoc
  const currentEntry = selectedDoc ? docsById.get(selectedDoc.id) : undefined

  if (!ready) {
    return (
      <div className="flex h-[calc(100dvh-180px)] min-h-[480px] items-center justify-center rounded-xl border border-border bg-background text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading notes…
      </div>
    )
  }

  if (loadError) {
    return (
      <div role="alert" className="flex h-[calc(100dvh-180px)] min-h-[480px] flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-background p-6 text-center">
        <AlertTriangle className="size-8 text-destructive" />
        <div>
          <h2 className="font-semibold">Your notes could not be loaded</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{loadError} Editing is disabled so saved notes aren&apos;t overwritten.</p>
        </div>
        <Button onClick={() => { setReady(false); setLoadAttempt((n) => n + 1) }}>Try again</Button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative flex h-[calc(100dvh-180px)] min-h-[480px] flex-col overflow-hidden rounded-xl border border-border bg-background",
        focusMode && "fixed inset-0 z-[60] h-dvh w-screen max-w-none rounded-none border-0"
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {!focusMode && (
            <Button variant="ghost" size="icon-sm" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? "Hide file browser" : "Show file browser"} title={sidebarOpen ? "Hide file browser" : "Show file browser"} aria-pressed={sidebarOpen}>
              <PanelLeft className="size-4" />
            </Button>
          )}
          <h1 className="truncate text-base font-semibold">{focusMode ? selectedDoc?.name ?? "Notes" : "Notes"}</h1>
        </div>
        <div className="flex items-center gap-1">
          <SaveIndicator status={autosave.status} error={autosave.error} onRetry={() => void autosave.retry()} />
          {!focusMode && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setSwitcherOpen(true)} title="Quick switcher (Alt+O)" aria-label="Open quick switcher">
                <Search className="size-4" /> <span className="hidden md:inline">Quick find</span>
                <kbd className="hidden rounded border border-border px-1 text-[10px] text-muted-foreground md:inline">Alt+O</kbd>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => importRef.current?.click()} title="Import Markdown files">
                <Upload className="size-4" /> <span className="hidden md:inline">Import</span>
              </Button>
              <input
                ref={importRef}
                type="file"
                multiple
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                className="hidden"
                aria-label="Import Markdown files"
                onChange={(event) => void handleImport(event.target.files)}
              />
            </>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => setFocusMode((active) => !active)} aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"} title={focusMode ? "Exit focus mode (Esc)" : "Focus mode"}>
            {focusMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
          {!focusMode && (
            <Button variant="ghost" size="icon-sm" onClick={() => setPanelOpen((open) => !open)} aria-label={panelOpen ? "Hide details panel" : "Show details panel"} title={panelOpen ? "Hide details panel" : "Show details panel"} aria-pressed={panelOpen}>
              <PanelRight className="size-4" />
            </Button>
          )}
        </div>
      </header>

      {autosave.status === "error" && (
        <div role="alert" className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          Your latest changes haven&apos;t been saved: {autosave.error}. Retrying automatically — keep this page open or use Retry.
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-1.5 text-sm">
          {notice}
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}><X className="size-3.5" /></button>
        </div>
      )}

      <div className="relative flex min-h-0 min-w-0 flex-1">
        {showSidebar && (
          <aside className="z-20 flex w-72 shrink-0 flex-col border-r border-border bg-card max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-xl">
            <NotesSidebar
              files={files}
              favourites={favourites}
              recents={recents}
              tags={tags}
              query={query}
              results={results}
              selectedId={selectedId}
              actions={actions}
              onQueryChange={setQuery}
            />
          </aside>
        )}

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedDoc ? (
            <>
              {!focusMode && (
                <div role="tablist" aria-label="Open documents" className="flex min-h-9 items-end gap-1 overflow-x-auto border-b border-border bg-muted/30 px-2 pt-1">
                  {openIds.map((id) => {
                    const file = docsById.get(id)?.node
                    if (!file) return null
                    const active = selectedId === id
                    return (
                      <div key={id} role="presentation" className={cn("group flex max-w-52 shrink-0 items-center rounded-t-lg border border-b-0 px-2 text-sm", active ? "border-border bg-card" : "border-transparent text-muted-foreground hover:bg-muted")}>
                        <button type="button" role="tab" aria-selected={active} onClick={() => openDocument(file)} className="flex h-8 min-w-0 items-center gap-2">
                          <FileText className="size-3.5 shrink-0" />
                          <span className="truncate">{file.name || "Untitled"}</span>
                        </button>
                        <button type="button" aria-label={`Close ${file.name}`} onClick={() => closeTab(id)} className="ml-1 rounded p-1 opacity-60 hover:bg-muted hover:opacity-100">
                          <X className="size-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              {!focusMode && (
                <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] text-muted-foreground">{currentEntry ? ["Notes", ...currentEntry.path].join(" / ") : "Notes"}</p>
                    <input
                      type="text"
                      aria-label="Document title"
                      value={selectedDoc.name}
                      onChange={(event) => actions.onRename(selectedDoc, event.target.value)}
                      onBlur={(event) => !event.target.value.trim() && actions.onRename(selectedDoc, "Untitled document")}
                      placeholder="Untitled document"
                      className="w-full border-none bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground/60"
                    />
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => actions.onToggleFavourite(selectedDoc)} aria-pressed={Boolean(selectedDoc.isFavourite)} aria-label={selectedDoc.isFavourite ? "Remove from favourites" : "Add to favourites"} title={selectedDoc.isFavourite ? "Remove from favourites" : "Add to favourites"}>
                    <Star className={cn("size-4", selectedDoc.isFavourite && "fill-amber-400 text-amber-400")} />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => exportMarkdown(selectedDoc)} aria-label="Export as Markdown" title="Export as Markdown">
                    <Download className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(selectedDoc)} aria-label="Delete document" title="Delete document">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
              <TiptapEditor
                key={`${selectedDoc.id}:${editorRevision}`}
                content={selectedDoc.content || ""}
                onChange={(content) => setFiles((current) => updateNode(current, selectedDoc.id, { content }))}
                onSave={() => void autosave.retry()}
                placeholder="Start writing, or type / for formatting…"
                onNewDocument={() => requestCreate("document", null)}
                title={selectedDoc.name}
                focusMode={focusMode}
                onToggleFocus={() => setFocusMode((active) => !active)}
                documents={docs}
                recentIds={recentIds}
                currentDocumentId={selectedDoc.id}
                onNavigateToDocument={openById}
                onExportMarkdown={() => exportMarkdown(selectedDoc)}
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-muted-foreground">
              <div className="text-center">
                <FileText className="mx-auto mb-4 size-16 opacity-20" />
                <h2 className="mb-1 text-lg font-medium text-foreground">{docs.length ? "No document open" : "Create your first note"}</h2>
                <p className="mb-5 text-sm">{docs.length ? "Pick a document from the sidebar or press Alt+O to jump to one." : "Documents support rich text, tables, maths, images and links between notes."}</p>
                <div className="flex justify-center gap-2">
                  <Button onClick={() => requestCreate("document", null)}><Plus /> New document</Button>
                  <Button variant="outline" onClick={() => requestCreate("folder", null)}>New folder</Button>
                </div>
              </div>
            </div>
          )}
        </main>

        {showPanel && selectedDoc && (
          <aside className="z-20 w-72 shrink-0 border-l border-border bg-card max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:shadow-xl">
            <DetailsPanel
              doc={selectedDoc}
              folderPath={currentEntry ? ["Notes", ...currentEntry.path].join(" / ") : "Notes"}
              outline={outline}
              backlinks={toEntries(linkIndex?.backlinks.get(selectedDoc.id) ?? [])}
              outgoing={toEntries(linkIndex?.outgoing.get(selectedDoc.id) ?? [])}
              related={toEntries(linkIndex ? relatedDocumentIds(selectedDoc, docs, linkIndex) : [])}
              tagSuggestions={tags.map((item) => item.tag)}
              onOpen={openDocument}
              onJumpToHeading={jumpToHeading}
              onAddTag={(tag) => {
                const normalised = normaliseTag(tag)
                if (normalised && !(selectedDoc.tags ?? []).includes(normalised)) updateTags([...(selectedDoc.tags ?? []), normalised])
              }}
              onRemoveTag={(tag) => updateTags((selectedDoc.tags ?? []).filter((item) => item !== tag))}
            />
          </aside>
        )}
      </div>

      <NameDialog
        open={nameRequest !== null}
        title={nameRequest?.kind === "folder" ? "New folder" : "New document"}
        initialValue={nameRequest?.kind === "folder" ? "New folder" : "Untitled document"}
        confirmLabel="Create"
        onSubmit={submitName}
        onClose={() => setNameRequest(null)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.type === "folder" ? "folder" : "document"}?`}
        description={
          deleteTarget?.type === "folder"
            ? `“${deleteTarget.name}” and the ${flattenDocuments(deleteTarget.children ?? []).length} document(s) inside it will be permanently deleted.`
            : `“${deleteTarget?.name ?? ""}” will be permanently deleted. This cannot be undone.`
        }
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
      <MoveDialog
        open={moveTarget !== null}
        node={moveTarget}
        tree={files}
        onMove={(folderId) => {
          if (moveTarget) {
            const moved = moveNode(files, moveTarget.id, folderId)
            if (moved) setFiles(moved)
          }
          setMoveTarget(null)
        }}
        onClose={() => setMoveTarget(null)}
      />
      <DocumentPicker
        open={switcherOpen}
        title="Quick switcher"
        docs={docs}
        recentIds={recentIds}
        onSelect={(node) => {
          setSwitcherOpen(false)
          openDocument(node)
        }}
        onClose={() => setSwitcherOpen(false)}
      />
    </div>
  )
}
