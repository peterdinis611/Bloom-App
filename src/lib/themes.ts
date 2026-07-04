/** App colour themes + shared annotation palette. */

export type ThemeId = "ember" | "aurora" | "violet" | "rose" | "ocean" | "daylight"

export interface ThemeMeta {
  id: ThemeId
  name: string
  description: string
  /** Preview swatch gradient stops */
  swatch: [string, string]
}

export const THEMES: ThemeMeta[] = [
  { id: "ember",    name: "Ember",    description: "Warm coral on charcoal",     swatch: ["#FF6B4A", "#1a1210"] },
  { id: "aurora",   name: "Aurora",   description: "Teal & mint northern lights", swatch: ["#2DD4BF", "#0a1418"] },
  { id: "violet",   name: "Violet",   description: "Soft purple dusk",           swatch: ["#A78BFA", "#12101a"] },
  { id: "rose",     name: "Rose",     description: "Blush pink accent",          swatch: ["#FB7185", "#160e12"] },
  { id: "ocean",    name: "Ocean",    description: "Deep sea blue",              swatch: ["#60A5FA", "#0a1018"] },
  { id: "daylight", name: "Daylight", description: "Clean light interface",      swatch: ["#2563EB", "#f4f4f5"] },
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

export const DEFAULT_THEME: ThemeId = "aurora"
export const DEFAULT_ANNOTATION_COLOR = ANNOTATION_COLORS[0].hex
