import { describe, expect, it } from "vitest"
import type { FileNode } from "@/lib/types"
import {
  collectIds,
  createFileNode,
  duplicateNode,
  findNode,
  flattenDocuments,
  insertNode,
  isFileNode,
  mergeNotesTrees,
  moveNode,
  removeNode,
  searchDocuments,
  updateNode,
} from "@/lib/notes/tree"

const doc = (id: string, name: string, text: string, parentId: string | null = null, updatedAt = "2026-01-01T00:00:00.000Z"): FileNode => ({
  id,
  name,
  type: "document",
  parentId,
  content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt,
})

const folder = (id: string, name: string, children: FileNode[] = [], parentId: string | null = null): FileNode => ({
  id,
  name,
  type: "folder",
  parentId,
  children,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
})

const textOf = (node: FileNode | null) => (node?.content ? JSON.parse(node.content).content[0].content?.[0]?.text : undefined)

describe("tree helpers", () => {
  const tree = [folder("f1", "Folder", [doc("d1", "One", "alpha", "f1")]), doc("d2", "Two", "beta")]

  it("generates unique ids for new nodes", () => {
    const ids = new Set(Array.from({ length: 200 }, () => createFileNode("x", "document", null).id))
    expect(ids.size).toBe(200)
  })

  it("finds, updates and removes nodes without touching others", () => {
    expect(findNode(tree, "d1")?.name).toBe("One")
    const renamed = updateNode(tree, "d1", { name: "Uno" })
    expect(findNode(renamed, "d1")?.name).toBe("Uno")
    expect(findNode(renamed, "d2")).toBe(tree[1])
    const removed = removeNode(tree, "d1")
    expect(findNode(removed, "d1")).toBeNull()
    expect(findNode(removed, "d2")?.name).toBe("Two")
    expect(findNode(tree, "d1")).not.toBeNull()
  })

  it("inserts into a folder and updates the parent id", () => {
    const next = insertNode(tree, "f1", doc("d3", "Three", "gamma"))
    expect(findNode(next, "d3")?.parentId).toBe("f1")
    expect(findNode(next, "f1")?.children?.map((child) => child.id)).toEqual(["d1", "d3"])
  })

  it("moves nodes, but never a folder into itself or its descendants", () => {
    const moved = moveNode(tree, "d2", "f1")
    expect(findNode(moved ?? [], "d2")?.parentId).toBe("f1")
    expect(moveNode(tree, "f1", "f1")).toBeNull()
    const nested = [folder("a", "A", [folder("b", "B", [], "a")])]
    expect(moveNode(nested, "a", "b")).toBeNull()
  })

  it("duplicates with fresh ids", () => {
    const result = duplicateNode(tree, "f1")
    expect(result).not.toBeNull()
    const original = collectIds(tree[0])
    const copy = collectIds(result!.copy)
    expect(copy.some((id) => original.includes(id))).toBe(false)
    expect(copy).toHaveLength(original.length)
  })

  it("lists every document with its folder path", () => {
    expect(flattenDocuments(tree).map((entry) => [entry.node.id, entry.path])).toEqual([
      ["d1", ["Folder"]],
      ["d2", []],
    ])
  })

  it("validates stored data", () => {
    expect(isFileNode(tree[0])).toBe(true)
    expect(isFileNode({ ...tree[1], content: "not json" })).toBe(false)
    expect(isFileNode({ ...tree[1], id: 4 })).toBe(false)
    expect(isFileNode(null)).toBe(false)
  })

  it("searches by partial title and by body text", () => {
    const docs = flattenDocuments(tree)
    const titles = new Map(docs.map(({ node }) => [node.id, node.name]))
    expect(searchDocuments(docs, "tw", titles).map((result) => result.entry.node.id)).toEqual(["d2"])
    expect(searchDocuments(docs, "alph", titles).map((result) => result.entry.node.id)).toEqual(["d1"])
    expect(searchDocuments(docs, "nothing-here", titles)).toEqual([])
  })
})

describe("mergeNotesTrees (cross-tab saves)", () => {
  const base = [doc("a", "Doc A", "a0"), doc("b", "Doc B", "b0")]

  it("keeps edits made in another tab when this tab edited a different document", () => {
    const local = updateNode(base, "b", { content: doc("b", "", "b-local").content })
    const remote = updateNode(base, "a", { content: doc("a", "", "a-remote").content })
    const merged = mergeNotesTrees(base, local, remote)
    expect(textOf(findNode(merged, "a"))).toBe("a-remote")
    expect(textOf(findNode(merged, "b"))).toBe("b-local")
  })

  it("lets the newest edit win when both tabs edited the same document", () => {
    const local = [{ ...base[0], content: doc("a", "", "a-local").content, updatedAt: "2026-01-02T00:00:00.000Z" }, base[1]]
    const remote = [{ ...base[0], content: doc("a", "", "a-remote").content, updatedAt: "2026-01-03T00:00:00.000Z" }, base[1]]
    expect(textOf(findNode(mergeNotesTrees(base, local, remote), "a"))).toBe("a-remote")
    expect(textOf(findNode(mergeNotesTrees(base, remote, local), "a"))).toBe("a-remote")
  })

  it("keeps documents created in either tab", () => {
    const local = insertNode(base, null, doc("c", "Local new", "c"))
    const remote = insertNode(base, null, doc("d", "Remote new", "d"))
    const merged = mergeNotesTrees(base, local, remote)
    expect(merged.map((node) => node.id).sort()).toEqual(["a", "b", "c", "d"])
  })

  it("creates folders before the documents inside them", () => {
    const withFolder = insertNode(base, null, folder("f", "New folder"))
    const local = insertNode(withFolder, "f", doc("c", "Inside", "c"))
    const merged = mergeNotesTrees(base, local, base)
    expect(findNode(merged, "c")?.parentId).toBe("f")
    expect(findNode(merged, "f")?.children?.map((child) => child.id)).toEqual(["c"])
  })

  it("applies deletions made in this tab but never deletes unrelated remote work", () => {
    const local = removeNode(base, "a")
    const remote = insertNode(base, null, doc("d", "Remote new", "d"))
    const merged = mergeNotesTrees(base, local, remote)
    expect(merged.map((node) => node.id).sort()).toEqual(["b", "d"])
  })

  it("keeps a document deleted in another tab deleted", () => {
    const local = updateNode(base, "a", { content: doc("a", "", "a-local").content })
    const remote = removeNode(base, "a")
    expect(findNode(mergeNotesTrees(base, local, remote), "a")).toBeNull()
  })

  it("applies renames and moves", () => {
    const withFolder = insertNode(base, null, folder("f", "Folder"))
    const local = moveNode(updateNode(withFolder, "b", { name: "Renamed" }), "b", "f")!
    const merged = mergeNotesTrees(withFolder, local, withFolder)
    expect(findNode(merged, "b")?.name).toBe("Renamed")
    expect(findNode(merged, "b")?.parentId).toBe("f")
    expect(findNode(merged, "f")?.children?.map((child) => child.id)).toEqual(["b"])
  })

  it("is a no-op when nothing changed locally", () => {
    const remote = updateNode(base, "a", { name: "Remote rename" })
    const merged = mergeNotesTrees(base, base, remote)
    expect(merged.map((node) => node.name)).toEqual(["Remote rename", "Doc B"])
  })
})
