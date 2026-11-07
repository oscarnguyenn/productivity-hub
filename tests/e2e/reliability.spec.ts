import { expect, test, type Page } from "@playwright/test"
import {
  clickToolbar,
  createDocument,
  editor,
  flattenStored,
  openDocumentFromTree,
  openNotes,
  selectText,
  STORAGE_KEY,
  storedTree,
  titleInput,
  waitForSaved,
} from "./helpers"

function plainText(content: string | undefined) {
  const parts: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return
    const value = node as { text?: string; content?: unknown[] }
    if (value.text) parts.push(value.text)
    value.content?.forEach(walk)
  }
  if (content) walk(JSON.parse(content))
  return parts.join(" ")
}

async function contentOf(page: Page, name: string) {
  const node = flattenStored(await storedTree(page)).find((item) => item.name === name)
  return plainText(node?.content)
}

test.describe("performance and reliability", () => {
  test("rapid typing of a long run is neither lost nor reordered", async ({ page }) => {
    const diagnostics = await openNotes(page)
    await createDocument(page, "Rapid")
    const text = Array.from({ length: 120 }, (_, i) => `w${i}`).join(" ")
    await page.keyboard.type(text, { delay: 0 })
    await expect(editor(page)).toContainText("w119")
    await waitForSaved(page)
    expect(await contentOf(page, "Rapid")).toBe(text)
    expect(diagnostics.consoleErrors).toEqual([])
    expect(diagnostics.pageErrors).toEqual([])
  })

  test("typing stays responsive in a very long document", async ({ page }) => {
    await openNotes(page)
    await createDocument(page, "Huge")
    const paragraph = "The quick brown fox jumps over the lazy dog. ".repeat(20)
    await page.evaluate((text) => {
      const el = document.querySelector(".ProseMirror[contenteditable]") as HTMLElement
      el.focus()
      const data = new DataTransfer()
      data.setData("text/plain", Array.from({ length: 400 }, () => text).join("\n\n"))
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
    }, paragraph)
    await expect(editor(page).locator("p").nth(399)).toBeAttached()
    await page.keyboard.press("Control+End")
    const started = Date.now()
    await page.keyboard.type("typing at the end of a huge document", { delay: 0 })
    await expect(editor(page)).toContainText("huge document")
    expect(Date.now() - started).toBeLessThan(8000)
  })

  test("rapid formatting toggles leave the text intact and the editor responsive", async ({ page }) => {
    const diagnostics = await openNotes(page)
    await createDocument(page, "Toggle storm")
    await page.keyboard.type("stable words here")
    await selectText(page, "stable words here")
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press("Control+b")
      await page.keyboard.press("Control+i")
    }
    await expect(editor(page)).toContainText("stable words here")
    await clickToolbar(page, "Clear formatting")
    await expect(editor(page).locator("strong, em")).toHaveCount(0)
    await expect(editor(page)).toContainText("stable words here")
    expect(diagnostics.pageErrors).toEqual([])
  })

  test("switching documents mid-debounce keeps every document's edits", async ({ page }) => {
    await openNotes(page)
    const names = ["Doc 1", "Doc 2", "Doc 3", "Doc 4", "Doc 5"]
    for (const name of names) await createDocument(page, name)
    for (let round = 0; round < 3; round += 1) {
      for (const name of names) {
        await openDocumentFromTree(page, name)
        await editor(page).click()
        await page.keyboard.press("Control+End")
        await page.keyboard.type(` ${name}-r${round}`)
      }
    }
    await waitForSaved(page)
    for (const name of names) {
      const stored = await contentOf(page, name)
      for (let round = 0; round < 3; round += 1) expect(stored).toContain(`${name}-r${round}`)
      for (const other of names.filter((n) => n !== name)) expect(stored).not.toContain(`${other}-r`)
    }
  })

  test("reloading straight after an edit keeps the edit", async ({ page }) => {
    await openNotes(page)
    await createDocument(page, "Instant")
    await page.keyboard.type("typed right before reload")
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(titleInput(page)).toHaveValue("Instant")
    await expect(editor(page)).toContainText("typed right before reload")
  })

  test("a full editing session produces no console errors, page errors or failed requests", async ({ page }) => {
    const diagnostics = await openNotes(page)
    await createDocument(page, "Session")
    await page.keyboard.type("hello world")
    await clickToolbar(page, "Bulleted list")
    await page.keyboard.type("item")
    await page.getByRole("button", { name: "Insert", exact: true }).click()
    await page.getByRole("button", { name: "Horizontal line", exact: true }).click()
    await page.getByLabel("Search notes").fill("hello")
    await page.getByLabel("Search notes").fill("")
    await waitForSaved(page)
    await page.reload()
    await openDocumentFromTree(page, "Session")
    expect(diagnostics.consoleErrors).toEqual([])
    expect(diagnostics.pageErrors).toEqual([])
    expect(diagnostics.failedRequests).toEqual([])
  })
})

test.describe("data integrity", () => {
  test("every node has a unique id and consistent parent links", async ({ page }) => {
    await openNotes(page)
    await createDocument(page, "Integrity")
    await page.keyboard.type("text")
    await waitForSaved(page)
    const tree = await storedTree(page)
    const nodes = flattenStored(tree)
    const ids = nodes.map((node) => node.id)
    expect(new Set(ids).size).toBe(ids.length)
    const walk = (list: typeof tree, parent: string | null) => {
      for (const node of list) {
        expect(node.parentId ?? null).toBe(parent)
        walk(node.children ?? [], node.id)
      }
    }
    walk(tree, null)
  })

  test("titles and content persist independently", async ({ page }) => {
    await openNotes(page)
    await createDocument(page, "Alpha")
    await page.keyboard.type("alpha body")
    await createDocument(page, "Beta")
    await page.keyboard.type("beta body")
    await openDocumentFromTree(page, "Alpha")
    await titleInput(page).fill("Alpha renamed")
    await waitForSaved(page)
    expect(await contentOf(page, "Alpha renamed")).toBe("alpha body")
    expect(await contentOf(page, "Beta")).toBe("beta body")
  })

  test("corrupted stored data is reported and not overwritten", async ({ page }) => {
    await page.addInitScript((key) => {
      if (!sessionStorage.getItem("__corrupt")) {
        sessionStorage.setItem("__corrupt", "1")
        localStorage.setItem(key, JSON.stringify([{ nonsense: true }]))
      }
    }, STORAGE_KEY)
    await page.goto("/notes")
    await page.waitForTimeout(1500)
    const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    expect(raw).toContain("nonsense")
  })

  test("two tabs editing different documents do not overwrite each other", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const first = await context.newPage()
    await openNotes(first)
    await createDocument(first, "Tab one doc")
    await first.keyboard.type("seed one")
    await createDocument(first, "Tab two doc")
    await first.keyboard.type("seed two")
    await waitForSaved(first)

    const second = await context.newPage()
    await second.goto("/notes")
    await expect(second.getByRole("tree", { name: "Documents and folders" })).toBeVisible()

    await openDocumentFromTree(first, "Tab one doc")
    await editor(first).click()
    await first.keyboard.press("Control+End")
    await first.keyboard.type(" first-tab-edit")
    await waitForSaved(first)

    await openDocumentFromTree(second, "Tab two doc")
    await editor(second).click()
    await second.keyboard.press("Control+End")
    await second.keyboard.type(" second-tab-edit")
    await waitForSaved(second)

    const final = await first.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    expect(final).toContain("first-tab-edit")
    expect(final).toContain("second-tab-edit")
    await context.close()
  })
})
