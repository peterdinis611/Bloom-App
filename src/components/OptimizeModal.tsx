import { useCallback, useEffect, useRef, useState } from "react"
import { useCloseOnEscape } from "@/hooks/useCloseOnEscape"
import {
  X,
  Zap,
  Gauge,
  Maximize2,
  FileVideo,
  Scissors,
  Sparkles,
  Check,
  CircleAlert,
  FolderOpen,
  LoaderCircle,
  FastForward,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { sk, type OptimizeSpeed } from "@/lib/i18n/sk"
import { OPTIMIZE_SPEEDS, speedToNumber } from "@/lib/videoOptions"
import type {
  OptimizeFormat,
  OptimizePreset,
  OptimizeResolution,
  RecordingEntry,
  VideoInfo,
} from "@/types"
import {
  getVideoInfo,
  optimizeVideo,
  cancelOptimize,
  onOptimizeProgress,
  revealInFinder,
  formatBytes,
  formatDurationSecs,
} from "@/hooks/useBloomBackend"

type Phase = "config" | "running" | "done" | "error"

const PRESETS: { v: OptimizePreset; label: string; hint: string }[] = [
  { v: "small", label: sk.optimize.presets.small.label, hint: sk.optimize.presets.small.hint },
  { v: "medium", label: sk.optimize.presets.medium.label, hint: sk.optimize.presets.medium.hint },
  { v: "high", label: sk.optimize.presets.high.label, hint: sk.optimize.presets.high.hint },
]
const RESOLUTIONS: { v: OptimizeResolution; label: string }[] = [
  { v: "480p", label: sk.optimize.resolutions["480p"] },
  { v: "720p", label: sk.optimize.resolutions["720p"] },
  { v: "1080p", label: sk.optimize.resolutions["1080p"] },
  { v: "original", label: sk.optimize.resolutions.original },
]
const FORMATS: { v: OptimizeFormat; label: string }[] = [
  { v: "mp4", label: "MP4" },
  { v: "webm", label: "WebM" },
  { v: "gif", label: "GIF" },
]
const SPEEDS: { v: OptimizeSpeed; label: string }[] = OPTIMIZE_SPEEDS.map((v) => ({
  v,
  label: sk.optimize.speeds[v],
}))

function Segmented<T extends string>({ icon: Icon, label, options, value, onChange, render }: {
  icon: React.FC<{ className?: string }>
  label: string
  options: { v: T; label: string; hint?: string }[]
  value: T
  onChange: (v: T) => void
  render?: (o: { v: T; label: string; hint?: string }) => React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">
        <Icon className="size-3" /> {label}
      </span>
      <div className="grid grid-flow-col gap-1 rounded-xl border border-border/60 bg-[var(--surface)] p-1">
        {options.map((o) => (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={cn(
              "flex flex-col items-center rounded-lg px-2 py-2 text-xs font-semibold transition-all",
              o.v === value ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {render ? render(o) : o.label}
            {o.hint && <span className={cn("text-[9px] font-medium", o.v === value ? "text-white/70" : "text-muted-foreground/50")}>{o.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

interface OptimizeModalProps {
  entry: RecordingEntry
  onClose: () => void
  onComplete: () => void
}

export function OptimizeModal({ entry, onClose, onComplete }: OptimizeModalProps) {
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [phase, setPhase] = useState<Phase>("config")
  const [preset, setPreset] = useState<OptimizePreset>("medium")
  const [resolution, setResolution] = useState<OptimizeResolution>("720p")
  const [format, setFormat] = useState<OptimizeFormat>("mp4")
  const [speed, setSpeed] = useState<OptimizeSpeed>("1")
  const [trimOn, setTrimOn] = useState(false)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)

  const [percent, setPercent] = useState(0)
  const [result, setResult] = useState<{ path: string; size: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const jobIdRef = useRef<string | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)

  const duration = info?.duration_secs ?? entry.meta.duration_secs

  useEffect(() => {
    getVideoInfo(entry.path)
      .then((i) => { setInfo(i); setTrimEnd(i.duration_secs) })
      .catch(() => setTrimEnd(entry.meta.duration_secs))

    let disposed = false
    onOptimizeProgress((p) => {
      if (p.job_id !== jobIdRef.current) return
      if (!p.done) { setPercent(p.percent); return }
      if (p.cancelled) { setPhase("config"); setPercent(0); return }
      if (p.error) { setErrorMsg(p.error); setPhase("error"); return }
      setPercent(100)
      setResult({ path: p.output_path ?? "", size: p.output_size_bytes ?? 0 })
      setPhase("done")
    }).then((un) => {
      if (disposed) un()
      else unlistenRef.current = un
    })

    return () => {
      disposed = true
      unlistenRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useCloseOnEscape(onClose, phase !== "running")

  const start = useCallback(async () => {
    setErrorMsg(null)
    setPercent(0)
    setPhase("running")
    try {
      const id = await optimizeVideo({
        input_path: entry.path,
        preset,
        resolution,
        format,
        speed: speedToNumber(speed),
        trim_start: trimOn ? Math.max(0, Math.min(trimStart, trimEnd)) : null,
        trim_end: trimOn ? trimEnd : null,
        add_to_library: true,
      })
      jobIdRef.current = id
    } catch (e) {
      setErrorMsg(String(e))
      setPhase("error")
    }
  }, [entry.path, preset, resolution, format, speed, trimOn, trimStart, trimEnd])

  const cancel = useCallback(() => {
    if (jobIdRef.current) cancelOptimize(jobIdRef.current).catch(() => {})
  }, [])

  const reduction =
    result && result.size > 0 && entry.meta.file_size_bytes > 0
      ? Math.round((1 - result.size / entry.meta.file_size_bytes) * 100)
      : null

  const outputDuration = trimOn
    ? Math.max(0, trimEnd - trimStart) / speedToNumber(speed)
    : duration / speedToNumber(speed)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-5 fade-up" onClick={() => phase !== "running" && onClose()}>
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15">
            <Sparkles className="size-4 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold text-foreground">{sk.optimize.title}</h3>
            <p className="truncate text-[11px] text-muted-foreground">{entry.meta.title}</p>
          </div>
          <button
            onClick={onClose}
            disabled={phase === "running"}
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/50 bg-[var(--surface)] px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">
            <FileVideo className="size-3.5 text-muted-foreground/70" />
            {info ? (
              <>
                <span className="text-foreground">{info.width}×{info.height}</span>
                <span>· {info.fps ? `${info.fps.toFixed(0)} fps` : "—"}</span>
                <span>· {info.codec}</span>
                <span>· {formatDurationSecs(info.duration_secs)}</span>
                <span>· {formatBytes(info.size_bytes)}</span>
              </>
            ) : (
              <span>{sk.optimize.readingSource}</span>
            )}
          </div>

          {phase === "config" && (
            <>
              <Segmented icon={Gauge} label={sk.optimize.qualityPreset} options={PRESETS} value={preset} onChange={setPreset} />
              <Segmented icon={Maximize2} label={sk.optimize.resolution} options={RESOLUTIONS} value={resolution} onChange={setResolution} />
              <Segmented icon={FastForward} label={sk.optimize.speed} options={SPEEDS} value={speed} onChange={setSpeed} />
              <Segmented icon={FileVideo} label={sk.optimize.format} options={FORMATS} value={format} onChange={setFormat} />

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setTrimOn((v) => !v)}
                  className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 transition-colors hover:text-foreground"
                >
                  <Scissors className="size-3" /> {sk.optimize.trim}
                  <div className={cn("ml-1 flex h-4 w-7 items-center rounded-full p-0.5 transition-colors", trimOn ? "bg-primary" : "bg-secondary")}>
                    <div className={cn("size-3 rounded-full bg-white transition-transform", trimOn ? "translate-x-3" : "translate-x-0")} />
                  </div>
                </button>
                {trimOn && duration > 0 && (
                  <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-[var(--surface)] p-3">
                    <label className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                      <span>{sk.optimize.start}</span>
                      <span className="font-mono tabular-nums text-foreground">{formatDurationSecs(trimStart)}</span>
                    </label>
                    <input
                      type="range" min={0} max={duration} step={0.1} value={trimStart}
                      onChange={(e) => setTrimStart(Math.min(Number(e.target.value), trimEnd - 0.1))}
                      className="accent-primary"
                    />
                    <label className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                      <span>{sk.optimize.end}</span>
                      <span className="font-mono tabular-nums text-foreground">{formatDurationSecs(trimEnd)}</span>
                    </label>
                    <input
                      type="range" min={0} max={duration} step={0.1} value={trimEnd}
                      onChange={(e) => setTrimEnd(Math.max(Number(e.target.value), trimStart + 0.1))}
                      className="accent-primary"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {sk.optimize.clipLength}:{" "}
                      <span className="font-mono text-foreground">{formatDurationSecs(Math.max(0, trimEnd - trimStart))}</span>
                      {speed !== "1" && (
                        <>
                          {" → "}
                          <span className="font-mono text-foreground">{formatDurationSecs(outputDuration)}</span>
                          {" "}
                          <span className="text-muted-foreground/80">({sk.optimize.speed.toLowerCase()} {sk.optimize.speeds[speed]})</span>
                        </>
                      )}
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={start}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-all hover:bg-accent active:scale-[0.98]"
              >
                <Zap className="size-4" /> {sk.optimize.optimize}
              </button>
            </>
          )}

          {phase === "running" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <LoaderCircle className="size-4 animate-spin text-accent" />
                {sk.optimize.transcoding}
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn("h-full rounded-full bg-primary transition-all duration-200", percent < 0 && "animate-pulse w-1/3")}
                  style={percent >= 0 ? { width: `${percent}%` } : undefined}
                />
              </div>
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {percent >= 0 ? `${percent.toFixed(0)}%` : sk.optimize.working}
              </p>
              <button
                onClick={cancel}
                className="rounded-xl border border-border/60 bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:border-red-500/40 hover:text-red-400"
              >
                {sk.optimize.cancel}
              </button>
            </div>
          )}

          {phase === "done" && (
            <div className="flex flex-col items-center gap-3 py-3 text-center">
              <div className="flex size-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15">
                <Check className="size-7 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-300">{sk.optimize.done}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatBytes(result?.size ?? 0)}
                  {reduction !== null && (
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
                  <FolderOpen className="size-4" /> {sk.optimize.reveal}
                </button>
                <button
                  onClick={() => { onComplete(); onClose() }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent"
                >
                  {sk.optimize.done.replace("!", "")}
                </button>
              </div>
            </div>
          )}

          {phase === "error" && (
            <div className="flex flex-col items-center gap-3 py-3 text-center">
              <div className="flex size-14 items-center justify-center rounded-full border border-red-500/30 bg-red-500/15">
                <CircleAlert className="size-7 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-red-300">{sk.optimize.failed}</p>
                <p className="mt-1 max-h-24 overflow-y-auto text-xs text-muted-foreground">{errorMsg}</p>
              </div>
              <button
                onClick={() => setPhase("config")}
                className="rounded-xl border border-border/60 bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
              >
                {sk.optimize.tryAgain}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
