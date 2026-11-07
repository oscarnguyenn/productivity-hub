import { expect, test } from "@playwright/test"
import {
  clickToolbar,
  createDocument,
  editor,
  openDocumentFromTree,
  openNotes,
  pasteHtml,
  selectText,
  toolbarButton,
  waitForSaved,
} from "./helpers"

test.beforeEach(async ({ page }) => {
  await openNotes(page)
  await createDocument(page, "Formatting")
})

const marks = [
  { name: "Bold (Ctrl+B)", selector: "strong" },
  { name: "Italic (Ctrl+I)", selector: "em" },
  { name: "Underline (Ctrl+U)", selector: "u" },
  { name: "Strikethrough", selector: "s" },
]

test.describe("inline marks", () => {
  for (const { name, selector } of marks) {
    test(`${name} applies to the selection only and can be removed`, async ({ page }) => {
      await page.keyboard.type("one two three")
      await selectText(page, "two")
      await toolbarButton(page, name).click()
      await expect(editor(page).locator(selector)).toHaveText("two")
      await expect(editor(page)).toHaveText("one two three")
      await toolbarButton(page, name).click()
      await expect(editor(page).locator(selector)).toHaveCount(0)
    })

    test(`${name} applied before typing affects only new text`, async ({ page }) => {
      await page.keyboard.type("plain ")
      await clickToolbar(page, name)
      await page.keyboard.type("styled")
      await clickToolbar(page, name)
      await page.keyboard.type(" plain")
      await expect(editor(page).locator(selector)).toHaveText("styled")
      await expect(editor(page)).toHaveText("plain styled plain")
    })
  }

  test("toolbar clicks keep the selection so typing replaces it", async ({ page }) => {
    await page.keyboard.type("keep this word")
    await selectText(page, "this")
    await clickToolbar(page, "Bold (Ctrl+B)")
    await page.keyboard.type("THAT")
    await expect(editor(page)).toHaveText("keep THAT word")
  })

  test("several marks can be combined on one selection", async ({ page }) => {
    await page.keyboard.type("combo")
    await page.keyboard.press("Control+A")
    for (const { name } of marks) await toolbarButton(page, name).click()
    for (const { selector } of marks) await expect(editor(page).locator(selector)).toHaveCount(1)
  })

  test("formatting spans multiple paragraphs", async ({ page }) => {
    await page.keyboard.type("first")
    await page.keyboard.press("Enter")
    await page.keyboard.type("second")
    await page.keyboard.press("Control+A")
    await toolbarButton(page, "Bold (Ctrl+B)").click()
    await expect(editor(page).locator("p strong")).toHaveCount(2)
  })

  test("active state is exposed on the toolbar button", async ({ page }) => {
    await page.keyboard.type("state")
    await page.keyboard.press("Control+A")
    await toolbarButton(page, "Bold (Ctrl+B)").click()
    await expect(toolbarButton(page, "Bold (Ctrl+B)")).toHaveAttribute("aria-pressed", "true")
    await toolbarButton(page, "Bold (Ctrl+B)").click()
    await expect(toolbarButton(page, "Bold (Ctrl+B)")).toHaveAttribute("aria-pressed", "false")
  })

  test("formatting persists across reload", async ({ page }) => {
    await page.keyboard.type("keep style")
    await page.keyboard.press("Control+A")
    await toolbarButton(page, "Bold (Ctrl+B)").click()
    await toolbarButton(page, "Italic (Ctrl+I)").click()
    await waitForSaved(page)
    await page.reload()
    await openDocumentFromTree(page, "Formatting")
    await expect(editor(page).locator("strong em, em strong")).toHaveText("keep style")
  })
})

test.describe("block formatting", () => {
  for (const level of [1, 2, 3]) {
    test(`Heading ${level} via the Text style menu, then back to Normal text`, async ({ page }) => {
      await page.keyboard.type("Title")
      await page.getByLabel("Text style").selectOption(String(level))
      await expect(editor(page).locator(`h${level}`)).toHaveText("Title")
      await page.getByLabel("Text style").selectOption("")
      await expect(editor(page).locator(`h${level}`)).toHaveCount(0)
      await expect(editor(page).locator("p").filter({ hasText: /\S/ })).toHaveText("Title")
    })
  }

  test("a heading only affects its own paragraph", async ({ page }) => {
    await page.keyboard.type("keep")
    await page.keyboard.press("Enter")
    await page.keyboard.type("head")
    await page.getByLabel("Text style").selectOption("2")
    await expect(editor(page).locator("p").filter({ hasText: /\S/ })).toHaveText("keep")
    await expect(editor(page).locator("h2")).toHaveText("head")
  })

  test("bulleted, numbered and checklist toggle on and off", async ({ page }) => {
    await page.keyboard.type("item")
    for (const [name, selector] of [
      ["Bulleted list", "ul:not([data-type=taskList]) li"],
      ["Numbered list", "ol li"],
      ["Checklist", "ul[data-type=taskList] li"],
    ] as const) {
      await toolbarButton(page, name).click()
      await expect(editor(page).locator(selector)).toContainText("item")
      await toolbarButton(page, name).click()
      await expect(editor(page).locator(selector)).toHaveCount(0)
      await expect(editor(page)).toContainText("item")
    }
  })

  test("a block quote can be added and removed", async ({ page }) => {
    await page.keyboard.type("quoted")
    await toolbarButton(page, "Block quote").click()
    await expect(editor(page).locator("blockquote")).toHaveText("quoted")
    await toolbarButton(page, "Block quote").click()
    await expect(editor(page).locator("blockquote")).toHaveCount(0)
    await expect(editor(page)).toHaveText("quoted")
  })

  test("a code block can be added and removed", async ({ page }) => {
    await page.keyboard.type("const a = 1")
    await toolbarButton(page, "Code block").click()
    await expect(editor(page).locator("pre code")).toHaveText("const a = 1")
    await toolbarButton(page, "Code block").click()
    await expect(editor(page).locator("pre")).toHaveCount(0)
  })

  for (const [button, value] of [
    ["Align center", "center"],
    ["Align right", "right"],
    ["Justify", "justify"],
    ["Align left", "left"],
  ] as const) {
    test(`${button} sets text-align: ${value}`, async ({ page }) => {
      await page.keyboard.type("aligned")
      await toolbarButton(page, button).click()
      await expect(editor(page).locator("p")).toHaveCSS("text-align", value)
    })
  }

  test("Clear formatting removes marks but never text", async ({ page }) => {
    await page.keyboard.type("styled text")
    await page.keyboard.press("Control+A")
    await toolbarButton(page, "Bold (Ctrl+B)").click()
    await toolbarButton(page, "Italic (Ctrl+I)").click()
    await page.getByLabel("Text color").fill("#ff0000")
    await toolbarButton(page, "Clear formatting").click()
    await expect(editor(page)).toHaveText("styled text")
    await expect(editor(page).locator("strong, em, [style*=color]")).toHaveCount(0)
  })

  test("Clear formatting on a heading returns it to normal text", async ({ page }) => {
    await page.keyboard.type("Big")
    await page.getByLabel("Text style").selectOption("1")
    await toolbarButton(page, "Clear formatting").click()
    await expect(editor(page).locator("h1")).toHaveCount(0)
    await expect(editor(page)).toHaveText("Big")
  })
})

