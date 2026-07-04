import { useCallback, useEffect, useRef, useState } from "react"
import type { PipRect } from "@/lib/capture"
import { cn } from "@/lib/utils"

interface PipOverlayProps {
  /** Normalised 0–1 rect relative to preview container. */
  rect: PipRect
  onChange: (rect: PipRect) => void
  disabled?: boolean
}

type DragMode = "move" | "resize-br" | null

export function PipOverlay({ rect, onChange, disabled }: PipOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<DragMode>(null)
  const startRef = useRef({ mx: 0, my: 0, rect: rect })

  const onPointerDown = useCallback((e: React.PointerEvent, m: DragMode) => {
    if (disabled) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setMode(m)
    startRef.current = { mx: e.clientX, my: e.clientY, rect: { ...rect } }
  }, [disabled, rect])

  useEffect(() => {
    if (!mode) return

    const onMove = (e: PointerEvent) => {
      const el = containerRef.current?.parentElement
      if (!el) return
      const bounds = el.getBoundingClientRect()
      const dx = (e.clientX - startRef.current.mx) / bounds.width
      const dy = (e.clientY - startRef.current.my) / bounds.height
      const s = startRef.current.rect

      if (mode === "move") {
        onChange({
          ...s,
          x: Math.max(0, Math.min(1 - s.w, s.x + dx)),
          y: Math.max(0, Math.min(1 - s.h, s.y + dy)),
        })
      } else {
        const nw = Math.max(0.12, Math.min(0.45, s.w + dx))
        const aspect = s.h / s.w
        const nh = nw * aspect
        onChange({
          x: s.x,
          y: s.y,
          w: nw,
          h: Math.min(1 - s.y, nh),
        })
      }
    }

    const onUp = () => setMode(null)
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [mode, onChange])

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0">
      <div
        className={cn(
          "pointer-events-auto absolute rounded-xl border-2 border-white/90 shadow-lg",
          disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.w * 100}%`,
          height: `${rect.h * 100}%`,
        }}
        onPointerDown={(e) => onPointerDown(e, "move")}
      >
        <div className="absolute inset-0 rounded-xl bg-black/20" />
        {!disabled && (
          <div
            className="absolute bottom-0 right-0 size-4 cursor-se-resize rounded-br-xl bg-white/90"
            onPointerDown={(e) => onPointerDown(e, "resize-br")}
          />
        )}
        <span className="absolute -top-5 left-0 text-[9px] font-bold uppercase tracking-wider text-white/80 drop-shadow">
          Camera
        </span>
      </div>
    </div>
  )
}
