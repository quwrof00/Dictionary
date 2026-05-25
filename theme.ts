export type ThemeId = "light" | "dark-novel" | "dark-slate" | "dark-oled"

export interface ThemeColors {
  id: ThemeId
  name: string
  isDark: boolean
  bg: string
  textMain: string
  textSecondary: string
  accent: string
  pdfBg: string
  pdfFg: string
}

export const THEMES: Record<ThemeId, ThemeColors> = {
  "light": {
    id: "light",
    name: "Light Mode",
    isDark: false,
    bg: "#ffffff",
    textMain: "#0f172a",
    textSecondary: "#475569",
    accent: "#3b82f6",
    pdfBg: "#ffffff",
    pdfFg: "#000000"
  },
  "dark-novel": {
    id: "dark-novel",
    name: "Novel (Warm Dark)",
    isDark: true,
    bg: "#1F1F1F",
    textMain: "#E6D7B8",
    textSecondary: "#B8A98A",
    accent: "#D4A373",
    pdfBg: "#1F1F1F",
    pdfFg: "#E6D7B8"
  },
  "dark-slate": {
    id: "dark-slate",
    name: "Slate (Cool Dark)",
    isDark: true,
    bg: "#1e293b",
    textMain: "#f8fafc",
    textSecondary: "#94a3b8",
    accent: "#86EFAC",
    pdfBg: "#0f172a",
    pdfFg: "#f8fafc"
  },
  "dark-oled": {
    id: "dark-oled",
    name: "OLED (Pure Black)",
    isDark: true,
    bg: "#000000",
    textMain: "#E5E5E5",
    textSecondary: "#A3A3A3",
    accent: "#86EFAC",
    pdfBg: "#000000",
    pdfFg: "#E5E5E5"
  }
}

export const DEFAULT_THEME: ThemeId = "dark-novel"
