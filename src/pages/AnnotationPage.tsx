import { useRef, useState, useEffect, useCallback } from "react"
import { useHotkey, useHotkeys, formatForDisplay } from "@tanstack/react-hotkeys"
import { cn } from "@/lib/utils"
import {
  Pen,
  Highlighter,
  Square,
  Circle,
  Minus,
  ArrowRight,
  Eraser,
  Trash2,
  X,
  Undo2,
  ImageDown,
  Check,
  GripVertical,
} from "lucide-react"
import { getSafeWebviewWindow } from "@/lib/windowControl"
import { emit } from "@tauri-apps/api/event"
import { ANNOTATION_COLORS, applyTheme, readStoredSettings, type AnnotationTool } from "@/hooks/useSettings"
import { ANNOTATION_TOOL_HOTKEYS } from "@/lib/hotkeys"

type Tool = AnnotationTool

interface DrawState {
  tool: Tool
  color: string
  width: number
}

interface Point { x: number; y: number }
interface Stroke {
  tool: Tool
  color: string
  width: number
  points: Point[]
  start?: Point
  end?: Point
}

const TOOLS: { id: Tool; icon: React.FC<{ className?: string }>; label: string; shortcut?: string }[] = [
  { id: "pen",         icon: Pen,         label: "Pero",       shortcut: "P" },
  { id: "highlighter", icon: Highlighter, label: "Zvýrazniť",  shortcut: "H" },
  { id: "line",        icon: Minus,       label: "Čiara",      shortcut: "L" },
  { id: "arrow",       icon: ArrowRight,  label: "Šípka",      shortcut: "A" },
  { id: "rect",        icon: Square,      label: "Obdĺžnik",   shortcut: "R" },
  { id: "circle",      icon: Circle,      label: "Kruh",       shortcut: "C" },
  { id: "eraser",      icon: Eraser,      label: "Guma",       shortcut: "E" },
]

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (!stroke.points.length && !(stroke.start && stroke.end)) return
  ctx.save()

  if (stroke.tool === "highlighter") {
    ctx.globalAlpha = 0.38
    ctx.globalCompositeOperation = "source-over"
    ctx.lineWidth = stroke.width * 5
  } else if (stroke.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out"
    ctx.lineWidth = stroke.width * 7
  } else {
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = "source-over"
    ctx.lineWidth = stroke.width
  }

  ctx.strokeStyle = stroke.color
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  if (stroke.tool === "pen" || stroke.tool === "highlighter" || stroke.tool === "eraser") {
    ctx.beginPath()
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
    }
    ctx.stroke()
  } else if ((stroke.tool === "line" || stroke.tool === "arrow") && stroke.start && stroke.end) {
    ctx.beginPath()
    ctx.moveTo(stroke.start.x, stroke.start.y)
    ctx.lineTo(stroke.end.x, stroke.end.y)
    ctx.stroke()
    if (stroke.tool === "arrow") drawArrowHead(ctx, stroke.start, stroke.end, stroke.width)
  } else if (stroke.tool === "rect" && stroke.start && stroke.end) {
    ctx.beginPath()
    ctx.strokeRect(stroke.start.x, stroke.start.y, stroke.end.x - stroke.start.x, stroke.end.y - stroke.start.y)
  } else if (stroke.tool === "circle" && stroke.start && stroke.end) {
    const rx = Math.abs(stroke.end.x - stroke.start.x) / 2
    const ry = Math.abs(stroke.end.y - stroke.start.y) / 2
    const cx = (stroke.start.x + stroke.end.x) / 2
    const cy = (stroke.start.y + stroke.end.y) / 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.restore()
}

function drawArrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, width: number) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const size = width * 4 + 10
  ctx.save()
  ctx.translate(to.x, to.y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-size, -size * 0.5)
  ctx.lineTo(-size, size * 0.5)
  ctx.closePath()
  ctx.fillStyle = ctx.strokeStyle as string
  ctx.fill()
  ctx.restore()
}

