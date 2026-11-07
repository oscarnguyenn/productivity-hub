"use client"

import { FilePlus, FileText, FolderPlus, Hash, Search, Star, Clock, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { FileNode } from "@/lib/types"
import { pathLabel, type DocumentEntry, type SearchResult } from "@/lib/notes/tree"
import { FileTree, type FileTreeActions } from "./file-tree"

function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query.trim().replace(/^#/, "").split(/\s+/).filter(Boolean)
  if (terms.length === 0) return <>{text}</>
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"))
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? <mark key={index} className="rounded-sm bg-amber-200/70 px-0.5 text-inherit">{part}</mark> : part
      )}
    </>
  )
}

function DocLink({ entry, selectedId, onOpen, icon }: { entry: DocumentEntry; selectedId: string | null; onOpen: (node: FileNode) => void; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(entry.node)}
      className={cn(
        "flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted/60",
        selectedId === entry.node.id && "bg-muted font-medium"
      )}
    >
      {icon ?? <FileText className="size-4 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1 truncate">{entry.node.name || "Untitled"}</span>
    </button>
  )
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {icon}
      {children}
    </h3>
  )
}

export function NotesSidebar({
  files,
  favourites,
  recents,
  tags,
  query,
  results,
  selectedId,
  actions,
  onQueryChange,
}: {
  files: FileNode[]
  favourites: DocumentEntry[]
  recents: DocumentEntry[]
  tags: { tag: string; count: number }[]
  query: string
  results: SearchResult[]
  selectedId: string | null
  actions: FileTreeActions
  onQueryChange: (query: string) => void
}) {
  const searching = query.trim().length > 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && onQueryChange("")}
            placeholder="Search notes or #tag"
            aria-label="Search notes"
            className="h-8 pl-8 pr-8"
          />
          {searching && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onQueryChange("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1" onClick={() => actions.onCreateFile(null)}>
            <FilePlus /> New document
          </Button>
          <Button size="sm" variant="outline" onClick={() => actions.onCreateFolder(null)} aria-label="New folder" title="New folder">
            <FolderPlus /> Folder
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-2">
        {searching ? (
          <section aria-live="polite">
            <SectionTitle icon={<Search className="size-3" />}>{results.length} result{results.length === 1 ? "" : "s"}</SectionTitle>
            {results.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">No notes match “{query.trim()}”.</p>}
            <ul className="space-y-0.5">
              {results.slice(0, 100).map(({ entry, preview }) => (
                <li key={entry.node.id}>
                  <button
                    type="button"
                    onClick={() => actions.onOpen(entry.node)}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left hover:bg-muted/60",
                      selectedId === entry.node.id && "bg-muted"
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate"><Highlight text={entry.node.name || "Untitled"} query={query} /></span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{pathLabel(entry)}</span>
                    {preview && (
                      <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        <Highlight text={preview} query={query} />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <>
            {favourites.length > 0 && (
              <section>
                <SectionTitle icon={<Star className="size-3" />}>Favourites</SectionTitle>
                {favourites.map((entry) => (
                  <DocLink key={entry.node.id} entry={entry} selectedId={selectedId} onOpen={actions.onOpen} icon={<Star className="size-4 shrink-0 fill-amber-400 text-amber-400" />} />
                ))}
              </section>
            )}
            {recents.length > 0 && (
              <section>
                <SectionTitle icon={<Clock className="size-3" />}>Recent</SectionTitle>
                {recents.map((entry) => (
                  <DocLink key={entry.node.id} entry={entry} selectedId={selectedId} onOpen={actions.onOpen} />
                ))}
              </section>
            )}
            <section>
              <SectionTitle icon={<FileText className="size-3" />}>Notes</SectionTitle>
              {files.length === 0 ? (
                <div className="px-3 py-8 text-center text-muted-foreground">
                  <FileText className="mx-auto mb-2 size-8 opacity-40" />
                  <p className="text-sm">No documents yet</p>
                  <p className="mt-1 text-xs">Create a document or folder to get started.</p>
                </div>
              ) : (
                <FileTree files={files} selectedId={selectedId} actions={actions} />
              )}
            </section>
            {tags.length > 0 && (
              <section>
                <SectionTitle icon={<Hash className="size-3" />}>Tags</SectionTitle>
                <div className="flex flex-wrap gap-1 px-2">
                  {tags.map(({ tag, count }) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => onQueryChange(`#${tag}`)}
                      className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      #{tag} <span className="opacity-60">{count}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
