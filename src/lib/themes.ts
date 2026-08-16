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
  { id: "mac",      name: "Automaticky", description: "macOS tmavý vzhľad",   swatch: ["#0A84FF", "#1c1c1e"] },
  { id: "daylight", name: "Svetlý",      description: "macOS svetlý vzhľad",  swatch: ["#007AFF", "#f2f2f7"] },
  { id: "ember",    name: "Oranžový",    description: "Systémový oranžový",   swatch: ["#FF9F0A", "#1c1917"] },
  { id: "aurora",   name: "Tyrkysový",   description: "Systémový tyrkysový",  swatch: ["#64D2FF", "#141c1c"] },
  { id: "violet",   name: "Fialový",     description: "Systémový fialový",    swatch: ["#BF5AF2", "#1c1a22"] },
  { id: "rose",     name: "Ružový",      description: "Systémový ružový",     swatch: ["#FF375F", "#1e181a"] },
  { id: "ocean",    name: "Modrý",       description: "Svetlejší Aqua",       swatch: ["#409CFF", "#161b22"] },
]

export const ANNOTATION_COLORS = [
  { id: "red",     hex: "#FF453A", label: "Červená"  },
  { id: "orange",  hex: "#FF9F0A", label: "Oranžová" },
  { id: "yellow",  hex: "#FFD60A", label: "Žltá"     },
  { id: "green",   hex: "#30D158", label: "Zelená"   },
  { id: "mint",    hex: "#63E6E2", label: "Mäta"     },
  { id: "teal",    hex: "#40C8E0", label: "Tyrkys"   },
  { id: "blue",    hex: "#0A84FF", label: "Modrá"    },
  { id: "indigo",  hex: "#5E5CE6", label: "Indigo"   },
  { id: "purple",  hex: "#BF5AF2", label: "Fialová"  },
  { id: "pink",    hex: "#FF375F", label: "Ružová"   },
  { id: "white",   hex: "#FFFFFF", label: "Biela"    },
  { id: "black",   hex: "#1C1C1E", label: "Čierna"   },
] as const

export const DEFAULT_THEME: ThemeId = "mac"
export const DEFAULT_ANNOTATION_COLOR = ANNOTATION_COLORS[0].hex
