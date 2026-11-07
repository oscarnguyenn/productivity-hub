export interface JsonNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  content?: JsonNode[]
}

export const NOTE_LINK_PREFIX = "note://"

export const emptyDocContent = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph", content: [] }],
})

export function parseContent(content: string | undefined): JsonNode | null {
  if (!content) return null
  try {
    const parsed: unknown = JSON.parse(content)
    return parsed && typeof parsed === "object" ? (parsed as JsonNode) : null
  } catch {
    return null
  }
}

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "listItem",
  "taskItem",
  "blockquote",
  "codeBlock",
  "tableCell",
  "tableHeader",
  "blockMath",
])

function walkText(node: JsonNode, out: string[]) {
  if (node.type === "text" && node.text) out.push(node.text)
  if ((node.type === "inlineMath" || node.type === "blockMath") && typeof node.attrs?.latex === "string") {
    out.push(node.attrs.latex)
  }
  if (node.content) for (const child of node.content) walkText(child, out)
  if (node.type && BLOCK_TYPES.has(node.type)) out.push("\n")
}

const textCache = new Map<string, { content: string; text: string }>()

// Plain text of a document, cached per document id and content string so search stays fast.
export function extractText(id: string, content: string | undefined): string {
  if (!content) return ""
  const cached = textCache.get(id)
  if (cached && cached.content === content) return cached.text
  const root = parseContent(content)
  let text = content
  if (root) {
    const parts: string[] = []
    walkText(root, parts)
    text = parts.join("").replace(/[ \t]*\n[ \t\n]*/g, "\n").trim()
  }
  textCache.set(id, { content, text })
  return text
}

const linkCache = new Map<string, { content: string; links: string[] }>()

export function extractLinks(content: string | undefined, id?: string): string[] {
  if (id) {
    const cached = linkCache.get(id)
    if (cached && cached.content === content) return cached.links
  }
  const root = parseContent(content)
  if (!root) return []
  const ids = new Set<string>()
  const visit = (node: JsonNode) => {
    for (const mark of node.marks ?? []) {
      const href = mark.type === "link" ? mark.attrs?.href : undefined
      if (typeof href === "string" && href.startsWith(NOTE_LINK_PREFIX)) {
        ids.add(href.slice(NOTE_LINK_PREFIX.length))
      }
    }
    node.content?.forEach(visit)
  }
  visit(root)
  const links = [...ids]
  if (id && content) linkCache.set(id, { content, links })
  return links
}

export interface OutlineItem {
  level: number
  text: string
  index: number
}

export function extractOutline(content: string | undefined): OutlineItem[] {
  const root = parseContent(content)
  if (!root) return []
  const items: OutlineItem[] = []
  const visit = (node: JsonNode) => {
    if (node.type === "heading") {
      const parts: string[] = []
      walkText(node, parts)
      const text = parts.join("").trim()
      items.push({ level: Number(node.attrs?.level ?? 1), text: text || "Untitled heading", index: items.length })
    } else {
      node.content?.forEach(visit)
    }
  }
  visit(root)
  return items
}

type TitleLookup = (id: string) => string | undefined

function inlineToMarkdown(nodes: JsonNode[] | undefined, titleFor: TitleLookup): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "hardBreak") return "  \n"
      if (node.type === "inlineMath") return `$${String(node.attrs?.latex ?? "")}$`
      if (node.type === "image") return `![${String(node.attrs?.alt ?? "")}](${String(node.attrs?.src ?? "")})`
      let text = node.text ?? ""
      if (!text) return ""
      const marks = node.marks ?? []
      const has = (type: string) => marks.some((mark) => mark.type === type)
      if (has("code")) text = `\`${text}\``
      if (has("bold")) text = `**${text}**`
      if (has("italic")) text = `*${text}*`
      if (has("strike")) text = `~~${text}~~`
      const link = marks.find((mark) => mark.type === "link")
      const href = typeof link?.attrs?.href === "string" ? link.attrs.href : null
      if (href?.startsWith(NOTE_LINK_PREFIX)) {
        const target = titleFor(href.slice(NOTE_LINK_PREFIX.length))
        return target ? `[[${target}]]` : text
      }
      return href ? `[${text}](${href})` : text
    })
    .join("")
}

function blockToMarkdown(node: JsonNode, indent: string, titleFor: TitleLookup): string {
  const children = node.content ?? []
  switch (node.type) {
    case "heading":
      return `${"#".repeat(Number(node.attrs?.level ?? 1))} ${inlineToMarkdown(children, titleFor)}`
    case "paragraph":
      return indent + inlineToMarkdown(children, titleFor)
    case "blockquote":
      return children
        .map((child) => blockToMarkdown(child, "", titleFor))
        .join("\n\n")
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")
    case "codeBlock":
      return `\`\`\`${String(node.attrs?.language ?? "")}\n${children.map((child) => child.text ?? "").join("")}\n\`\`\``
    case "horizontalRule":
      return "---"
    case "blockMath":
      return `$$\n${String(node.attrs?.latex ?? "")}\n$$`
    case "image":
      return `![${String(node.attrs?.alt ?? "")}](${String(node.attrs?.src ?? "")})`
    case "attachment":
      return `[${String(node.attrs?.name ?? "attachment")}](${String(node.attrs?.data ?? "")})`
    case "bulletList":
    case "orderedList":
    case "taskList":
      return children
        .map((item, index) => {
          const marker =
            node.type === "orderedList"
              ? `${index + 1}. `
              : node.type === "taskList"
                ? `- [${item.attrs?.checked ? "x" : " "}] `
                : "- "
          const [first, ...rest] = item.content ?? []
          const head = first ? blockToMarkdown(first, "", titleFor) : ""
          const tail = rest.map((child) => blockToMarkdown(child, indent + "  ", titleFor)).join("\n")
          return `${indent}${marker}${head}${tail ? `\n${tail}` : ""}`
        })
        .join("\n")
    case "table": {
      const rows = children.map((row) =>
        (row.content ?? []).map((cell) =>
          (cell.content ?? [])
            .map((child) => blockToMarkdown(child, "", titleFor))
            .join(" ")
            .replace(/\|/g, "\\|")
            .replace(/\n/g, " ")
        )
      )
      if (rows.length === 0) return ""
      const width = Math.max(...rows.map((row) => row.length))
      const pad = (row: string[]) => `| ${Array.from({ length: width }, (_, i) => row[i] ?? "").join(" | ")} |`
      return [pad(rows[0]), `| ${Array(width).fill("---").join(" | ")} |`, ...rows.slice(1).map(pad)].join("\n")
    }
    default:
      return children.map((child) => blockToMarkdown(child, indent, titleFor)).join("\n\n")
  }
}

