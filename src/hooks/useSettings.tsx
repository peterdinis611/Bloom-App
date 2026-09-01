import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useDebouncedCallback } from "@tanstack/react-pacer"
import {
  ANNOTATION_COLORS,
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_THEME,
  isThemeId,
  type ThemeId,
} from "@/lib/themes"
import { idbGet, idbSet } from "@/lib/idb"
import { PACER } from "@/lib/pacer"
import type { PipPosition, PipSize } from "@/lib/capture"
import { BUILTIN_PRESETS, type RecordingPreset } from "@/lib/presets"
import type { RecordingQuality } from "@/lib/videoOptions"

export type AnnotationTool = "pen" | "highlighter" | "rect" | "circle" | "line" | "arrow" | "eraser"

export interface AppSettings {
  theme: ThemeId
  annotation: {
    defaultTool: AnnotationTool
    defaultColor: string
    defaultWidth: number
  }
  recording: {
    defaultQuality: RecordingQuality
    defaultCountdown: 0 | 3 | 5
    /** Minimize main window once capture starts so Bloom is not in the recording. */
    minimizeOnRecord: boolean
    cursorHighlight: boolean
    cameraBlur: boolean
    pipSize: PipSize
    pipPosition: PipPosition
    /** Last-used quick preset id (demo / meeting / tutorial). */
    activePresetId: string
    presets: RecordingPreset[]
    /** Auto-stop after N seconds (0 = disabled). */
    maxDurationSecs: number
    /** Auto-stop after N seconds of no mouse/keyboard activity (0 = disabled). */
    idleStopSecs: number
  }
}

const STORAGE_KEY = "bloom-settings-v3"

export const DEFAULTS: AppSettings = {
  theme: DEFAULT_THEME,
  annotation: {
    defaultTool: "pen",
    defaultColor: DEFAULT_ANNOTATION_COLOR,
    defaultWidth: 4,
  },
  recording: {
    defaultQuality: "1080p",
    defaultCountdown: 3,
    minimizeOnRecord: true,
    cursorHighlight: false,
    cameraBlur: false,
    pipSize: "medium",
    pipPosition: "bottom-right",
    activePresetId: "demo",
    presets: BUILTIN_PRESETS,
    maxDurationSecs: 0,
    idleStopSecs: 0,
  },
}

function parseSettings(raw: string | null): AppSettings {
  if (!raw) return DEFAULTS
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const theme = isThemeId(parsed.theme) ? parsed.theme : DEFAULT_THEME
    return {
      ...DEFAULTS,
      ...parsed,
      theme,
      annotation: { ...DEFAULTS.annotation, ...parsed.annotation },
      recording: {
        ...DEFAULTS.recording,
        ...parsed.recording,
        presets: parsed.recording?.presets ?? DEFAULTS.recording.presets,
      },
    }
  } catch {
    return DEFAULTS
  }
}

async function loadSettings(): Promise<AppSettings> {
  const raw = await idbGet(STORAGE_KEY)
  return parseSettings(raw)
}

export function applyTheme(theme: ThemeId) {
  if (theme === "mac") {
    document.documentElement.removeAttribute("data-theme")
  } else {
    document.documentElement.setAttribute("data-theme", theme)
  }
}

/** Load persisted settings (usable outside React – e.g. annotation overlay window). */
export async function readStoredSettings(): Promise<AppSettings> {
  return loadSettings()
}

interface SettingsCtx {
  settings: AppSettings
  ready: boolean
  setTheme: (theme: ThemeId) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  updateAnnotation: (patch: Partial<AppSettings["annotation"]>) => void
  updateRecording: (patch: Partial<AppSettings["recording"]>) => void
  resetSettings: () => void
}

const SettingsContext = createContext<SettingsCtx | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadSettings().then((loaded) => {
      if (cancelled) return
      setSettings(loaded)
      applyTheme(loaded.theme)
      setReady(true)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (ready) applyTheme(settings.theme)
  }, [settings.theme, ready])

  const persistSettings = useDebouncedCallback((next: AppSettings) => {
    void idbSet(STORAGE_KEY, JSON.stringify(next))
  }, { wait: PACER.persist })

  useEffect(() => {
    if (!ready) return
    persistSettings(settings)
  }, [settings, persistSettings, ready])

  const setTheme = useCallback((theme: ThemeId) => {
    setSettings((s) => ({ ...s, theme }))
  }, [])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((s) => ({ ...s, ...patch }))
  }, [])

  const updateAnnotation = useCallback((patch: Partial<AppSettings["annotation"]>) => {
    setSettings((s) => ({ ...s, annotation: { ...s.annotation, ...patch } }))
  }, [])

  const updateRecording = useCallback((patch: Partial<AppSettings["recording"]>) => {
    setSettings((s) => ({ ...s, recording: { ...s.recording, ...patch } }))
  }, [])

  const resetSettings = useCallback(() => setSettings(DEFAULTS), [])

  const value = useMemo(
    () => ({ settings, ready, setTheme, updateSettings, updateAnnotation, updateRecording, resetSettings }),
    [settings, ready, setTheme, updateSettings, updateAnnotation, updateRecording, resetSettings],
  )

  if (!ready) return null

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider")
  return ctx
}

export { ANNOTATION_COLORS, STORAGE_KEY }
