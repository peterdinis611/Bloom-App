import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  X,
  Scissors,
  Sparkles,
  Check,
  ChevronLeft,
  ChevronRight,
  FileVideo,
  Zap,
  SplitSquareHorizontal,
} from "lucide-react"
import { useCloseOnEscape } from "@/hooks/useCloseOnEscape"
import { cn } from "@/lib/utils"
import { sk, type OptimizeSpeed } from "@/lib/i18n/sk"
import { ChoiceGroup } from "@/components/mac/MacUIKit"
import { OPTIMIZE_SPEEDS, speedToNumber } from "@/lib/videoOptions"
import { clampTrimRange, formatEditorTime, parseEditorTime } from "@/lib/editorTime"
import {
  defaultSegments,
  mergeSegment,
  segmentDuration,
  splitSegmentAt,
  totalSegmentsDuration,
  updateSegment,
  type EditorSegment,
} from "@/lib/editorSegments"
import { FilmstripTimeline } from "@/components/editor/FilmstripTimeline"
import { CompareSlider } from "@/components/editor/CompareSlider"
import { BloomVideoPlayer, type BloomVideoPlayerHandle } from "@/components/video/BloomVideoPlayer"
import { useExportQueue } from "@/hooks/useExportQueue"
import type {
  ExportEstimate,
  OptimizeFormat,
  OptimizeOptions,
  OptimizePreset,
  OptimizeResolution,
  RecordingEntry,
  SubtitleCard,
  VideoAnalyze,
  VideoInfo,
} from "@/types"
import {
  analyzeVideo,
  estimateExport,
  formatBytes,
  formatDurationSecs,
  getFilmstrip,
  getVideoInfo,
} from "@/hooks/useBloomBackend"

