import { describe, expect, it } from "vitest"
import { buildHtmlDocument, escapeHtml, safeFileName } from "@/lib/notes/export-html"

describe("escapeHtml", () => {
  it("escapes markup characters", () => {
    expect(escapeHtml(`Tom & Jerry <script>alert("x")</script> 'q'`)).toBe(
      "Tom &amp; Jerry &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &#39;q&#39;"
    )
  })
})

describe("safeFileName", () => {
  it("keeps ordinary titles", () => {
    expect(safeFileName("Weekly plan", "html")).toBe("Weekly plan.html")
  })

  it("removes characters that are invalid on common file systems", () => {
    expect(safeFileName('Plan: Q1/Q2 "draft"?', "html")).toBe("Plan Q1 Q2 draft.html")
    expect(safeFileName("a\\b|c*d<e>f", "md")).toBe("a b c d e f.md")
  })

  it("falls back for empty, dotted and reserved names", () => {
    expect(safeFileName("", "html")).toBe("document.html")
    expect(safeFileName("   ", "html")).toBe("document.html")
    expect(safeFileName("...", "html")).toBe("document.html")
    expect(safeFileName("CON", "html")).toBe("document.html")
    expect(safeFileName("///", "html", "note")).toBe("note.html")
  })

  it("limits the length", () => {
    expect(safeFileName("x".repeat(500), "html").length).toBeLessThanOrEqual(125)
  })
})

describe("buildHtmlDocument", () => {
  const html = buildHtmlDocument("Tom & Jerry <script>alert(1)</script>", "<h1>Hello</h1><p>World</p>")

  it("is a standalone document with a viewport and basic styles", () => {
    expect(html).toMatch(/^<!doctype html>/i)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toMatch(/<meta name="viewport"/)
    expect(html).toContain("<style>")
    expect(html).toContain("<h1>Hello</h1><p>World</p>")
  })

  it("escapes the title", () => {
    expect(html).toContain("<title>Tom &amp; Jerry &lt;script&gt;alert(1)&lt;/script&gt;</title>")
    expect(html).not.toContain("<title>Tom & Jerry <script>")
  })

  it("uses a placeholder title when empty", () => {
    expect(buildHtmlDocument("  ", "")).toContain("<title>Untitled document</title>")
  })
})
