import { describe, expect, it } from "vitest"
import { normaliseLinkUrl } from "@/lib/notes/link-url"

describe("normaliseLinkUrl", () => {
  it("returns an empty string for blank input", () => {
    expect(normaliseLinkUrl("")).toBe("")
    expect(normaliseLinkUrl("   ")).toBe("")
  })

  it("adds https:// to bare domains", () => {
    expect(normaliseLinkUrl("example.com")).toBe("https://example.com")
    expect(normaliseLinkUrl(" www.example.com/path ")).toBe("https://www.example.com/path")
    expect(normaliseLinkUrl("localhost:3000/app")).toBe("https://localhost:3000/app")
  })

  it("leaves URLs that already have a scheme alone", () => {
    expect(normaliseLinkUrl("https://example.com")).toBe("https://example.com")
    expect(normaliseLinkUrl("http://example.com")).toBe("http://example.com")
    expect(normaliseLinkUrl("mailto:me@example.com")).toBe("mailto:me@example.com")
    expect(normaliseLinkUrl("tel:+441234567")).toBe("tel:+441234567")
    expect(normaliseLinkUrl("note://abc")).toBe("note://abc")
  })

  it("leaves in-page anchors and relative paths alone", () => {
    expect(normaliseLinkUrl("#section")).toBe("#section")
    expect(normaliseLinkUrl("/notes/one")).toBe("/notes/one")
    expect(normaliseLinkUrl("./two")).toBe("./two")
    expect(normaliseLinkUrl("../three")).toBe("../three")
    expect(normaliseLinkUrl("?q=1")).toBe("?q=1")
  })

  it("turns bare email addresses into mailto links", () => {
    expect(normaliseLinkUrl("me@example.com")).toBe("mailto:me@example.com")
  })
})
