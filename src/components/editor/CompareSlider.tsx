import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { sk } from "@/lib/i18n/sk"
import { fileSrc, formatBytes, formatDurationSecs } from "@/hooks/useBloomBackend"
import type { ExportEstimate, VideoInfo } from "@/types"

interface CompareSliderProps {
  path: string
  info: VideoInfo | null
  estimate: ExportEstimate | null
  className?: string
}

export function CompareSlider({ path, info, estimate, className }: CompareSliderProps) {
  const [pos, setPos] = useState(50)
  const [dragging, setDragging] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLVideoElement>(null)
  const rightRef = useRef<HTMLVideoElement>(null)
  const src = fileSrc(path)

  const syncTime = useCallback((source: HTMLVideoElement) => {
    const other = source === leftRef.current ? rightRef.current : leftRef.current
    if (other && Math.abs(other.currentTime - source.currentTime) > 0.15) {
      other.currentTime = source.currentTime
    }
  }, [])

  useEffect(() => {
    const left = leftRef.current
    const right = rightRef.current
    if (!left || !right) return
    left.src = src
    right.src = src
    left.load()
    right.load()
  }, [src])

  const setPositionFromClientX = useCallback((clientX: number) => {
    const root = rootRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    const pct = Math.max(8, Math.min(92, ((clientX - rect.left) / rect.width) * 100))
    setPos(pct)
  }, [])

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        ref={rootRef}
        className="relative aspect-video overflow-hidden rounded-xl border border-border/50 bg-black"
        onPointerMove={(e) => dragging && setPositionFromClientX(e.clientX)}
        onPointerUp={() => setDragging(false)}
        onPointerLeave={() => setDragging(false)}
      >
        <video
          ref={leftRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-contain"
          onTimeUpdate={(e) => syncTime(e.currentTarget)}
        />
        <video
          ref={rightRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-contain contrast-[1.04] saturate-[0.88] brightness-[0.97]"
          style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
          onTimeUpdate={(e) => syncTime(e.currentTarget)}
        />

        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.5)]"
          style={{ left: `${pos}%` }}
        />
        <div
          className="absolute top-1/2 z-20 flex size-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-white/30 bg-black/70 text-white shadow-lg"
          style={{ left: `${pos}%` }}
          onPointerDown={(e) => { e.preventDefault(); setDragging(true); setPositionFromClientX(e.clientX) }}
          role="slider"
          aria-valuenow={Math.round(pos)}
          aria-label={sk.editor.compare.slider}
        >
          ↔
        </div>

        <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-bold text-white/90">
          {sk.editor.compare.original}
        </div>
        <div className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-bold text-white/90">
          {sk.editor.compare.optimized}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/50 bg-[var(--surface)] p-2.5 text-[11px]">
        <div>
          <p className="font-bold text-muted-foreground/70">{sk.editor.compare.original}</p>
          <p className="mt-0.5 font-mono text-foreground">
            {info ? formatBytes(info.size_bytes) : "—"} · {info ? formatDurationSecs(info.duration_secs) : "—"}
          </p>
        </div>
        <div>
          <p className="font-bold text-muted-foreground/70">{sk.editor.compare.optimized}</p>
          <p className="mt-0.5 font-mono text-foreground">
            {estimate ? formatBytes(estimate.size_bytes) : sk.editor.estimateLoading}
            {estimate && ` · ${formatDurationSecs(estimate.duration_secs)}`}
          </p>
        </div>
      </div>
    </div>
  )
}
