import { describe, expect, it } from "vitest"
import { computeTextStats, formatTextStats, pluralise } from "@/lib/notes/text-stats"

describe("computeTextStats", () => {
  it("counts nothing in an empty document", () => {
    expect(computeTextStats("")).toEqual({ words: 0, characters: 0, charactersNoSpaces: 0 })
  })

  it("does not count blank paragraphs (the 0 words · 2 characters bug)", () => {
    expect(computeTextStats("\n\n")).toEqual({ words: 0, characters: 0, charactersNoSpaces: 0 })
    expect(computeTextStats("\n")).toEqual({ words: 0, characters: 0, charactersNoSpaces: 0 })
  })

  it("counts one character and one word", () => {
    expect(computeTextStats("a")).toEqual({ words: 1, characters: 1, charactersNoSpaces: 1 })
  })

  it("treats repeated spaces as one separator but still counts them as characters", () => {
    expect(computeTextStats("a   b")).toEqual({ words: 2, characters: 5, charactersNoSpaces: 2 })
  })

  it("does not count paragraph separators as characters but still splits words", () => {
    expect(computeTextStats("one\ntwo three")).toEqual({ words: 3, characters: 12, charactersNoSpaces: 11 })
  })

  it("handles Windows and Unicode line breaks", () => {
    expect(computeTextStats("a\r\nb\u2028c").words).toBe(3)
    expect(computeTextStats("a\r\nb\u2028c").characters).toBe(3)
  })

  it("counts punctuation, numbers and accented letters", () => {
    expect(computeTextStats("Hello, world! 123 456 café ñ #tag")).toMatchObject({ words: 7, characters: 33 })
  })

  it("counts each emoji, including skin tones and ZWJ sequences, once", () => {
    expect(computeTextStats("hi 😀👍🏽")).toMatchObject({ words: 2, characters: 5 })
    expect(computeTextStats("👨‍👩‍👧‍👦").characters).toBe(1)
  })
})

describe("formatting", () => {
  it("pluralises correctly", () => {
    expect(pluralise(1, "word")).toBe("1 word")
    expect(pluralise(0, "word")).toBe("0 words")
    expect(formatTextStats({ words: 1, characters: 1 })).toBe("1 word · 1 character")
    expect(formatTextStats({ words: 2, characters: 11 })).toBe("2 words · 11 characters")
  })
})
