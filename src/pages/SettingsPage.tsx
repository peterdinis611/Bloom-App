import { useCallback, useEffect, useState } from "react"
import { RotateCcw, Trash2, Check, FolderOpen, RefreshCw, Shield, Mic, Video, Sparkles, Monitor, Wrench, Play, LifeBuoy } from "lucide-react"
import { open } from "@tauri-apps/plugin-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useMessages } from "@/lib/i18n/I18nProvider"
import { RECORDING_QUALITIES } from "@/lib/videoOptions"
import { THEMES } from "@/lib/themes"
import { ANNOTATION_COLORS, useSettings, type AnnotationTool } from "@/hooks/useSettings"
import {
  checkCapturePermissions,
  deleteAllRecordings,
  discardIncompleteSession,
  formatBytes,
  getAppInfo,
  getAutoOptimizeAfterRecord,
  getDiskSpaceMinMb,
  listIncompleteSessions,
  listRecentRecordings,
  onLibraryChanged,
  openLibraryFolder,
  recoverIncompleteSession,
  regenerateThumbnails,
  repairSidecars,
  setAutoOptimizeAfterRecord,
  setDiskSpaceMinMb,
  getFilenameTemplate,
  getLibraryDirectory,
  getLibraryStats,
  getTrayRecentCount,
  purgeLibraryOrphans,
  setFilenameTemplate,
  setLibraryDirectory,
  setTrayRecentCount,
  type AppInfo,
  type FilenamePreview,
} from "@/hooks/useBloomBackend"
import type { CapturePermissions, IncompleteSession, LibraryDirectoryInfo, RecordingEntry } from "@/types"
import { useToast } from "@/hooks/useToast"
import { ConfirmDeleteAll } from "@/components/library/ConfirmDeleteAll"
import { PageScrollArea } from "@/components/layout/PageScrollArea"
import { PresetEditor } from "@/components/settings/PresetEditor"
import { ShortcutsPanel } from "@/components/settings/ShortcutsPanel"
import { MacGroup, MacGroupHeader, MacPageHeader, MacRow, MacToggle, ChoiceGroup } from "@/components/mac/MacUIKit"
import { localizeError } from "@/lib/i18n/localizeError"
import { LOCALES } from "@/lib/i18n/catalog"
import type { LocaleId } from "@/lib/i18n/types"
import { checkForAppUpdate } from "@/lib/updater"
import { PrivacyPolicyModal } from "@/components/legal/PrivacyPolicyModal"
import { openPrivacySettings } from "@/lib/privacySettings"

