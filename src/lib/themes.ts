/** App colour themes + shared annotation palette. */

export type ThemeId =
  | "mac"
  | "daylight"
  | "ember"
  | "aurora"
  | "violet"
  | "rose"
  | "ocean"
  | "cinema"
  | "forest"
  | "slate"
  | "neon"
  | "paper"
  | "copper"
  | "midnight"

export interface ThemeMeta {
  id: ThemeId
  name: string
  description: string
  /** Preview swatch: [primary, accent, background] */
  swatch: [string, string, string]
}

export const THEMES: ThemeMeta[] = [
  { id: "mac",      name: "Darkroom",     description: "Monitor + tungsten",        swatch: ["#6B9EFF", "#E6A94C", "#090A0D"] },
  { id: "daylight", name: "Svetlý",       description: "Teplý papier + med",        swatch: ["#2F6FED", "#C8781A", "#F0EDE6"] },
  { id: "paper",    name: "Papier",       description: "Svetlý editor + ink",       swatch: ["#1D4ED8", "#B45309", "#F7F5F0"] },
  { id: "cinema",   name: "Kino",         description: "Striebro + červená opona",  swatch: ["#E8E4DC", "#C41E3A", "#050506"] },
  { id: "midnight", name: "Polnoc",       description: "Indigo + ľad",              swatch: ["#818CF8", "#38BDF8", "#080B14"] },
  { id: "slate",    name: "Bridlica",     description: "Studiová sivá + jantár",    swatch: ["#94A3B8", "#F59E0B", "#111318"] },
  { id: "ocean",    name: "Oceán",        description: "Modrá + teal",              swatch: ["#4D9DFF", "#2DD4BF", "#0A1018"] },
  { id: "aurora",   name: "Tyrkysový",    description: "Aqua + mätový",             swatch: ["#3ECFE0", "#7CF7C6", "#0A1214"] },
  { id: "forest",   name: "Les",          description: "Tmavá zeleň + limetka",     swatch: ["#4ADE80", "#A3E635", "#0A0F0C"] },
  { id: "copper",   name: "Meď",          description: "Teplá hrdza + zlato",       swatch: ["#D97706", "#FBBF24", "#150F0C"] },
  { id: "ember",    name: "Oranžový",     description: "Jantár + zlatý",            swatch: ["#FF9F0A", "#FFD60A", "#12100E"] },
  { id: "neon",     name: "Neón",         description: "Magenta + cyan",            swatch: ["#FF2D95", "#00F0FF", "#0D0514"] },
  { id: "violet",   name: "Fialový",      description: "Fialová + ružová",          swatch: ["#A855F7", "#F472B6", "#100E16"] },
  { id: "rose",     name: "Ružový",       description: "Ružová + broskyňa",         swatch: ["#FB7185", "#FDA4AF", "#140F11"] },
]

export const THEME_IDS = new Set<ThemeId>(THEMES.map((t) => t.id))

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.has(value as ThemeId)
}

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
