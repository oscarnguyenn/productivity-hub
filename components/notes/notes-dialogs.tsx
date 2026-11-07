"use client"

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { FileText, Folder, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { FileNode } from "@/lib/types"
import { flattenFolders, isSameOrDescendant, pathLabel, type DocumentEntry } from "@/lib/notes/tree"

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  className,
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50",
        className
      )}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      {open && (
        <div className="space-y-4 p-5">
          <div>
            <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

export function NameDialog({
  open,
  title,
  initialValue,
  confirmLabel,
  onSubmit,
  onClose,
}: {
  open: boolean
  title: string
  initialValue: string
  confirmLabel: string
  onSubmit: (name: string) => void
  onClose: () => void
}) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <NameForm key={`${title}-${initialValue}`} initialValue={initialValue} confirmLabel={confirmLabel} onSubmit={onSubmit} onClose={onClose} />
    </Modal>
  )
}

function NameForm({
  initialValue,
  confirmLabel,
  onSubmit,
  onClose,
}: {
  initialValue: string
  confirmLabel: string
  onSubmit: (name: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (value.trim()) onSubmit(value.trim())
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Input
        autoFocus
        aria-label="Name"
        value={value}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!value.trim()}>{confirmLabel}</Button>
      </div>
    </form>
  )
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal open={open} title={title} description={description} onClose={onClose}>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" variant="destructive" autoFocus onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}

export function MoveDialog({
  open,
  node,
  tree,
  onMove,
  onClose,
}: {
  open: boolean
  node: FileNode | null
  tree: FileNode[]
  onMove: (targetFolderId: string | null) => void
  onClose: () => void
}) {
  const folders = useMemo(() => flattenFolders(tree), [tree])
  return (
    <Modal open={open && node !== null} title={`Move “${node?.name ?? ""}”`} description="Choose a destination folder." onClose={onClose}>
      <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1">
        <button
          type="button"
          disabled={node?.parentId === null}
          onClick={() => onMove(null)}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-40"
        >
          <Folder className="size-4 text-muted-foreground" /> Notes (top level)
        </button>
        {folders.map(({ node: folder, depth }) => {
          const invalid = !node || isSameOrDescendant(tree, node.id, folder.id) || node.parentId === folder.id
          return (
            <button
              key={folder.id}
              type="button"
              disabled={invalid}
              onClick={() => onMove(folder.id)}
              style={{ paddingLeft: 8 + depth * 16 }}
              className="flex w-full items-center gap-2 rounded py-1.5 pr-2 text-left text-sm hover:bg-muted disabled:opacity-40"
            >
              <Folder className="size-4 text-muted-foreground" />
              <span className="truncate">{folder.name}</span>
            </button>
          )
        })}
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  )
}

export function DocumentPicker({
  open,
  title,
  docs,
  recentIds,
  excludeId,
  onSelect,
  onClose,
}: {
  open: boolean
  title: string
  docs: DocumentEntry[]
  recentIds: string[]
  excludeId?: string | null
  onSelect: (doc: FileNode) => void
  onClose: () => void
}) {
  return (
    <Modal open={open} title={title} onClose={onClose} className="max-w-lg">
      <PickerBody docs={docs} recentIds={recentIds} excludeId={excludeId} onSelect={onSelect} onClose={onClose} />
    </Modal>
  )
}

function PickerBody({
  docs,
  recentIds,
  excludeId,
  onSelect,
  onClose,
}: {
  docs: DocumentEntry[]
  recentIds: string[]
  excludeId?: string | null
  onSelect: (doc: FileNode) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)

  const results = useMemo(() => {
    const candidates = docs.filter((doc) => doc.node.id !== excludeId)
    const term = query.trim().toLocaleLowerCase()
    if (!term) {
      const order = new Map(recentIds.map((id, index) => [id, index]))
      return [...candidates]
        .sort((a, b) => (order.get(a.node.id) ?? 1e9) - (order.get(b.node.id) ?? 1e9) || a.node.name.localeCompare(b.node.name))
        .slice(0, 50)
    }
    return candidates
      .filter((doc) => `${doc.node.name} ${doc.path.join(" ")} ${(doc.node.tags ?? []).join(" ")}`.toLocaleLowerCase().includes(term))
      .sort((a, b) => Number(b.node.name.toLocaleLowerCase().startsWith(term)) - Number(a.node.name.toLocaleLowerCase().startsWith(term)))
      .slice(0, 50)
  }, [docs, excludeId, query, recentIds])

  const current = Math.min(active, Math.max(results.length - 1, 0))

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="document-picker-list"
          aria-label="Search documents"
          placeholder="Search documents…"
          className="pl-9"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault()
              setActive(Math.min(current + 1, results.length - 1))
            } else if (event.key === "ArrowUp") {
              event.preventDefault()
              setActive(Math.max(current - 1, 0))
            } else if (event.key === "Enter" && results[current]) {
              event.preventDefault()
              onSelect(results[current].node)
            }
          }}
        />
      </div>
      <ul id="document-picker-list" role="listbox" className="max-h-72 space-y-0.5 overflow-y-auto">
        {results.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted-foreground">No matching documents</li>}
        {results.map((doc, index) => (
          <li key={doc.node.id} role="option" aria-selected={index === current}>
            <button
              type="button"
              onClick={() => onSelect(doc.node)}
              onMouseEnter={() => setActive(index)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                index === current ? "bg-muted" : "hover:bg-muted/60"
              )}
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{doc.node.name}</span>
              <span className="max-w-[40%] truncate text-xs text-muted-foreground">{pathLabel(doc)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  )
}
