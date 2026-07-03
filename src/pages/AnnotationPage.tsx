import { useRef, useState, useEffect, useCallback } from "react"
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
  ChevronUp,
  ChevronDown,
  ImageDown,
  Check,
} from "lucide-react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { emit } from "@tauri-apps/api/event"

// ── Types ────────────────────────────────────────────────────────────────────
type Tool = "pen" | "highlighter" | "rect" | "circle" | "line" | "arrow" | "eraser"

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
  start?: Point   // for shapes
  end?: Point
}

// ── Color palette ─────────────────────────────────────────────────────────────
const COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ffffff",  // white
  "#000000",  // black
]

// ── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS: { id: Tool; icon: React.FC<{ className?: string }>; label: string }[] = [
  { id: "pen",         icon: Pen,       label: "Pen"         },
  { id: "highlighter", icon: Highlighter, label: "Highlight" },
  { id: "line",        icon: Minus,     label: "Line"        },
  { id: "arrow",       icon: ArrowRight, label: "Arrow"      },
  { id: "rect",        icon: Square,    label: "Rectangle"   },
  { id: "circle",      icon: Circle,    label: "Circle"      },
  { id: "eraser",      icon: Eraser,    label: "Eraser"      },
]

// ── Canvas helpers ────────────────────────────────────────────────────────────
function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (!stroke.points.length) return
  ctx.save()

  if (stroke.tool === "highlighter") {
    ctx.globalAlpha = 0.35
    ctx.globalCompositeOperation = "source-over"
    ctx.lineWidth = stroke.width * 4
  } else if (stroke.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out"
    ctx.lineWidth = stroke.width * 6
  } else {
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = "source-over"
    ctx.lineWidth = stroke.width
  }

  ctx.strokeStyle = stroke.color
  ctx.lineCap  = "round"
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
    if (stroke.tool === "arrow") {
      drawArrowHead(ctx, stroke.start, stroke.end, stroke.width)
    }
  } else if (stroke.tool === "rect" && stroke.start && stroke.end) {
    ctx.beginPath()
    ctx.strokeRect(
      stroke.start.x, stroke.start.y,
      stroke.end.x - stroke.start.x, stroke.end.y - stroke.start.y
    )
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
  const size  = width * 4 + 8
  ctx.save()
  ctx.translate(to.x, to.y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-size, -size * 0.5)
  ctx.lineTo(-size,  size * 0.5)
  ctx.closePath()
  ctx.fillStyle = ctx.strokeStyle as string
  ctx.fill()
  ctx.restore()
}

function redrawAll(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  strokes.forEach((s) => drawStroke(ctx, s))
}

// ── Main component ────────────────────────────────────────────────────────────
export function AnnotationPage() {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const drawing    = useRef(false)
  const strokes    = useRef<Stroke[]>([])
  const liveStroke = useRef<Stroke | null>(null)

  const [drawState, setDrawState] = useState<DrawState>({
    tool: "pen",
    color: "#ef4444",
    width: 3,
  })
  const [toolbarOpen, setToolbarOpen] = useState(true)
  const [saved, setSaved] = useState(false)

  // Fit canvas to window
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")!
      // Save current drawing
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
      ctx.putImageData(img, 0, 0)
      redrawAll(ctx, strokes.current)
    }
    resize()
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [])

  // ── Pointer events ────────────────────────────────────────────────────────
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
    const ctx = canvasRef.current!.getContext("2d")!
    redrawAll(ctx, strokes.current)
  }, [])

  const clearAll = useCallback(() => {
    strokes.current = []
    const canvas = canvasRef.current!
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const closeWindow = () => getCurrentWindow().hide()

  // Send the current drawing to the main window, which composites it onto the
  // live video frame and saves a PNG snapshot to the library.
  const saveSnapshot = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const png = canvas.toDataURL("image/png")
      await emit("annotation-save", { png })
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } catch {
      /* ignore */
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeWindow()
      if ((e.metaKey || e.ctrlKey) && e.key === "z") undo()
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); saveSnapshot() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [undo, saveSnapshot])

  return (
    <div className="relative h-screen w-screen overflow-hidden" style={{ background: "transparent" }}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      {/* Floating toolbar */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-50"
        style={{ pointerEvents: "all" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {toolbarOpen && (
          <div className="fade-up flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/80 p-3 backdrop-blur-xl shadow-2xl">
            {/* Tool row */}
            <div className="flex items-center gap-1">
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  title={t.label}
                  onClick={() => setDrawState((s) => ({ ...s, tool: t.id }))}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-xl transition-all",
                    drawState.tool === t.id
                      ? "bg-orange-500 text-white shadow-md shadow-orange-500/30"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <t.icon className="size-4" />
                </button>
              ))}

              <div className="mx-1 h-6 w-px bg-white/15" />

              {/* Width */}
              <div className="flex flex-col items-center gap-0.5">
                <button
                  onClick={() => setDrawState((s) => ({ ...s, width: Math.min(s.width + 1, 12) }))}
                  className="text-white/50 hover:text-white transition-colors"
                >
                  <ChevronUp className="size-3" />
                </button>
                <span className="text-[11px] font-mono font-bold text-white/70 tabular-nums w-4 text-center">
                  {drawState.width}
                </span>
                <button
                  onClick={() => setDrawState((s) => ({ ...s, width: Math.max(s.width - 1, 1) }))}
                  className="text-white/50 hover:text-white transition-colors"
                >
                  <ChevronDown className="size-3" />
                </button>
              </div>

              <div className="mx-1 h-6 w-px bg-white/15" />

              {/* Undo + Clear */}
              <button
                onClick={undo}
                title="Undo (⌘Z)"
                className="flex size-9 items-center justify-center rounded-xl text-white/60 transition-all hover:bg-white/10 hover:text-white"
              >
                <Undo2 className="size-4" />
              </button>
              <button
                onClick={clearAll}
                title="Clear all"
                className="flex size-9 items-center justify-center rounded-xl text-white/60 transition-all hover:bg-red-500/20 hover:text-red-400"
              >
                <Trash2 className="size-4" />
              </button>

              <div className="mx-1 h-6 w-px bg-white/15" />

              {/* Save snapshot */}
              <button
                onClick={saveSnapshot}
                title="Save snapshot (⌘S)"
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-2.5 transition-all",
                  saved
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "text-white/60 hover:bg-orange-500/20 hover:text-orange-300",
                )}
                style={{ height: "2.25rem" }}
              >
                {saved ? <Check className="size-4" /> : <ImageDown className="size-4" />}
                <span className="text-xs font-bold">{saved ? "Uložené" : "Uložiť"}</span>
              </button>

              <div className="mx-1 h-6 w-px bg-white/15" />

              {/* Close */}
              <button
                onClick={closeWindow}
                title="Close (Esc)"
                className="flex size-9 items-center justify-center rounded-xl text-white/60 transition-all hover:bg-red-500/20 hover:text-red-400"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Color palette */}
            <div className="flex items-center justify-center gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setDrawState((s) => ({ ...s, color: c, tool: s.tool === "eraser" ? "pen" : s.tool }))}
                  className={cn(
                    "size-6 rounded-full border-2 transition-all hover:scale-110",
                    drawState.color === c && drawState.tool !== "eraser"
                      ? "border-white scale-110 shadow-md"
                      : "border-transparent"
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Toggle toolbar button */}
        <button
          onClick={() => setToolbarOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-xs text-white/60 backdrop-blur-xl transition-all hover:text-white hover:border-white/20"
        >
          {toolbarOpen ? "Hide tools" : "Show tools"}
        </button>
      </div>
    </div>
  )
}
