import { useCallback, useEffect, useRef, useState } from "react"
import { X, Scissors, Play, Pause, Zap, Check, CircleAlert, FolderOpen, LoaderCircle } from "lucide-react"
import type { RecordingEntry } from "@/types"
import {
  fileSrc,
  formatBytes,
  formatDurationSecs,
  getVideoInfo,
  optimizeVideo,
  onOptimizeProgress,
  revealInFinder,
} from "@/hooks/useBloomBackend"

type Phase = "edit" | "running" | "done" | "error"

interface TrimModalProps {
  entry: RecordingEntry
  onClose: () => void
  onComplete: () => void
}

function DualRangeTimeline({ duration, start, end, playhead, onChange, onSeek }: {
  duration: number
  start: number
  end: number
  playhead: number
  onChange: (start: number, end: number) => void
  onSeek: (t: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)

  const pct = (v: number) => (duration > 0 ? (v / duration) * 100 : 0)

  const drag = (kind: "start" | "end" | "seek") => (e: React.PointerEvent) => {
    e.preventDefault()
    const track = trackRef.current
    if (!track || duration <= 0) return

    const move = (ev: PointerEvent) => {
      const rect = track.getBoundingClientRect()
      const t = Math.max(0, Math.min(duration, ((ev.clientX - rect.left) / rect.width) * duration))
      if (kind === "seek") onSeek(t)
      else if (kind === "start") onChange(Math.min(t, end - 0.25), end)
      else onChange(start, Math.max(t, start + 0.25))
    }

    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    move(e.nativeEvent)
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={trackRef}
        className="relative h-10 cursor-pointer rounded-xl bg-secondary"
        onPointerDown={drag("seek")}
      >
        <div
          className="absolute inset-y-2 rounded-lg bg-primary/25"
          style={{ left: `${pct(start)}%`, right: `${100 - pct(end)}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/90"
          style={{ left: `${pct(playhead)}%` }}
        />
        <div
          className="absolute top-1/2 z-10 size-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-primary bg-white shadow"
          style={{ left: `${pct(start)}%` }}
          onPointerDown={(e) => { e.stopPropagation(); drag("start")(e) }}
        />
        <div
          className="absolute top-1/2 z-10 size-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-accent bg-white shadow"
          style={{ left: `${pct(end)}%` }}
          onPointerDown={(e) => { e.stopPropagation(); drag("end")(e) }}
        />
      </div>
      <div className="flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
        <span>{formatDurationSecs(start)}</span>
        <span className="text-foreground">{formatDurationSecs(Math.max(0, end - start))} clip</span>
        <span>{formatDurationSecs(end)}</span>
      </div>
    </div>
  )
}

export function TrimModal({ entry, onClose, onComplete }: TrimModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [duration, setDuration] = useState(entry.meta.duration_secs)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(entry.meta.duration_secs)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [phase, setPhase] = useState<Phase>("edit")
  const [percent, setPercent] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [result, setResult] = useState<{ path: string; size: number } | null>(null)
  const jobIdRef = useRef<string | null>(null)

  useEffect(() => {
    getVideoInfo(entry.path)
      .then((i) => { setDuration(i.duration_secs); setTrimEnd(i.duration_secs) })
      .catch(() => {})

    let disposed = false
    onOptimizeProgress((p) => {
      if (p.job_id !== jobIdRef.current) return
      if (!p.done) { setPercent(p.percent); return }
      if (p.error) { setErrorMsg(p.error); setPhase("error"); return }
      setResult({ path: p.output_path ?? "", size: p.output_size_bytes ?? 0 })
      setPhase("done")
    }).then((un) => {
      if (disposed) un()
    })
    return () => { disposed = true }
  }, [entry.path])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const tick = () => setPlayhead(v.currentTime)
    v.addEventListener("timeupdate", tick)
    return () => v.removeEventListener("timeupdate", tick)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && phase !== "running") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [phase, onClose])

  const seek = useCallback((t: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = t
    setPlayhead(t)
  }, [])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (playing) { v.pause(); setPlaying(false) }
    else {
      if (v.currentTime < trimStart || v.currentTime >= trimEnd) v.currentTime = trimStart
      v.play().then(() => setPlaying(true)).catch(() => {})
    }
  }

  useEffect(() => {
    const v = videoRef.current
    if (!v || !playing) return
    const check = () => {
      if (v.currentTime >= trimEnd) { v.pause(); v.currentTime = trimStart; setPlaying(false) }
    }
    v.addEventListener("timeupdate", check)
    return () => v.removeEventListener("timeupdate", check)
  }, [playing, trimStart, trimEnd])

  const exportTrim = async () => {
    setPhase("running")
    setPercent(0)
    try {
      const id = await optimizeVideo({
        input_path: entry.path,
        preset: "medium",
        resolution: "original",
        format: "mp4",
        trim_start: trimStart,
        trim_end: trimEnd,
        add_to_library: true,
        output_name: `${entry.meta.title}-trim`,
      })
      jobIdRef.current = id
    } catch (e) {
      setErrorMsg(String(e))
      setPhase("error")
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 fade-up" onClick={() => phase !== "running" && onClose()}>
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-sky-500/15">
            <Scissors className="size-4 text-sky-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold">Trim video</h3>
            <p className="truncate text-[11px] text-muted-foreground">{entry.meta.title}</p>
          </div>
          <button onClick={onClose} disabled={phase === "running"} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          {phase === "edit" && (
            <>
              <div className="relative aspect-video overflow-hidden rounded-xl border border-border/60 bg-black">
                <video
                  ref={videoRef}
                  src={fileSrc(entry.path)}
                  className="h-full w-full object-contain"
                  onClick={togglePlay}
                />
                <button
                  onClick={togglePlay}
                  className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1.5 text-xs font-bold text-white backdrop-blur"
                >
                  {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  Preview
                </button>
              </div>

              <DualRangeTimeline
                duration={duration}
                start={trimStart}
                end={trimEnd}
                playhead={playhead}
                onChange={(s, e) => { setTrimStart(s); setTrimEnd(e) }}
                onSeek={seek}
              />

              <button
                onClick={exportTrim}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/25 hover:bg-accent"
              >
                <Zap className="size-4" /> Export trimmed clip
              </button>
            </>
          )}

          {phase === "running" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <LoaderCircle className="size-8 animate-spin text-accent" />
              <div className="h-2 w-full rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, percent)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">Exporting… {percent.toFixed(0)}%</p>
            </div>
          )}

          {phase === "done" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <Check className="size-10 text-emerald-400" />
              <p className="text-sm font-bold text-emerald-300">Trim saved to library</p>
              <p className="text-xs text-muted-foreground">{formatBytes(result?.size ?? 0)}</p>
              <div className="flex w-full gap-2">
                <button onClick={() => result?.path && revealInFinder(result.path).catch(() => {})} className="flex-1 rounded-xl border border-border/60 py-2.5 text-sm font-semibold">
                  <FolderOpen className="mr-1 inline size-4" /> Reveal
                </button>
                <button onClick={() => { onComplete(); onClose() }} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white">Done</button>
              </div>
            </div>
          )}

          {phase === "error" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CircleAlert className="size-10 text-red-400" />
              <p className="text-sm text-red-300">{errorMsg}</p>
              <button onClick={() => setPhase("edit")} className="rounded-xl border border-border/60 px-4 py-2 text-sm">Try again</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
