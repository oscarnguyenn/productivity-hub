import { expect, test, type Page } from "@playwright/test"
import { counterText, createDocument, editor, toolbarButton } from "./helpers"

async function setup(page: Page) {
  const { openNotes } = await import("./helpers")
  await openNotes(page)
  await createDocument(page, "Counter")
}

test.describe("word and character counter", () => {
  test("empty document shows zero words and zero characters", async ({ page }) => {
    await setup(page)
    expect(await counterText(page)).toBe("0 words · 0 characters")
  })

  test("blank paragraphs do not count as characters", async ({ page }) => {
    await setup(page)
    await page.keyboard.press("Enter")
    await page.keyboard.press("Enter")
    expect(await counterText(page)).toBe("0 words · 0 characters")
  })

  test("one character and one word are singular", async ({ page }) => {
    await setup(page)
    await page.keyboard.type("a")
    await expect.poll(() => counterText(page)).toBe("1 word · 1 character")
  })

  test("counts update immediately while typing", async ({ page }) => {
    await setup(page)
    await page.keyboard.type("hello world")
    await expect.poll(() => counterText(page), { timeout: 1000 }).toBe("2 words · 11 characters")
  })

  test("multiple spaces never create extra words", async ({ page }) => {
    await setup(page)
    await page.keyboard.type("a   b")
    await expect.poll(() => counterText(page)).toBe("2 words · 5 characters")
  })

  test("paragraph breaks separate words but add no characters", async ({ page }) => {
    await setup(page)
    await page.keyboard.type("one")
    await page.keyboard.press("Enter")
    await page.keyboard.type("two three")
    await expect.poll(() => counterText(page)).toBe("3 words · 12 characters")
  })

  test("punctuation, numbers and special characters", async ({ page }) => {
    await setup(page)
    await page.keyboard.type("Hello, world! 123 456 café ñ #tag")
    await expect.poll(() => counterText(page)).toBe("7 words · 33 characters")
  })

  test("emoji count as one character each", async ({ page }) => {
    await setup(page)
    await page.keyboard.type("hi ")
    await page.keyboard.insertText("😀👍🏽")
    await expect.poll(() => counterText(page)).toBe("2 words · 5 characters")
  })

  test("formatting does not change the counts", async ({ page }) => {
    await setup(page)
    await page.keyboard.type("bold words here")
    await page.keyboard.press("Control+A")
    await toolbarButton(page, "Bold (Ctrl+B)").click()
    await expect.poll(() => counterText(page)).toBe("3 words · 15 characters")
  })

  test("pasted content is counted", async ({ page }) => {
    await setup(page)
    await page.evaluate(() => {
      const el = document.querySelector(".ProseMirror[contenteditable]") as HTMLElement
      el.focus()
      const data = new DataTransfer()
      data.setData("text/plain", "alpha beta\n\ngamma")
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
    })
    await expect.poll(() => counterText(page)).toBe("3 words · 15 characters")
  })

  test("deleting everything returns to zero", async ({ page }) => {
    await setup(page)
    await page.keyboard.type("temporary text")
    await page.keyboard.press("Control+A")
    await page.keyboard.press("Delete")
    await expect(editor(page)).toHaveText("")
    await expect.poll(() => counterText(page)).toBe("0 words · 0 characters")
  })

  test("the Word count dialog agrees with the toolbar counter", async ({ page }) => {
    await setup(page)
    await page.keyboard.type("one two")
    await page.keyboard.press("Enter")
    await page.keyboard.type("three")
    await page.getByRole("button", { name: /^Tools/ }).click()
    await page.getByRole("button", { name: "Word count" }).click()
    const dialog = page.getByRole("dialog", { name: /Word count/ }).or(page.locator("[role=dialog]").filter({ hasText: "Word count" }))
    await expect(dialog.getByText("Words", { exact: true }).locator("..").locator("strong")).toHaveText("3")
    await expect(dialog.getByText("Characters", { exact: true }).locator("..").locator("strong")).toHaveText("12")
    await expect(dialog.getByText("Characters without spaces").locator("..").locator("strong")).toHaveText("11")
  })
})
