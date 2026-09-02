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
  | "tally"
  | "sand"
  | "graphite"
  | "sakura"
  | "waveform"
  | "dusk"
  | "obsidian"
  | "lagoon"
  | "wine"
  | "steel"
  | "noir"
  | "electric"
  | "moss"
  | "honey"
  | "linen"
  | "arctic"

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
  { id: "sand",     name: "Piesok",       description: "Svetlý piesok + terakota",  swatch: ["#C2410C", "#D97706", "#F5F0E8"] },
  { id: "honey",    name: "Med",          description: "Svetlý med + jantár",       swatch: ["#CA8A04", "#D97706", "#FBF6EB"] },
  { id: "linen",    name: "Ľan",          description: "Svetlý ľan + hnedá",        swatch: ["#78716C", "#A16207", "#F7F3ED"] },
  { id: "arctic",   name: "Arktída",      description: "Svetlý ľad + modrá",        swatch: ["#0284C7", "#0EA5E9", "#F0F7FC"] },
  { id: "cinema",   name: "Kino",         description: "Striebro + červená opona",  swatch: ["#E8E4DC", "#C41E3A", "#050506"] },
  { id: "noir",     name: "Noir",         description: "Film B&W + červená",        swatch: ["#FAFAFA", "#DC2626", "#050505"] },
  { id: "obsidian", name: "Obsidián",     description: "Void + strieborný okraj",   swatch: ["#C8CDD8", "#8B5CF6", "#050508"] },
  { id: "midnight", name: "Polnoc",       description: "Indigo + ľad",              swatch: ["#818CF8", "#38BDF8", "#080B14"] },
  { id: "electric", name: "Elektrický",   description: "Kobalt + volt",             swatch: ["#2563EB", "#FACC15", "#080810"] },
  { id: "slate",    name: "Bridlica",     description: "Studiová sivá + jantár",    swatch: ["#94A3B8", "#F59E0B", "#111318"] },
  { id: "steel",    name: "Oceľ",         description: "Priemyselná modro-sivá",    swatch: ["#64748B", "#38BDF8", "#0E1117"] },
  { id: "ocean",    name: "Oceán",        description: "Modrá + teal",              swatch: ["#4D9DFF", "#2DD4BF", "#0A1018"] },
  { id: "lagoon",   name: "Lagúna",       description: "Hlboká voda + mätová",      swatch: ["#14B8A6", "#5EEAD4", "#061418"] },
  { id: "aurora",   name: "Tyrkysový",    description: "Aqua + mätový",             swatch: ["#3ECFE0", "#7CF7C6", "#0A1214"] },
  { id: "forest",   name: "Les",          description: "Tmavá zeleň + limetka",     swatch: ["#4ADE80", "#A3E635", "#0A0F0C"] },
  { id: "moss",     name: "Mach",         description: "Zem + olivová",             swatch: ["#65A30D", "#D9F99D", "#0C1008"] },
  { id: "copper",   name: "Meď",          description: "Teplá hrdza + zlato",       swatch: ["#D97706", "#FBBF24", "#150F0C"] },
  { id: "wine",     name: "Víno",         description: "Bordó + ruža",              swatch: ["#BE123C", "#FECDD3", "#1A0A0E"] },
  { id: "ember",    name: "Oranžový",     description: "Jantár + zlatý",            swatch: ["#FF9F0A", "#FFD60A", "#12100E"] },
  { id: "neon",     name: "Neón",         description: "Magenta + cyan",            swatch: ["#FF2D95", "#00F0FF", "#0D0514"] },
  { id: "violet",   name: "Fialový",      description: "Fialová + ružová",          swatch: ["#A855F7", "#F472B6", "#100E16"] },
  { id: "rose",     name: "Ružový",       description: "Ružová + broskyňa",         swatch: ["#FB7185", "#FDA4AF", "#140F11"] },
  { id: "sakura",   name: "Sakura",       description: "Tmavá + čerešňová",        swatch: ["#F9A8D4", "#FBCFE8", "#140E12"] },
  { id: "tally",    name: "Tally",        description: "REC červená + striebro",     swatch: ["#FF3B30", "#E8E4DC", "#080808"] },
  { id: "waveform", name: "Vlna",         description: "Fosfor + jantár",           swatch: ["#39FF14", "#FFB020", "#050805"] },
  { id: "dusk",     name: "Súmrak",       description: "Fialovo-oranžový súmrak",   swatch: ["#A78BFA", "#FB923C", "#120C18"] },
  { id: "graphite", name: "Grafit",       description: "Neutrálna monochrom",       swatch: ["#D4D4D8", "#A1A1AA", "#0C0C0E"] },
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
