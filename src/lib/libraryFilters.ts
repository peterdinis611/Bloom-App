import { idbGet, idbSet } from "@/lib/idb"
import type { RecordingEntry } from "@/types"

const FILTERS_KEY = "bloom-library-filters-v1"

export interface SavedLibraryView {
  id: string
  name: string
  starredOnly: boolean
  folder: string
  hasClicks: boolean
}

export interface LibraryFilterState {
  starredOnly: boolean
  folderFilter: string
  hasClicksOnly: boolean
  savedViews: SavedLibraryView[]
}

export const DEFAULT_LIBRARY_FILTERS: LibraryFilterState = {
  starredOnly: false,
  folderFilter: "",
  hasClicksOnly: false,
  savedViews: [],
}

function isView(v: unknown): v is SavedLibraryView {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return typeof o.id === "string" && typeof o.name === "string"
}

export async function loadLibraryFilters(): Promise<LibraryFilterState> {
  try {
    const raw = await idbGet(FILTERS_KEY)
    if (!raw) return DEFAULT_LIBRARY_FILTERS
    const p = JSON.parse(raw) as Partial<LibraryFilterState>
    return {
      starredOnly: Boolean(p.starredOnly),
      folderFilter: typeof p.folderFilter === "string" ? p.folderFilter : "",
      hasClicksOnly: Boolean(p.hasClicksOnly),
      savedViews: Array.isArray(p.savedViews)
        ? p.savedViews.filter(isView).map((v) => ({
            id: v.id,
            name: v.name,
            starredOnly: Boolean(v.starredOnly),
            folder: typeof v.folder === "string" ? v.folder : "",
            hasClicks: Boolean(v.hasClicks),
          }))
        : [],
    }
  } catch {
    return DEFAULT_LIBRARY_FILTERS
  }
}

export async function saveLibraryFilters(state: LibraryFilterState): Promise<void> {
  try {
    await idbSet(FILTERS_KEY, JSON.stringify(state))
  } catch { /* non-critical */ }
}

/** Folder filter: sidecar `folder` equals `f`, or the file lives under `/f/`. */
export function entryInFolder(entry: RecordingEntry, folder: string): boolean {
  if (!folder) return true
  const f = folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
  if (!f) return true
  if ((entry.meta.folder ?? "").replace(/\\/g, "/") === f) return true
  return entry.path.replace(/\\/g, "/").includes(`/${f}/`)
}
