import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  X,
  Scissors,
  Sparkles,
  Check,
  ChevronLeft,
  ChevronRight,
  Zap,
  SplitSquareHorizontal,
  Trash2,
  Crop,
  ArrowLeftRight,
} from "lucide-react"
import { useCloseOnEscape } from "@/hooks/useCloseOnEscape"
import { cn } from "@/lib/utils"
import { useMessages } from "@/lib/i18n/I18nProvider"
import type { OptimizeSpeed } from "@/lib/i18n/sk"
import { ChoiceGroup } from "@/components/mac/MacUIKit"
import { OPTIMIZE_SPEEDS, speedToNumber } from "@/lib/videoOptions"
import { clampTrimRange, formatEditorTime, parseEditorTime } from "@/lib/editorTime"
import {
  cropForAspect,
  cutOutRange,
  defaultSegments,
  deleteSegment,
  isFullFrameCrop,
  MAX_SEGMENTS,
  MIN_SPEECH_SECS,
  mergeSegment,
  moveSegment,
  segmentDuration,
  splitSegmentAt,
  totalSegmentsDuration,
  updateSegment,
  type CropAspectId,
  type EditorCrop,
  type EditorSegment,
} from "@/lib/editorSegments"
import { FilmstripTimeline } from "@/components/editor/FilmstripTimeline"
import { EditorCropOverlay } from "@/components/editor/EditorCropOverlay"
import { CompareSlider } from "@/components/editor/CompareSlider"
import { EditorStudioBay, type EditorChapter, type RotateDeg } from "@/components/editor/EditorStudioBay"
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
  detectSilence,
  estimateExport,
  extractAudio,
  formatBytes,
  formatDurationSecs,
  getAudioPeaks,
  getFilmstrip,
  getVideoInfo,
  getClickTrack,
  applyClickSpotlight,
} from "@/hooks/useBloomBackend"
import { useSettings } from "@/hooks/useSettings"
import { useToast } from "@/hooks/useToast"
import { localizeError } from "@/lib/i18n/localizeError"

type Step = "preview" | "trim" | "export" | "queued"
type SaveMode = "copy" | "replace"
type PartsMode = "separate" | "join"

const STEPS: Step[] = ["preview", "trim", "export"]
const FORMATS = [
  { value: "mp4" as const, label: "MP4", hint: "Univerzálny" },
  { value: "mov" as const, label: "MOV", hint: "QuickTime" },
  { value: "m4v" as const, label: "M4V", hint: "Apple" },
  { value: "mkv" as const, label: "MKV", hint: "Matroska" },
  { value: "avi" as const, label: "AVI", hint: "Klasický" },
  { value: "mpeg" as const, label: "MPEG", hint: "MPEG-2" },
  { value: "ts" as const, label: "TS", hint: "Broadcast" },
  { value: "flv" as const, label: "FLV", hint: "Flash" },
  { value: "3gp" as const, label: "3GP", hint: "Mobil" },
  { value: "ogv" as const, label: "OGV", hint: "Ogg" },
  { value: "webm" as const, label: "WebM", hint: "VP9" },
  { value: "gif" as const, label: "GIF", hint: "Animácia" },
]

interface EditorModalProps {
  entry: RecordingEntry
  onClose: () => void
  onComplete: () => void
}