test.describe("fonts and colours", () => {
  test("font family can be changed and reverted to the default", async ({ page }) => {
    await page.keyboard.type("fonts")
    await page.keyboard.press("Control+A")
    await page.getByLabel("Font family").selectOption("Georgia")
    await expect(editor(page).locator("span[style*='Georgia']")).toHaveText("fonts")
    await page.getByLabel("Font family").selectOption({ label: "Arial" })
    await expect(editor(page).locator("span[style*='font-family']")).toHaveCount(0)
  })

  test("font size buttons and the size field apply a size to the selection", async ({ page }) => {
    await page.keyboard.type("sized")
    await page.keyboard.press("Control+A")
    await toolbarButton(page, "Increase font size").click()
    await expect(editor(page).locator("span[style*='font-size: 13pt']")).toHaveText("sized")
    const sizeField = page.getByRole("spinbutton", { name: "Font size" })
    await sizeField.fill("20")
    await sizeField.press("Enter")
    await expect(editor(page).locator("span[style*='font-size: 20pt']")).toHaveText("sized")
  })

  test("tabbing through the font size field does not restyle the text", async ({ page }) => {
    await page.keyboard.type("untouched")
    await page.keyboard.press("Control+A")
    const sizeField = page.getByRole("spinbutton", { name: "Font size" })
    await sizeField.focus()
    await sizeField.blur()
    await expect(editor(page).locator("span[style*='font-size']")).toHaveCount(0)
  })

  test("font size applies only to the selection", async ({ page }) => {
    await page.keyboard.type("small BIG small")
    await selectText(page, "BIG")
    await toolbarButton(page, "Increase font size").click()
    await expect(editor(page).locator("span[style*='font-size']")).toHaveText("BIG")
  })

  test("text colour and highlight colour apply to the selection", async ({ page }) => {
    await page.keyboard.type("plain colour plain")
    await selectText(page, "colour")
    await page.getByLabel("Text color").fill("#ff0000")
    await expect(editor(page).locator("span[style*='color']")).toHaveText("colour")
    await selectText(page, "colour")
    await page.getByRole("button", { name: "Choose highlight color" }).click()
    await page.getByRole("button", { name: "Yellow highlight" }).click()
    await expect(editor(page).locator("mark")).toHaveText("colour")
    await selectText(page, "colour")
    await page.getByRole("button", { name: "Choose highlight color" }).click()
    await page.getByRole("button", { name: "Remove highlight" }).click()
    await expect(editor(page).locator("mark")).toHaveCount(0)
  })
})

test.describe("pasting", () => {
  test("pasted rich text keeps bold, italic and links", async ({ page }) => {
    await pasteHtml(page, '<p><strong>bold</strong> and <em>italic</em> and <a href="https://example.com">link</a></p>')
    await expect(editor(page).locator("strong")).toHaveText("bold")
    await expect(editor(page).locator("em")).toHaveText("italic")
    await expect(editor(page).locator("a")).toHaveAttribute("href", "https://example.com")
  })

  test("pasted scripts and event handlers are stripped", async ({ page }) => {
    await pasteHtml(page, '<p onclick="window.__pwn=1">safe</p><script>window.__pwn=2</script><img src="x" onerror="window.__pwn=3">')
    await expect(editor(page)).toContainText("safe")
    await expect(editor(page).locator("script")).toHaveCount(0)
    await expect(editor(page).locator("[onclick], [onerror]")).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { __pwn?: number }).__pwn)).toBeUndefined()
  })

  test("pasting a list and heading keeps structure", async ({ page }) => {
    await pasteHtml(page, "<h2>Heading</h2><ul><li>one</li><li>two</li></ul>")
    await expect(editor(page).locator("h2")).toHaveText("Heading")
    await expect(editor(page).locator("ul li")).toHaveCount(2)
  })
})