export function SettingsPage({
  active = true,
  onOpenRecording,
}: {
  active?: boolean
  /** Open a recording in the library (play). */
  onOpenRecording?: (id: string) => void
}) {
  const sk = useMessages()
  const {
    settings,
    setTheme,
    updateAnnotation,
    updateRecording,
    updateIntegrations,
    updateGeneral,
    updateExportDefaults,
    resetSettings,
  } = useSettings()
  const { success: toastSuccess, error: toastError } = useToast()
  const [libraryCount, setLibraryCount] = useState(0)
  const [librarySize, setLibrarySize] = useState(0)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deleteAllBusy, setDeleteAllBusy] = useState(false)
  const [libraryDir, setLibraryDir] = useState<LibraryDirectoryInfo | null>(null)
  const [libraryDirBusy, setLibraryDirBusy] = useState(false)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [filenameDraft, setFilenameDraft] = useState("")
  const [filenameExample, setFilenameExample] = useState("")
  const [filenameBusy, setFilenameBusy] = useState(false)
  const [trayRecent, setTrayRecent] = useState(5)
  const [trayBusy, setTrayBusy] = useState(false)
  const [purgeBusy, setPurgeBusy] = useState(false)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [migrateOnChoose, setMigrateOnChoose] = useState(true)
  const [autoOptimize, setAutoOptimize] = useState(false)
  const [diskMinDraft, setDiskMinDraft] = useState("")
  const [thumbsBusy, setThumbsBusy] = useState(false)
  const [repairBusy, setRepairBusy] = useState(false)
  const [incomplete, setIncomplete] = useState<IncompleteSession[]>([])
  const [incompleteBusy, setIncompleteBusy] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<CapturePermissions | null>(null)
  const [recent, setRecent] = useState<RecordingEntry[]>([])
  const integ = settings.integrations
  const general = settings.general
  const exportDefaults = settings.exportDefaults

  const TOOLS: { id: AnnotationTool; label: string }[] = [
    { id: "pen", label: sk.settings.tools.pen },
    { id: "highlighter", label: sk.settings.tools.highlighter },
    { id: "line", label: sk.settings.tools.line },
    { id: "arrow", label: sk.settings.tools.arrow },
    { id: "rect", label: sk.settings.tools.rect },
    { id: "circle", label: sk.settings.tools.circle },
    { id: "eraser", label: sk.settings.tools.eraser },
  ]
  const handleCheckUpdates = async () => {
    setUpdateBusy(true)
    try {
      const result = await checkForAppUpdate({
        onAvailable: (version) => {
          toastSuccess({ title: sk.toast.updateAvailable(version) })
        },
      })
      if (result === "up-to-date") {
        toastSuccess({ title: sk.updater.upToDate })
      } else if (result === "error") {
        toastError({ title: sk.toast.updateCheckFailed })
      }
    } finally {
      setUpdateBusy(false)
    }
  }

  const refreshLibraryDir = useCallback(async () => {
    try {
      setLibraryDir(await getLibraryDirectory())
    } catch {
      setLibraryDir(null)
    }
  }, [])

  const refreshLibraryStats = useCallback(async () => {
    try {
      const st = await getLibraryStats()
      setLibraryCount(st.total_recordings)
      setLibrarySize(st.total_size_bytes)
    } catch {
      setLibraryCount(0)
      setLibrarySize(0)
    }
  }, [])

  const refreshIncomplete = useCallback(() => {
    void listIncompleteSessions().then(setIncomplete).catch(() => setIncomplete([]))
  }, [])

  const refreshRecent = useCallback(() => {
    void listRecentRecordings(5).then(setRecent).catch(() => setRecent([]))
  }, [])

  const refreshPermissions = useCallback(() => {
    void checkCapturePermissions().then(setPermissions).catch(() => setPermissions(null))
  }, [])

  useEffect(() => {
    refreshIncomplete()
    refreshRecent()
    refreshPermissions()
    void getAutoOptimizeAfterRecord().then(setAutoOptimize).catch(() => {})
    void getDiskSpaceMinMb().then((mb) => setDiskMinDraft(String(mb))).catch(() => {})
    let unlisten: (() => void) | undefined
    let disposed = false
    void onLibraryChanged(() => {
      refreshRecent()
      refreshIncomplete()
    })
      .then((fn) => { if (disposed) fn(); else unlisten = fn })
      .catch(() => {})
    return () => { disposed = true; unlisten?.() }
  }, [refreshIncomplete, refreshRecent, refreshPermissions])

  useEffect(() => {
    void refreshLibraryStats()
    void refreshLibraryDir()
    void getFilenameTemplate()
      .then((p: FilenamePreview) => {
        setFilenameDraft(p.template)
        setFilenameExample(p.example)
      })
      .catch(() => {})
    void getTrayRecentCount()
      .then(setTrayRecent)
      .catch(() => {})
    void getAppInfo()
      .then(setAppInfo)
      .catch(() => {})
  }, [refreshLibraryStats, refreshLibraryDir])

  const handleDeleteAll = async () => {
    const count = libraryCount
    setDeleteAllBusy(true)
    try {
      await deleteAllRecordings()
      setLibraryCount(0)
      setLibrarySize(0)
      setConfirmDeleteAll(false)
      toastSuccess({ title: sk.toast.deletedAll(count) })
    } catch (e) {
      toastError({ title: sk.toast.actionFailed, description: localizeError(e) })
    } finally {
      setDeleteAllBusy(false)
    }
  }

  const handleThemeChange = (themeId: typeof settings.theme) => {
    if (settings.theme === themeId) return
    setTheme(themeId)
    const theme = THEMES.find((t) => t.id === themeId)
    toastSuccess({ title: sk.toast.themeChanged(theme?.name ?? themeId) })
  }

  const handleResetSettings = () => {
    resetSettings()
    toastSuccess({
      title: sk.toast.settingsReset,
      description: sk.toast.settingsResetBody,
    })
  }

  const handleChooseLibraryFolder = async () => {
    setLibraryDirBusy(true)
    try {
      const selected = await open({ directory: true, multiple: false, title: sk.settings.libraryFolder })
      if (!selected || Array.isArray(selected)) return
      const info = await setLibraryDirectory(selected, migrateOnChoose)
      setLibraryDir(info)
      await refreshLibraryStats()
      refreshRecent()
      toastSuccess({
        title: sk.settings.libraryFolder,
        description: migrateOnChoose && info.migrated_files
          ? `${info.path} · ${sk.toast.libraryFolderMigrated(info.migrated_files)}`
          : info.path,
      })
    } catch (e) {
      toastError({ title: sk.toast.actionFailed, description: localizeError(e) })
    } finally {
      setLibraryDirBusy(false)
    }
  }

  const handleResetLibraryFolder = async () => {
    setLibraryDirBusy(true)
    try {
      const info = await setLibraryDirectory(null)
      setLibraryDir(info)
      await refreshLibraryStats()
      toastSuccess({
        title: sk.settings.libraryFolderReset,
        description: info.path,
      })
    } catch (e) {
      toastError({ title: sk.toast.actionFailed, description: localizeError(e) })
    } finally {
      setLibraryDirBusy(false)
    }
  }

  const handleSaveFilenameTemplate = async () => {
    setFilenameBusy(true)
    try {
      const preview = await setFilenameTemplate(filenameDraft.trim() || "recording-{date}-{time}")
      setFilenameDraft(preview.template)
      setFilenameExample(preview.example)
      toastSuccess({ title: sk.toast.filenameTemplateSaved })
    } catch (e) {
      toastError({ title: sk.toast.actionFailed, description: localizeError(e) })
    } finally {
      setFilenameBusy(false)
    }
  }

  const handleTrayRecentChange = async (count: number) => {
    setTrayBusy(true)
    try {
      const next = await setTrayRecentCount(count)
      setTrayRecent(next)
    } catch (e) {
      toastError({ title: sk.toast.actionFailed, description: localizeError(e) })
    } finally {
      setTrayBusy(false)
    }
  }

  const handlePurgeOrphans = async () => {
    setPurgeBusy(true)
    try {
      const result = await purgeLibraryOrphans()
      await refreshLibraryStats()
      toastSuccess({
        title: sk.toast.purged(result.removedSidecars, result.removedEmptyVideos),
      })
    } catch (e) {
      toastError({ title: sk.toast.actionFailed, description: localizeError(e) })
    } finally {
      setPurgeBusy(false)
    }
  }

  const handleToggleAutoOptimize = async () => {
    const next = !autoOptimize
    setAutoOptimize(next)
    try {
      setAutoOptimize(await setAutoOptimizeAfterRecord(next))
    } catch (e) {
      setAutoOptimize(!next)
      toastError({ title: sk.toast.actionFailed, description: localizeError(e) })
    }
  }

  const commitDiskMin = async () => {
    const mb = Math.max(0, Math.floor(Number(diskMinDraft) || 0))
    try {
      setDiskMinDraft(String(await setDiskSpaceMinMb(mb)))
    } catch (e) {
      toastError({ title: sk.toast.actionFailed, description: localizeError(e) })
    }
  }

  const handleRegenThumbs = async () => {
    setThumbsBusy(true)
    try {
      const { updated } = await regenerateThumbnails(false)
      toastSuccess({ title: sk.toast.thumbsRegenerated(updated) })
    } catch (e) {
      toastError({ title: sk.toast.actionFailed, description: localizeError(e) })
    } finally {
      setThumbsBusy(false)
    }
  }

  const handleRepairSidecars = async () => {
    setRepairBusy(true)
    try {
      const { repaired } = await repairSidecars()
      await refreshLibraryStats()
      toastSuccess({ title: sk.toast.sidecarsRepaired(repaired) })
    } catch (e) {
      toastError({ title: sk.toast.actionFailed, description: localizeError(e) })
    } finally {
      setRepairBusy(false)
    }
  }

  const handleRecover = async (filename: string) => {
    setIncompleteBusy(filename)
    try {
      const meta = await recoverIncompleteSession(filename)
      toastSuccess({ title: sk.toast.sessionRecovered(meta.title) })
      refreshIncomplete()
      refreshRecent()
      await refreshLibraryStats()
    } catch (e) {
      toastError({ title: sk.toast.actionFailed, description: localizeError(e) })
    } finally {
      setIncompleteBusy(null)
    }
  }

  const handleDiscard = async (filename: string) => {
    setIncompleteBusy(filename)
    try {
      await discardIncompleteSession(filename)
      toastSuccess({ title: sk.toast.sessionDiscarded })
      refreshIncomplete()
    } catch (e) {
      toastError({ title: sk.toast.actionFailed, description: localizeError(e) })
    } finally {
      setIncompleteBusy(null)
    }
  }

  const permissionRows: { key: keyof CapturePermissions; label: string; icon: typeof Monitor }[] = [
    { key: "screen", label: sk.settings.permScreen, icon: Monitor },
    { key: "microphone", label: sk.settings.permMic, icon: Mic },
    { key: "camera", label: sk.settings.permCamera, icon: Video },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <MacPageHeader eyebrow={sk.pageEyebrow.settings} title={sk.settings.title} subtitle={sk.settings.subtitle} />

      <PageScrollArea active={active} className="pb-6">
        <MacGroupHeader>{sk.settings.appearance}</MacGroupHeader>
        <MacGroup>
          <div className="grid max-h-[520px] grid-cols-2 gap-2.5 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4">
            {THEMES.map((t) => {
              const active = settings.theme === t.id
              return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleThemeChange(t.id)}
                className={cn(
                  "theme-card bloom-card relative rounded-lg p-2.5 text-left min-h-[76px] cursor-pointer",
                  active && "bloom-card-active",
                )}
              >
                {active && (
                  <span className="absolute right-2 top-2 z-[1] flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                )}
                <div
                  className="mb-2 h-8 rounded-md ring-1 ring-black/5"
                  style={{
                    background: `linear-gradient(135deg, ${t.swatch[0]} 0%, ${t.swatch[1]} 42%, ${t.swatch[2]} 100%)`,
                  }}
                />
                <p className="theme-card__name">{t.name}</p>
                <p className="theme-card__desc">{t.description}</p>
              </button>
            )})}
          </div>
        </MacGroup>

        <MacGroupHeader>{sk.settings.general}</MacGroupHeader>
        <MacGroup>
          <div className="flex flex-col gap-4 p-3">
            <ChoiceGroup
              label={sk.settings.language}
              layout="wrap"
              options={LOCALES.map((l) => ({
                value: l.id,
                label: l.nativeLabel,
                hint: l.englishLabel,
              }))}
              value={general.locale}
              onChange={(v) => updateGeneral({ locale: v as LocaleId })}
            />
          </div>
          <MacRow
            label={sk.settings.startMaximized}
            hint={sk.settings.startMaximizedHint}
            onClick={() => updateGeneral({ startMaximized: !general.startMaximized })}
          >
            <MacToggle
              on={general.startMaximized}
              onChange={() => updateGeneral({ startMaximized: !general.startMaximized })}
            />
          </MacRow>
          <MacRow
            label={sk.settings.openLibraryAfterRecord}
            onClick={() => updateGeneral({ openLibraryAfterRecord: !general.openLibraryAfterRecord })}
          >
            <MacToggle
              on={general.openLibraryAfterRecord}
              onChange={() => updateGeneral({ openLibraryAfterRecord: !general.openLibraryAfterRecord })}
            />
          </MacRow>
          <MacRow
            label={sk.settings.showNewsBadge}
            hint={sk.settings.showNewsBadgeHint}
            onClick={() => updateGeneral({ showNewsBadge: !general.showNewsBadge })}
          >
            <MacToggle
              on={general.showNewsBadge}
              onChange={() => updateGeneral({ showNewsBadge: !general.showNewsBadge })}
            />
          </MacRow>
          <MacRow
            label={sk.settings.confirmDelete}
            hint={sk.settings.confirmDeleteHint}
            onClick={() => updateGeneral({ confirmDelete: !general.confirmDelete })}
          >
            <MacToggle
              on={general.confirmDelete}
              onChange={() => updateGeneral({ confirmDelete: !general.confirmDelete })}
            />
          </MacRow>
          <MacRow
            label={sk.settings.reduceTransparency}
            hint={sk.settings.reduceTransparencyHint}
            onClick={() => updateGeneral({ reduceTransparency: !general.reduceTransparency })}
          >
            <MacToggle
              on={general.reduceTransparency}
              onChange={() => updateGeneral({ reduceTransparency: !general.reduceTransparency })}
            />
          </MacRow>
        </MacGroup>

        <MacGroupHeader>{sk.settings.recording}</MacGroupHeader>
        <MacGroup>
          <div className="flex flex-col gap-4 p-3">
            <ChoiceGroup
              label={sk.settings.quality}
              options={RECORDING_QUALITIES.map((q) => ({ value: q, label: sk.qualities[q] }))}
              value={settings.recording.defaultQuality}
              onChange={(v) => updateRecording({ defaultQuality: v })}
            />
            <ChoiceGroup
              label={sk.settings.countdown}
              options={[
                { value: "0", label: sk.record.countdownOff },
                { value: "3", label: "3 s" },
                { value: "5", label: "5 s" },
              ]}
              value={String(settings.recording.defaultCountdown)}
              onChange={(v) => updateRecording({ defaultCountdown: Number(v) as 0 | 3 | 5 })}
            />
            <ChoiceGroup
              label={sk.settings.pipSize}
              options={(["small", "medium", "large"] as const).map((v) => ({
                value: v,
                label: sk.record.pipSizes[v],
              }))}
              value={settings.recording.pipSize}
              onChange={(v) => updateRecording({ pipSize: v })}
            />
            <ChoiceGroup
              label={sk.settings.pipPosition}
              options={(["bottom-right", "bottom-left", "top-right", "top-left"] as const).map((v) => ({
                value: v,
                label: sk.record.pipPositions[v],
              }))}
              value={settings.recording.pipPosition}
              onChange={(v) => updateRecording({ pipPosition: v })}
            />
          </div>
          <MacRow
            label={sk.settings.hideWindow}
            hint={sk.settings.hideWindowHint}
            onClick={() => updateRecording({ minimizeOnRecord: !settings.recording.minimizeOnRecord })}
          >
            <MacToggle
              on={settings.recording.minimizeOnRecord}
              onChange={() => updateRecording({ minimizeOnRecord: !settings.recording.minimizeOnRecord })}
            />
          </MacRow>
          <MacRow
            label={sk.settings.cursorSpotlight}
            onClick={() => updateRecording({ cursorHighlight: !settings.recording.cursorHighlight })}
          >
            <MacToggle
              on={settings.recording.cursorHighlight}
              onChange={() => updateRecording({ cursorHighlight: !settings.recording.cursorHighlight })}
            />
          </MacRow>
          <MacRow
            label={sk.settings.cameraBlur}
            onClick={() => updateRecording({ cameraBlur: !settings.recording.cameraBlur })}
          >
            <MacToggle
              on={settings.recording.cameraBlur}
              onChange={() => updateRecording({ cameraBlur: !settings.recording.cameraBlur })}
            />
          </MacRow>
          <MacRow
            label={sk.settings.autoOptimize}
            hint={sk.settings.autoOptimizeHint}
            onClick={() => { void handleToggleAutoOptimize() }}
          >
            <MacToggle on={autoOptimize} onChange={() => { void handleToggleAutoOptimize() }} />
          </MacRow>
          <MacRow label={sk.settings.diskSpaceMin} hint={sk.settings.diskSpaceMinHint}>
            <Input
              type="number"
              min={0}
              step={50}
              value={diskMinDraft}
              placeholder="200"
              onChange={(e) => setDiskMinDraft(e.target.value)}
              onBlur={() => { void commitDiskMin() }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
              className="w-20 text-right"
            />
          </MacRow>
        </MacGroup>

        <MacGroupHeader>{sk.settings.exportDefaults}</MacGroupHeader>
        <MacGroup>
          <div className="flex flex-col gap-4 p-3">
            <ChoiceGroup
              label={sk.settings.exportPreset}
              options={[
                { value: "small", label: sk.optimize.presets.small.label, hint: sk.optimize.presets.small.hint },
                { value: "medium", label: sk.optimize.presets.medium.label, hint: sk.optimize.presets.medium.hint },
                { value: "high", label: sk.optimize.presets.high.label, hint: sk.optimize.presets.high.hint },
              ]}
              value={exportDefaults.preset}
              onChange={(v) => updateExportDefaults({ preset: v })}
            />
            <ChoiceGroup
              label={sk.settings.exportResolution}
              layout="wrap"
              options={[
                { value: "480p", label: sk.optimize.resolutions["480p"] },
                { value: "720p", label: sk.optimize.resolutions["720p"] },
                { value: "1080p", label: sk.optimize.resolutions["1080p"] },
                { value: "original", label: sk.optimize.resolutions.original },
              ]}
              value={exportDefaults.resolution}
              onChange={(v) => updateExportDefaults({ resolution: v })}
            />
            <ChoiceGroup
              label={sk.settings.exportFormat}
              layout="wrap"
              options={[
                { value: "mp4", label: "MP4" },
                { value: "mov", label: "MOV" },
                { value: "m4v", label: "M4V" },
                { value: "mkv", label: "MKV" },
                { value: "avi", label: "AVI" },
                { value: "mpeg", label: "MPEG" },
                { value: "webm", label: "WebM" },
                { value: "gif", label: "GIF" },
              ]}
              value={exportDefaults.format}
              onChange={(v) => updateExportDefaults({ format: v })}
            />
          </div>
          <MacRow
            label={sk.settings.preferStreamCopy}
            hint={sk.settings.preferStreamCopyHint}
            onClick={() => updateExportDefaults({ preferStreamCopy: !exportDefaults.preferStreamCopy })}
          >
            <MacToggle
              on={exportDefaults.preferStreamCopy}
              onChange={() => updateExportDefaults({ preferStreamCopy: !exportDefaults.preferStreamCopy })}
            />
          </MacRow>
          <MacRow
            label={sk.settings.preferHardwareEncode}
            hint={sk.settings.preferHardwareEncodeHint}
            onClick={() => updateExportDefaults({ preferHardwareEncode: !exportDefaults.preferHardwareEncode })}
          >
            <MacToggle
              on={exportDefaults.preferHardwareEncode}
              onChange={() => updateExportDefaults({ preferHardwareEncode: !exportDefaults.preferHardwareEncode })}
            />
          </MacRow>
        </MacGroup>

        <MacGroupHeader>{sk.settings.autoStop}</MacGroupHeader>
        <MacGroup>
          <MacRow label={sk.settings.maxDuration} hint={sk.settings.maxDurationHint}>
            <Input
              type="number"
              min={0}
              max={240}
              value={Math.round(settings.recording.maxDurationSecs / 60) || ""}
              placeholder="0"
              onChange={(e) => updateRecording({ maxDurationSecs: Math.max(0, Number(e.target.value) || 0) * 60 })}
              className="w-16 text-right"
            />
          </MacRow>
          <MacRow label={sk.settings.idleTimeout} hint={sk.settings.idleTimeoutHint}>
            <Input
              type="number"
              min={0}
              max={60}
              value={Math.round(settings.recording.idleStopSecs / 60) || ""}
              placeholder="0"
              onChange={(e) => updateRecording({ idleStopSecs: Math.max(0, Number(e.target.value) || 0) * 60 })}
              className="w-16 text-right"
            />
          </MacRow>
        </MacGroup>

        <MacGroupHeader>{sk.settings.drawingDefaults}</MacGroupHeader>
        <MacGroup>
          <div className="flex flex-wrap gap-2 p-3">
            {ANNOTATION_COLORS.map((c) => (
              <button
                key={c.id}
                title={c.label}
                onClick={() => updateAnnotation({ defaultColor: c.hex })}
                className={cn(
                  "size-7 rounded-full border-2",
                  settings.annotation.defaultColor === c.hex ? "border-[var(--accent)] scale-110" : "border-transparent",
                )}
                style={{ background: c.hex }}
              />
            ))}
          </div>
          <MacRow label={sk.settings.strokeWidth}>
            <input
              type="range"
              min={1}
              max={12}
              value={settings.annotation.defaultWidth}
              onChange={(e) => updateAnnotation({ defaultWidth: Number(e.target.value) })}
              className="w-24 accent-[var(--accent)]"
            />
          </MacRow>
          <div className="flex flex-wrap gap-1.5 p-3 pt-0">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                onClick={() => updateAnnotation({ defaultTool: t.id })}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12px] font-medium",
                  settings.annotation.defaultTool === t.id
                    ? "bg-[var(--sidebar-active)] text-foreground"
                    : "text-muted-foreground hover:bg-[var(--sidebar-hover)]",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </MacGroup>

        <ShortcutsPanel />

        <MacGroupHeader>{sk.legal.privacyTitle}</MacGroupHeader>
        <MacGroup>
          <MacRow label={sk.legal.openPrivacy} hint={sk.legal.openPrivacyHint}>
            <Button variant="outline" size="sm" className="text-[11px]" onClick={() => setShowPrivacy(true)}>
              <Shield className="size-3" /> {sk.legal.readPolicy}
            </Button>
          </MacRow>
          <MacRow label={sk.privacy.openScreen} hint={sk.privacy.screenHint}>
            <Button
              variant="outline"
              size="sm"
              className="text-[11px]"
              onClick={() => void openPrivacySettings("screen")}
            >
              <Video className="size-3" /> {sk.privacy.openScreen}
            </Button>
          </MacRow>
          <MacRow label={sk.privacy.openCamera}>
            <div className="flex flex-wrap justify-end gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="text-[11px]"
                onClick={() => void openPrivacySettings("camera")}
              >
                <Video className="size-3" /> {sk.privacy.openCamera}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-[11px]"
                onClick={() => void openPrivacySettings("microphone")}
              >
                <Mic className="size-3" /> {sk.privacy.openMic}
              </Button>
            </div>
          </MacRow>
        </MacGroup>

        <MacGroupHeader>{sk.settings.permissions}</MacGroupHeader>
        <MacGroup>
          {permissionRows.map(({ key, label, icon: Icon }) => {
            const ok = permissions?.[key]
            return (
              <MacRow key={key} label={label} hint={key === "screen" ? sk.settings.permissionsHint : undefined}>
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold",
                    permissions === null ? "border-border/60 text-muted-foreground" : ok ? "tone-soft-success" : "tone-soft-warning",
                  )}
                >
                  <Icon className="size-3" />
                  {permissions === null ? "—" : ok ? sk.settings.permGranted : sk.settings.permNotGranted}
                </span>
              </MacRow>
            )
          })}
          <MacRow label={sk.settings.permRefresh}>
            <Button variant="outline" size="sm" className="text-[11px]" onClick={refreshPermissions}>
              <RefreshCw className="size-3" /> {sk.settings.permRefresh}
            </Button>
          </MacRow>
        </MacGroup>

        <MacGroupHeader>{sk.settings.integrations}</MacGroupHeader>
        <MacGroup>
          <MacRow
            label={sk.settings.notifyOnExport}
            hint={sk.settings.notifyOnExportHint}
            onClick={() => updateIntegrations({ notifyOnExport: !integ.notifyOnExport })}
          >
            <MacToggle
              on={integ.notifyOnExport}
              onChange={() => updateIntegrations({ notifyOnExport: !integ.notifyOnExport })}
            />
          </MacRow>
          <MacRow label={sk.settings.slackWebhook} hint={sk.settings.slackWebhookHint}>
            <Input
              type="url"
              placeholder="https://hooks.slack.com/…"
              value={integ.slackWebhookUrl}
              onChange={(e) => updateIntegrations({ slackWebhookUrl: e.target.value.trim() })}
              className="w-[min(100%,14rem)] text-[11px]"
            />
          </MacRow>
          <MacRow label={sk.settings.discordWebhook} hint={sk.settings.discordWebhookHint}>
            <Input
              type="url"
              placeholder="https://discord.com/api/webhooks/…"
              value={integ.discordWebhookUrl}
              onChange={(e) => updateIntegrations({ discordWebhookUrl: e.target.value.trim() })}
              className="w-[min(100%,14rem)] text-[11px]"
            />
          </MacRow>
          <MacRow
            label={sk.settings.openAfterExport}
            hint={sk.settings.openAfterExportHint}
            onClick={() => updateIntegrations({ openAfterExport: !integ.openAfterExport })}
          >
            <MacToggle
              on={integ.openAfterExport}
              onChange={() => updateIntegrations({ openAfterExport: !integ.openAfterExport })}
            />
          </MacRow>
          <MacRow
            label={sk.settings.copyPathAfterExport}
            onClick={() => updateIntegrations({ copyPathAfterExport: !integ.copyPathAfterExport })}
          >
            <MacToggle
              on={integ.copyPathAfterExport}
              onChange={() => updateIntegrations({ copyPathAfterExport: !integ.copyPathAfterExport })}
            />
          </MacRow>
          <MacRow
            label={sk.ux.autoShare.label}
            hint={sk.ux.autoShare.hint}
            onClick={() => updateIntegrations({ autoShareAfterExport: !integ.autoShareAfterExport })}
          >
            <MacToggle
              on={integ.autoShareAfterExport}
              onChange={() => updateIntegrations({ autoShareAfterExport: !integ.autoShareAfterExport })}
            />
          </MacRow>
          <MacRow
            label={sk.settings.preferNativeShare}
            hint={sk.share.nativeHint}
            onClick={() => updateIntegrations({ preferNativeShare: !integ.preferNativeShare })}
          >
            <MacToggle
              on={integ.preferNativeShare}
              onChange={() => updateIntegrations({ preferNativeShare: !integ.preferNativeShare })}
            />
          </MacRow>
        </MacGroup>

        <MacGroupHeader>{sk.settings.updates}</MacGroupHeader>
        <MacGroup>
          <MacRow label={sk.settings.updates} hint={sk.settings.updatesHint}>
            <Button
              variant="outline"
              size="sm"
              disabled={updateBusy}
              onClick={() => { void handleCheckUpdates() }}
              className="text-[11px]"
            >
              <RefreshCw className={cn("size-3", updateBusy && "animate-spin")} />
              {sk.settings.checkUpdates}
            </Button>
          </MacRow>
        </MacGroup>

        <MacGroupHeader>{sk.settings.presets}</MacGroupHeader>
        <div className="px-6">
          <PresetEditor
            presets={settings.recording.presets}
            onChange={(presets) => updateRecording({ presets })}
          />
        </div>

        <div className="px-6 pt-4">
          <Button variant="ghost" onClick={handleResetSettings} className="text-muted-foreground">
            <RotateCcw className="size-4" /> {sk.settings.resetDefaults}
          </Button>
        </div>

        <MacGroupHeader>{sk.settings.library}</MacGroupHeader>
        <MacGroup>
          <MacRow
            label={sk.settings.libraryFolder}
            hint={sk.settings.libraryFolderHint}
          >
            <div className="flex max-w-[min(100%,18rem)] flex-col items-end gap-1.5">
              <p className="w-full truncate text-right font-mono text-[10px] text-muted-foreground">
                {libraryDir?.path ?? "…"}
              </p>
              <div className="flex flex-wrap justify-end gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={libraryDirBusy}
                  onClick={() => { void handleChooseLibraryFolder() }}
                  className="text-[11px]"
                >
                  <FolderOpen className="size-3" /> {sk.settings.libraryFolderChoose}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void openLibraryFolder().catch((e) =>
                      toastError({ title: sk.toast.actionFailed, description: localizeError(e) }),
                    )
                  }}
                  className="text-[11px]"
                >
                  <FolderOpen className="size-3" /> {sk.settings.libraryFolderOpen}
                </Button>
                {libraryDir?.is_custom && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={libraryDirBusy}
                    onClick={() => { void handleResetLibraryFolder() }}
                    className="text-[11px] text-muted-foreground"
                  >
                    {sk.settings.libraryFolderReset}
                  </Button>
                )}
              </div>
            </div>
          </MacRow>
          <MacRow
            label={sk.settings.libraryFolderMigrate}
            hint={sk.settings.libraryFolderMigrateHint}
            onClick={() => setMigrateOnChoose((v) => !v)}
          >
            <MacToggle on={migrateOnChoose} onChange={() => setMigrateOnChoose((v) => !v)} />
          </MacRow>
          <MacRow
            label={sk.settings.filenameTemplate}
            hint={sk.settings.filenameTemplateHint}
          >
            <div className="flex max-w-[min(100%,18rem)] flex-col items-end gap-1.5">
              <Input
                value={filenameDraft}
                onChange={(e) => setFilenameDraft(e.target.value)}
                className="w-full font-mono text-[11px]"
                spellCheck={false}
              />
              {filenameExample && (
                <p className="w-full truncate text-right font-mono text-[10px] text-muted-foreground">
                  {sk.settings.filenameTemplateExample}: {filenameExample}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={filenameBusy}
                onClick={() => { void handleSaveFilenameTemplate() }}
                className="text-[11px]"
              >
                {sk.settings.filenameTemplateSave}
              </Button>
            </div>
          </MacRow>
          <MacRow
            label={sk.settings.trayRecentCount}
            hint={sk.settings.trayRecentCountHint}
          >
            <select
              value={trayRecent}
              disabled={trayBusy}
              onChange={(e) => { void handleTrayRecentChange(Number(e.target.value)) }}
              className="h-8 rounded-md border border-border bg-background px-2 text-[11px]"
            >
              {Array.from({ length: 9 }, (_, i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </MacRow>
          <MacRow
            label={sk.settings.purgeOrphans}
            hint={sk.settings.purgeOrphansHint}
          >
            <Button
              variant="outline"
              size="sm"
              disabled={purgeBusy}
              onClick={() => { void handlePurgeOrphans() }}
              className="text-[11px]"
            >
              <Sparkles className={cn("size-3", purgeBusy && "animate-spin")} />
              {sk.settings.purgeOrphansBtn}
            </Button>
          </MacRow>
          <MacRow label={sk.settings.regenThumbs} hint={sk.settings.regenThumbsHint}>
            <Button
              variant="outline"
              size="sm"
              disabled={thumbsBusy}
              onClick={() => { void handleRegenThumbs() }}
              className="text-[11px]"
            >
              <RefreshCw className={cn("size-3", thumbsBusy && "animate-spin")} />
              {sk.settings.regenThumbsBtn}
            </Button>
          </MacRow>
          <MacRow label={sk.settings.repairSidecars} hint={sk.settings.repairSidecarsHint}>
            <Button
              variant="outline"
              size="sm"
              disabled={repairBusy}
              onClick={() => { void handleRepairSidecars() }}
              className="text-[11px]"
            >
              <Wrench className={cn("size-3", repairBusy && "animate-pulse")} />
              {sk.settings.repairSidecarsBtn}
            </Button>
          </MacRow>
          <MacRow
            label={sk.settings.deleteAll}
            hint={sk.settings.deleteAllHint(libraryCount, formatBytes(librarySize))}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDeleteAll(true)}
              disabled={libraryCount === 0}
              className="border tone-soft-error text-[12px] font-semibold hover:opacity-90"
            >
              <Trash2 className="size-3.5" /> {sk.settings.deleteAllBtn}
            </Button>
          </MacRow>
          {appInfo && (
            <MacRow label={sk.settings.appInfo} hint={sk.settings.appInfoHint}>
              <p className="max-w-[min(100%,18rem)] text-right font-mono text-[10px] text-muted-foreground">
                {appInfo.name} {appInfo.version} · {appInfo.platform}
                <br />
                ffmpeg {appInfo.ffmpegAvailable ? (appInfo.ffmpegVersion ?? "ok") : "—"}
              </p>
            </MacRow>
          )}
        </MacGroup>

        <MacGroupHeader>{sk.settings.incompleteSessions}</MacGroupHeader>
        <MacGroup>
          {incomplete.length === 0 ? (
            <MacRow label={sk.settings.incompleteNone} hint={sk.settings.incompleteSessionsHint} />
          ) : (
            incomplete.map((s) => (
              <MacRow
                key={s.filename}
                label={s.filename}
                hint={formatBytes(s.size_bytes)}
              >
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={incompleteBusy === s.filename}
                    onClick={() => { void handleRecover(s.filename) }}
                    className="text-[11px]"
                  >
                    <LifeBuoy className="size-3" /> {sk.settings.recoverBtn}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={incompleteBusy === s.filename}
                    onClick={() => { void handleDiscard(s.filename) }}
                    className="border tone-soft-error text-[11px]"
                  >
                    <Trash2 className="size-3" /> {sk.settings.discardBtn}
                  </Button>
                </div>
              </MacRow>
            ))
          )}
        </MacGroup>

        <MacGroupHeader>{sk.settings.recentRecordings}</MacGroupHeader>
        <MacGroup>
          {recent.length === 0 ? (
            <MacRow label={sk.settings.recentNone} />
          ) : (
            recent.map((r) => (
              <MacRow
                key={r.meta.id}
                label={r.meta.title}
                hint={`${formatBytes(r.meta.file_size_bytes)} · ${new Date(r.meta.created_at).toLocaleString()}`}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[11px]"
                  disabled={!onOpenRecording}
                  onClick={() => onOpenRecording?.(r.meta.id)}
                >
                  <Play className="size-3" /> {sk.settings.recentOpen}
                </Button>
              </MacRow>
            ))
          )}
        </MacGroup>
      </PageScrollArea>

      <ConfirmDeleteAll
        open={confirmDeleteAll}
        count={libraryCount}
        sizeLabel={formatBytes(librarySize)}
        busy={deleteAllBusy}
        onCancel={() => setConfirmDeleteAll(false)}
        onConfirm={() => { void handleDeleteAll() }}
      />

      <PrivacyPolicyModal open={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </div>
  )
}
