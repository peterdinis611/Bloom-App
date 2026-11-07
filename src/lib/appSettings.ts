import {
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_THEME,
  isThemeId,
  type ThemeId,
} from "@/lib/themes"
import { idbGet } from "@/lib/idb"
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
  /** Disable frosted glass / blur (solid surfaces). */
  reduceTransparency: boolean
  /** UI language (synced to Rust tray / backend strings). */
  locale: LocaleId
}

export interface FolderSettings {
  /** Remind to back up after this many days (0 = off). */
  backupReminderDays: number
  /** ISO date of last successful backup (local). */
  lastBackupAt: string | null
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
  /** Open the share sheet once an export finishes. */
  autoShareAfterExport: boolean
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
  folders: FolderSettings
}

export const STORAGE_KEY = "bloom-settings-v5"
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
    autoShareAfterExport: false,
    preferNativeShare: true,
  },
  general: {
    startMaximized: false,
    openLibraryAfterRecord: false,
    showNewsBadge: true,
    confirmDelete: true,
    reduceTransparency: false,
    locale: "sk",
  },
  exportDefaults: {
    preset: "medium",
    resolution: "original",
    format: "mp4",
    preferStreamCopy: true,
    preferHardwareEncode: true,
  },
  folders: {
    backupReminderDays: 7,
    lastBackupAt: null,
  },
}

export function normalizeShortcutKey(raw: unknown, fallback: string): string {
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
        arm: normalizeShortcutKey(parsed.shortcuts?.arm, DEFAULTS.shortcuts.arm),
        pause: normalizeShortcutKey(parsed.shortcuts?.pause, DEFAULTS.shortcuts.pause),
        stop: normalizeShortcutKey(parsed.shortcuts?.stop, DEFAULTS.shortcuts.stop),
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
      folders: {
        ...DEFAULTS.folders,
        ...parsed.folders,
        backupReminderDays:
          typeof parsed.folders?.backupReminderDays === "number"
            ? Math.max(0, Math.min(365, Math.round(parsed.folders.backupReminderDays)))
            : DEFAULTS.folders.backupReminderDays,
        lastBackupAt:
          typeof parsed.folders?.lastBackupAt === "string" || parsed.folders?.lastBackupAt === null
            ? parsed.folders.lastBackupAt
            : DEFAULTS.folders.lastBackupAt,
      },
    }
  } catch {
    return DEFAULTS
  }
}

export async function loadSettings(): Promise<{ settings: AppSettings; isFresh: boolean }> {
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

export function applyTheme(theme: ThemeId) {
  if (theme === "mac") {
    document.documentElement.removeAttribute("data-theme")
  } else {
    document.documentElement.setAttribute("data-theme", theme)
  }
}

export function applyReduceTransparency(on: boolean) {
  document.documentElement.setAttribute("data-reduce-transparency", on ? "true" : "false")
}

/** Load persisted settings (usable outside React – e.g. annotation overlay window). */
export async function readStoredSettings(): Promise<AppSettings> {
  const { settings } = await loadSettings()
  return settings
}
