import { expect, test, type Page } from "@playwright/test"
import { counterText, createDocument, editor, openNotes, titleInput } from "./helpers"

const zoomSelect = (page: Page) => page.getByLabel("Zoom", { exact: true })
const notesSidebar = (page: Page) => page.locator("aside").filter({ has: page.getByRole("tree") })
const scrollArea = (page: Page) => page.locator(".note-editor-scroll")

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

test.beforeEach(async ({ page }) => {
  await openNotes(page)
})

test.describe("focus mode", () => {
  test("the header button enters and leaves focus mode without touching content", async ({ page }) => {
    await createDocument(page, "Focused")
    await page.keyboard.type("keep this text")
    await page.getByRole("button", { name: "Enter focus mode" }).click()
    await expect(notesSidebar(page)).toHaveCount(0)
    await expect(page.getByRole("tablist")).toHaveCount(0)
    await expect(editor(page)).toContainText("keep this text")
    await page.getByRole("button", { name: "Exit focus mode" }).click()
    await expect(notesSidebar(page)).toBeVisible()
    await expect(titleInput(page)).toHaveValue("Focused")
    await expect(editor(page)).toContainText("keep this text")
  })

  test("the editor-menu focus button toggles the same state", async ({ page }) => {
    await createDocument(page, "Focused two")
    await page.getByRole("button", { name: "Open focus view" }).click()
    await expect(notesSidebar(page)).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Exit focus view" })).toBeVisible()
    await page.getByRole("button", { name: "Exit focus view" }).click()
    await expect(notesSidebar(page)).toBeVisible()
    await expect(page.getByRole("button", { name: "Open focus view" })).toBeVisible()
  })

  test("Escape leaves focus mode and typing still works afterwards", async ({ page }) => {
    await createDocument(page, "Esc focus")
    await page.getByRole("button", { name: "Enter focus mode" }).click()
    await editor(page).click()
    await page.keyboard.press("Escape")
    await expect(notesSidebar(page)).toBeVisible()
    await editor(page).click()
    await page.keyboard.type("typed after")
    await expect(editor(page)).toContainText("typed after")
  })

  test("focus mode fills the viewport", async ({ page }) => {
    await createDocument(page, "Fill")
    await page.getByRole("button", { name: "Enter focus mode" }).click()
    const box = await scrollArea(page).boundingBox()
    const viewport = page.viewportSize()!
    expect(box!.width).toBeGreaterThan(viewport.width * 0.9)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe("zoom", () => {
  for (const level of [50, 75, 90, 100, 125, 150, 200]) {
    test(`zoom ${level}% applies, stays editable and fits horizontally`, async ({ page }) => {
      await createDocument(page, `Zoom ${level}`)
      await zoomSelect(page).selectOption(String(level))
      await expect(scrollArea(page).locator("div[style*='zoom']").first()).toHaveAttribute("style", new RegExp(`zoom:\\s*${level}%`))
      await editor(page).click()
      await page.keyboard.type("zoomed text")
      await expect(editor(page)).toContainText("zoomed text")
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    })
  }

  test("View > Zoom in/out keeps the toolbar selector in sync", async ({ page }) => {
    await createDocument(page, "Zoom menu")
    await page.getByRole("button", { name: "View", exact: true }).click()
    await page.getByRole("button", { name: "Zoom in" }).click()
    const shown = await zoomSelect(page).evaluate((select: HTMLSelectElement) => select.options[select.selectedIndex]?.textContent ?? "")
    const applied = await scrollArea(page).locator("div[style*='zoom']").first().getAttribute("style")
    expect(shown.trim()).toBe(`${/zoom:\s*(\d+)%/.exec(applied ?? "")![1]}%`)
  })
})

test.describe("responsive layout", () => {
  const sizes = [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]

  for (const size of sizes) {
    test(`${size.width}x${size.height}: no horizontal overflow, toolbar clear of the page, editable`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.reload()
      await expect(page.getByRole("tree", { name: "Documents and folders" }).or(editor(page)).first()).toBeVisible()
      if (!(await editor(page).isVisible())) await page.getByRole("treeitem", { name: /Welcome/ }).click()
      await expect(editor(page)).toBeVisible()
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
      const toolbar = await page.locator(".note-editor-toolbar").boundingBox()
      const scroll = await scrollArea(page).boundingBox()
      expect(toolbar!.y + toolbar!.height).toBeLessThanOrEqual(scroll!.y + 1)
      await editor(page).click()
      await page.keyboard.press("Control+End")
      await page.keyboard.type(" resized")
      await expect(editor(page)).toContainText("resized")
    })
  }

  test("the word and character counter is reachable on a 1024px wide screen", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.reload()
    await page.getByRole("treeitem", { name: /Welcome/ }).click()
    await expect(page.getByText(/\d+ words? · \d+ characters?/).first()).toBeVisible()
  })

  test("a wide table never pushes the page wider than the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await expect(editor(page)).toBeVisible()
    await editor(page).click()
    await page.getByRole("button", { name: "Insert", exact: true }).click()
    await page.getByRole("button", { name: "Insert table…", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Insert table" })
    await dialog.getByLabel("Columns").fill("12")
    await dialog.getByRole("button", { name: "Insert table" }).click()
    await expect(editor(page).locator("table")).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe("long documents", () => {
  test("a long document scrolls inside the editor, not the page, and the caret follows typing", async ({ page }) => {
    await createDocument(page, "Long")
    for (let i = 0; i < 60; i += 1) await page.keyboard.press("Enter")
    await page.keyboard.type("final line")
    const caretVisible = await page.evaluate(() => {
      const selection = window.getSelection()!
      const rect = selection.getRangeAt(0).getBoundingClientRect()
      const area = document.querySelector(".note-editor-scroll")!.getBoundingClientRect()
      return rect.bottom <= area.bottom + 2 && rect.top >= area.top - 2
    })
    expect(caretVisible).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1)
  })

  test("the counter stays correct for a long document", async ({ page }) => {
    await createDocument(page, "Count long")
    await page.keyboard.type("word ".repeat(300))
    await expect.poll(() => counterText(page)).toMatch(/^300 words/)
  })
})
