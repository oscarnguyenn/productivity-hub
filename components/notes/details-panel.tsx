"use client"

import { useState, type ReactNode } from "react"
import { FileText, Link2, ListTree, Tags, X, Info, Share2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { FileNode } from "@/lib/types"
import { pathLabel, type DocumentEntry } from "@/lib/notes/tree"
import type { OutlineItem } from "@/lib/notes/content"

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="border-b border-border px-3 py-3 last:border-0">
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

function DocList({ entries, empty, onOpen }: { entries: DocumentEntry[]; empty: string; onOpen: (node: FileNode) => void }) {
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>
  return (
    <ul className="space-y-0.5">
      {entries.map((entry) => (
        <li key={entry.node.id}>
          <button type="button" onClick={() => onOpen(entry.node)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-muted">
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{entry.node.name || "Untitled"}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{pathLabel(entry)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function DetailsPanel({
  doc,
  folderPath,
  outline,
  backlinks,
  outgoing,
  related,
  tagSuggestions,
  onOpen,
  onJumpToHeading,
  onAddTag,
  onRemoveTag,
}: {
  doc: FileNode
  folderPath: string
  outline: OutlineItem[]
  backlinks: DocumentEntry[]
  outgoing: DocumentEntry[]
  related: DocumentEntry[]
  tagSuggestions: string[]
  onOpen: (node: FileNode) => void
  onJumpToHeading: (index: number) => void
  onAddTag: (tag: string) => void
  onRemoveTag: (tag: string) => void
}) {
  const [tagInput, setTagInput] = useState("")
  const submitTag = () => {
    if (!tagInput.trim()) return
    onAddTag(tagInput)
    setTagInput("")
  }
  const minLevel = outline.length ? Math.min(...outline.map((item) => item.level)) : 1

  return (
    <div className="h-full overflow-y-auto">
      <Section icon={<Tags className="size-3" />} title="Tags">
        <div className="mb-2 flex flex-wrap gap-1">
          {(doc.tags ?? []).length === 0 && <p className="text-xs text-muted-foreground">No tags yet.</p>}
          {(doc.tags ?? []).map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs">
              #{tag}
              <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => onRemoveTag(tag)} className="rounded-full hover:text-destructive">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <Input
          value={tagInput}
          list="notes-tag-suggestions"
          onChange={(event) => setTagInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault()
              submitTag()
            }
          }}
          placeholder="Add tag and press Enter"
          aria-label="Add tag"
          className="h-8 text-sm"
        />
        <datalist id="notes-tag-suggestions">
          {tagSuggestions.filter((tag) => !(doc.tags ?? []).includes(tag)).map((tag) => <option key={tag} value={tag} />)}
        </datalist>
      </Section>

      <Section icon={<ListTree className="size-3" />} title="Outline">
        {outline.length === 0 ? (
          <p className="text-xs text-muted-foreground">Add headings to build an outline.</p>
        ) : (
          <ul className="space-y-0.5">
            {outline.map((item) => (
              <li key={item.index}>
                <button
                  type="button"
                  onClick={() => onJumpToHeading(item.index)}
                  style={{ paddingLeft: 6 + (item.level - minLevel) * 12 }}
                  className={cn("w-full truncate rounded py-1 pr-1 text-left text-sm hover:bg-muted", item.level === minLevel ? "font-medium" : "text-muted-foreground")}
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={<Link2 className="size-3" />} title={`Backlinks (${backlinks.length})`}>
        <DocList entries={backlinks} empty="No documents link here yet. Use Insert → Link to document." onOpen={onOpen} />
      </Section>

      <Section icon={<Share2 className="size-3" />} title={`Links from this note (${outgoing.length})`}>
        <DocList entries={outgoing} empty="This note doesn't link to other documents." onOpen={onOpen} />
      </Section>

      <Section icon={<FileText className="size-3" />} title="Related">
        <DocList entries={related} empty="Related documents share links or tags with this one." onOpen={onOpen} />
      </Section>

      <Section icon={<Info className="size-3" />} title="Properties">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Folder</dt>
          <dd className="truncate">{folderPath}</dd>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{new Date(doc.createdAt).toLocaleString()}</dd>
          <dt className="text-muted-foreground">Modified</dt>
          <dd>{new Date(doc.updatedAt).toLocaleString()}</dd>
          <dt className="text-muted-foreground">Last opened</dt>
          <dd>{doc.lastAccessedAt ? new Date(doc.lastAccessedAt).toLocaleString() : "—"}</dd>
        </dl>
      </Section>
    </div>
  )
}
