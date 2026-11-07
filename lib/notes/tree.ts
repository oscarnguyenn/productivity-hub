import type { FileNode } from "@/lib/types"
import { NOTE_LINK_PREFIX, emptyDocContent, extractLinks, extractText } from "./content"

export const NOTES_STORAGE_KEY = "productivity-hub-notes-files-v1"

export function generateId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export function createFileNode(name: string, type: "folder" | "document", parentId: string | null): FileNode {
  const now = new Date().toISOString()
  return {
    id: generateId(),
    name,
    type,
    parentId,
    children: type === "folder" ? [] : undefined,
    content: type === "document" ? emptyDocContent : undefined,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: type === "document" ? now : undefined,
    isExpanded: true,
  }
}

export function isFileNode(value: unknown): value is FileNode {
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
    (node.tags === undefined || (Array.isArray(node.tags) && node.tags.every((tag) => typeof tag === "string"))) &&
    (node.children === undefined || (Array.isArray(node.children) && node.children.every(isFileNode)))
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

export function findNode(nodes: FileNode[], id: string | null): FileNode | null {
  if (!id) return null
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

// Names of the folders containing a node, outermost first.
export function folderPath(nodes: FileNode[], id: string): string[] {
  const walk = (list: FileNode[], trail: string[]): string[] | null => {
    for (const node of list) {
      if (node.id === id) return trail
      if (node.children) {
        const found = walk(node.children, [...trail, node.name])
        if (found) return found
      }
    }
    return null
  }
  return walk(nodes, []) ?? []
}

export function updateNode(
  nodes: FileNode[],
  id: string,
  updates: Partial<FileNode>,
  touch = true
): FileNode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return { ...node, ...updates, ...(touch ? { updatedAt: new Date().toISOString() } : {}) }
    }
    if (node.children) return { ...node, children: updateNode(node.children, id, updates, touch) }
    return node
  })
}

export function removeNode(nodes: FileNode[], id: string): FileNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => (node.children ? { ...node, children: removeNode(node.children, id) } : node))
}

export function insertNode(
  nodes: FileNode[],
  parentId: string | null,
  newNode: FileNode,
  beforeId: string | null = null
): FileNode[] {
  const placed = { ...newNode, parentId }
  const place = (list: FileNode[]) => {
    const index = beforeId ? list.findIndex((node) => node.id === beforeId) : -1
    if (index < 0) return [...list, placed]
    return [...list.slice(0, index), placed, ...list.slice(index)]
  }
  if (parentId === null) return place(nodes)
  return nodes.map((node) => {
    if (node.id === parentId && node.type === "folder") {
      return { ...node, isExpanded: true, children: place(node.children ?? []) }
    }
    return node.children ? { ...node, children: insertNode(node.children, parentId, newNode, beforeId) } : node
  })
}

export function collectIds(node: FileNode): string[] {
  return [node.id, ...(node.children?.flatMap(collectIds) ?? [])]
}

export function isSameOrDescendant(nodes: FileNode[], ancestorId: string, id: string): boolean {
  const ancestor = findNode(nodes, ancestorId)
  return ancestor ? collectIds(ancestor).includes(id) : false
}

// Moves a node into a folder (or the root), optionally before a sibling. Returns null when the move is invalid.
export function moveNode(
  nodes: FileNode[],
  id: string,
  targetParentId: string | null,
  beforeId: string | null = null
): FileNode[] | null {
  const node = findNode(nodes, id)
  if (!node || id === beforeId) return null
  if (targetParentId !== null) {
    const target = findNode(nodes, targetParentId)
    if (!target || target.type !== "folder" || isSameOrDescendant(nodes, id, targetParentId)) return null
  }
  const moved = { ...node, updatedAt: new Date().toISOString() }
  return insertNode(removeNode(nodes, id), targetParentId, moved, beforeId)
}

function cloneWithNewIds(node: FileNode, parentId: string | null): FileNode {
  const id = generateId()
  return {
    ...node,
    id,
    parentId,
    children: node.children?.map((child) => cloneWithNewIds(child, id)),
  }
}

export function duplicateNode(nodes: FileNode[], id: string): { nodes: FileNode[]; copy: FileNode } | null {
  const node = findNode(nodes, id)
  if (!node) return null
  const now = new Date().toISOString()
  const copy = {
    ...cloneWithNewIds(node, node.parentId),
    name: `${node.name} copy`,
    createdAt: now,
    updatedAt: now,
    isFavourite: false,
  }
  const insertAfter = (list: FileNode[]): FileNode[] => {
    const index = list.findIndex((item) => item.id === id)
    if (index < 0) return list.map((item) => (item.children ? { ...item, children: insertAfter(item.children) } : item))
    return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)]
  }
  return { nodes: insertAfter(nodes), copy }
}

export interface DocumentEntry {
  node: FileNode
  path: string[]
}

export function flattenDocuments(nodes: FileNode[], path: string[] = []): DocumentEntry[] {
  return nodes.flatMap((node) =>
    node.type === "document"
      ? [{ node, path }]
      : flattenDocuments(node.children ?? [], [...path, node.name])
  )
}

export function flattenFolders(nodes: FileNode[], depth = 0): { node: FileNode; depth: number }[] {
  return nodes.flatMap((node) =>
    node.type === "folder" ? [{ node, depth }, ...flattenFolders(node.children ?? [], depth + 1)] : []
  )
}

export function pathLabel(entry: DocumentEntry): string {
  return entry.path.length ? entry.path.join(" / ") : "Notes"
}

export function allTags(docs: DocumentEntry[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const { node } of docs) for (const tag of node.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag))
}

