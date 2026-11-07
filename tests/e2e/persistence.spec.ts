import { expect, test } from "@playwright/test"
import {
  counterText,
  createDocument,
  editor,
  flattenStored,
  openDocumentFromTree,
  openNotes,
  storedTree,
  titleInput,
  waitForSaved,
} from "./helpers"

test.describe("document editing and persistence", () => {
  test("typed content survives reload, with no duplication", async ({ page }) => {
    await openNotes(page)
    await createDocument(page, "Persist me")
    await editor(page).pressSequentially("Hello persistent world")
    await waitForSaved(page)
    await page.reload()
    await openDocumentFromTree(page, "Persist me")
    await expect(editor(page)).toHaveText("Hello persistent world")
  })

  test("reloading immediately after typing loses nothing", async ({ page }) => {
    await openNotes(page)
    await createDocument(page, "Immediate reload")
    await editor(page).pressSequentially("last keystroke counts")
    await page.reload()
    await openDocumentFromTree(page, "Immediate reload")
    await expect(editor(page)).toHaveText("last keystroke counts")
  })

  test("closing the tab right after typing does not trigger a leave-site prompt in local mode", async ({ page }) => {
    await openNotes(page)
    await createDocument(page, "Prompt check")
    let dialogSeen = false
    page.on("dialog", async (dialog) => {
      dialogSeen = dialog.type() === "beforeunload"
      await dialog.accept()
    })
    await editor(page).pressSequentially("x")
    await page.reload()
    expect(dialogSeen).toBe(false)
    await openDocumentFromTree(page, "Prompt check")
    await expect(editor(page)).toHaveText("x")
  })

  test("switching documents keeps content and titles independent", async ({ page }) => {
    await openNotes(page)
    await createDocument(page, "Alpha")
    await editor(page).pressSequentially("alpha body")
    await createDocument(page, "Beta")
    await editor(page).pressSequentially("beta body")
    await openDocumentFromTree(page, "Alpha")
    await expect(editor(page)).toHaveText("alpha body")
    await openDocumentFromTree(page, "Beta")
    await expect(editor(page)).toHaveText("beta body")
    await waitForSaved(page)
    const docs = flattenStored(await storedTree(page)).filter((node) => node.type === "document")
    const alpha = docs.find((node) => node.name === "Alpha")
    const beta = docs.find((node) => node.name === "Beta")
    expect(alpha?.content).toContain("alpha body")
    expect(alpha?.content).not.toContain("beta body")
    expect(beta?.content).toContain("beta body")
    expect(beta?.content).not.toContain("alpha body")
    expect(new Set(docs.map((node) => node.id)).size).toBe(docs.length)
  })

  test("rapid document switching while typing never crosses content", async ({ page }) => {
    await openNotes(page)
    await createDocument(page, "Rapid A")
    await createDocument(page, "Rapid B")
    for (let round = 0; round < 6; round++) {
      await openDocumentFromTree(page, "Rapid A")
      await editor(page).click()
      await page.keyboard.type(`A${round} `)
      await openDocumentFromTree(page, "Rapid B")
      await editor(page).click()
      await page.keyboard.type(`B${round} `)
    }
    await waitForSaved(page)
    await page.reload()
    await openDocumentFromTree(page, "Rapid A")
    await expect(editor(page)).toHaveText("A0 A1 A2 A3 A4 A5 ")
    await openDocumentFromTree(page, "Rapid B")
    await expect(editor(page)).toHaveText("B0 B1 B2 B3 B4 B5 ")
  })

  test("renaming updates the title, tab and tree and persists", async ({ page }) => {
    await openNotes(page)
    await createDocument(page, "Old name")
    await titleInput(page).fill("Brand new name")
    await expect(page.getByRole("tab", { name: "Brand new name" })).toBeVisible()
    await expect(page.getByRole("tree").getByText("Brand new name")).toBeVisible()
    await waitForSaved(page)
    await page.reload()
    await expect(page.getByRole("tree").getByText("Brand new name")).toBeVisible()
  })

  test("clearing the title falls back to Untitled document", async ({ page }) => {
    await openNotes(page)
    await createDocument(page, "To be blank")
    await titleInput(page).fill("")
    await titleInput(page).blur()
    await expect(titleInput(page)).toHaveValue("Untitled document")
  })

  test("closing and reopening a tab restores the document", async ({ page }) => {
    await openNotes(page)
    await createDocument(page, "Tab doc")
    await editor(page).pressSequentially("tab content")
    await page.getByRole("button", { name: "Close Tab doc" }).click()
    await openDocumentFromTree(page, "Tab doc")
    await expect(editor(page)).toHaveText("tab content")
  })

  test("select all, delete, copy and paste behave like a normal editor", async ({ page }) => {
    await openNotes(page)
    await createDocument(page, "Clipboard")
    await editor(page).pressSequentially("one two three")
    await page.keyboard.press("Control+A")
    await page.keyboard.press("Control+C")
    await page.keyboard.press("Delete")
    await expect(editor(page)).toHaveText("")
    await page.keyboard.press("Control+V")
    await expect(editor(page)).toHaveText("one two three")
    await page.keyboard.press("Control+V")
    await expect(editor(page)).toHaveText("one two threeone two three")
  })

  test("an empty document saves as an empty document and reopens empty", async ({ page }) => {
    await openNotes(page)
    await createDocument(page, "Empty one")
    await waitForSaved(page)
    await page.reload()
    await openDocumentFromTree(page, "Empty one")
    await expect(editor(page)).toHaveText("")
    expect(await counterText(page)).toBe("0 words · 0 characters")
  })

  test("a long document keeps every paragraph after reload", async ({ page }) => {
    await openNotes(page)
    await createDocument(page, "Long doc")
    const paragraphs = Array.from({ length: 200 }, (_, index) => `Paragraph number ${index} with some filler text.`)
    await page.evaluate((lines) => {
      const el = document.querySelector(".ProseMirror[contenteditable]") as HTMLElement
      el.focus()
      document.execCommand("insertText", false, lines.join("\n"))
    }, paragraphs)
    await waitForSaved(page)
    await page.reload()
    await openDocumentFromTree(page, "Long doc")
    await expect(editor(page).locator("p")).toHaveCount(200)
    await expect(editor(page).locator("p").last()).toHaveText("Paragraph number 199 with some filler text.")
  })

  test("no console or page errors during a normal editing session", async ({ page }) => {
    const diagnostics = await openNotes(page)
    await createDocument(page, "Clean console")
    await editor(page).pressSequentially("hello")
    await page.getByRole("tab", { name: "Clean console" }).click()
    await waitForSaved(page)
    expect(diagnostics.pageErrors).toEqual([])
    expect(diagnostics.consoleErrors).toEqual([])
    expect(diagnostics.failedRequests).toEqual([])
  })
})
