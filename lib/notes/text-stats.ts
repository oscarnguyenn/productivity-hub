export interface TextStats {
  words: number
  characters: number
  charactersNoSpaces: number
}

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null

function countGraphemes(text: string): number {
  if (!text) return 0
  if (segmenter) return Array.from(segmenter.segment(text)).length
  return Array.from(text).length
}

/**
 * Counts what a reader would count. `text` is the document text with blocks separated by line breaks;
 * line breaks themselves are not characters, and emoji or accented letters count once.
 */
export function computeTextStats(text: string): TextStats {
  const flat = text.replace(/[\r\n\u2028\u2029]+/g, "")
  const words = text.split(/\s+/).filter(Boolean).length
  return {
    words,
    characters: countGraphemes(flat),
    charactersNoSpaces: countGraphemes(flat.replace(/\s+/g, "")),
  }
}

export function pluralise(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`
}

export function formatTextStats(stats: Pick<TextStats, "words" | "characters">): string {
  return `${pluralise(stats.words, "word")} · ${pluralise(stats.characters, "character")}`
}