export function normaliseTag(value: string): string {
  return value.trim().replace(/^#+/, "").replace(/\s+/g, "-").toLocaleLowerCase()
}

export interface LinkIndex {
  outgoing: Map<string, string[]>
  backlinks: Map<string, string[]>
}

export function buildLinkIndex(docs: DocumentEntry[]): LinkIndex {
  const ids = new Set(docs.map((doc) => doc.node.id))
  const outgoing = new Map<string, string[]>()
  const backlinks = new Map<string, string[]>()
  for (const { node } of docs) {
    const targets = extractLinks(node.content, node.id).filter((target) => ids.has(target) && target !== node.id)
    outgoing.set(node.id, targets)
    for (const target of targets) backlinks.set(target, [...(backlinks.get(target) ?? []), node.id])
  }
  return { outgoing, backlinks }
}

export function relatedDocumentIds(doc: FileNode, docs: DocumentEntry[], index: LinkIndex): string[] {
  const linked = new Set([...(index.outgoing.get(doc.id) ?? []), ...(index.backlinks.get(doc.id) ?? [])])
  const tags = new Set(doc.tags ?? [])
  const related = new Set(linked)
  if (tags.size) {
    for (const { node } of docs) {
      if (node.id !== doc.id && node.tags?.some((tag) => tags.has(tag))) related.add(node.id)
    }
  }
  return [...related]
}

export interface SearchResult {
  entry: DocumentEntry
  preview: string
  score: number
}

function buildPreview(text: string, terms: string[]): string {
  const lower = text.toLocaleLowerCase()
  const first = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0]
  if (first === undefined) return text.slice(0, 120).replace(/\s+/g, " ")
  const start = Math.max(0, first - 40)
  const snippet = text.slice(start, first + 100).replace(/\s+/g, " ")
  return `${start > 0 ? "…" : ""}${snippet}${first + 100 < text.length ? "…" : ""}`
}

// "#tag" queries filter by tag; everything else matches title, folders, tags, linked document titles and body text.
export function searchDocuments(docs: DocumentEntry[], query: string, titles: Map<string, string>): SearchResult[] {
  const trimmed = query.trim().toLocaleLowerCase()
  if (!trimmed) return []
  const tagQuery = trimmed.startsWith("#") ? normaliseTag(trimmed) : null
  const terms = trimmed.split(/\s+/).filter(Boolean)
  const results: SearchResult[] = []
  for (const entry of docs) {
    const { node } = entry
    if (tagQuery !== null) {
      if (node.tags?.some((tag) => tag.includes(tagQuery))) {
        results.push({ entry, preview: extractText(node.id, node.content).slice(0, 120), score: 1 })
      }
      continue
    }
    const title = node.name.toLocaleLowerCase()
    const folders = entry.path.join(" ").toLocaleLowerCase()
    const tags = (node.tags ?? []).join(" ").toLocaleLowerCase()
    const body = extractText(node.id, node.content)
    const bodyLower = body.toLocaleLowerCase()
    const links = extractLinks(node.content, node.id)
      .map((id) => titles.get(id)?.toLocaleLowerCase() ?? "")
      .join(" ")
    let score = 0
    let all = true
    for (const term of terms) {
      let termScore = 0
      if (title.includes(term)) termScore += title.startsWith(term) ? 10 : 6
      if (tags.includes(term)) termScore += 4
      if (folders.includes(term)) termScore += 2
      if (links.includes(term)) termScore += 2
      if (bodyLower.includes(term)) termScore += 1
      if (termScore === 0) {
        all = false
        break
      }
      score += termScore
    }
    if (all) results.push({ entry, preview: buildPreview(body, terms), score })
  }
  return results.sort((a, b) => b.score - a.score || a.entry.node.name.localeCompare(b.entry.node.name))
}

export function noteHref(id: string): string {
  return `${NOTE_LINK_PREFIX}${id}`
}

function flattenAll(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((node) => [node, ...flattenAll(node.children ?? [])])
}

function nodeFields(node: FileNode) {
  const { children, parentId, ...fields } = node
  void children
  void parentId
  return fields
}

/**
 * Re-applies this tab's unsaved edits (the difference between `base` and `local`) onto the tree another tab
 * just saved (`remote`), so a stale tab never overwrites newer work. When both tabs edited the same node the
 * most recently updated copy wins; a node deleted remotely stays deleted.
 */
export function mergeNotesTrees(base: FileNode[], local: FileNode[], remote: FileNode[]): FileNode[] {
  const baseById = new Map(flattenAll(base).map((node) => [node.id, node]))
  const localNodes = flattenAll(local)
  const localIds = new Set(localNodes.map((node) => node.id))
  let result = remote

  for (const id of baseById.keys()) {
    if (!localIds.has(id) && findNode(result, id)) result = removeNode(result, id)
  }

  for (const node of localNodes) {
    const before = baseById.get(node.id)
    const current = findNode(result, node.id)
    if (!before) {
      if (current) continue
      const parent = node.parentId && findNode(result, node.parentId)?.type === "folder" ? node.parentId : null
      result = insertNode(result, parent, { ...node, children: node.type === "folder" ? [] : undefined })
      continue
    }
    if (!current) continue
    const edited = JSON.stringify(nodeFields(before)) !== JSON.stringify(nodeFields(node))
    if (edited && current.updatedAt <= node.updatedAt) {
      result = updateNode(result, node.id, nodeFields(node), false)
    }
    if (before.parentId !== node.parentId) {
      const parent = node.parentId && findNode(result, node.parentId)?.type === "folder" ? node.parentId : null
      result = moveNode(result, node.id, parent) ?? result
    }
  }
  return result
}
