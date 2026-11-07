import { createContext, useContext } from "react"
import type {
  AppSettings,
  ExportDefaults,
  FolderSettings,
  GeneralSettings,
  IntegrationSettings,
  ShortcutBindings,
} from "@/lib/appSettings"
import type { ThemeId } from "@/lib/themes"

export interface SettingsCtx {
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
  updateFolders: (patch: Partial<FolderSettings>) => void
  resetSettings: () => void
}

export const SettingsContext = createContext<SettingsCtx | null>(null)

export function useSettings(): SettingsCtx {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider")
  return ctx
}

export type {
  AnnotationTool,
  AppSettings,
  ExportDefaults,
  FolderSettings,
  GeneralSettings,
  IntegrationSettings,
  ShortcutBindings,
} from "@/lib/appSettings"
