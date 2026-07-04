import { useCallback, useEffect, useRef } from "react"
import { Pen, Highlighter, Eraser, Undo2, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  AnnotationLayer,
  RECORDING_ASPECT,
  clientToNorm,
  contentRectContain,
  type DrawState,
} from "@/lib/annotation"
import { ANNOTATION_COLORS } from "@/hooks/useSettings"
import type { AnnotationTool } from "@/hooks/useSettings"

const TOOLS: { id: AnnotationTool; icon: React.FC<{ className?: string }>; label: string }[] = [
  { id: "pen", icon: Pen, label: "Pen" },
  { id: "highlighter", icon: Highlighter, label: "Highlight" },
  { id: "eraser", icon: Eraser, label: "Eraser" },
]

interface LiveDrawOverlayProps {
  layer: AnnotationLayer
  drawState: DrawState
  onToolChange: (tool: AnnotationTool) => void
  onColorChange: (color: string) => void
  onClose: () => void
}

export function LiveDrawOverlay({
  layer,
  drawState,
  onToolChange,
  onColorChange,
  onClose,
}: LiveDrawOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef({ w: 0, h: 0 })
  const paintRaf = useRef(0)

  const repaint = useCallback(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return

    const rect = root.getBoundingClientRect()
    const cssW = Math.round(rect.width)
    const cssH = Math.round(rect.height)
    if (cssW <= 0 || cssH <= 0) return

    const dpr = window.devicePixelRatio || 1
    if (sizeRef.current.w !== cssW || sizeRef.current.h !== cssH) {
      sizeRef.current = { w: cssW, h: cssH }
      canvas.width = Math.round(cssW * dpr)
      canvas.height = Math.round(cssH * dpr)
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
    }

    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    layer.drawPreview(ctx, cssW, cssH)
  }, [layer])

  const scheduleRepaint = useCallback(() => {
    if (paintRaf.current) return
    paintRaf.current = requestAnimationFrame(() => {
      paintRaf.current = 0
      repaint()
    })
  }, [repaint])

  useEffect(() => {
    scheduleRepaint()
    const onResize = () => scheduleRepaint()
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      if (paintRaf.current) cancelAnimationFrame(paintRaf.current)
    }
  }, [scheduleRepaint])

  const normFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return null
    return clientToNorm(e.clientX, e.clientY, rect, RECORDING_ASPECT)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = normFromEvent(e)
    if (!p) return
    e.currentTarget.setPointerCapture(e.pointerId)
    layer.beginStroke(drawState, p)
    scheduleRepaint()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = normFromEvent(e)
    if (!p) return
    layer.extendStroke(p)
    scheduleRepaint()
  }

  const onPointerUp = () => {
    layer.endStroke()
    scheduleRepaint()
  }

  const guide = sizeRef.current.w > 0
    ? contentRectContain(sizeRef.current.w, sizeRef.current.h, RECORDING_ASPECT)
    : null

  return (
    <div ref={rootRef} className="absolute inset-0 z-20">
      {guide && (
        <div
          className="pointer-events-none absolute border border-white/20"
          style={{ left: guide.x, top: guide.y, width: guide.w, height: guide.h }}
        />
      )}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      <div className="pointer-events-auto absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border/60 bg-black/75 px-2 py-1.5 shadow-lg backdrop-blur-sm">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.label}
            onClick={() => onToolChange(t.id)}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg transition-colors",
              drawState.tool === t.id ? "bg-white/20 text-white" : "text-white/60 hover:bg-white/10 hover:text-white",
            )}
          >
            <t.icon className="size-3.5" />
          </button>
        ))}
        <div className="mx-0.5 h-5 w-px bg-white/20" />
        {ANNOTATION_COLORS.slice(0, 6).map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.label}
            onClick={() => onColorChange(c.hex)}
            className={cn(
              "size-5 rounded-full border-2 transition-transform hover:scale-110",
              drawState.color === c.hex ? "scale-110 border-white" : "border-transparent",
            )}
            style={{ background: c.hex }}
          />
        ))}
        <div className="mx-0.5 h-5 w-px bg-white/20" />
        <button
          type="button"
          title="Undo"
          onClick={() => { layer.undo(); scheduleRepaint() }}
          className="flex size-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
        >
          <Undo2 className="size-3.5" />
        </button>
        <button
          type="button"
          title="Clear all"
          onClick={() => { layer.clear(); scheduleRepaint() }}
          className="flex size-8 items-center justify-center rounded-lg text-white/60 hover:bg-red-400/20 hover:text-red-300"
        >
          <Trash2 className="size-3.5" />
        </button>
        <button
          type="button"
          title="Done"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
