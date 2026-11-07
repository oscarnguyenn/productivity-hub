import { expect, test } from "@playwright/test"
import { clickToolbar, createDocument, editor, openDocumentFromTree, openNotes, selectText, toolbarButton, waitForSaved } from "./helpers"

const PIXEL_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

test.beforeEach(async ({ page }) => {
  await openNotes(page)
  await createDocument(page, "Inserts")
})

async function openMenu(page: import("@playwright/test").Page, menu: string) {
  await page.getByRole("button", { name: menu, exact: true }).click()
}

test.describe("links", () => {
  test("insert a link on selected text, normalising a bare domain", async ({ page }) => {
    await page.keyboard.type("visit the site now")
    await selectText(page, "the site")
    await page.keyboard.press("Control+K")
    await page.getByLabel("Link URL").fill("example.com")
    await page.getByRole("button", { name: "Apply" }).click()
    await expect(editor(page).locator("a")).toHaveAttribute("href", "https://example.com")
    await expect(editor(page).locator("a")).toHaveText("the site")
    await expect(editor(page)).toHaveText("visit the site now")
  })

  test("mailto: and tel: links are kept as typed", async ({ page }) => {
    await page.keyboard.type("mail me")
    await page.keyboard.press("Control+A")
    await page.keyboard.press("Control+K")
    await page.getByLabel("Link URL").fill("mailto:someone@example.com")
    await page.getByRole("button", { name: "Apply" }).click()
    await expect(editor(page).locator("a")).toHaveAttribute("href", "mailto:someone@example.com")
  })

  test("edit an existing link", async ({ page }) => {
    await page.keyboard.type("go there")
    await page.keyboard.press("Control+A")
    await page.keyboard.press("Control+K")
    await page.getByLabel("Link URL").fill("https://one.example")
    await page.getByRole("button", { name: "Apply" }).click()
    await editor(page).locator("a").click()
    await page.keyboard.press("Control+K")
    await expect(page.getByLabel("Link URL")).toHaveValue("https://one.example")
    await page.getByLabel("Link URL").fill("https://two.example")
    await page.getByLabel("Link URL").press("Enter")
    await expect(editor(page).locator("a")).toHaveAttribute("href", "https://two.example")
    await expect(editor(page).locator("a")).toHaveText("go there")
  })

  test("remove a link but keep its text", async ({ page }) => {
    await page.keyboard.type("go there")
    await page.keyboard.press("Control+A")
    await page.keyboard.press("Control+K")
    await page.getByLabel("Link URL").fill("https://one.example")
    await page.getByRole("button", { name: "Apply" }).click()
    await editor(page).locator("a").click()
    await page.keyboard.press("Control+K")
    await page.getByRole("button", { name: "Remove link" }).click()
    await expect(editor(page).locator("a")).toHaveCount(0)
    await expect(editor(page)).toHaveText("go there")
  })

  test("clearing the URL removes the link", async ({ page }) => {
    await page.keyboard.type("go there")
    await page.keyboard.press("Control+A")
    await page.keyboard.press("Control+K")
    await page.getByLabel("Link URL").fill("https://one.example")
    await page.getByRole("button", { name: "Apply" }).click()
    await editor(page).locator("a").click()
    await page.keyboard.press("Control+K")
    await page.getByLabel("Link URL").fill("")
    await page.getByRole("button", { name: "Apply" }).click()
    await expect(editor(page).locator("a")).toHaveCount(0)
  })

  test("a link inserted with no selection shows its address instead of nothing", async ({ page }) => {
    await page.keyboard.type("before ")
    await page.keyboard.press("Control+K")
    await page.getByLabel("Link URL").fill("https://empty.example")
    await page.getByRole("button", { name: "Apply" }).click()
    await expect(editor(page).locator("a")).toHaveAttribute("href", "https://empty.example")
    await expect(editor(page).locator("a")).toHaveText("https://empty.example")
    await page.keyboard.type(" after")
    await expect(editor(page)).toContainText("before https://empty.example after")
  })

  test("relative and in-page links are not rewritten into https:// URLs", async ({ page }) => {
    await page.keyboard.type("jump")
    await page.keyboard.press("Control+A")
    await page.keyboard.press("Control+K")
    await page.getByLabel("Link URL").fill("#section")
    await page.getByRole("button", { name: "Apply" }).click()
    await expect(editor(page).locator("a")).toHaveAttribute("href", "#section")
  })

  test("links survive a reload", async ({ page }) => {
    await page.keyboard.type("stay linked")
    await page.keyboard.press("Control+A")
    await page.keyboard.press("Control+K")
    await page.getByLabel("Link URL").fill("https://persist.example")
    await page.getByRole("button", { name: "Apply" }).click()
    await waitForSaved(page)
    await page.reload()
    await openDocumentFromTree(page, "Inserts")
    await expect(editor(page).locator("a")).toHaveAttribute("href", "https://persist.example")
  })
})

