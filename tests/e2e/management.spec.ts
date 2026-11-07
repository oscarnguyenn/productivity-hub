import { expect, test, type Page } from "@playwright/test"
import {
  createDocument,
  createFolder,
  editor,
  flattenStored,
  openDocumentFromTree,
  openNotes,
  storedTree,
  titleInput,
  waitForSaved,
} from "./helpers"

const sidebar = (page: Page) => page.locator("aside")
const treeItem = (page: Page, name: string) => page.getByRole("tree").getByRole("treeitem", { name: new RegExp(`^${name}\\b`) })

async function rowMenu(page: Page, name: string, item: string) {
  await page.getByRole("tree").getByRole("button", { name: `Actions for ${name}`, exact: true }).click()
  await page.getByRole("menuitem", { name: item, exact: true }).click()
}

async function nameDialog(page: Page, name: string, confirm = "Create") {
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("textbox", { name: "Name" }).fill(name)
  await dialog.getByRole("button", { name: confirm }).click()
  await expect(dialog).toBeHidden()
}

async function stored(page: Page) {
  await waitForSaved(page)
  return storedTree(page)
}

test.beforeEach(async ({ page }) => {
  await openNotes(page)
})

test.describe("creating", () => {
  test("a document created inside a folder is stored under that folder", async ({ page }) => {
    await createFolder(page, "Projects")
    await rowMenu(page, "Projects", "New document")
    await nameDialog(page, "Inside")
    await expect(titleInput(page)).toHaveValue("Inside")
    const nodes = flattenStored(await stored(page))
    const folder = nodes.find((node) => node.name === "Projects")!
    const doc = nodes.find((node) => node.name === "Inside")!
    expect(doc.parentId).toBe(folder.id)
    expect(folder.children?.map((child) => child.id)).toContain(doc.id)
  })

  test("a document created inside a collapsed folder is revealed in the tree", async ({ page }) => {
    await createFolder(page, "Hidden")
    await treeItem(page, "Hidden").click()
    await expect(treeItem(page, "Hidden")).toHaveAttribute("aria-expanded", "false")
    await rowMenu(page, "Hidden", "New document")
    await nameDialog(page, "Revealed")
    await expect(treeItem(page, "Revealed")).toBeVisible()
  })

  test("a subfolder can be created inside a folder", async ({ page }) => {
    await createFolder(page, "Parent")
    await rowMenu(page, "Parent", "New subfolder")
    await nameDialog(page, "Child")
    const nodes = flattenStored(await stored(page))
    const parent = nodes.find((node) => node.name === "Parent")!
    const child = nodes.find((node) => node.name === "Child")!
    expect(child.type).toBe("folder")
    expect(child.parentId).toBe(parent.id)
  })

  test("documents with the same name stay independent", async ({ page }) => {
    await createDocument(page, "Twin")
    await page.keyboard.type("first twin")
    await createDocument(page, "Twin")
    await page.keyboard.type("second twin")
    const nodes = flattenStored(await stored(page)).filter((node) => node.name === "Twin")
    expect(nodes).toHaveLength(2)
    expect(nodes[0].id).not.toBe(nodes[1].id)
    expect(JSON.stringify(nodes.map((node) => node.content))).toContain("first twin")
    expect(JSON.stringify(nodes.map((node) => node.content))).toContain("second twin")
  })

  test("every node has a unique id after many creates and duplicates", async ({ page }) => {
    await createFolder(page, "Bulk")
    for (const name of ["One", "Two", "Three"]) await createDocument(page, name)
    await rowMenu(page, "One", "Duplicate")
    await rowMenu(page, "Bulk", "Duplicate")
    const nodes = flattenStored(await stored(page))
    const ids = nodes.map((node) => node.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("an empty name cannot be submitted", async ({ page }) => {
    await page.getByRole("button", { name: "New document" }).first().click()
    const dialog = page.getByRole("dialog")
    await dialog.getByRole("textbox", { name: "Name" }).fill("   ")
    await expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled()
  })
})

test.describe("renaming", () => {
  test("renaming a document updates the tree, tab and title", async ({ page }) => {
    await createDocument(page, "Before")
    await page.keyboard.type("body stays")
    await rowMenu(page, "Before", "Rename")
    const input = page.getByRole("textbox", { name: "Rename Before" })
    await input.fill("After")
    await input.press("Enter")
    await expect(treeItem(page, "After")).toBeVisible()
    await expect(titleInput(page)).toHaveValue("After")
    await expect(page.getByRole("tab", { name: /After/ })).toBeVisible()
    await expect(editor(page)).toContainText("body stays")
  })

  test("renaming a folder keeps its documents", async ({ page }) => {
    await createFolder(page, "Old folder")
    await rowMenu(page, "Old folder", "New document")
    await nameDialog(page, "Kept doc")
    await rowMenu(page, "Old folder", "Rename")
    const input = page.getByRole("textbox", { name: "Rename Old folder" })
    await input.fill("New folder")
    await input.press("Enter")
    await expect(treeItem(page, "New folder")).toBeVisible()
    await expect(treeItem(page, "Kept doc")).toBeVisible()
    const nodes = flattenStored(await stored(page))
    const folder = nodes.find((node) => node.name === "New folder")!
    expect(folder.children?.map((child) => child.name)).toEqual(["Kept doc"])
  })

  test("Escape cancels an inline rename", async ({ page }) => {
    await createDocument(page, "Keep name")
    await rowMenu(page, "Keep name", "Rename")
    const input = page.getByRole("textbox", { name: "Rename Keep name" })
    await input.fill("Discarded")
    await input.press("Escape")
    await expect(treeItem(page, "Keep name")).toBeVisible()
  })

  test("F2 starts renaming the focused row", async ({ page }) => {
    await createDocument(page, "Fast rename")
    await treeItem(page, "Fast rename").focus()
    await page.keyboard.press("F2")
    await expect(page.getByRole("textbox", { name: "Rename Fast rename" })).toBeFocused()
  })
})

test.describe("moving", () => {
  test("Move to… relocates a document without touching its content", async ({ page }) => {
    await createFolder(page, "Target")
    await createDocument(page, "Mover")
    await page.keyboard.type("moving text")
    await rowMenu(page, "Mover", "Move to…")
    await page.getByRole("dialog").getByRole("button", { name: /Target/ }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
    const nodes = flattenStored(await stored(page))
    const folder = nodes.find((node) => node.name === "Target")!
    const doc = nodes.find((node) => node.name === "Mover")!
    expect(doc.parentId).toBe(folder.id)
    expect(doc.content).toContain("moving text")
    expect(nodes.filter((node) => node.name === "Mover")).toHaveLength(1)
  })

  test("dragging a document onto a folder moves it", async ({ page }) => {
    await createFolder(page, "Drop zone")
    await createDocument(page, "Dragged")
    await treeItem(page, "Dragged").dragTo(treeItem(page, "Drop zone"))
    const nodes = flattenStored(await stored(page))
    const folder = nodes.find((node) => node.name === "Drop zone")!
    expect(nodes.find((node) => node.name === "Dragged")!.parentId).toBe(folder.id)
  })

  test("a folder cannot be moved into itself", async ({ page }) => {
    await createFolder(page, "Loop")
    await treeItem(page, "Loop").dragTo(treeItem(page, "Loop"))
    const nodes = flattenStored(await stored(page))
    expect(nodes.filter((node) => node.name === "Loop")).toHaveLength(1)
  })
})

test.describe("duplicating", () => {
  test("a duplicate is a separate document with copied content", async ({ page }) => {
    await createDocument(page, "Original")
    await page.keyboard.type("copy this")
    await waitForSaved(page)
    await rowMenu(page, "Original", "Duplicate")
    const nodes = flattenStored(await stored(page)).filter((node) => node.type === "document" && /Original/.test(node.name))
    expect(nodes).toHaveLength(2)
    expect(nodes[0].id).not.toBe(nodes[1].id)
    for (const node of nodes) expect(node.content).toContain("copy this")
    await editor(page).click()
    await page.keyboard.press("Control+End")
    await page.keyboard.type(" and more")
    const after = flattenStored(await stored(page)).filter((node) => /Original/.test(node.name))
    expect(after.filter((node) => node.content?.includes("and more"))).toHaveLength(1)
  })
})

test.describe("deleting", () => {
  test("deleting a document removes only that document and it stays deleted", async ({ page }) => {
    await createDocument(page, "Doomed")
    await createDocument(page, "Survivor")
    await page.keyboard.type("still here")
    await rowMenu(page, "Doomed", "Delete")
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click()
    await expect(treeItem(page, "Doomed")).toHaveCount(0)
    await expect(treeItem(page, "Survivor")).toBeVisible()
    await waitForSaved(page)
    await page.reload()
    await expect(treeItem(page, "Doomed")).toHaveCount(0)
    await openDocumentFromTree(page, "Survivor")
    await expect(editor(page)).toContainText("still here")
    await expect(treeItem(page, "Welcome to your workspace")).toBeVisible()
  })

  test("cancelling the delete confirmation keeps the document", async ({ page }) => {
    await createDocument(page, "Safe")
    await rowMenu(page, "Safe", "Delete")
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click()
    await expect(treeItem(page, "Safe")).toBeVisible()
  })

  test("deleting a folder removes its contents but nothing else", async ({ page }) => {
    await createFolder(page, "Doomed folder")
    await rowMenu(page, "Doomed folder", "New document")
    await nameDialog(page, "Inner")
    await createDocument(page, "Outside")
    await rowMenu(page, "Doomed folder", "Delete")
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click()
    await expect(treeItem(page, "Doomed folder")).toHaveCount(0)
    await expect(treeItem(page, "Inner")).toHaveCount(0)
    await expect(treeItem(page, "Outside")).toBeVisible()
    const names = flattenStored(await stored(page)).map((node) => node.name)
    expect(names).not.toContain("Inner")
    expect(names).toContain("Outside")
    expect(names).toContain("Weekly study plan")
  })

  test("the folder delete confirmation warns that contents are deleted", async ({ page }) => {
    await createFolder(page, "Warned")
    await rowMenu(page, "Warned", "Delete")
    await expect(page.getByRole("dialog")).toContainText(/contain|inside|all/i)
  })

  test("deleting the active document activates another open tab", async ({ page }) => {
    await createDocument(page, "Tab A")
    await createDocument(page, "Tab B")
    await rowMenu(page, "Tab B", "Delete")
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click()
    await expect(page.getByRole("tab", { name: /Tab A/ })).toHaveAttribute("aria-selected", "true")
    await expect(titleInput(page)).toHaveValue("Tab A")
  })

  test("Delete key on a focused row asks for confirmation", async ({ page }) => {
    await createDocument(page, "Keyed")
    await treeItem(page, "Keyed").focus()
    await page.keyboard.press("Delete")
    await expect(page.getByRole("dialog")).toBeVisible()
  })
})

test.describe("search", () => {
  test("partial, case-insensitive title search narrows results and clearing restores the tree", async ({ page }) => {
    await createDocument(page, "Quarterly budget")
    await createDocument(page, "Holiday plans")
    const search = page.getByLabel("Search notes")
    await search.fill("BUDG")
    await expect(page.getByText(/1 result\b/)).toBeVisible()
    await expect(sidebar(page).getByRole("button", { name: /Quarterly budget/ })).toBeVisible()
    await expect(sidebar(page).getByRole("button", { name: /Holiday plans/ })).toHaveCount(0)
    await page.getByRole("button", { name: "Clear search" }).click()
    await expect(treeItem(page, "Holiday plans")).toBeVisible()
  })

  test("search with no matches says so", async ({ page }) => {
    await page.getByLabel("Search notes").fill("zzzz-nothing")
    await expect(page.getByText(/No notes match/)).toBeVisible()
    await expect(page.getByText(/0 results/)).toBeVisible()
  })

  test("search finds document body text and reflects new edits", async ({ page }) => {
    await createDocument(page, "Searchable")
    await page.keyboard.type("an unmistakable pineapple")
    await page.getByLabel("Search notes").fill("pineapple")
    await expect(sidebar(page).getByRole("button", { name: /Searchable/ })).toBeVisible()
  })

  test("search results open the matching document", async ({ page }) => {
    await createDocument(page, "Findable one")
    await createDocument(page, "Findable two")
    await page.getByLabel("Search notes").fill("Findable one")
    await sidebar(page).getByRole("button", { name: /Findable one/ }).click()
    await expect(titleInput(page)).toHaveValue("Findable one")
  })
})

test.describe("tabs and sessions", () => {
  test("closing and reopening a tab keeps the content", async ({ page }) => {
    await createDocument(page, "Reopen")
    await page.keyboard.type("remember me")
    await createDocument(page, "Other")
    await page.getByRole("button", { name: "Close Reopen" }).click()
    await expect(page.getByRole("tab", { name: /Reopen/ })).toHaveCount(0)
    await openDocumentFromTree(page, "Reopen")
    await expect(editor(page)).toContainText("remember me")
  })

  test("the last edited document reopens after a reload", async ({ page }) => {
    await createDocument(page, "Latest")
    await page.keyboard.type("edited last")
    await waitForSaved(page)
    await page.reload()
    await expect(titleInput(page)).toHaveValue("Latest")
    await expect(editor(page)).toContainText("edited last")
  })
})
