import { expect, test } from "@playwright/test"
import { clickToolbar, createDocument, editor, openNotes, selectText, toolbarButton } from "./helpers"

test.beforeEach(async ({ page }) => {
  await openNotes(page)
  await createDocument(page, "Shortcuts")
})

test.describe("keyboard shortcuts", () => {
  for (const [keys, selector] of [
    ["Control+B", "strong"],
    ["Control+I", "em"],
    ["Control+U", "u"],
  ] as const) {
    test(`${keys} toggles ${selector} on the selection only`, async ({ page }) => {
      await page.keyboard.type("one two three")
      await selectText(page, "two")
      await page.keyboard.press(keys)
      await expect(editor(page).locator(selector)).toHaveText("two")
      await expect(editor(page)).toHaveText("one two three")
      await page.keyboard.press(keys)
      await expect(editor(page).locator(selector)).toHaveCount(0)
    })
  }

  test("Ctrl+A selects only the document, not the page", async ({ page }) => {
    await page.keyboard.type("alpha")
    await page.keyboard.press("Enter")
    await page.keyboard.type("beta")
    await page.keyboard.press("Control+A")
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "")
    expect(selected.replace(/\s+/g, " ").trim()).toBe("alpha beta")
    await page.keyboard.type("replaced")
    await expect(editor(page)).toHaveText("replaced")
  })

  test("Ctrl+Z and Ctrl+Y undo and redo typing in steps", async ({ page }) => {
    await page.keyboard.type("first")
    await page.waitForTimeout(700)
    await page.keyboard.type(" second")
    await page.keyboard.press("Control+Z")
    await expect(editor(page)).toHaveText("first")
    await page.keyboard.press("Control+Y")
    await expect(editor(page)).toHaveText("first second")
    await page.keyboard.press("Control+Z")
    await page.keyboard.press("Control+Shift+Z")
    await expect(editor(page)).toHaveText("first second")
  })

  test("undo reverts formatting without removing the text", async ({ page }) => {
    await page.keyboard.type("styled")
    await page.waitForTimeout(700)
    await page.keyboard.press("Control+A")
    await page.keyboard.press("Control+B")
    await expect(editor(page).locator("strong")).toHaveText("styled")
    await page.keyboard.press("Control+Z")
    await expect(editor(page).locator("strong")).toHaveCount(0)
    await expect(editor(page)).toHaveText("styled")
    await page.keyboard.press("Control+Y")
    await expect(editor(page).locator("strong")).toHaveText("styled")
  })

  test("toolbar undo and redo buttons mirror the shortcuts and disable correctly", async ({ page }) => {
    await expect(toolbarButton(page, "Undo (Ctrl+Z)")).toBeDisabled()
    await page.keyboard.type("abc")
    await expect(toolbarButton(page, "Undo (Ctrl+Z)")).toBeEnabled()
    await expect(toolbarButton(page, "Redo (Ctrl+Y)")).toBeDisabled()
    await clickToolbar(page, "Undo (Ctrl+Z)")
    await expect(editor(page)).not.toContainText("abc")
    await expect(toolbarButton(page, "Redo (Ctrl+Y)")).toBeEnabled()
    await clickToolbar(page, "Redo (Ctrl+Y)")
    await expect(editor(page)).toHaveText("abc")
  })

  test("Ctrl+K opens the editor link dialog instead of a browser action", async ({ page }) => {
    await page.keyboard.type("link me")
    await page.keyboard.press("Control+A")
    await page.keyboard.press("Control+K")
    await expect(page.getByLabel("Link URL")).toBeVisible()
  })

  test("Ctrl+F opens the in-document find dialog", async ({ page }) => {
    await page.keyboard.press("Control+F")
    await expect(page.getByLabel("Find text")).toBeVisible()
  })

  test("Ctrl+S is captured by the editor and saves the note immediately", async ({ page }) => {
    await page.keyboard.type("save me now")
    const prevented = await page.evaluate(() => {
      const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true })
      document.querySelector(".ProseMirror[contenteditable]")!.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(prevented).toBe(true)
    // Well inside the 800 ms debounce, the content must already be stored.
    const stored = await page.evaluate(() => localStorage.getItem("productivity-hub-notes-files-v1") ?? "")
    expect(stored).toContain("save me now")
  })

  test("Ctrl+P opens the print flow", async ({ page }) => {
    await page.evaluate(() => {
      ;(window as unknown as { __printed: number }).__printed = 0
      window.print = () => {
        ;(window as unknown as { __printed: number }).__printed += 1
      }
    })
    await page.keyboard.type("print me")
    await page.keyboard.press("Control+P")
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1)
  })

  test("Escape closes the link dialog", async ({ page }) => {
    await page.keyboard.press("Control+K")
    await expect(page.getByLabel("Link URL")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByLabel("Link URL")).toBeHidden()
  })

  test("Tab indents and Shift+Tab outdents a list item", async ({ page }) => {
    await page.keyboard.type("parent")
    await clickToolbar(page, "Bulleted list")
    await page.keyboard.press("Enter")
    await page.keyboard.type("child")
    await page.keyboard.press("Tab")
    await expect(editor(page).locator("ul ul li")).toHaveText("child")
    await page.keyboard.press("Shift+Tab")
    await expect(editor(page).locator("ul ul")).toHaveCount(0)
  })
})
