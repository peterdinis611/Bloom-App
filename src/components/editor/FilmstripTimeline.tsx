import { useRef } from "react"
import { cn } from "@/lib/utils"
import { fileSrc, formatDurationSecs } from "@/hooks/useBloomBackend"
import type { EditorSegment } from "@/lib/editorSegments"
import { segmentDuration, totalSegmentsDuration } from "@/lib/editorSegments"

interface FilmstripTimelineProps {
  duration: number
  playhead: number
  frames: string[]
  loading?: boolean
  onSeek: (t: number) => void
  /** Single-range mode */
  start?: number
  end?: number
  onChange?: (start: number, end: number) => void
  /** Multi-segment mode */
  segments?: EditorSegment[]
  activeSegment?: number
  onChangeSegment?: (index: number, start: number, end: number) => void
}

export function FilmstripTimeline({
  duration,
  playhead,
  frames,
  loading,
  onSeek,
  start,
  end,
  onChange,
  segments,
  activeSegment = 0,
  onChangeSegment,
}: FilmstripTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const pct = (v: number) => (duration > 0 ? (v / duration) * 100 : 0)

  const ranges = segments ?? (start !== undefined && end !== undefined ? [{ start, end }] : [])
  const active = ranges[activeSegment] ?? ranges[0]

  const drag = (kind: "start" | "end" | "seek") => (e: React.PointerEvent) => {
    e.preventDefault()
    const track = trackRef.current
    if (!track || duration <= 0) return

    const move = (ev: PointerEvent) => {
      const rect = track.getBoundingClientRect()
      const t = Math.max(0, Math.min(duration, ((ev.clientX - rect.left) / rect.width) * duration))
      if (kind === "seek") {
        onSeek(t)
        return
      }
      if (!active) return
      if (kind === "start") {
        const nextStart = Math.min(t, active.end - 0.25)
        if (segments && onChangeSegment) onChangeSegment(activeSegment, nextStart, active.end)
        else if (onChange) onChange(nextStart, active.end)
      } else {
        const nextEnd = Math.max(t, active.start + 0.25)
        if (segments && onChangeSegment) onChangeSegment(activeSegment, active.start, nextEnd)
        else if (onChange) onChange(active.start, nextEnd)
      }
    }

    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    move(e.nativeEvent)
  }

  const summaryStart = active?.start ?? 0
  const summaryEnd = active?.end ?? duration
  const summaryLen = segments && segments.length > 1
    ? totalSegmentsDuration(segments)
    : segmentDuration({ start: summaryStart, end: summaryEnd })

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-xl border border-border/50 bg-secondary/40">
        <div className="flex h-14">
          {loading ? (
            <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">…</div>
          ) : frames.length > 0 ? (
            frames.map((path, i) => (
              <img key={`${path}-${i}`} src={fileSrc(path)} alt="" draggable={false} className="h-full flex-1 object-cover opacity-90" />
            ))
          ) : (
            <div className="flex flex-1 items-center justify-center bg-secondary text-[11px] text-muted-foreground">—</div>
          )}
        </div>
      </div>

      <div ref={trackRef} className="relative h-10 cursor-pointer rounded-xl bg-secondary" onPointerDown={drag("seek")}>
        {ranges.map((seg, i) => (
          <div
            key={`${seg.start}-${seg.end}-${i}`}
            className={cn(
              "absolute inset-y-2 rounded-lg",
              i === activeSegment ? "bg-primary/30 ring-1 ring-primary/40" : "bg-accent/15",
            )}
            style={{ left: `${pct(seg.start)}%`, right: `${100 - pct(seg.end)}%` }}
          />
        ))}
        <div className="absolute top-0 bottom-0 w-0.5 bg-white/90" style={{ left: `${pct(playhead)}%` }} />
        {active && (
          <>
            <div
              className="absolute top-1/2 z-10 size-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-primary bg-white shadow"
              style={{ left: `${pct(active.start)}%` }}
              onPointerDown={(e) => { e.stopPropagation(); drag("start")(e) }}
            />
            <div
              className="absolute top-1/2 z-10 size-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-accent bg-white shadow"
              style={{ left: `${pct(active.end)}%` }}
              onPointerDown={(e) => { e.stopPropagation(); drag("end")(e) }}
            />
          </>
        )}
      </div>

      <div className="flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
        <span>{formatDurationSecs(summaryStart)}</span>
        <span className="text-foreground">{formatDurationSecs(summaryLen)}</span>
        <span>{formatDurationSecs(summaryEnd)}</span>
      </div>
    </div>
  )
}
