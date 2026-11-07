import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useDebouncedCallback } from "@tanstack/react-pacer"
import { idbSet } from "@/lib/idb"
import { PACER } from "@/lib/pacer"
import { isLocaleId } from "@/lib/i18n/catalog"
import {
  DEFAULTS,
  STORAGE_KEY,
  applyReduceTransparency,
  applyTheme,
  loadSettings,
  normalizeShortcutKey,
  type AppSettings,
  type ExportDefaults,
  type FolderSettings,
  type GeneralSettings,
  type IntegrationSettings,
  type ShortcutBindings,
} from "@/lib/appSettings"
import type { ThemeId } from "@/lib/themes"
import { SettingsContext } from "@/hooks/settingsContext"

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
      try {
        const {
          getExportLimits,
          setIntegrationsConfig,
          setExportDefaultsConfig,
          setRecordingLimitsConfig,
        } = await import("@/hooks/useBloomBackend")
        const { applyExportLimits } = await import("@/lib/editorSegments")
        applyExportLimits(await getExportLimits())
        await Promise.all([
          setIntegrationsConfig({
            slack_webhook_url: next.integrations.slackWebhookUrl,
            discord_webhook_url: next.integrations.discordWebhookUrl,
            notify_on_export: next.integrations.notifyOnExport,
            open_after_export: next.integrations.openAfterExport,
            copy_path_after_export: next.integrations.copyPathAfterExport,
            auto_share_after_export: next.integrations.autoShareAfterExport,
          }),
          setExportDefaultsConfig({
            preset: next.exportDefaults.preset,
            resolution: next.exportDefaults.resolution,
            format: next.exportDefaults.format,
            prefer_stream_copy: next.exportDefaults.preferStreamCopy,
            prefer_hardware_encode: next.exportDefaults.preferHardwareEncode,
          }),
          setRecordingLimitsConfig({
            max_duration_secs: next.recording.maxDurationSecs,
            idle_stop_secs: next.recording.idleStopSecs,
          }),
        ])
      } catch {
        /* Vite-only / non-Tauri */
      }
      setSettings(next)
      applyTheme(next.theme)
      applyReduceTransparency(next.general.reduceTransparency)
      setReady(true)
      void import("@/hooks/useBloomBackend")
        .then(({ getGlobalShortcuts }) => getGlobalShortcuts())
        .then(({ arm, pause, stop }) => {
          if (cancelled) return
          setSettings((s) => ({
            ...s,
            shortcuts: {
              arm: normalizeShortcutKey(arm, s.shortcuts.arm),
              pause: normalizeShortcutKey(pause, s.shortcuts.pause),
              stop: normalizeShortcutKey(stop, s.shortcuts.stop),
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

  useEffect(() => {
    if (!ready) return
    applyReduceTransparency(settings.general.reduceTransparency)
  }, [settings.general.reduceTransparency, ready])

  const persistSettings = useDebouncedCallback((next: AppSettings) => {
    void idbSet(STORAGE_KEY, JSON.stringify(next))
    void import("@/hooks/useBloomBackend")
      .then(({ setIntegrationsConfig, setExportDefaultsConfig, setRecordingLimitsConfig }) =>
        Promise.all([
          setIntegrationsConfig({
            slack_webhook_url: next.integrations.slackWebhookUrl,
            discord_webhook_url: next.integrations.discordWebhookUrl,
            notify_on_export: next.integrations.notifyOnExport,
            open_after_export: next.integrations.openAfterExport,
            copy_path_after_export: next.integrations.copyPathAfterExport,
            auto_share_after_export: next.integrations.autoShareAfterExport,
          }),
          setExportDefaultsConfig({
            preset: next.exportDefaults.preset,
            resolution: next.exportDefaults.resolution,
            format: next.exportDefaults.format,
            prefer_stream_copy: next.exportDefaults.preferStreamCopy,
            prefer_hardware_encode: next.exportDefaults.preferHardwareEncode,
          }),
          setRecordingLimitsConfig({
            max_duration_secs: next.recording.maxDurationSecs,
            idle_stop_secs: next.recording.idleStopSecs,
          }),
        ]),
      )
      .catch(() => {
        /* Vite-only / non-Tauri */
      })
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

  const updateFolders = useCallback((patch: Partial<FolderSettings>) => {
    setSettings((s) => ({ ...s, folders: { ...s.folders, ...patch } }))
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
      updateFolders,
      resetSettings,
    }),
    [settings, ready, setTheme, updateSettings, updateAnnotation, updateRecording, updateShortcuts, updateIntegrations, updateGeneral, updateExportDefaults, updateFolders, resetSettings],
  )

  if (!ready) return null

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
