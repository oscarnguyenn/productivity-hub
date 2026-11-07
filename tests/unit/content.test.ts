import { describe, expect, it } from "vitest"
import { extractLinks, extractOutline, extractText, markdownToContent, toMarkdown } from "@/lib/notes/content"

const paragraph = (text: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({
  type: "paragraph",
  content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
})
const docOf = (...content: unknown[]) => JSON.stringify({ type: "doc", content })

describe("extractText", () => {
  it("returns an empty string for empty or invalid content", () => {
    expect(extractText("t-empty", undefined)).toBe("")
    expect(extractText("t-empty2", docOf({ type: "paragraph" }))).toBe("")
  })

  it("joins blocks with single newlines and includes maths", () => {
    const content = docOf(paragraph("one"), paragraph("two"), { type: "blockMath", attrs: { latex: "x^2" } })
    expect(extractText("t-blocks", content)).toBe("one\ntwo\nx^2")
  })

  it("re-reads the document when its content changes but the id stays the same", () => {
    expect(extractText("t-cache", docOf(paragraph("before")))).toBe("before")
    expect(extractText("t-cache", docOf(paragraph("after")))).toBe("after")
  })
})

describe("links and outline", () => {
  it("finds unique note links only", () => {
    const content = docOf(
      paragraph("a", [{ type: "link", attrs: { href: "note://abc" } }]),
      paragraph("b", [{ type: "link", attrs: { href: "note://abc" } }]),
      paragraph("c", [{ type: "link", attrs: { href: "https://example.com" } }])
    )
    expect(extractLinks(content)).toEqual(["abc"])
  })

  it("lists headings in order", () => {
    const content = docOf(
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Top" }] },
      paragraph("body"),
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Sub" }] },
      { type: "heading", attrs: { level: 3 } }
    )
    expect(extractOutline(content)).toEqual([
      { level: 1, text: "Top", index: 0 },
      { level: 2, text: "Sub", index: 1 },
      { level: 3, text: "Untitled heading", index: 2 },
    ])
  })
})

describe("markdown", () => {
  it("exports headings, formatting, links and lists", () => {
    const content = docOf(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Sub" }] },
      paragraph("bold", [{ type: "bold" }]),
      paragraph("site", [{ type: "link", attrs: { href: "https://example.com" } }]),
      { type: "bulletList", content: [{ type: "listItem", content: [paragraph("item")] }] },
      { type: "orderedList", content: [{ type: "listItem", content: [paragraph("first")] }] },
      { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [paragraph("done")] }] }
    )
    const markdown = toMarkdown("Title", content, () => undefined)
    expect(markdown).toContain("# Title")
    expect(markdown).toContain("## Sub")
    expect(markdown).toContain("**bold**")
    expect(markdown).toContain("[site](https://example.com)")
    expect(markdown).toContain("- item")
    expect(markdown).toContain("1. first")
    expect(markdown).toContain("- [x] done")
  })

  it("exports note links as wiki links using the target title", () => {
    const content = docOf(paragraph("anything", [{ type: "link", attrs: { href: "note://xyz" } }]))
    expect(toMarkdown("T", content, (id) => (id === "xyz" ? "Target" : undefined))).toContain("[[Target]]")
  })

  it("imports a document with a title and blocks", () => {
    const { title, content } = markdownToContent("# My note\n\nHello **world**\n\n- a\n- b\n\n> quote\n\n```ts\nconst a = 1\n```\n")
    expect(title).toBe("My note")
    const types = JSON.parse(content).content.map((node: { type: string }) => node.type)
    expect(types).toEqual(["paragraph", "bulletList", "blockquote", "codeBlock"])
  })

  it("imports an empty file as a valid empty document", () => {
    const { title, content } = markdownToContent("")
    expect(title).toBeNull()
    expect(JSON.parse(content)).toEqual({ type: "doc", content: [{ type: "paragraph" }] })
  })

  it("round-trips basic content", () => {
    const original = docOf(paragraph("plain text"), { type: "bulletList", content: [{ type: "listItem", content: [paragraph("one")] }] })
    const markdown = toMarkdown("Round trip", original, () => undefined)
    const imported = markdownToContent(markdown)
    expect(imported.title).toBe("Round trip")
    expect(extractText("rt", imported.content)).toBe(extractText("rt-original", original))
  })
})
