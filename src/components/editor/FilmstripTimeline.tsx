import { useRef } from "react"
import { cn } from "@/lib/utils"
import { fileSrc, formatDurationSecs } from "@/hooks/useBloomBackend"

interface FilmstripTimelineProps {
  duration: number
  start: number
  end: number
  playhead: number
  frames: string[]
  loading?: boolean
  onChange: (start: number, end: number) => void
  onSeek: (t: number) => void
}

export function FilmstripTimeline({
  duration,
  start,
  end,
  playhead,
  frames,
  loading,
  onChange,
  onSeek,
}: FilmstripTimelineProps) {
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
      <div className="overflow-hidden rounded-xl border border-border/50 bg-secondary/40">
        <div className="flex h-14">
          {loading ? (
            <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">
              …
            </div>
          ) : frames.length > 0 ? (
            frames.map((path, i) => (
              <img
                key={`${path}-${i}`}
                src={fileSrc(path)}
                alt=""
                draggable={false}
                className="h-full flex-1 object-cover opacity-90"
              />
            ))
          ) : (
            <div className="flex flex-1 items-center justify-center bg-secondary text-[11px] text-muted-foreground">
              —
            </div>
          )}
        </div>
      </div>

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
          className={cn(
            "absolute top-1/2 z-10 size-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-primary bg-white shadow",
          )}
          style={{ left: `${pct(start)}%` }}
          onPointerDown={(e) => { e.stopPropagation(); drag("start")(e) }}
        />
        <div
          className={cn(
            "absolute top-1/2 z-10 size-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-accent bg-white shadow",
          )}
          style={{ left: `${pct(end)}%` }}
          onPointerDown={(e) => { e.stopPropagation(); drag("end")(e) }}
        />
      </div>

      <div className="flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
        <span>{formatDurationSecs(start)}</span>
        <span className="text-foreground">{formatDurationSecs(Math.max(0, end - start))}</span>
        <span>{formatDurationSecs(end)}</span>
      </div>
    </div>
  )
}
