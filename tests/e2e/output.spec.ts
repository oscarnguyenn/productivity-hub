import { readFileSync } from "node:fs"
import { expect, test, type Download, type Page } from "@playwright/test"
import { clickToolbar, createDocument, editor, openNotes, pasteHtml, selectText } from "./helpers"

const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="

async function download(page: Page): Promise<{ file: Download; html: string }> {
  const pending = page.waitForEvent("download")
  await page.getByTitle("Download document").click()
  const file = await pending
  return { file, html: readFileSync(await file.path(), "utf8") }
}

async function seedRichDocument(page: Page, name = "Export me") {
  await createDocument(page, name)
  await pasteHtml(
    page,
    `<h1>Main heading</h1><h2>Sub heading</h2><p>Plain <strong>bold</strong> <em>italic</em> <a href="https://example.com/page">a link</a></p>` +
      `<ul><li><p>bullet one</p></li><li><p>bullet two</p></li></ul><ol><li><p>step one</p></li></ol>` +
      `<blockquote><p>quoted words</p></blockquote><pre><code>const x = 1</code></pre>` +
      `<table><tbody><tr><th>Head A</th><th>Head B</th></tr><tr><td>cell 1</td><td>cell 2</td></tr></tbody></table>` +
      `<img src="${PIXEL}" alt="tiny pixel">`
  )
  await expect(editor(page).locator("table")).toBeVisible()
}

