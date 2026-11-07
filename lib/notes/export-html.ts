import katex from "katex"

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

// Filenames that are valid on Windows, macOS and Linux.
export function safeFileName(title: string, extension: string, fallback = "document"): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 120)
    .trim()
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned)
  return `${cleaned && !reserved ? cleaned : fallback}.${extension}`
}

// The editor stores maths as an empty element carrying its LaTeX; render it as MathML so the export needs no scripts or fonts.
export function renderMathForExport(html: string): string {
  if (typeof DOMParser === "undefined" || !html.includes("data-latex")) return html
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html")
  parsed.querySelectorAll<HTMLElement>("[data-type='inline-math'], [data-type='block-math']").forEach((element) => {
    const latex = element.getAttribute("data-latex") ?? ""
    try {
      element.innerHTML = katex.renderToString(latex, {
        displayMode: element.getAttribute("data-type") === "block-math",
        output: "mathml",
        throwOnError: false,
      })
    } catch {
      element.textContent = latex
    }
  })
  return parsed.body.innerHTML
}

const exportStyles = `
body{font-family:Arial,Helvetica,sans-serif;font-size:12pt;line-height:1.6;color:#18181b;max-width:816px;margin:0 auto;padding:48px 24px}
h1,h2,h3{line-height:1.25}
img{max-width:100%;height:auto}
table{border-collapse:collapse;max-width:100%}
th,td{border:1px solid #d4d4d8;padding:6px 10px;vertical-align:top}
th{background:#f4f4f5;text-align:left}
blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #d4d4d8;color:#52525b}
pre{background:#f4f4f5;padding:12px 16px;border-radius:6px;overflow-x:auto}
code{font-family:Consolas,Menlo,monospace}
ul[data-type="taskList"]{list-style:none;padding-left:0}
ul[data-type="taskList"] li{display:flex;gap:8px}
a{color:#2563eb}
mark{background:#fff176}
`.trim()

export function buildHtmlDocument(title: string, bodyHtml: string): string {
  const heading = title.trim() || "Untitled document"
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(heading)}</title>
<style>
${exportStyles}
</style>
</head>
<body>
${renderMathForExport(bodyHtml)}
</body>
</html>
`
}