function StepIndicator({ step }: { step: Step }) {
  const sk = useMessages()
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
  const sk = useMessages()
  const partsModes = [
    { value: "separate" as const, label: sk.editor.separateParts, hint: sk.editor.separatePartsHint },
    { value: "join" as const, label: sk.editor.joinParts, hint: sk.editor.joinPartsHint },
  ]
  const presets = [
    { value: "small" as const, label: sk.optimize.presets.small.label, hint: sk.optimize.presets.small.hint },
    { value: "medium" as const, label: sk.optimize.presets.medium.label, hint: sk.optimize.presets.medium.hint },
    { value: "high" as const, label: sk.optimize.presets.high.label, hint: sk.optimize.presets.high.hint },
  ]
  const resolutions = [
    { value: "480p" as const, label: sk.optimize.resolutions["480p"] },
    { value: "720p" as const, label: sk.optimize.resolutions["720p"] },
    { value: "1080p" as const, label: sk.optimize.resolutions["1080p"] },
    { value: "original" as const, label: sk.optimize.resolutions.original },
  ]
  const speeds: { value: OptimizeSpeed; label: string }[] = OPTIMIZE_SPEEDS.map((v) => ({
    value: v,
    label: sk.optimize.speeds[v],
  }))
  const saveModes = [
    { value: "copy" as const, label: sk.editor.saveCopy, hint: sk.editor.saveCopyHint },
    { value: "replace" as const, label: sk.editor.replaceOriginal, hint: sk.editor.replaceOriginalHint },
  ]
  const playerRef = useRef<BloomVideoPlayerHandle>(null)
  const { enqueue } = useExportQueue()
  const { success: toastSuccess, error: toastError } = useToast()
  const { settings } = useSettings()
  const exportDefaults = settings.exportDefaults

  const [step, setStep] = useState<Step>("preview")
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [duration, setDuration] = useState(entry.meta.duration_secs)
  const [segments, setSegments] = useState<EditorSegment[]>(() => defaultSegments(entry.meta.duration_secs))
  const [activeSegment, setActiveSegment] = useState(0)
  const [partsMode, setPartsMode] = useState<PartsMode>("separate")
  const [crop, setCrop] = useState<EditorCrop | null>(null)
  const [cropMode, setCropMode] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [startText, setStartText] = useState("0:00.00")
  const [endText, setEndText] = useState(formatEditorTime(entry.meta.duration_secs))
  const [startError, setStartError] = useState(false)
  const [endError, setEndError] = useState(false)
  const [frames, setFrames] = useState<string[]>([])
  const [framesLoading, setFramesLoading] = useState(false)

  const [preset, setPreset] = useState<OptimizePreset>(exportDefaults.preset)
  const [resolution, setResolution] = useState<OptimizeResolution>(
    exportDefaults.preferStreamCopy ? "original" : exportDefaults.resolution,
  )
  const [format, setFormat] = useState<OptimizeFormat>(exportDefaults.format)
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
  const [denoiseAudio, setDenoiseAudio] = useState(false)
  const [normalizeAudio, setNormalizeAudio] = useState(false)
  const [removeAudio, setRemoveAudio] = useState(false)
  const [useHevc, setUseHevc] = useState(false)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [rotate, setRotate] = useState<RotateDeg>(0)
  const [fadeIn, setFadeIn] = useState(0)
  const [fadeOut, setFadeOut] = useState(0)
  const [volume, setVolume] = useState(1)
  const [cropAspect, setCropAspect] = useState<CropAspectId>("free")
  const [analysis, setAnalysis] = useState<VideoAnalyze | null>(null)
  const [clickTimes, setClickTimes] = useState<number[]>([])
  const [spotlightPreview, setSpotlightPreview] = useState(false)
  const [spotlightBusy, setSpotlightBusy] = useState(false)
  const [chapters, setChapters] = useState<EditorChapter[]>([])
  const [peaks, setPeaks] = useState<number[]>([])
  const [audioBusy, setAudioBusy] = useState(false)

  const active = segments[activeSegment] ?? segments[0]!
  const multiClip = segments.length > 1
  const joinOutput = multiClip && partsMode === "join"
  const replaceOriginal = saveMode === "replace" && !multiClip && !crop
  const hasCrop = Boolean(crop && !isFullFrameCrop(crop))

  const baseOptions = useMemo(
    (): Omit<OptimizeOptions, "trim_start" | "trim_end" | "output_name" | "keep_ranges"> => ({
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
      denoise_audio: denoiseAudio,
      normalize_audio: normalizeAudio,
      remove_audio: removeAudio,
      use_hevc: useHevc,
      flip_h: flipH,
      flip_v: flipV,
      rotate,
      fade_in_secs: fadeIn,
      fade_out_secs: fadeOut,
      volume: removeAudio ? 1 : volume,
      crop_x: hasCrop ? crop!.x : null,
      crop_y: hasCrop ? crop!.y : null,
      crop_w: hasCrop ? crop!.w : null,
      crop_h: hasCrop ? crop!.h : null,
    }),
    [entry.path, preset, resolution, format, speed, replaceOriginal, subtitlesOn, srtPath, cards, denoise, denoiseAudio, normalizeAudio, removeAudio, useHevc, flipH, flipV, rotate, fadeIn, fadeOut, volume, hasCrop, crop],
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

  // Click track (screen recordings) — studio bay + filmstrip lane.
  useEffect(() => {
    if (entry.meta.source !== "screen" && entry.meta.source !== "both") return
    let alive = true
    getClickTrack(entry.meta.id)
      .then((track) => { if (alive) setClickTimes(track?.clicks.map((c) => c.t) ?? []) })
      .catch(() => { if (alive) setClickTimes([]) })
    return () => { alive = false }
  }, [entry.meta.id, entry.meta.source])

  // Spotlight preview: flash while the playhead is just after a recorded click.
  const spotlightActive = spotlightPreview
    && clickTimes.some((t) => playhead >= t && playhead - t < 0.45)

  const handleApplySpotlight = useCallback(async () => {
    setSpotlightBusy(true)
    try {
      const created = await applyClickSpotlight(entry.meta.id)
      toastSuccess({ title: sk.toast.spotlightDone(created.meta.title) })
      onComplete()
    } catch (e) {
      toastError({ title: sk.toast.actionFailed, description: localizeError(e) })
    } finally {
      setSpotlightBusy(false)
    }
  }, [entry.meta.id, onComplete, toastSuccess, toastError, sk.toast])

  useEffect(() => {
    if (step !== "trim") return
    setFramesLoading(true)
    getFilmstrip(entry.path, 12, duration > 0 ? duration : undefined)
      .then(setFrames)
      .catch(() => setFrames([]))
      .finally(() => setFramesLoading(false))
    getAudioPeaks(entry.path, 120)
      .then((r) => setPeaks(r.peaks))
      .catch(() => setPeaks([]))
  }, [entry.path, step, duration])

  const handleExtractAudio = useCallback(async () => {
    setAudioBusy(true)
    try {
      const out = await extractAudio({
        path: entry.path,
        format: "wav",
        denoise_audio: denoiseAudio,
        normalize_audio: normalizeAudio,
      })
      toastSuccess({ title: sk.editor.enhance.extractDone, description: out })
    } catch (e) {
      toastError({ title: sk.toast.actionFailed, description: localizeError(e) })
    } finally {
      setAudioBusy(false)
    }
  }, [entry.path, denoiseAudio, normalizeAudio, toastSuccess, toastError, sk])

  const handleSkipSilence = useCallback(async () => {
    setAudioBusy(true)
    try {
      const report = await detectSilence(entry.path)
      const ranges = report.speech_ranges.filter((r) => r.end - r.start >= MIN_SPEECH_SECS)
      if (ranges.length === 0) {
        toastError({ title: sk.toast.actionFailed, description: sk.editor.enhance.skipSilenceHint })
        return
      }
      const next = ranges.slice(0, MAX_SEGMENTS).map((r) => ({ start: r.start, end: r.end }))
      setSegments(next)
      setActiveSegment(0)
      setPartsMode(next.length > 1 ? "join" : "separate")
      syncFieldsFromSegment(next[0]!)
      toastSuccess({ title: sk.editor.enhance.skipSilenceDone(next.length) })
    } catch (e) {
      toastError({ title: sk.toast.actionFailed, description: localizeError(e) })
    } finally {
      setAudioBusy(false)
    }
  }, [entry.path, toastSuccess, toastError, sk, syncFieldsFromSegment])

  useEffect(() => {
    if (step !== "preview" && step !== "export") return
    const seg = segments[0]!
    setEstimateLoading(true)
    const timer = window.setTimeout(() => {
      const opts: OptimizeOptions = joinOutput
        ? {
            ...baseOptions,
            trim_start: null,
            trim_end: null,
            keep_ranges: segments.map((s) => ({ start: s.start, end: s.end })),
          }
        : {
            ...baseOptions,
            trim_start: multiClip ? null : seg.start,
            trim_end: multiClip ? null : seg.end,
            keep_ranges: [],
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
  }, [step, baseOptions, segments, multiClip, joinOutput])

  useEffect(() => {
    if (step !== "export") return
    analyzeVideo(entry.path)
      .then((a) => {
        setAnalysis(a)
        setPreset((prev) => (prev === exportDefaults.preset ? a.suggested_preset : prev))
        setResolution((prev) => {
          if (exportDefaults.preferStreamCopy && a.can_stream_copy_trim) return "original"
          if (prev !== "original" && prev !== exportDefaults.resolution) return prev
          return a.can_stream_copy_trim && exportDefaults.preferStreamCopy
            ? "original"
            : a.suggested_resolution
        })
      })
      .catch(() => setAnalysis(null))
  }, [entry.path, step, exportDefaults.preset, exportDefaults.preferStreamCopy, exportDefaults.resolution])

  useEffect(() => {
    if (step !== "export") return
    if (replaceOriginal && format !== "mp4") setFormat("mp4")
    if (multiClip && saveMode === "replace") setSaveMode("copy")
    if ((format === "webm" || format === "gif" || format === "avi" || format === "mpeg" || format === "ts" || format === "flv" || format === "3gp" || format === "ogv") && useHevc) {
      setUseHevc(false)
    }
  }, [step, replaceOriginal, format, multiClip, saveMode, useHevc])

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

  const cutOutActive = useCallback(() => {
    const next = cutOutRange(segments, active.start, active.end)
    if (!next) return
    setSegments(next)
    const idx = Math.min(activeSegment, next.length - 1)
    setActiveSegment(idx)
    syncFieldsFromSegment(next[idx]!)
  }, [segments, active, activeSegment, syncFieldsFromSegment])

  const removeActivePart = useCallback(() => {
    if (segments.length <= 1) return
    const next = deleteSegment(segments, activeSegment)
    setSegments(next)
    const idx = Math.min(activeSegment, next.length - 1)
    setActiveSegment(idx)
    syncFieldsFromSegment(next[idx]!)
  }, [segments, activeSegment, syncFieldsFromSegment])

  const shiftActive = useCallback((dir: -1 | 1) => {
    const to = activeSegment + dir
    const next = moveSegment(segments, activeSegment, to)
    setSegments(next)
    setActiveSegment(Math.max(0, Math.min(next.length - 1, to)))
  }, [segments, activeSegment])

  const buildExportJobs = useCallback(() => {
    const stem = fileStem(entry.path)
    const subtitleOpts = {
      srt_path: baseOptions.srt_path,
      subtitle_cards: baseOptions.subtitle_cards,
    }
    if (multiClip && partsMode === "separate") {
      return segments.map((seg, i) => ({
        label: `${entry.meta.title} — ${sk.editor.segment(i + 1)}`,
        options: {
          ...baseOptions,
          trim_start: seg.start,
          trim_end: seg.end,
          keep_ranges: [],
          output_name: `${stem}-cast${i + 1}`,
          add_to_library: true,
          replace_original: false,
          ...subtitleOpts,
        } satisfies OptimizeOptions,
      }))
    }
    if (joinOutput) {
      return [{
        label: entry.meta.title,
        options: {
          ...baseOptions,
          trim_start: null,
          trim_end: null,
          keep_ranges: segments.map((s) => ({ start: s.start, end: s.end })),
          output_name: `${stem}-joined`,
          add_to_library: true,
          replace_original: false,
          ...subtitleOpts,
        } satisfies OptimizeOptions,
      }]
    }
    return [{
      label: entry.meta.title,
      options: {
        ...baseOptions,
        trim_start: active.start,
        trim_end: active.end,
        keep_ranges: [],
        ...subtitleOpts,
      } satisfies OptimizeOptions,
    }]
  }, [entry, baseOptions, multiClip, partsMode, joinOutput, segments, active])

  const startExport = useCallback(() => {
    const jobs = buildExportJobs()
    enqueue(jobs)
    setQueuedCount(jobs.length)
    onComplete()
    setStep("queued")
  }, [buildExportJobs, enqueue, onComplete])

  const clipDuration = multiClip ? totalSegmentsDuration(segments) : segmentDuration(active)
  const showStudio = step === "preview" || step === "trim" || step === "export"

  const studioBay = showStudio ? (
    <EditorStudioBay
      title={entry.meta.title}
      info={info}
      clipDuration={clipDuration}
      playhead={playhead}
      chapters={chapters}
      onAddChapter={(label) => {
        setChapters((prev) => [
          ...prev,
          { id: crypto.randomUUID(), t: playhead, label },
        ].sort((a, b) => a.t - b.t))
      }}
      onSeekChapter={(t) => playerRef.current?.seek(t)}
      onRemoveChapter={(id) => setChapters((prev) => prev.filter((c) => c.id !== id))}
      clickCount={clickTimes.length}
      spotlightPreview={spotlightPreview}
      onToggleSpotlightPreview={() => setSpotlightPreview((v) => !v)}
      onApplySpotlight={() => { void handleApplySpotlight() }}
      spotlightBusy={spotlightBusy}
      denoise={denoise}
      denoiseAudio={denoiseAudio}
      normalizeAudio={normalizeAudio}
      removeAudio={removeAudio}
      useHevc={useHevc}
      flipH={flipH}
      flipV={flipV}
      rotate={rotate}
      fadeIn={fadeIn}
      fadeOut={fadeOut}
      volume={volume}
      onToggleDenoise={() => setDenoise((v) => !v)}
      onToggleDenoiseAudio={() => {
        setDenoiseAudio((v) => {
          const next = !v
          if (next) setNormalizeAudio(true)
          return next
        })
      }}
      onToggleNormalize={() => setNormalizeAudio((v) => !v)}
      onToggleRemoveAudio={() => setRemoveAudio((v) => !v)}
      onToggleHevc={() => setUseHevc((v) => !v)}
      onToggleFlipH={() => setFlipH((v) => !v)}
      onToggleFlipV={() => setFlipV((v) => !v)}
      onRotate={setRotate}
      onFadeIn={setFadeIn}
      onFadeOut={setFadeOut}
      onVolume={setVolume}
      onExtractAudio={() => { void handleExtractAudio() }}
      onSkipSilence={() => { void handleSkipSilence() }}
      audioBusy={audioBusy}
      analysis={analysis}
      onApplySuggestion={analysis ? () => {
        setPreset(analysis.suggested_preset)
        setResolution(analysis.suggested_resolution)
      } : undefined}
    />
  ) : null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-2 sm:p-4 backdrop-blur-xl fade-up"
      onClick={() => step !== "queued" && onClose()}
    >
      <div
        className="editor-shell flex h-[min(94vh,920px)] w-full max-w-[min(96vw,1440px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15">
            <Scissors className="size-4 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-bold tracking-tight text-foreground">{sk.editor.title}</h3>
            <p className="truncate text-[11px] text-muted-foreground">{entry.meta.title}</p>
          </div>
          <div className="hidden min-w-0 flex-[1.2] sm:block">
            <StepIndicator step={step} />
          </div>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="border-b border-border/40 px-4 py-2.5 sm:hidden">
          <StepIndicator step={step} />
        </div>

        {step === "queued" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex size-16 items-center justify-center rounded-full border tone-soft-success">
              <Check className="size-8 tone-fg-success" />
            </div>
            <div>
              <p className="text-base font-bold tone-fg-success">{sk.editor.queuedTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">{sk.editor.queuedBody(queuedCount)}</p>
            </div>
            <button
              onClick={onClose}
              className="mt-2 min-w-[12rem] rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:bg-accent"
            >
              {sk.editor.close}
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className={cn(
                "editor-stage relative min-h-0 overflow-hidden bg-black/90",
                step === "export" ? "max-h-[38%] shrink-0 basis-[38%]" : "flex-1",
              )}>
                {(step === "trim" || step === "export") && (
                  <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-4">
                    <div className="relative aspect-video h-full max-h-full w-full max-w-full overflow-hidden rounded-xl ring-1 ring-white/10">
                      <BloomVideoPlayer
                        ref={playerRef}
                        path={entry.path}
                        controlsLayout="docked"
                        onTimeUpdate={setPlayhead}
                      />
                      {spotlightPreview && (
                        <div
                          aria-hidden
                          className={cn(
                            "pointer-events-none absolute inset-0 rounded-xl ring-4 ring-inset ring-accent/80 transition-opacity duration-150",
                            spotlightActive ? "opacity-100" : "opacity-0",
                          )}
                        />
                      )}
                      {cropMode && step === "trim" && (
                        <EditorCropOverlay
                          value={crop}
                          onChange={(c) => {
                            setCrop(c)
                            setCropAspect("free")
                            if (c) setCropMode(false)
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}
                {step === "preview" && (
                  <div className="absolute inset-0 overflow-y-auto p-4 sm:p-6">
                    <div className="mx-auto flex max-w-4xl flex-col gap-4">
                      <CompareSlider path={entry.path} info={info} estimate={previewEstimate} />
                      <p className="text-xs text-muted-foreground">{sk.editor.compare.hint}</p>
                      <button
                        onClick={() => setStep("trim")}
                        className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-[color,background-color,box-shadow,transform] hover:bg-accent active:scale-[0.98]"
                      >
                        {sk.editor.continueToTrim}
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {step === "trim" && (
                <div className="shrink-0 space-y-3 border-t border-border/50 bg-card px-4 py-3 sm:px-5">
                  <p className="text-[11px] text-muted-foreground">{sk.editor.splitHint}</p>
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
                    clickTimes={[...clickTimes, ...chapters.map((c) => c.t)]}
                    peaks={peaks}
                  />

                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={splitAtPlayhead} disabled={segments.length >= MAX_SEGMENTS} className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-[var(--surface)] px-3 py-2 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-40">
                      <SplitSquareHorizontal className="size-3.5" /> {sk.editor.splitAtPlayhead}
                    </button>
                    <button type="button" onClick={cutOutActive} disabled={segments.length >= MAX_SEGMENTS} title={sk.editor.cutOutHint} className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-[var(--surface)] px-3 py-2 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-40">
                      <Scissors className="size-3.5" /> {sk.editor.cutOutRange}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCropMode((v) => !v)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors",
                        cropMode || hasCrop
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : "border-border/60 bg-[var(--surface)] text-foreground hover:bg-secondary",
                      )}
                    >
                      <Crop className="size-3.5" /> {sk.editor.cropToggle}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {sk.editor.aspectLabel}
                    </span>
                    {(["free", "16:9", "9:16", "1:1", "4:3"] as CropAspectId[]).map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setCropAspect(id)
                          if (id === "free") {
                            setCrop(null)
                            return
                          }
                          const next = cropForAspect(id, info?.width ?? 1920, info?.height ?? 1080)
                          if (next) {
                            setCrop(next)
                            setCropMode(true)
                          }
                        }}
                        className={cn(
                          "rounded-md px-2 py-1 text-[10px] font-semibold tabular-nums transition-colors",
                          cropAspect === id
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {id === "free" ? sk.editor.aspectFree : id}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
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
                    {segments.length > 1 && (
                      <>
                        <button type="button" onClick={() => shiftActive(-1)} disabled={activeSegment === 0} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40">
                          <ArrowLeftRight className="size-3.5" /> {sk.editor.moveLeft}
                        </button>
                        <button type="button" onClick={() => shiftActive(1)} disabled={activeSegment >= segments.length - 1} className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40">
                          {sk.editor.moveRight}
                        </button>
                        <button type="button" onClick={removeActivePart} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold tone-fg-error hover:bg-[var(--status-error-bg)]">
                          <Trash2 className="size-3.5" /> {sk.editor.deleteSegment}
                        </button>
                      </>
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

                  <div className="flex gap-2">
                    <button onClick={() => setStep("preview")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-[var(--surface)] py-2.5 text-sm font-semibold hover:bg-secondary">
                      <ChevronLeft className="size-4" /> {sk.editor.back}
                    </button>
                    <button onClick={() => setStep("export")} className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:bg-accent">
                      {sk.editor.continueToExport} <ChevronRight className="size-4" />
                    </button>
                  </div>
                </div>
              )}

              {step === "export" && (
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto border-t border-border/50 px-4 py-4 sm:px-5">
                  <p className="text-xs text-muted-foreground">{sk.editor.exportHint}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: "gif", label: sk.editor.quick.gif, run: () => { setFormat("gif"); setResolution("480p"); setPreset("small"); setRemoveAudio(true) } },
                        { id: "social", label: sk.editor.quick.social, run: () => { setFormat("mp4"); setResolution("720p"); setPreset("medium"); setCropAspect("1:1"); const c = cropForAspect("1:1", info?.width ?? 1920, info?.height ?? 1080); if (c) setCrop(c) } },
                        { id: "vertical", label: sk.editor.quick.vertical, run: () => { setFormat("mp4"); setResolution("1080p"); setPreset("medium"); setCropAspect("9:16"); const c = cropForAspect("9:16", info?.width ?? 1920, info?.height ?? 1080); if (c) setCrop(c) } },
                        { id: "hq", label: sk.editor.quick.hq, run: () => { setFormat("mp4"); setResolution("original"); setPreset("high"); setUseHevc(false); setCrop(null); setCropAspect("free") } },
                      ] as const
                    ).map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={q.run}
                        className="rounded-lg border border-border/60 bg-[var(--surface)] px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary"
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                  <ChoiceGroup label={sk.optimize.qualityPreset} options={presets} value={preset} onChange={setPreset} />
                  <ChoiceGroup label={sk.optimize.resolution} layout="wrap" options={resolutions} value={resolution} onChange={setResolution} />
                  <ChoiceGroup label={sk.optimize.speed} layout="wrap" options={speeds} value={speed} onChange={setSpeed} />
                  <ChoiceGroup label={sk.optimize.format} layout="wrap" options={FORMATS} value={format} onChange={setFormat} />
                  {multiClip && (
                    <ChoiceGroup label={sk.editor.partsTitle} options={partsModes} value={partsMode} onChange={setPartsMode} />
                  )}
                  {!multiClip && (
                    <ChoiceGroup label={sk.editor.saveMode} options={saveModes} value={saveMode} onChange={setSaveMode} />
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
                        {cards.slice(0, 6).map((card, i) => (
                          <div key={i} className="grid gap-2 sm:grid-cols-4">
                            <input
                              value={card.text}
                              onChange={(e) => setCards((prev) => prev.map((c, j) => (j === i ? { ...c, text: e.target.value } : c)))}
                              placeholder={sk.editor.cardText}
                              className="rounded-lg border border-border/60 bg-background px-2.5 py-2 text-[11px] sm:col-span-2"
                            />
                            <input type="number" min={0} step={0.1} value={card.start_secs} onChange={(e) => setCards((prev) => prev.map((c, j) => (j === i ? { ...c, start_secs: Number(e.target.value) } : c)))} placeholder={sk.editor.cardStart} className="rounded-lg border border-border/60 bg-background px-2 py-2 font-mono text-[11px]" />
                            <input type="number" min={0} step={0.1} value={card.end_secs} onChange={(e) => setCards((prev) => prev.map((c, j) => (j === i ? { ...c, end_secs: Number(e.target.value) } : c)))} placeholder={sk.editor.cardEnd} className="rounded-lg border border-border/60 bg-background px-2 py-2 font-mono text-[11px]" />
                          </div>
                        ))}
                        {cards.length < 6 && (
                          <button type="button" onClick={() => setCards((prev) => [...prev, { text: "", start_secs: playhead, end_secs: playhead + 3 }])} className="self-start text-[11px] font-semibold text-primary hover:underline">
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

                  <div className="flex gap-2 pb-2">
                    <button onClick={() => setStep("trim")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-[var(--surface)] py-2.5 text-sm font-semibold hover:bg-secondary">
                      <ChevronLeft className="size-4" /> {sk.editor.back}
                    </button>
                    <button onClick={startExport} className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-accent">
                      <Zap className="size-4" />
                      {joinOutput
                        ? sk.editor.joinParts
                        : multiClip
                          ? sk.editor.multiClipExport(segments.length)
                          : sk.editor.startExport}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {studioBay}
          </div>
        )}
      </div>
    </div>
  )
}