test.describe("images", () => {
  test("insert an image from a URL and keep it after reload", async ({ page }) => {
    page.once("dialog", (dialog) => void dialog.accept(PIXEL_GIF))
    await page.keyboard.type("above")
    await openMenu(page, "Insert")
    await page.getByRole("button", { name: "Image from URL" }).click()
    await expect(editor(page).locator("img")).toHaveCount(1)
    await expect(editor(page)).toContainText("above")
    await waitForSaved(page)
    await page.reload()
    await openDocumentFromTree(page, "Inserts")
    await expect(editor(page).locator("img")).toHaveCount(1)
  })

  test("cancelling the image prompt inserts nothing", async ({ page }) => {
    page.once("dialog", (dialog) => void dialog.dismiss())
    await openMenu(page, "Insert")
    await page.getByRole("button", { name: "Image from URL" }).click()
    await expect(editor(page).locator("img")).toHaveCount(0)
  })

  test("uploading a non-image file reports an error", async ({ page }) => {
    await page.setInputFiles("#note-image-input", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") })
    await expect(page.getByText(/is not an image/)).toBeVisible()
    await expect(editor(page).locator("img")).toHaveCount(0)
  })

  test("uploading a small image embeds it", async ({ page }) => {
    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")
    await page.setInputFiles("#note-image-input", { name: "dot.gif", mimeType: "image/gif", buffer: gif })
    await expect(editor(page).locator("img")).toHaveCount(1)
  })
})

test.describe("tables", () => {
  async function insertTable(page: import("@playwright/test").Page, rows: number, cols: number) {
    await openMenu(page, "Insert")
    await page.getByRole("button", { name: "Insert table…", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Insert table" })
    await dialog.getByLabel("Rows").fill(String(rows))
    await dialog.getByLabel("Columns").fill(String(cols))
    await dialog.getByRole("button", { name: "Insert table" }).click()
    await expect(dialog).toBeHidden()
  }

  test("insert a table, type into cells, navigate with Tab", async ({ page }) => {
    await insertTable(page, 3, 2)
    await expect(editor(page).locator("table tr")).toHaveCount(3)
    await expect(editor(page).locator("table tr").first().locator("th")).toHaveCount(2)
    await page.keyboard.type("A1")
    await page.keyboard.press("Tab")
    await page.keyboard.type("B1")
    await page.keyboard.press("Tab")
    await page.keyboard.type("A2")
    const cells = editor(page).locator("table th, table td")
    await expect(cells.nth(0)).toHaveText("A1")
    await expect(cells.nth(1)).toHaveText("B1")
    await expect(cells.nth(2)).toHaveText("A2")
  })

  test("add and remove rows and columns", async ({ page }) => {
    await insertTable(page, 2, 2)
    await page.keyboard.type("x")
    await clickToolbar(page, "Add table row")
    await expect(editor(page).locator("table tr")).toHaveCount(3)
    await clickToolbar(page, "Add table column")
    await expect(editor(page).locator("table tr").nth(1).locator("td, th")).toHaveCount(3)
    await clickToolbar(page, "Delete table column")
    await expect(editor(page).locator("table tr").nth(1).locator("td, th")).toHaveCount(2)
    await clickToolbar(page, "Delete table row")
    await expect(editor(page).locator("table tr")).toHaveCount(2)
  })

  test("deleting a table leaves the rest of the document intact", async ({ page }) => {
    await page.keyboard.type("keep me")
    await page.keyboard.press("Enter")
    await insertTable(page, 2, 2)
    await clickToolbar(page, "Delete table")
    await expect(editor(page).locator("table")).toHaveCount(0)
    await expect(editor(page)).toContainText("keep me")
  })

  test("table contents survive a reload", async ({ page }) => {
    await insertTable(page, 2, 2)
    await page.keyboard.type("persisted")
    await waitForSaved(page)
    await page.reload()
    await openDocumentFromTree(page, "Inserts")
    await expect(editor(page).locator("table")).toHaveCount(1)
    await expect(editor(page).locator("table th, table td").first()).toHaveText("persisted")
  })

  test("invalid table sizes are rejected without inserting", async ({ page }) => {
    await openMenu(page, "Insert")
    await page.getByRole("button", { name: "Insert table…", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Insert table" })
    await dialog.getByLabel("Rows").fill("0")
    await expect(dialog.getByRole("button", { name: "Insert table" })).toBeDisabled()
    await dialog.getByLabel("Rows").fill("100")
    await dialog.getByLabel("Columns").fill("100")
    await expect(dialog.getByRole("button", { name: "Insert table" })).toBeDisabled()
  })
})

test.describe("quotes, code and rules", () => {
  test("block quote and code block insert around typed text", async ({ page }) => {
    await page.keyboard.type("quote text")
    await clickToolbar(page, "Block quote")
    await expect(editor(page).locator("blockquote")).toHaveText("quote text")
    await page.keyboard.press("Enter")
    await page.keyboard.press("Enter")
    await page.keyboard.type("after quote")
    await expect(editor(page).locator("blockquote")).toHaveText("quote text")
    await expect(editor(page)).toContainText("after quote")
  })

  test("code block keeps whitespace and persists", async ({ page }) => {
    await clickToolbar(page, "Code block")
    await page.keyboard.type("if (a) {")
    await page.keyboard.press("Enter")
    await page.keyboard.type("  return 1")
    await waitForSaved(page)
    await page.reload()
    await openDocumentFromTree(page, "Inserts")
    await expect(editor(page).locator("pre code")).toContainText("if (a) {")
    await expect(editor(page).locator("pre code")).toContainText("  return 1")
  })

  test("horizontal line is inserted from the Insert menu", async ({ page }) => {
    await page.keyboard.type("top")
    await openMenu(page, "Insert")
    await page.getByRole("button", { name: "Horizontal line" }).click()
    await expect(editor(page).locator("hr")).toHaveCount(1)
  })

  test("inline math renders and is editable", async ({ page }) => {
    await page.keyboard.type("$$x^2$$ ")
    await expect(editor(page).locator(".tiptap-mathematics-render, .katex").first()).toBeVisible()
  })

  test("table toolbar buttons only appear inside a table", async ({ page }) => {
    await expect(toolbarButton(page, "Add table row")).toHaveCount(0)
  })
})