type Step = "preview" | "trim" | "export" | "queued"
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
  const visualStep = step === "queued" ? "export" : step
  const idx = STEPS.indexOf(visualStep)
  const allDone = step === "queued"
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const active = i === idx && !allDone
        const done = i < idx || allDone
        const labels = sk.editor.steps
        const label = s === "preview" ? labels.preview : s === "trim" ? labels.trim : labels.export
        return (
          <div key={s} className="flex min-w-0 flex-1 items-center gap-1.5">
            <div
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                active && "bg-primary text-white",
                done && !active && "tone-soft-success",
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

function fileStem(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? "video"
  return base.replace(/\.[^.]+$/, "")
}

export function EditorModal({ entry, onClose, onComplete }: EditorModalProps) {
  const playerRef = useRef<BloomVideoPlayerHandle>(null)
  const { enqueue } = useExportQueue()

  const [step, setStep] = useState<Step>("preview")
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [duration, setDuration] = useState(entry.meta.duration_secs)
  const [segments, setSegments] = useState<EditorSegment[]>(() => defaultSegments(entry.meta.duration_secs))
  const [activeSegment, setActiveSegment] = useState(0)
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
  const [previewEstimate, setPreviewEstimate] = useState<ExportEstimate | null>(null)
  const [estimateLoading, setEstimateLoading] = useState(false)
  const [queuedCount, setQueuedCount] = useState(0)

  const [subtitlesOn, setSubtitlesOn] = useState(false)
  const [srtPath, setSrtPath] = useState("")
  const [cards, setCards] = useState<SubtitleCard[]>([{ text: "", start_secs: 0, end_secs: 3 }])
  const [denoise, setDenoise] = useState(false)
  const [normalizeAudio, setNormalizeAudio] = useState(false)
  const [removeAudio, setRemoveAudio] = useState(false)
  const [useHevc, setUseHevc] = useState(false)
  const [analysis, setAnalysis] = useState<VideoAnalyze | null>(null)

  const active = segments[activeSegment] ?? segments[0]!
  const multiClip = segments.length > 1
  const replaceOriginal = saveMode === "replace" && !multiClip

  const baseOptions = useMemo(
    (): Omit<OptimizeOptions, "trim_start" | "trim_end" | "output_name"> => ({
      input_path: entry.path,
      preset,
      resolution,
      format,
      speed: speedToNumber(speed),
      add_to_library: !replaceOriginal,
      replace_original: replaceOriginal,
      srt_path: subtitlesOn && srtPath.trim() ? srtPath.trim() : null,
      subtitle_cards: subtitlesOn
        ? cards.filter((c) => c.text.trim() && c.end_secs > c.start_secs)
        : [],
      denoise,
      normalize_audio: normalizeAudio,
      remove_audio: removeAudio,
      use_hevc: useHevc,
    }),
    [entry.path, preset, resolution, format, speed, replaceOriginal, subtitlesOn, srtPath, cards, denoise, normalizeAudio, removeAudio, useHevc],
  )

  const syncFieldsFromSegment = useCallback((seg: EditorSegment) => {
    setStartText(formatEditorTime(seg.start))
    setEndText(formatEditorTime(seg.end))
    setStartError(false)
    setEndError(false)
  }, [])

  useEffect(() => {
    getVideoInfo(entry.path)
      .then((i) => {
        setInfo(i)
        setDuration(i.duration_secs)
        const segs = defaultSegments(i.duration_secs)
        setSegments(segs)
        syncFieldsFromSegment(segs[0]!)
      })
      .catch(() => {})
  }, [entry.path, syncFieldsFromSegment])

  useEffect(() => {
    if (step !== "trim") return
    setFramesLoading(true)
    getFilmstrip(entry.path, 12)
      .then(setFrames)
      .catch(() => setFrames([]))
      .finally(() => setFramesLoading(false))
  }, [entry.path, step])

  useEffect(() => {
    if (step !== "preview" && step !== "export") return
    const seg = segments[0]!
    setEstimateLoading(true)
    const timer = window.setTimeout(() => {
      const opts: OptimizeOptions = {
        ...baseOptions,
        trim_start: multiClip ? null : seg.start,
        trim_end: multiClip ? null : seg.end,
      }
      estimateExport(opts)
        .then((e) => {
          if (step === "preview") setPreviewEstimate(e)
          else setEstimate(e)
        })
        .catch(() => {
          if (step === "preview") setPreviewEstimate(null)
          else setEstimate(null)
        })
        .finally(() => setEstimateLoading(false))
    }, 180)
    return () => window.clearTimeout(timer)
  }, [step, baseOptions, segments, multiClip])

  useEffect(() => {
    if (step !== "export") return
    analyzeVideo(entry.path).then(setAnalysis).catch(() => setAnalysis(null))
  }, [entry.path, step])

  useEffect(() => {
    if (step !== "export") return
    if (replaceOriginal && format !== "mp4") setFormat("mp4")
    if (multiClip && saveMode === "replace") setSaveMode("copy")
  }, [step, replaceOriginal, format, multiClip, saveMode])

  useCloseOnEscape(onClose, step !== "queued")

  const syncActiveSegment = useCallback((start: number, end: number) => {
    const next = clampTrimRange(duration, start, end)
    setSegments((prev) => updateSegment(prev, activeSegment, next.start, next.end, duration))
    syncFieldsFromSegment({ start: next.start, end: next.end })
  }, [duration, activeSegment, syncFieldsFromSegment])

  const applyStartField = useCallback(() => {
    const parsed = parseEditorTime(startText)
    if (parsed === null) { setStartError(true); return }
    syncActiveSegment(parsed, active.end)
  }, [startText, active.end, syncActiveSegment])

  const applyEndField = useCallback(() => {
    const parsed = parseEditorTime(endText)
    if (parsed === null) { setEndError(true); return }
    syncActiveSegment(active.start, parsed)
  }, [endText, active.start, syncActiveSegment])

  const setInAtPlayhead = useCallback(() => {
    syncActiveSegment(playhead, active.end)
  }, [playhead, active.end, syncActiveSegment])

  const setOutAtPlayhead = useCallback(() => {
    syncActiveSegment(active.start, playhead)
  }, [playhead, active.start, syncActiveSegment])

  const splitAtPlayhead = useCallback(() => {
    const next = splitSegmentAt(segments, activeSegment, playhead)
    if (next) {
      setSegments(next)
      setActiveSegment(activeSegment + 1)
      syncFieldsFromSegment(next[activeSegment + 1]!)
    }
  }, [segments, activeSegment, playhead, syncFieldsFromSegment])

  const buildExportJobs = useCallback(() => {
    const stem = fileStem(entry.path)
    const subtitleOpts = {
      srt_path: baseOptions.srt_path,
      subtitle_cards: baseOptions.subtitle_cards,
    }
    if (multiClip) {
      return segments.map((seg, i) => ({
        label: `${entry.meta.title} — ${sk.editor.segment(i + 1)}`,
        options: {
          ...baseOptions,
          trim_start: seg.start,
          trim_end: seg.end,
          output_name: `${stem}-cast${i + 1}`,
          add_to_library: true,
          replace_original: false,
          ...subtitleOpts,
        } satisfies OptimizeOptions,
      }))
    }
    return [{
      label: entry.meta.title,
      options: {
        ...baseOptions,
        trim_start: active.start,
        trim_end: active.end,
        ...subtitleOpts,
      } satisfies OptimizeOptions,
    }]
  }, [entry, baseOptions, multiClip, segments, active])

  const startExport = useCallback(() => {
    const jobs = buildExportJobs()
    enqueue(jobs)
    setQueuedCount(jobs.length)
    onComplete()
    setStep("queued")
  }, [buildExportJobs, enqueue, onComplete])

  const clipDuration = multiClip ? totalSegmentsDuration(segments) : segmentDuration(active)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 fade-up"
      onClick={() => step !== "queued" && onClose()}
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
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {(STEPS.includes(step as (typeof STEPS)[number]) || step === "queued") && (
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

          {step === "trim" && (
            <BloomVideoPlayer
              ref={playerRef}
              path={entry.path}
              controlsLayout="docked"
              onTimeUpdate={setPlayhead}
            />
          )}

          {step === "preview" && (
            <>
              <CompareSlider path={entry.path} info={info} estimate={previewEstimate} />
              <p className="text-xs text-muted-foreground">{sk.editor.compare.hint}</p>
              <button
                onClick={() => setStep("trim")}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-[color,background-color,box-shadow,transform] hover:bg-accent active:scale-[0.98]"
              >
                {sk.editor.continueToTrim}
                <ChevronRight className="size-4" />
              </button>
            </>
          )}

          {step === "trim" && (
            <>
              <p className="text-xs text-muted-foreground">{sk.editor.splitHint}</p>
              <FilmstripTimeline
                duration={duration}
                playhead={playhead}
                frames={frames}
                loading={framesLoading}
                segments={segments}
                activeSegment={activeSegment}
                onChangeSegment={(index, start, end) => {
                  setActiveSegment(index)
                  setSegments((prev) => updateSegment(prev, index, start, end, duration))
                  if (index === activeSegment) syncFieldsFromSegment({ start, end })
                }}
                onSeek={(t) => playerRef.current?.seek(t)}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={splitAtPlayhead}
                  disabled={segments.length >= 3}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-[var(--surface)] px-3 py-2 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                >
                  <SplitSquareHorizontal className="size-3.5" /> {sk.editor.splitAtPlayhead}
                </button>
                {segments.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setActiveSegment(i)
                      syncFieldsFromSegment(segments[i]!)
                    }}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                      i === activeSegment ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {sk.editor.segment(i + 1)}
                  </button>
                ))}
                {activeSegment > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const merged = mergeSegment(segments, activeSegment)
                      setSegments(merged)
                      setActiveSegment(Math.max(0, activeSegment - 1))
                      syncFieldsFromSegment(merged[Math.max(0, activeSegment - 1)]!)
                    }}
                    className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {sk.editor.mergeSegment}
                  </button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-[var(--surface)] p-3">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">{sk.editor.startField}</label>
                  <div className="flex gap-2">
                    <input
                      value={startText}
                      onChange={(e) => { setStartText(e.target.value); setStartError(false) }}
                      onBlur={applyStartField}
                      onKeyDown={(e) => e.key === "Enter" && applyStartField()}
                      className={cn("min-w-0 flex-1 rounded-lg border bg-background px-2.5 py-2 font-mono text-sm tabular-nums", startError ? "border-[var(--status-error-border)]" : "border-border/60")}
                      spellCheck={false}
                    />
                    <button type="button" onClick={setInAtPlayhead} className="rounded-lg border border-border/60 bg-secondary px-2.5 text-[11px] font-semibold">{sk.editor.setIn}</button>
                  </div>
                  {startError && <p className="text-[10px] tone-fg-error">{sk.editor.invalidTime}</p>}
                </div>
                <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-[var(--surface)] p-3">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">{sk.editor.endField}</label>
                  <div className="flex gap-2">
                    <input
                      value={endText}
                      onChange={(e) => { setEndText(e.target.value); setEndError(false) }}
                      onBlur={applyEndField}
                      onKeyDown={(e) => e.key === "Enter" && applyEndField()}
                      className={cn("min-w-0 flex-1 rounded-lg border bg-background px-2.5 py-2 font-mono text-sm tabular-nums", endError ? "border-[var(--status-error-border)]" : "border-border/60")}
                      spellCheck={false}
                    />
                    <button type="button" onClick={setOutAtPlayhead} className="rounded-lg border border-border/60 bg-secondary px-2.5 text-[11px] font-semibold">{sk.editor.setOut}</button>
                  </div>
                  {endError && <p className="text-[10px] tone-fg-error">{sk.editor.invalidTime}</p>}
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                {sk.editor.clipLength}: <span className="font-mono text-foreground">{formatDurationSecs(clipDuration)}</span>
              </p>

              <div className="flex gap-2">
                <button onClick={() => setStep("preview")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-[var(--surface)] py-2.5 text-sm font-semibold hover:bg-secondary">
                  <ChevronLeft className="size-4" /> {sk.editor.back}
                </button>
                <button onClick={() => setStep("export")} className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-white hover:bg-accent">
                  {sk.editor.continueToExport} <ChevronRight className="size-4" />
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
              {!multiClip && (
                <ChoiceGroup label={sk.editor.saveMode} options={SAVE_MODES} value={saveMode} onChange={setSaveMode} />
              )}
              {analysis && (
                <div className="rounded-xl border border-border/50 bg-[var(--surface)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">{sk.editor.analyzeTitle}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{analysis.notes[0]}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPreset(analysis.suggested_preset)
                        setResolution(analysis.suggested_resolution)
                      }}
                      className="shrink-0 rounded-lg border border-border/60 bg-secondary px-2.5 py-1.5 text-[10px] font-semibold hover:bg-secondary/80"
                    >
                      {sk.editor.applySuggestion}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  [denoise, setDenoise, sk.editor.enhance.denoise, sk.editor.enhance.denoiseHint],
                  [normalizeAudio, setNormalizeAudio, sk.editor.enhance.normalizeAudio, ""],
                  [removeAudio, setRemoveAudio, sk.editor.enhance.removeAudio, ""],
                  [useHevc, setUseHevc, sk.editor.enhance.useHevc, sk.editor.enhance.useHevcHint],
                ] as const).map(([on, setOn, label, hint]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setOn(!on)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left text-[11px] transition-colors",
                      on ? "border-primary/40 bg-primary/10 text-foreground" : "border-border/50 bg-[var(--surface)] text-muted-foreground",
                    )}
                  >
                    <span className="font-semibold">{label}</span>
                    {hint && <span className="mt-0.5 block text-[10px] opacity-70">{hint}</span>}
                  </button>
                ))}
              </div>
              {multiClip && (
                <p className="text-[11px] text-muted-foreground">{sk.editor.multiClipExport(segments.length)}</p>
              )}
              {replaceOriginal && format !== "mp4" && (
                <p className="text-[11px] tone-fg-warning">{sk.editor.replaceMp4Only}</p>
              )}

              <div className="rounded-xl border border-border/50 bg-[var(--surface)] p-3">
                <button
                  type="button"
                  onClick={() => setSubtitlesOn((v) => !v)}
                  className="flex w-full items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70"
                >
                  {sk.editor.subtitles}
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px]", subtitlesOn ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground")}>
                    {subtitlesOn ? "Zapnuté" : sk.editor.subtitlesOff}
                  </span>
                </button>
                {subtitlesOn && (
                  <div className="mt-3 flex flex-col gap-3">
                    <label className="flex flex-col gap-1 text-[11px]">
                      <span className="font-semibold text-muted-foreground">{sk.editor.srtPath}</span>
                      <input
                        value={srtPath}
                        onChange={(e) => setSrtPath(e.target.value)}
                        placeholder={sk.editor.srtPlaceholder}
                        className="rounded-lg border border-border/60 bg-background px-2.5 py-2 font-mono text-[11px]"
                      />
                    </label>
                    {cards.slice(0, 2).map((card, i) => (
                      <div key={i} className="grid gap-2 sm:grid-cols-4">
                        <input
                          value={card.text}
                          onChange={(e) => setCards((prev) => prev.map((c, j) => (j === i ? { ...c, text: e.target.value } : c)))}
                          placeholder={sk.editor.cardText}
                          className="rounded-lg border border-border/60 bg-background px-2.5 py-2 text-[11px] sm:col-span-2"
                        />
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={card.start_secs}
                          onChange={(e) => setCards((prev) => prev.map((c, j) => (j === i ? { ...c, start_secs: Number(e.target.value) } : c)))}
                          placeholder={sk.editor.cardStart}
                          className="rounded-lg border border-border/60 bg-background px-2 py-2 font-mono text-[11px]"
                        />
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={card.end_secs}
                          onChange={(e) => setCards((prev) => prev.map((c, j) => (j === i ? { ...c, end_secs: Number(e.target.value) } : c)))}
                          placeholder={sk.editor.cardEnd}
                          className="rounded-lg border border-border/60 bg-background px-2 py-2 font-mono text-[11px]"
                        />
                      </div>
                    ))}
                    {cards.length < 2 && (
                      <button
                        type="button"
                        onClick={() => setCards((prev) => [...prev, { text: "", start_secs: 0, end_secs: 3 }])}
                        className="self-start text-[11px] font-semibold text-accent hover:underline"
                      >
                        {sk.editor.addCard}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-accent">
                  <Sparkles className="size-3.5" /> {sk.editor.estimateTitle}
                </div>
                <p className="mt-1.5 text-sm text-foreground">
                  {estimateLoading || !estimate
                    ? sk.editor.estimateLoading
                    : sk.editor.estimateBody(
                        formatBytes(estimate.size_bytes),
                        formatDurationSecs(estimate.duration_secs),
                        estimate.resolution_label,
                        estimate.format_label,
                      )}
                </p>
                {estimate?.stream_copy && (
                  <p className="mt-1 text-[11px] tone-fg-success">{sk.editor.streamCopyHint}</p>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep("trim")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-[var(--surface)] py-2.5 text-sm font-semibold hover:bg-secondary">
                  <ChevronLeft className="size-4" /> {sk.editor.back}
                </button>
                <button onClick={startExport} className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/25 hover:bg-accent">
                  <Zap className="size-4" />
                  {multiClip ? sk.editor.multiClipExport(segments.length) : sk.editor.startExport}
                </button>
              </div>
            </>
          )}

          {step === "queued" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-full border tone-soft-success">
                <Check className="size-7 tone-fg-success" />
              </div>
              <div>
                <p className="text-sm font-bold tone-fg-success">{sk.editor.queuedTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">{sk.editor.queuedBody(queuedCount)}</p>
              </div>
              <button
                onClick={onClose}
                className="mt-2 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white hover:bg-accent"
              >
                {sk.editor.close}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
