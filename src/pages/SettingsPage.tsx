import { useCallback, useEffect, useState } from "react"
import { RotateCcw, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { THEMES, type ThemeId } from "@/lib/themes"
import { ANNOTATION_COLORS, useSettings, type AnnotationTool } from "@/hooks/useSettings"
import { deleteAllRecordings, formatBytes, getLibraryStats } from "@/hooks/useBloomBackend"
import { ConfirmDeleteAll } from "@/components/library/ConfirmDeleteAll"
import { PresetEditor } from "@/components/settings/PresetEditor"
import { MacGroup, MacGroupHeader, MacPageHeader, MacRow, MacSegmented, MacToggle } from "@/components/mac/MacUIKit"

const TOOLS: { id: AnnotationTool; label: string }[] = [
  { id: "pen", label: "Pen" },
  { id: "highlighter", label: "Highlighter" },
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
  { id: "rect", label: "Rect" },
  { id: "circle", label: "Circle" },
]

export function SettingsPage() {
  const { settings, setTheme, updateAnnotation, updateRecording, resetSettings } = useSettings()
  const [libraryCount, setLibraryCount] = useState(0)
  const [librarySize, setLibrarySize] = useState(0)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deleteAllBusy, setDeleteAllBusy] = useState(false)

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

  useEffect(() => {
    void refreshLibraryStats()
  }, [refreshLibraryStats])

  const handleDeleteAll = async () => {
    setDeleteAllBusy(true)
    try {
      await deleteAllRecordings()
      setLibraryCount(0)
      setLibrarySize(0)
      setConfirmDeleteAll(false)
    } finally {
      setDeleteAllBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <MacPageHeader title="Settings" subtitle="Appearance and recording defaults" />

      <div className="flex-1 overflow-y-auto pb-6">
        <MacGroupHeader>Appearance</MacGroupHeader>
        <MacGroup>
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id as ThemeId)}
                className={cn(
                  "rounded-lg border p-2.5 text-left transition-colors",
                  settings.theme === t.id
                    ? "border-[var(--accent)] bg-[var(--sidebar-active)]"
                    : "border-transparent hover:bg-[var(--sidebar-hover)]",
                )}
              >
                <div className="mb-2 h-6 rounded-md" style={{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }} />
                <p className="text-[12px] font-medium">{t.name}</p>
              </button>
            ))}
          </div>
        </MacGroup>

        <MacGroupHeader>Recording</MacGroupHeader>
        <MacGroup>
          <MacRow label="Quality">
            <MacSegmented
              className="!w-auto"
              options={[{ value: "720p", label: "720p" }, { value: "1080p", label: "1080p" }]}
              value={settings.recording.defaultQuality}
              onChange={(v) => updateRecording({ defaultQuality: v })}
            />
          </MacRow>
          <MacRow label="Countdown">
            <MacSegmented
              className="!w-auto"
              options={[{ value: "0", label: "Off" }, { value: "3", label: "3s" }, { value: "5", label: "5s" }]}
              value={String(settings.recording.defaultCountdown)}
              onChange={(v) => updateRecording({ defaultCountdown: Number(v) as 0 | 3 | 5 })}
            />
          </MacRow>
          <MacRow label="Hide window when recording" hint="Shows a small HUD for controls">
            <MacToggle
              on={settings.recording.minimizeOnRecord}
              onChange={() => updateRecording({ minimizeOnRecord: !settings.recording.minimizeOnRecord })}
            />
          </MacRow>
          <MacRow label="Cursor spotlight">
            <MacToggle
              on={settings.recording.cursorHighlight}
              onChange={() => updateRecording({ cursorHighlight: !settings.recording.cursorHighlight })}
            />
          </MacRow>
          <MacRow label="Camera blur">
            <MacToggle
              on={settings.recording.cameraBlur}
              onChange={() => updateRecording({ cameraBlur: !settings.recording.cameraBlur })}
            />
          </MacRow>
        </MacGroup>

        <MacGroupHeader>Auto-stop</MacGroupHeader>
        <MacGroup>
          <MacRow label="Max duration (min)" hint="0 = off">
            <input
              type="number"
              min={0}
              max={240}
              value={Math.round(settings.recording.maxDurationSecs / 60) || ""}
              placeholder="0"
              onChange={(e) => updateRecording({ maxDurationSecs: Math.max(0, Number(e.target.value) || 0) * 60 })}
              className="w-16 rounded-md border border-border bg-[var(--background)] px-2 py-1 text-right text-[13px] outline-none focus:border-[var(--accent)]"
            />
          </MacRow>
          <MacRow label="Idle timeout (min)" hint="Stops when inactive">
            <input
              type="number"
              min={0}
              max={60}
              value={Math.round(settings.recording.idleStopSecs / 60) || ""}
              placeholder="0"
              onChange={(e) => updateRecording({ idleStopSecs: Math.max(0, Number(e.target.value) || 0) * 60 })}
              className="w-16 rounded-md border border-border bg-[var(--background)] px-2 py-1 text-right text-[13px] outline-none focus:border-[var(--accent)]"
            />
          </MacRow>
        </MacGroup>

        <MacGroupHeader>Drawing defaults</MacGroupHeader>
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
          <MacRow label="Stroke width">
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

        <MacGroupHeader>Presets</MacGroupHeader>
        <div className="px-6">
          <PresetEditor
            presets={settings.recording.presets}
            onChange={(presets) => updateRecording({ presets })}
          />
        </div>

        <div className="px-6 pt-4">
          <button
            onClick={resetSettings}
            className="mac-btn mac-btn-ghost text-muted-foreground"
          >
            <RotateCcw className="size-4" /> Reset defaults
          </button>
        </div>

        <MacGroupHeader>Library</MacGroupHeader>
        <MacGroup>
          <MacRow
            label="Delete all recordings"
            hint={
              libraryCount > 0
                ? `${libraryCount} file${libraryCount === 1 ? "" : "s"} · ${formatBytes(librarySize)} on disk`
                : "No recordings in library"
            }
          >
            <button
              type="button"
              onClick={() => setConfirmDeleteAll(true)}
              disabled={libraryCount === 0}
              className="mac-btn border border-red-500/30 bg-red-500/8 text-[12px] font-semibold text-red-300 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="size-3.5" /> Delete all
            </button>
          </MacRow>
        </MacGroup>
      </div>

      {confirmDeleteAll && (
        <ConfirmDeleteAll
          count={libraryCount}
          sizeLabel={formatBytes(librarySize)}
          busy={deleteAllBusy}
          onCancel={() => setConfirmDeleteAll(false)}
          onConfirm={() => { void handleDeleteAll() }}
        />
      )}
    </div>
  )
}