function redrawAll(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  strokes.forEach((s) => drawStroke(ctx, s))
}

export function AnnotationPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const strokes = useRef<Stroke[]>([])
  const liveStroke = useRef<Stroke | null>(null)

  const stored = readStoredSettings()
  applyTheme(stored.theme)

  const [drawState, setDrawState] = useState<DrawState>({
    tool: stored.annotation.defaultTool,
    color: stored.annotation.defaultColor,
    width: stored.annotation.defaultWidth,
  })
  const [saved, setSaved] = useState(false)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")!
      const dpr = window.devicePixelRatio || 1
      const cssW = window.innerWidth
      const cssH = window.innerHeight
      canvas.width = Math.round(cssW * dpr)
      canvas.height = Math.round(cssH * dpr)
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      redrawAll(ctx, strokes.current)
    }
    resize()
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [])

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const p = getPos(e)
    liveStroke.current = {
      tool: drawState.tool,
      color: drawState.tool === "eraser" ? "#000" : drawState.color,
      width: drawState.width,
      points: [p],
      start: p,
      end: p,
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !liveStroke.current) return
    const p = getPos(e)
    const ctx = canvasRef.current!.getContext("2d")!
    liveStroke.current.points.push(p)
    liveStroke.current.end = p
    redrawAll(ctx, strokes.current)
    drawStroke(ctx, liveStroke.current)
  }

  const onPointerUp = () => {
    if (!drawing.current || !liveStroke.current) return
    drawing.current = false
    strokes.current.push(liveStroke.current)
    liveStroke.current = null
  }

  const undo = useCallback(() => {
    if (!strokes.current.length) return
    strokes.current.pop()
    redrawAll(canvasRef.current!.getContext("2d")!, strokes.current)
  }, [])

  const clearAll = useCallback(() => {
    strokes.current = []
    const canvas = canvasRef.current!
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const closeWindow = useCallback(() => {
    emit("annotation-closed").catch(() => {})
    void getSafeWebviewWindow()?.hide()
  }, [])

  const saveSnapshot = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      await emit("annotation-save", { png: canvas.toDataURL("image/png") })
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } catch { /* ignore */ }
  }, [])

  const pickTool = useCallback((tool: Tool) => {
    setDrawState((s) => ({ ...s, tool }))
  }, [])

  useHotkey("Escape", closeWindow, {
    meta: { name: "Close", description: "Close annotation overlay" },
  })

  useHotkey("Mod+Z", undo, {
    meta: { name: "Undo", description: "Undo last stroke" },
  })

  useHotkey("Mod+S", () => { void saveSnapshot() }, {
    meta: { name: "Save", description: "Save annotated snapshot" },
  })

  useHotkeys(
    ANNOTATION_TOOL_HOTKEYS.map(({ hotkey, tool }) => ({
      hotkey,
      callback: () => pickTool(tool),
      options: {
        meta: { name: TOOLS.find((t) => t.id === tool)?.label ?? tool },
      },
    })),
  )

  useHotkey("[", () => {
    setDrawState((s) => ({ ...s, width: Math.max(1, s.width - 1) }))
  }, { meta: { name: "Decrease width" } })

  useHotkey("]", () => {
    setDrawState((s) => ({ ...s, width: Math.min(16, s.width + 1) }))
  }, { meta: { name: "Increase width" } })

  const saveLabel = formatForDisplay("Mod+S")
  const undoLabel = formatForDisplay("Mod+Z")

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ background: "rgba(0,0,0,0.001)" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      {/* Left tool rail */}
      <div
        className="absolute left-4 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-1.5 annot-dock rounded-2xl p-2 shadow-2xl"
        style={{ pointerEvents: "all" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {TOOLS.map((t) => (
          <button
            key={t.id}
            title={`${t.label}${t.shortcut ? ` (${t.shortcut})` : ""}`}
            onClick={() => pickTool(t.id)}
            className={cn(
              "group relative flex size-10 items-center justify-center rounded-xl transition-all",
              drawState.tool === t.id
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <t.icon className="size-4" />
          </button>
        ))}

        <div className="my-1 h-px bg-border/60" />

        <button onClick={undo} title={`Späť (${undoLabel})`} className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-secondary hover:text-foreground">
          <Undo2 className="size-4" />
        </button>
        <button onClick={clearAll} title="Vymazať všetko" className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-red-500/15 hover:text-red-400">
          <Trash2 className="size-4" />
        </button>
        <button
          onClick={saveSnapshot}
          title={`Uložiť snímku (${saveLabel})`}
          className={cn(
            "flex size-10 items-center justify-center rounded-xl transition-all",
            saved ? "bg-emerald-500/20 text-emerald-400" : "text-muted-foreground hover:bg-primary/15 hover:text-primary",
          )}
        >
          {saved ? <Check className="size-4" /> : <ImageDown className="size-4" />}
        </button>
        <button onClick={closeWindow} title="Zavrieť (Esc)" className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-red-500/15 hover:text-red-400">
          <X className="size-4" />
        </button>
      </div>

      {/* Bottom properties panel */}
      <div
        className="absolute bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
        style={{ pointerEvents: "all" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {expanded && (
          <div className="fade-up annot-dock flex flex-col gap-3 rounded-2xl px-4 py-3 shadow-2xl">
            {/* Colours */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Farba</span>
              <div className="flex flex-wrap gap-1.5">
                {ANNOTATION_COLORS.map((c) => (
                  <button
                    key={c.id}
                    title={c.label}
                    onClick={() => setDrawState((s) => ({ ...s, color: c.hex, tool: s.tool === "eraser" ? "pen" : s.tool }))}
                    className={cn(
                      "size-7 rounded-full border-2 transition-all hover:scale-110",
                      drawState.color === c.hex && drawState.tool !== "eraser"
                        ? "scale-110 border-primary ring-2 ring-primary/40"
                        : "border-border/50",
                    )}
                    style={{ background: c.hex }}
                  />
                ))}
              </div>
            </div>

            {/* Width slider */}
            <div className="flex items-center gap-3">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Hrúbka</span>
              <input
                type="range"
                min={1}
                max={16}
                value={drawState.width}
                onChange={(e) => setDrawState((s) => ({ ...s, width: Number(e.target.value) }))}
                className="w-36 accent-primary sm:w-48"
              />
              <div
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary"
                title={`${drawState.width}px`}
              >
                <div
                  className="rounded-full bg-primary"
                  style={{ width: Math.max(4, drawState.width * 2), height: Math.max(4, drawState.width * 2) }}
                />
              </div>
              <span className="w-5 font-mono text-xs font-bold tabular-nums text-foreground">{drawState.width}</span>
            </div>

            <p className="text-center text-[10px] text-muted-foreground/50">
              {undoLabel} späť · {saveLabel} uložiť · P H L A R C E skratky · [ ] hrúbka
            </p>
          </div>
        )}

        <button
          onClick={() => setExpanded((v) => !v)}
          className="annot-dock flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-muted-foreground shadow-lg transition-colors hover:text-foreground"
        >
          <GripVertical className="size-3" />
          {expanded ? "Skryť panel" : "Farby & hrúbka"}
        </button>
      </div>

      {/* Active tool indicator (top-right) */}
      <div className="pointer-events-none absolute right-4 top-4 z-40 rounded-xl annot-dock px-3 py-2 text-[11px] font-semibold text-muted-foreground shadow-lg">
        <span className="text-primary">{TOOLS.find((t) => t.id === drawState.tool)?.label}</span>
        {" · "}
        <span style={{ color: drawState.tool === "eraser" ? undefined : drawState.color }}>
          {drawState.tool === "eraser" ? "Guma" : drawState.color}
        </span>
        {" · "}
        {drawState.width}px
      </div>
    </div>
  )
}
