import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  X,
  Scissors,
  Sparkles,
  Check,
  CircleAlert,
  FolderOpen,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
  FileVideo,
  Zap,
} from "lucide-react"
import { useCloseOnEscape } from "@/hooks/useCloseOnEscape"
import { cn } from "@/lib/utils"
import { sk, type OptimizeSpeed } from "@/lib/i18n/sk"
import { ChoiceGroup } from "@/components/mac/MacUIKit"
import { OPTIMIZE_SPEEDS, speedToNumber } from "@/lib/videoOptions"
import { clampTrimRange, formatEditorTime, parseEditorTime } from "@/lib/editorTime"
import { FilmstripTimeline } from "@/components/editor/FilmstripTimeline"
import { BloomVideoPlayer, type BloomVideoPlayerHandle } from "@/components/video/BloomVideoPlayer"
import type {
  ExportEstimate,
  OptimizeFormat,
  OptimizePreset,
  OptimizeResolution,
  RecordingEntry,
  VideoInfo,
} from "@/types"
import {
  cancelOptimize,
  estimateExport,
  formatBytes,
  formatDurationSecs,
  getFilmstrip,
  getVideoInfo,
  onOptimizeProgress,
  optimizeVideo,
  revealInFinder,
} from "@/hooks/useBloomBackend"

type Step = "preview" | "trim" | "export" | "running" | "done" | "error"
type SaveMode = "copy" | "replace"

const STEPS: Step[] = ["preview", "trim", "export"]
const PRESETS = [
  { value: "small" as const, label: sk.optimize.presets.small.label, hint: sk.optimize.presets.small.hint },
  { value: "medium" as const, label: sk.optimize.presets.medium.label, hint: sk.optimize.presets.medium.hint },
  { value: "high" as const, label: sk.optimize.presets.high.label, hint: sk.optimize.presets.high.hint },
]
const RESOLUTIONS = [
  { value: "480p" as const, label: sk.optimize.resolutions["480p"] },
  { value: "720p" as const, label: sk.optimize.resolutions["720p"] },
  { value: "1080p" as const, label: sk.optimize.resolutions["1080p"] },
  { value: "original" as const, label: sk.optimize.resolutions.original },
]
const FORMATS = [
  { value: "mp4" as const, label: "MP4" },
  { value: "webm" as const, label: "WebM" },
  { value: "gif" as const, label: "GIF" },
]
const SPEEDS: { value: OptimizeSpeed; label: string }[] = OPTIMIZE_SPEEDS.map((v) => ({
  value: v,
  label: sk.optimize.speeds[v],
}))
const SAVE_MODES = [
  { value: "copy" as const, label: sk.editor.saveCopy, hint: sk.editor.saveCopyHint },
  { value: "replace" as const, label: sk.editor.replaceOriginal, hint: sk.editor.replaceOriginalHint },
]

interface EditorModalProps {
  entry: RecordingEntry
  onClose: () => void
  onComplete: () => void
}

function StepIndicator({ step }: { step: Step }) {
  const idx = STEPS.indexOf(step)
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const active = i === idx
        const done = idx > i
        const labels = sk.editor.steps
        const label = s === "preview" ? labels.preview : s === "trim" ? labels.trim : labels.export
        return (
          <div key={s} className="flex min-w-0 flex-1 items-center gap-1.5">
            <div
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                active && "bg-primary text-white",
                done && !active && "bg-emerald-500/20 text-emerald-400",
                !active && !done && "bg-secondary text-muted-foreground",
              )}
            >
              {done && !active ? <Check className="size-3" /> : i + 1}
            </div>
            <span className={cn("truncate text-[10px] font-semibold", active ? "text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
            {i < STEPS.length - 1 && <div className="mx-0.5 h-px min-w-2 flex-1 bg-border/70" />}
          </div>
        )
      })}
    </div>
  )
}

