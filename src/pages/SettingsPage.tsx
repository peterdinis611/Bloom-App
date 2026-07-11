import { useCallback, useEffect, useState } from "react"
import { RotateCcw, Trash2, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { sk } from "@/lib/i18n/sk"
import { RECORDING_QUALITIES } from "@/lib/videoOptions"
import { THEMES, type ThemeId } from "@/lib/themes"
import { ANNOTATION_COLORS, useSettings, type AnnotationTool } from "@/hooks/useSettings"
import { deleteAllRecordings, formatBytes, getLibraryStats } from "@/hooks/useBloomBackend"
import { ConfirmDeleteAll } from "@/components/library/ConfirmDeleteAll"
import { PageScrollArea } from "@/components/layout/PageScrollArea"
import { PresetEditor } from "@/components/settings/PresetEditor"
import { MacGroup, MacGroupHeader, MacPageHeader, MacRow, MacToggle, ChoiceGroup } from "@/components/mac/MacUIKit"

const TOOLS: { id: AnnotationTool; label: string }[] = [
  { id: "pen", label: sk.settings.tools.pen },
  { id: "highlighter", label: sk.settings.tools.highlighter },
  { id: "line", label: sk.settings.tools.line },
  { id: "arrow", label: sk.settings.tools.arrow },
  { id: "rect", label: sk.settings.tools.rect },
  { id: "circle", label: sk.settings.tools.circle },
]

export function SettingsPage({ active = true }: { active?: boolean }) {
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
      <MacPageHeader title={sk.settings.title} subtitle={sk.settings.subtitle} />

      <PageScrollArea active={active} className="pb-6">
        <MacGroupHeader>{sk.settings.appearance}</MacGroupHeader>
        <MacGroup>
          <div className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-3">
            {THEMES.map((t) => {
              const active = settings.theme === t.id
              return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id as ThemeId)}
                className={cn(
                  "bloom-card relative rounded-lg p-2.5 text-left transition-all min-h-[72px] cursor-pointer",
                  active && "bloom-card-active ring-2 ring-accent/30",
                )}
              >
                {active && (
                  <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-accent text-white">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                )}
                <div className="mb-2 h-7 rounded-md shadow-inner" style={{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }} />
                <p className="text-[12px] font-semibold">{t.name}</p>
                <p className="text-[10px] text-muted-foreground">{t.description}</p>
              </button>
            )})}
          </div>
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

        <MacGroupHeader>{sk.settings.presets}</MacGroupHeader>
        <div className="px-6">
          <PresetEditor
            presets={settings.recording.presets}
            onChange={(presets) => updateRecording({ presets })}
          />
        </div>

        <div className="px-6 pt-4">
          <Button variant="ghost" onClick={resetSettings} className="text-muted-foreground">
            <RotateCcw className="size-4" /> {sk.settings.resetDefaults}
          </Button>
        </div>

        <MacGroupHeader>{sk.settings.library}</MacGroupHeader>
        <MacGroup>
          <MacRow
            label={sk.settings.deleteAll}
            hint={sk.settings.deleteAllHint(libraryCount, formatBytes(librarySize))}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDeleteAll(true)}
              disabled={libraryCount === 0}
              className="border-red-500/30 bg-red-500/8 text-[12px] font-semibold text-red-300 hover:bg-red-500/15 hover:text-red-200"
            >
              <Trash2 className="size-3.5" /> {sk.settings.deleteAllBtn}
            </Button>
          </MacRow>
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
    </div>
  )
}
