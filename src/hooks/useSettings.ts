/** Public settings API — hook in .ts keeps Provider Fast Refresh clean. */
export { SettingsProvider } from "@/hooks/SettingsProvider"
export {
  useSettings,
  type AnnotationTool,
  type AppSettings,
  type ExportDefaults,
  type FolderSettings,
  type GeneralSettings,
  type IntegrationSettings,
  type ShortcutBindings,
} from "@/hooks/settingsContext"