export function EditorModal({ entry, onClose, onComplete }: EditorModalProps) {
  const playerRef = useRef<BloomVideoPlayerHandle>(null)
  const jobIdRef = useRef<string | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)

  const [step, setStep] = useState<Step>("preview")
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [duration, setDuration] = useState(entry.meta.duration_secs)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(entry.meta.duration_secs)
  const [playhead, setPlayhead] = useState(0)
  const [startText, setStartText] = useState("0:00.00")
  const [endText, setEndText] = useState(formatEditorTime(entry.meta.duration_secs))
  const [startError, setStartError] = useState(false)
  const [endError, setEndError] = useState(false)
  const [frames, setFrames] = useState<string[]>([])
  const [framesLoading, setFramesLoading] = useState(false)

  const [preset, setPreset] = useState<OptimizePreset>("medium")
  const [resolution, setResolution] = useState<OptimizeResolution>("720p")
  const [format, setFormat] = useState<OptimizeFormat>("mp4")
  const [speed, setSpeed] = useState<OptimizeSpeed>("1")
  const [saveMode, setSaveMode] = useState<SaveMode>("copy")
  const [estimate, setEstimate] = useState<ExportEstimate | null>(null)
  const [estimateLoading, setEstimateLoading] = useState(false)

  const [percent, setPercent] = useState(0)
  const [result, setResult] = useState<{ path: string; size: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const replaceOriginal = saveMode === "replace"

  const exportOptions = useMemo(
    () => ({
      input_path: entry.path,
      preset,
      resolution,
      format,
      speed: speedToNumber(speed),
      trim_start: trimStart,
      trim_end: trimEnd,
      add_to_library: !replaceOriginal,
      replace_original: replaceOriginal,
    }),
    [entry.path, preset, resolution, format, speed, trimStart, trimEnd, replaceOriginal],
  )

  useEffect(() => {
    getVideoInfo(entry.path)
      .then((i) => {
        setInfo(i)
        setDuration(i.duration_secs)
        setTrimEnd(i.duration_secs)
        setEndText(formatEditorTime(i.duration_secs))
      })
      .catch(() => {})

    let disposed = false
    onOptimizeProgress((p) => {
      if (p.job_id !== jobIdRef.current) return
      if (!p.done) { setPercent(p.percent); return }
      if (p.cancelled) { setStep("export"); setPercent(0); return }
      if (p.error) { setErrorMsg(p.error); setStep("error"); return }
      setPercent(100)
      setResult({ path: p.output_path ?? "", size: p.output_size_bytes ?? 0 })
      setStep("done")
    }).then((un) => {
      if (disposed) un()
      else unlistenRef.current = un
    })

    return () => {
      disposed = true
      unlistenRef.current?.()
    }
  }, [entry.path])

  useEffect(() => {
    if (step !== "trim") return
    setFramesLoading(true)
    getFilmstrip(entry.path, 12)
      .then(setFrames)
      .catch(() => setFrames([]))
      .finally(() => setFramesLoading(false))
  }, [entry.path, step])

  useEffect(() => {
    if (step !== "export") return
    if (replaceOriginal && format !== "mp4") {
      setFormat("mp4")
      return
    }
    setEstimateLoading(true)
    const timer = window.setTimeout(() => {
      estimateExport(exportOptions)
        .then(setEstimate)
        .catch(() => setEstimate(null))
        .finally(() => setEstimateLoading(false))
    }, 180)
    return () => window.clearTimeout(timer)
  }, [step, exportOptions, replaceOriginal, format])

  useCloseOnEscape(onClose, step !== "running")

  const syncTrim = useCallback((start: number, end: number) => {
    const next = clampTrimRange(duration, start, end)
    setTrimStart(next.start)
    setTrimEnd(next.end)
    setStartText(formatEditorTime(next.start))
    setEndText(formatEditorTime(next.end))
    setStartError(false)
    setEndError(false)
  }, [duration])

  const applyStartField = useCallback(() => {
    const parsed = parseEditorTime(startText)
    if (parsed === null) { setStartError(true); return }
    syncTrim(parsed, trimEnd)
  }, [startText, trimEnd, syncTrim])

  const applyEndField = useCallback(() => {
    const parsed = parseEditorTime(endText)
    if (parsed === null) { setEndError(true); return }
    syncTrim(trimStart, parsed)
  }, [endText, trimStart, syncTrim])

  const setInAtPlayhead = useCallback(() => {
    syncTrim(playhead, trimEnd)
  }, [playhead, trimEnd, syncTrim])

  const setOutAtPlayhead = useCallback(() => {
    syncTrim(trimStart, playhead)
  }, [playhead, trimStart, syncTrim])

  const startExport = useCallback(async () => {
    setErrorMsg(null)
    setPercent(0)
    setStep("running")
    try {
      const id = await optimizeVideo(exportOptions)
      jobIdRef.current = id
    } catch (e) {
      setErrorMsg(String(e))
      setStep("error")
    }
  }, [exportOptions])

  const cancel = useCallback(() => {
    if (jobIdRef.current) cancelOptimize(jobIdRef.current).catch(() => {})
  }, [])

  const reduction =
    result && result.size > 0 && entry.meta.file_size_bytes > 0
      ? Math.round((1 - result.size / entry.meta.file_size_bytes) * 100)
      : null

  const clipDuration = Math.max(0, trimEnd - trimStart)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 fade-up"
      onClick={() => step !== "running" && onClose()}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15">
            <Scissors className="size-4 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold text-foreground">{sk.editor.title}</h3>
            <p className="truncate text-[11px] text-muted-foreground">{entry.meta.title}</p>
          </div>
          <button
            onClick={onClose}
            disabled={step === "running"}
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
          >
            <X className="size-4" />
          </button>
        </div>

        {STEPS.includes(step) && (
          <div className="border-b border-border/40 px-4 py-3">
            <StepIndicator step={step} />
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/50 bg-[var(--surface)] px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">
            <FileVideo className="size-3.5 text-muted-foreground/70" />
            {info ? (
              <>
                <span className="text-foreground">{info.width}×{info.height}</span>
                <span>· {info.fps ? `${info.fps.toFixed(0)} fps` : "—"}</span>
                <span>· {formatDurationSecs(info.duration_secs)}</span>
                <span>· {formatBytes(info.size_bytes)}</span>
              </>
            ) : (
              <span>{sk.editor.readingSource}</span>
            )}
          </div>

          {(step === "preview" || step === "trim") && (
            <BloomVideoPlayer
              ref={playerRef}
              path={entry.path}
              controlsLayout="docked"
              onTimeUpdate={setPlayhead}
            />
          )}

          {step === "preview" && (
            <>
              <p className="text-xs text-muted-foreground">{sk.editor.previewHint}</p>
              <button
                onClick={() => setStep("trim")}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-all hover:bg-accent active:scale-[0.98]"
              >
                {sk.editor.continueToTrim}
                <ChevronRight className="size-4" />
              </button>
            </>
          )}

          {step === "trim" && (
            <>
              <p className="text-xs text-muted-foreground">{sk.editor.trimHint}</p>
              <FilmstripTimeline
                duration={duration}
                start={trimStart}
                end={trimEnd}
                playhead={playhead}
                frames={frames}
                loading={framesLoading}
                onChange={syncTrim}
                onSeek={(t) => playerRef.current?.seek(t)}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-[var(--surface)] p-3">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    {sk.editor.startField}
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={startText}
                      onChange={(e) => { setStartText(e.target.value); setStartError(false) }}
                      onBlur={applyStartField}
                      onKeyDown={(e) => e.key === "Enter" && applyStartField()}
                      className={cn(
                        "min-w-0 flex-1 rounded-lg border bg-background px-2.5 py-2 font-mono text-sm tabular-nums",
                        startError ? "border-red-500/60" : "border-border/60",
                      )}
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={setInAtPlayhead}
                      className="rounded-lg border border-border/60 bg-secondary px-2.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary/80"
                    >
                      {sk.editor.setIn}
                    </button>
                  </div>
                  {startError && <p className="text-[10px] text-red-400">{sk.editor.invalidTime}</p>}
                </div>

                <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-[var(--surface)] p-3">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    {sk.editor.endField}
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={endText}
                      onChange={(e) => { setEndText(e.target.value); setEndError(false) }}
                      onBlur={applyEndField}
                      onKeyDown={(e) => e.key === "Enter" && applyEndField()}
                      className={cn(
                        "min-w-0 flex-1 rounded-lg border bg-background px-2.5 py-2 font-mono text-sm tabular-nums",
                        endError ? "border-red-500/60" : "border-border/60",
                      )}
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={setOutAtPlayhead}
                      className="rounded-lg border border-border/60 bg-secondary px-2.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary/80"
                    >
                      {sk.editor.setOut}
                    </button>
                  </div>
                  {endError && <p className="text-[10px] text-red-400">{sk.editor.invalidTime}</p>}
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                {sk.editor.clipLength}:{" "}
                <span className="font-mono text-foreground">{formatDurationSecs(clipDuration)}</span>
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep("preview")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-[var(--surface)] py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                >
                  <ChevronLeft className="size-4" /> {sk.editor.back}
                </button>
                <button
                  onClick={() => setStep("export")}
                  className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition-all hover:bg-accent"
                >
                  {sk.editor.continueToExport}
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </>
          )}

          {step === "export" && (
            <>
              <p className="text-xs text-muted-foreground">{sk.editor.exportHint}</p>
              <ChoiceGroup label={sk.optimize.qualityPreset} options={PRESETS} value={preset} onChange={setPreset} />
              <ChoiceGroup label={sk.optimize.resolution} layout="wrap" options={RESOLUTIONS} value={resolution} onChange={setResolution} />
              <ChoiceGroup label={sk.optimize.speed} layout="wrap" options={SPEEDS} value={speed} onChange={setSpeed} />
              <ChoiceGroup label={sk.optimize.format} options={FORMATS} value={format} onChange={setFormat} />
              <ChoiceGroup label={sk.editor.saveMode} options={SAVE_MODES} value={saveMode} onChange={setSaveMode} />

              {replaceOriginal && format !== "mp4" && (
                <p className="text-[11px] text-amber-400">{sk.editor.replaceMp4Only}</p>
              )}

              <div className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-accent">
                  <Sparkles className="size-3.5" /> {sk.editor.estimateTitle}
                </div>
                <p className="mt-1.5 text-sm text-foreground">
                  {estimateLoading || !estimate ? (
                    sk.editor.estimateLoading
                  ) : (
                    sk.editor.estimateBody(
                      formatBytes(estimate.size_bytes),
                      formatDurationSecs(estimate.duration_secs),
                      estimate.resolution_label,
                      estimate.format_label,
                    )
                  )}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep("trim")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-[var(--surface)] py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                >
                  <ChevronLeft className="size-4" /> {sk.editor.back}
                </button>
                <button
                  onClick={startExport}
                  className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-all hover:bg-accent active:scale-[0.98]"
                >
                  <Zap className="size-4" /> {sk.editor.startExport}
                </button>
              </div>
            </>
          )}

          {step === "running" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <LoaderCircle className="size-4 animate-spin text-accent" />
                {sk.editor.transcoding}
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn("h-full rounded-full bg-primary transition-all duration-200", percent < 0 && "animate-pulse w-1/3")}
                  style={percent >= 0 ? { width: `${percent}%` } : undefined}
                />
              </div>
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {percent >= 0 ? `${percent.toFixed(0)}%` : sk.editor.working}
              </p>
              <button
                onClick={cancel}
                className="rounded-xl border border-border/60 bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:border-red-500/40 hover:text-red-400"
              >
                {sk.editor.cancel}
              </button>
            </div>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex size-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15">
                <Check className="size-7 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-300">{sk.editor.success}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatBytes(result?.size ?? 0)}
                  {!replaceOriginal && reduction !== null && (
                    <span className={cn("ml-1 font-semibold", reduction >= 0 ? "text-emerald-400" : "text-amber-400")}>
                      ({reduction >= 0 ? sk.optimize.smaller(reduction) : sk.optimize.larger(-reduction)})
                    </span>
                  )}
                </p>
              </div>
              <div className="flex w-full gap-2">
                <button
                  onClick={() => result?.path && revealInFinder(result.path).catch(() => {})}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-[var(--surface)] py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                >
                  <FolderOpen className="size-4" /> {sk.editor.reveal}
                </button>
                <button
                  onClick={() => { onComplete(); onClose() }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent"
                >
                  {sk.editor.close}
                </button>
              </div>
            </div>
          )}

          {step === "error" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex size-14 items-center justify-center rounded-full border border-red-500/30 bg-red-500/15">
                <CircleAlert className="size-7 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-red-300">{sk.editor.failed}</p>
                <p className="mt-1 max-h-24 overflow-y-auto text-xs text-muted-foreground">{errorMsg}</p>
              </div>
              <button
                onClick={() => setStep("export")}
                className="rounded-xl border border-border/60 bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
              >
                {sk.editor.tryAgain}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
