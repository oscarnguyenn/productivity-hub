export type ColorTheme = "default" | "ocean" | "lavender" | "forest" | "sunset" | "rose"
export type ThemeMode = "light" | "dark" | "system"

export const colorThemes: {
  id: ColorTheme
  name: string
  description: string
  colors: [string, string, string]
}[] = [
  { id: "default", name: "Midnight", description: "Calm charcoal with soft neutrals", colors: ["#18181b", "#f4f4f5", "#a1a1aa"] },
  { id: "ocean", name: "Ocean", description: "Cool blue with crisp sky accents", colors: ["#0369a1", "#e0f2fe", "#38bdf8"] },
  { id: "lavender", name: "Lavender", description: "Soft violet with a little whimsy", colors: ["#7c3aed", "#ede9fe", "#a78bfa"] },
  { id: "forest", name: "Forest", description: "Grounded green and warm paper", colors: ["#15803d", "#dcfce7", "#4ade80"] },
  { id: "sunset", name: "Sunset", description: "Warm terracotta with golden light", colors: ["#c2410c", "#ffedd5", "#fb923c"] },
  { id: "rose", name: "Rose", description: "Soft rose with a polished finish", colors: ["#be123c", "#ffe4e6", "#fb7185"] },
]

export function isColorTheme(value: unknown): value is ColorTheme {
  return colorThemes.some((theme) => theme.id === value)
}

export function applyAppearance(mode: ThemeMode, colorTheme: ColorTheme) {
  const root = document.documentElement
  const isDark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  root.classList.toggle("dark", isDark)
  if (colorTheme === "default") {
    root.removeAttribute("data-color-theme")
  } else {
    root.dataset.colorTheme = colorTheme
  }
}

export function getStoredColorTheme(): ColorTheme {
  try {
    const saved = window.localStorage.getItem("color-theme")
    return isColorTheme(saved) ? saved : "default"
  } catch {
    return "default"
  }
}
