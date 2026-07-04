/** App colour themes + shared annotation palette. */

export type ThemeId = "mac" | "daylight" | "ember" | "aurora" | "violet" | "rose" | "ocean"

export interface ThemeMeta {
  id: ThemeId
  name: string
  description: string
  /** Preview swatch gradient stops */
  swatch: [string, string]
}

export const THEMES: ThemeMeta[] = [
  { id: "mac",      name: "Automatic", description: "macOS dark appearance",      swatch: ["#0A84FF", "#1c1c1e"] },
  { id: "daylight", name: "Light",     description: "macOS light appearance",       swatch: ["#007AFF", "#f5f5f7"] },
  { id: "ember",    name: "Ember",     description: "Warm accent",                  swatch: ["#D4846A", "#1a1210"] },
  { id: "aurora",   name: "Aurora",    description: "Teal accent",                  swatch: ["#4DB8A8", "#0a1418"] },
  { id: "violet",   name: "Violet",    description: "Purple accent",                swatch: ["#9A88C8", "#12101a"] },
  { id: "rose",     name: "Rose",      description: "Pink accent",                  swatch: ["#D88898", "#160e12"] },
  { id: "ocean",    name: "Ocean",     description: "Blue accent",                  swatch: ["#6898C8", "#0a1018"] },
]

/** Fresh annotation palette – distinct from the old Tailwind defaults. */
export const ANNOTATION_COLORS = [
  { id: "coral",   hex: "#FF6B6B", label: "Coral"   },
  { id: "mango",   hex: "#FFB347", label: "Mango"   },
  { id: "mint",    hex: "#4ECDC4", label: "Mint"    },
  { id: "sky",     hex: "#45B7D1", label: "Sky"     },
  { id: "lavender",hex: "#A29BFE", label: "Lavender"},
  { id: "blush",   hex: "#FD79A8", label: "Blush"   },
  { id: "lemon",   hex: "#FDCB6E", label: "Lemon"   },
  { id: "slate",   hex: "#636E72", label: "Slate"   },
  { id: "white",   hex: "#FFFFFF", label: "White"   },
  { id: "ink",     hex: "#2D3436", label: "Ink"     },
] as const

export const DEFAULT_THEME: ThemeId = "mac"
export const DEFAULT_ANNOTATION_COLOR = ANNOTATION_COLORS[0].hex
