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
import { isLocaleId } from "@/lib/i18n/catalog"
import type { LocaleId } from "@/lib/i18n/types"
import type { OptimizeFormat } from "@/types"

const EXPORT_FORMATS: OptimizeFormat[] = [
  "mp4", "mov", "m4v", "mkv", "avi", "mpeg", "ts", "flv", "3gp", "ogv", "webm", "gif",
]

function isOptimizeFormat(v: unknown): v is OptimizeFormat {
  return typeof v === "string" && (EXPORT_FORMATS as string[]).includes(v)
}

export type AnnotationTool = "pen" | "highlighter" | "rect" | "circle" | "line" | "arrow" | "eraser"

export interface ShortcutBindings {
  /** Letter A–Z for ⌘⇧ binding to arm recording. */
  arm: string
  pause: string
  stop: string
}

export interface GeneralSettings {
  /** Maximize main window when Bloom starts. */
  startMaximized: boolean
  /** After a recording finishes, jump to Library. */
  openLibraryAfterRecord: boolean
  /** Show unread badge on Novinky until opened. */
  showNewsBadge: boolean
  /** Confirm before deleting a single recording. */
  confirmDelete: boolean
  /** UI language (synced to Rust tray / backend strings). */
  locale: LocaleId
}

export interface ExportDefaults {
  preset: "small" | "medium" | "high"
  resolution: "480p" | "720p" | "1080p" | "original"
  /** Default container for editor / batch export. */
  format: OptimizeFormat
  /** Prefer original resolution so trim-only can stream-copy. */
  preferStreamCopy: boolean
  /** Default hardware-friendly encode (VideoToolbox / NVENC when available). */
  preferHardwareEncode: boolean
}

export interface IntegrationSettings {
  slackWebhookUrl: string
  discordWebhookUrl: string
  notifyOnExport: boolean
  openAfterExport: boolean
  copyPathAfterExport: boolean
  preferNativeShare: boolean
}

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
  shortcuts: ShortcutBindings
  integrations: IntegrationSettings
  general: GeneralSettings
  exportDefaults: ExportDefaults
}

const STORAGE_KEY = "bloom-settings-v5"
const LEGACY_KEYS = ["bloom-settings-v4", "bloom-settings-v3"] as const

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
  shortcuts: {
    arm: "R",
    pause: "P",
    stop: "S",
  },
  integrations: {
    slackWebhookUrl: "",
    discordWebhookUrl: "",
    notifyOnExport: false,
    openAfterExport: false,
    copyPathAfterExport: false,
    preferNativeShare: true,
  },
  general: {
    startMaximized: false,
    openLibraryAfterRecord: false,
    showNewsBadge: true,
    confirmDelete: true,
    locale: "sk",
  },
  exportDefaults: {
    preset: "medium",
    resolution: "original",
    format: "mp4",
    preferStreamCopy: true,
    preferHardwareEncode: true,
  },
}

async function loadSettings(): Promise<{ settings: AppSettings; isFresh: boolean }> {
  let raw = await idbGet(STORAGE_KEY)
  let fromLegacy = false
  if (!raw) {
    for (const key of LEGACY_KEYS) {
      raw = await idbGet(key)
      if (raw) {
        fromLegacy = true
        break
      }
    }
  }
  return { settings: parseSettings(raw), isFresh: !raw && !fromLegacy }
}

function normalizeKey(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback
  const letter = raw.trim().toUpperCase()
  return /^[A-Z]$/.test(letter) ? letter : fallback
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
      shortcuts: {
        arm: normalizeKey(parsed.shortcuts?.arm, DEFAULTS.shortcuts.arm),
        pause: normalizeKey(parsed.shortcuts?.pause, DEFAULTS.shortcuts.pause),
        stop: normalizeKey(parsed.shortcuts?.stop, DEFAULTS.shortcuts.stop),
      },
      integrations: { ...DEFAULTS.integrations, ...parsed.integrations },
      general: {
        ...DEFAULTS.general,
        ...parsed.general,
        locale: isLocaleId(parsed.general?.locale) ? parsed.general.locale : DEFAULTS.general.locale,
      },
      exportDefaults: {
        ...DEFAULTS.exportDefaults,
        ...parsed.exportDefaults,
        format: isOptimizeFormat(parsed.exportDefaults?.format)
          ? parsed.exportDefaults.format
          : DEFAULTS.exportDefaults.format,
      },
    }
  } catch {
    return DEFAULTS
  }
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
  const { settings } = await loadSettings()
  return settings
}

interface SettingsCtx {
  settings: AppSettings
  ready: boolean
  setTheme: (theme: ThemeId) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  updateAnnotation: (patch: Partial<AppSettings["annotation"]>) => void
  updateRecording: (patch: Partial<AppSettings["recording"]>) => void
  updateShortcuts: (patch: Partial<ShortcutBindings>) => void
  updateIntegrations: (patch: Partial<IntegrationSettings>) => void
  updateGeneral: (patch: Partial<GeneralSettings>) => void
  updateExportDefaults: (patch: Partial<ExportDefaults>) => void
  resetSettings: () => void
}

const SettingsContext = createContext<SettingsCtx | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadSettings().then(async ({ settings: loaded, isFresh }) => {
      if (cancelled) return
      let next = loaded
      if (isFresh) {
        try {
          const { getLocale } = await import("@/hooks/useBloomBackend")
          const backend = await getLocale()
          if (isLocaleId(backend)) {
            next = { ...loaded, general: { ...loaded.general, locale: backend } }
          }
        } catch {
          /* Vite-only / non-Tauri */
        }
      }
      setSettings(next)
      applyTheme(next.theme)
      setReady(true)
      // Rust owns the registered global shortcuts — mirror them into the UI state.
      void import("@/hooks/useBloomBackend")
        .then(({ getGlobalShortcuts }) => getGlobalShortcuts())
        .then(({ arm, pause, stop }) => {
          if (cancelled) return
          setSettings((s) => ({
            ...s,
            shortcuts: {
              arm: normalizeKey(arm, s.shortcuts.arm),
              pause: normalizeKey(pause, s.shortcuts.pause),
              stop: normalizeKey(stop, s.shortcuts.stop),
            },
          }))
        })
        .catch(() => {
          /* Vite-only / non-Tauri */
        })
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

  const updateShortcuts = useCallback((patch: Partial<ShortcutBindings>) => {
    setSettings((s) => ({ ...s, shortcuts: { ...s.shortcuts, ...patch } }))
  }, [])

  const updateIntegrations = useCallback((patch: Partial<IntegrationSettings>) => {
    setSettings((s) => ({ ...s, integrations: { ...s.integrations, ...patch } }))
  }, [])

  const updateGeneral = useCallback((patch: Partial<GeneralSettings>) => {
    setSettings((s) => ({ ...s, general: { ...s.general, ...patch } }))
  }, [])

  const updateExportDefaults = useCallback((patch: Partial<ExportDefaults>) => {
    setSettings((s) => ({ ...s, exportDefaults: { ...s.exportDefaults, ...patch } }))
  }, [])

  const resetSettings = useCallback(() => setSettings(DEFAULTS), [])

  const value = useMemo(
    () => ({
      settings,
      ready,
      setTheme,
      updateSettings,
      updateAnnotation,
      updateRecording,
      updateShortcuts,
      updateIntegrations,
      updateGeneral,
      updateExportDefaults,
      resetSettings,
    }),
    [settings, ready, setTheme, updateSettings, updateAnnotation, updateRecording, updateShortcuts, updateIntegrations, updateGeneral, updateExportDefaults, resetSettings],
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
