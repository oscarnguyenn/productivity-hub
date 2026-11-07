import { expect, type Locator, type Page } from "@playwright/test"

export const STORAGE_KEY = "productivity-hub-notes-files-v1"

export interface Diagnostics {
  consoleErrors: string[]
  pageErrors: string[]
  failedRequests: string[]
}

/** Starts every test from a clean notes workspace; reloads within a test keep their data. */
export async function openNotes(page: Page): Promise<Diagnostics> {
  const diagnostics: Diagnostics = { consoleErrors: [], pageErrors: [], failedRequests: [] }
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text())
  })
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message))
  page.on("requestfailed", (request) => diagnostics.failedRequests.push(`${request.method()} ${request.url()}`))
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("__e2e_seeded")) {
      localStorage.clear()
      sessionStorage.setItem("__e2e_seeded", "1")
    }
  })
  await page.goto("/notes")
  await expect(page.getByRole("tree", { name: "Documents and folders" })).toBeVisible()
  return diagnostics
}

export function editor(page: Page): Locator {
  return page.locator(".ProseMirror[contenteditable]").first()
}

export function titleInput(page: Page): Locator {
  return page.getByLabel("Document title")
}

export function toolbarButton(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true })
}

/** Clicks a toolbar button and lets Tiptap's deferred refocus run, as a real user's delay would. */
export async function clickToolbar(page: Page, name: string) {
  await toolbarButton(page, name).click()
  await page.waitForTimeout(60)
}

export async function createDocument(page: Page, name: string) {
  await page.getByRole("button", { name: "New document" }).first().click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("textbox", { name: "Name" }).fill(name)
  await dialog.getByRole("button", { name: "Create" }).click()
  await expect(dialog).toBeHidden()
  await expect(titleInput(page)).toHaveValue(name)
  await editor(page).click()
}

export async function createFolder(page: Page, name: string) {
  await page.getByRole("button", { name: "New folder" }).first().click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("textbox", { name: "Name" }).fill(name)
  await dialog.getByRole("button", { name: "Create" }).click()
  await expect(dialog).toBeHidden()
}

export async function openDocumentFromTree(page: Page, name: string) {
  await page.getByRole("tree").getByRole("treeitem", { name: new RegExp(name) }).first().click()
  await expect(titleInput(page)).toHaveValue(name)
}

/** Waits out the 800ms autosave debounce, then expects the indicator to settle on "Saved". */
export async function waitForSaved(page: Page) {
  await page.waitForTimeout(1200)
  await expect(page.getByRole("status").filter({ hasText: /saved/i }).first()).toBeVisible({ timeout: 8000 })
}

export interface StoredNode {
  id: string
  name: string
  type: "document" | "folder"
  content?: string
  parentId: string | null
  children?: StoredNode[]
}

export async function storedTree(page: Page): Promise<StoredNode[]> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), STORAGE_KEY)
}

export function flattenStored(nodes: StoredNode[]): StoredNode[] {
  return nodes.flatMap((node) => [node, ...flattenStored(node.children ?? [])])
}

export async function counterText(page: Page) {
  return (await page.getByText(/\d+ words? · \d+ characters?/).first().textContent())?.replace(/\s+/g, " ").trim()
}

/** Selects the first occurrence of `needle` inside the editor using a real DOM selection. */
export async function selectText(page: Page, needle: string) {
  await page.evaluate((text) => {
    const root = document.querySelector(".ProseMirror[contenteditable]") as HTMLElement
    root.focus()
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(text) ?? -1
      if (index < 0) continue
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + text.length)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    throw new Error(`Text not found in editor: ${text}`)
  }, needle)
  await page.waitForTimeout(80)
}

/** Places the caret at the end of the first occurrence of `needle`. */
export async function caretAfter(page: Page, needle: string) {
  await selectText(page, needle)
  await page.keyboard.press("ArrowRight")
}

export async function pasteHtml(page: Page, html: string, plain = "") {
  await page.evaluate(
    ({ html: markup, plain: text }) => {
      const el = document.querySelector(".ProseMirror[contenteditable]") as HTMLElement
      el.focus()
      const data = new DataTransfer()
      data.setData("text/html", markup)
      data.setData("text/plain", text)
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
    },
    { html, plain }
  )
}