test.describe("download", () => {
  test.beforeEach(async ({ page }) => {
    await openNotes(page)
  })

  test("exports headings, lists, table, image and links with the document name", async ({ page }) => {
    await seedRichDocument(page)
    const { file, html } = await download(page)
    expect(file.suggestedFilename()).toBe("Export me.html")
    expect(html).toMatch(/<h1[^>]*>Main heading<\/h1>/)
    expect(html).toMatch(/<h2[^>]*>Sub heading<\/h2>/)
    expect(html).toContain("<strong>bold</strong>")
    expect(html).toContain("<em>italic</em>")
    expect(html).toContain('href="https://example.com/page"')
    expect(html).toMatch(/<ul[\s\S]*bullet two[\s\S]*<\/ul>/)
    expect(html).toMatch(/<ol[\s\S]*step one[\s\S]*<\/ol>/)
    expect(html).toContain("<blockquote")
    expect(html).toContain("const x = 1")
    expect(html).toMatch(/<table[\s\S]*Head A[\s\S]*cell 2[\s\S]*<\/table>/)
    expect(html).toContain("tiny pixel")
  })

  test("preserves colour, highlight and alignment as inline styles", async ({ page }) => {
    await createDocument(page, "Styled")
    await page.keyboard.type("coloured words")
    await selectText(page, "coloured words")
    await page.getByLabel("Text color").evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
      setter.call(el, "#ff0000")
      el.dispatchEvent(new Event("input", { bubbles: true }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await clickToolbar(page, "Align right")
    const { html } = await download(page)
    expect(html.toLowerCase()).toMatch(/color:\s*(#ff0000|rgb\(255,\s*0,\s*0\))/)
    expect(html).toMatch(/text-align:\s*right/)
  })

  test("is a standalone document: escaped title, viewport meta and basic styles", async ({ page }) => {
    await createDocument(page, "Tom & Jerry <script>alert(1)</script>")
    await page.keyboard.type("body")
    const { html } = await download(page)
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("Tom &amp; Jerry &lt;script&gt;")
    expect(html).toMatch(/<meta[^>]+viewport/)
    expect(html).toContain("<style")
  })

  test("the suggested filename is safe on every platform", async ({ page }) => {
    await createDocument(page, 'Plan: Q1/Q2 "draft"?')
    await page.keyboard.type("body")
    const { file } = await download(page)
    expect(file.suggestedFilename()).not.toMatch(/[\\/:*?"<>|]/)
    expect(file.suggestedFilename()).toMatch(/\.html$/)
  })

  test("File menu download works for an empty document", async ({ page }) => {
    await createDocument(page, "Empty export")
    const pending = page.waitForEvent("download")
    await page.getByRole("button", { name: "File", exact: true }).click()
    await page.getByRole("button", { name: "Download as HTML" }).click()
    const file = await pending
    expect(file.suggestedFilename()).toBe("Empty export.html")
    expect(readFileSync(await file.path(), "utf8")).toContain("<!doctype html>")
  })

  test("maths is exported in a form that renders without the app", async ({ page }) => {
    await createDocument(page, "Maths export")
    await page.getByRole("button", { name: "Insert", exact: true }).click()
    await page.getByRole("button", { name: "Inline math", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Edit math" })
    await dialog.locator("textarea").fill("x^2+1")
    await dialog.getByRole("button", { name: "Apply" }).click()
    await expect(dialog).toBeHidden()
    const { html } = await download(page)
    expect(html).toMatch(/<math|class="katex/)
  })

  test("Markdown export of a rich document keeps its structure", async ({ page }) => {
    await seedRichDocument(page, "Markdown out")
    const pending = page.waitForEvent("download")
    await page.getByRole("button", { name: "Export as Markdown" }).click()
    const file = await pending
    const markdown = readFileSync(await file.path(), "utf8")
    expect(file.suggestedFilename()).toBe("Markdown out.md")
    expect(markdown).toMatch(/^# Markdown out/m)
    expect(markdown).toMatch(/^# Main heading/m)
    expect(markdown).toMatch(/^## Sub heading/m)
    expect(markdown).toContain("**bold**")
    expect(markdown).toContain("[a link](https://example.com/page)")
    expect(markdown).toMatch(/^- bullet one/m)
    expect(markdown).toMatch(/^1\. step one/m)
    expect(markdown).toMatch(/^> quoted words/m)
    expect(markdown).toContain("```")
    expect(markdown).toContain("| Head A | Head B |")
  })
})

test.describe("print", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __prints: number }).__prints = 0
      window.print = () => {
        ;(window as unknown as { __prints: number }).__prints += 1
      }
    })
    await openNotes(page)
  })

  const prints = (page: Page) => page.evaluate(() => (window as unknown as { __prints: number }).__prints)

  test("the toolbar button, File menu and Ctrl+P each print exactly once", async ({ page }) => {
    await createDocument(page, "Print me")
    await page.keyboard.type("hello")
    await page.getByTitle("Print document").click()
    expect(await prints(page)).toBe(1)
    await page.getByRole("button", { name: "File", exact: true }).click()
    await page.getByRole("button", { name: "Print / save as PDF" }).click()
    expect(await prints(page)).toBe(2)
    await editor(page).click()
    await page.keyboard.press("Control+p")
    expect(await prints(page)).toBe(3)
  })

  test("print layout hides the app chrome and shows the title and content", async ({ page }) => {
    await seedRichDocument(page, "Printed doc")
    await page.emulateMedia({ media: "print" })
    await expect(page.locator(".print-document-title")).toBeVisible()
    await expect(page.locator(".print-document-title")).toHaveText("Printed doc")
    await expect(page.locator(".note-editor-toolbar")).toBeHidden()
    await expect(page.locator(".note-editor-menu")).toBeHidden()
    await expect(page.getByRole("tree")).toBeHidden()
    await expect(page.getByRole("tablist")).toBeHidden()
    await expect(editor(page).getByText("Main heading")).toBeVisible()
    await expect(editor(page).locator("table")).toBeVisible()
  })

  test("print ignores the on-screen zoom level", async ({ page }) => {
    await createDocument(page, "Zoomed print")
    await page.keyboard.type("zoom should not leak into print")
    await page.getByLabel("Zoom", { exact: true }).selectOption("200")
    await page.emulateMedia({ media: "print" })
    const zoom = await page.locator(".note-editor-scroll > div[style*='zoom']").first().evaluate((el) => getComputedStyle(el).zoom)
    expect(Number(zoom)).toBe(1)
  })

  test("a long document prints across several pages without overflowing the page width", async ({ page }) => {
    await createDocument(page, "Long print")
    await pasteHtml(page, Array.from({ length: 120 }, (_, i) => `<p>Paragraph ${i + 1} ${"lorem ipsum ".repeat(12)}</p>`).join(""))
    await page.emulateMedia({ media: "print" })
    const pdf = await page.pdf({ format: "A4" })
    const pages = Math.max(0, ...Array.from(pdf.toString("latin1").matchAll(/\/Count\s+(\d+)/g), (match) => Number(match[1])))
    expect(pages).toBeGreaterThan(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })
})