export function toMarkdown(title: string, content: string | undefined, titleFor: TitleLookup): string {
  const root = parseContent(content)
  const body = (root?.content ?? []).map((node) => blockToMarkdown(node, "", titleFor)).filter(Boolean).join("\n\n")
  return `# ${title}\n\n${body}\n`
}

function parseInline(text: string): JsonNode[] {
  const nodes: JsonNode[] = []
  const pattern = /(\*\*[^*]+\*\*|~~[^~]+~~|\*[^*]+\*|`[^`]+`|\$[^$\n]+\$|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) nodes.push({ type: "text", text: text.slice(last, index) })
    const token = match[0]
    if (token.startsWith("**")) nodes.push({ type: "text", text: token.slice(2, -2), marks: [{ type: "bold" }] })
    else if (token.startsWith("~~")) nodes.push({ type: "text", text: token.slice(2, -2), marks: [{ type: "strike" }] })
    else if (token.startsWith("*")) nodes.push({ type: "text", text: token.slice(1, -1), marks: [{ type: "italic" }] })
    else if (token.startsWith("`")) nodes.push({ type: "text", text: token.slice(1, -1), marks: [{ type: "code" }] })
    else if (token.startsWith("$")) nodes.push({ type: "inlineMath", attrs: { latex: token.slice(1, -1) } })
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
      if (link) nodes.push({ type: "text", text: link[1], marks: [{ type: "link", attrs: { href: link[2] } }] })
    }
    last = index + token.length
  }
  if (last < text.length) nodes.push({ type: "text", text: text.slice(last) })
  return nodes
}

const paragraph = (text: string): JsonNode => ({ type: "paragraph", content: parseInline(text) })

// Small Markdown subset importer: headings, lists, tasks, quotes, code fences, rules, math blocks, paragraphs.
export function markdownToContent(markdown: string): { title: string | null; content: string } {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n")
  const blocks: JsonNode[] = []
  let title: string | null = null
  let index = 0

  const listItem = (text: string): JsonNode => ({ type: "listItem", content: [paragraph(text)] })

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index++
      continue
    }
    const fence = /^```(\w*)/.exec(line)
    if (fence) {
      const code: string[] = []
      index++
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++])
      index++
      blocks.push({
        type: "codeBlock",
        attrs: { language: fence[1] || null },
        content: code.length ? [{ type: "text", text: code.join("\n") }] : [],
      })
      continue
    }
    if (line.trim() === "$$") {
      const math: string[] = []
      index++
      while (index < lines.length && lines[index].trim() !== "$$") math.push(lines[index++])
      index++
      blocks.push({ type: "blockMath", attrs: { latex: math.join("\n") } })
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = Math.min(heading[1].length, 3)
      if (title === null && heading[1].length === 1) title = heading[2].trim()
      else blocks.push({ type: "heading", attrs: { level }, content: parseInline(heading[2]) })
      index++
      continue
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ type: "horizontalRule" })
      index++
      continue
    }
    if (line.startsWith(">")) {
      const quote: string[] = []
      while (index < lines.length && lines[index].startsWith(">")) quote.push(lines[index++].replace(/^>\s?/, ""))
      blocks.push({ type: "blockquote", content: [paragraph(quote.join(" "))] })
      continue
    }
    if (/^\s*[-*+]\s+\[[ xX]\]\s/.test(line)) {
      const items: JsonNode[] = []
      while (index < lines.length && /^\s*[-*+]\s+\[[ xX]\]\s/.test(lines[index])) {
        const match = /^\s*[-*+]\s+\[([ xX])\]\s(.*)$/.exec(lines[index++])
        if (match) items.push({ type: "taskItem", attrs: { checked: match[1] !== " " }, content: [paragraph(match[2])] })
      }
      blocks.push({ type: "taskList", content: items })
      continue
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: JsonNode[] = []
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(listItem(lines[index++].replace(/^\s*[-*+]\s+/, "")))
      }
      blocks.push({ type: "bulletList", content: items })
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: JsonNode[] = []
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(listItem(lines[index++].replace(/^\s*\d+\.\s+/, "")))
      }
      blocks.push({ type: "orderedList", content: items })
      continue
    }
    const paragraphLines: string[] = []
    while (index < lines.length && lines[index].trim() && !/^(#{1,6}\s|```|>|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[index])) {
      paragraphLines.push(lines[index++].trim())
    }
    if (paragraphLines.length === 0) paragraphLines.push(lines[index++])
    blocks.push(paragraph(paragraphLines.join(" ")))
  }

  return {
    title,
    content: JSON.stringify({ type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] }),
  }
}
