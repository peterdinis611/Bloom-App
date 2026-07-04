import type { AnnotationTool } from "@/hooks/useSettings"

export type { AnnotationTool }

export interface NormPoint {
  x: number
  y: number
}

export interface DrawState {
  tool: AnnotationTool
  color: string
  width: number
}

interface PixelPoint {
  x: number
  y: number
}

export interface Stroke {
  tool: AnnotationTool
  color: string
  width: number
  points: PixelPoint[]
  start?: PixelPoint
  end?: PixelPoint
}

export interface NormStroke {
  tool: AnnotationTool
  color: string
  width: number
  points: NormPoint[]
  start?: NormPoint
  end?: NormPoint
}

/** Recording output is always 16:9 (see capture DIMENSIONS). */
export const RECORDING_ASPECT = 16 / 9

/** Letterboxed content rect for object-fit: contain. */
export function contentRectContain(cw: number, ch: number, aspect: number) {
  const containerAspect = cw / ch
  if (containerAspect > aspect) {
    const h = ch
    const w = h * aspect
    return { x: (cw - w) / 2, y: 0, w, h }
  }
  const w = cw
  const h = w / aspect
  return { x: 0, y: (ch - h) / 2, w, h }
}

export function clientToNorm(
  clientX: number,
  clientY: number,
  container: DOMRect,
  aspect = RECORDING_ASPECT,
): NormPoint | null {
  const cr = contentRectContain(container.width, container.height, aspect)
  const lx = clientX - container.left - cr.x
  const ly = clientY - container.top - cr.y
  if (lx < 0 || ly < 0 || lx > cr.w || ly > cr.h) return null
  return { x: lx / cr.w, y: ly / cr.h }
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
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

function drawArrowHead(ctx: CanvasRenderingContext2D, from: PixelPoint, to: PixelPoint, width: number) {
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

function toPixelStroke(stroke: NormStroke, w: number, h: number): Stroke {
  const map = (p: NormPoint) => ({ x: p.x * w, y: p.y * h })
  return {
    ...stroke,
    points: stroke.points.map(map),
    start: stroke.start ? map(stroke.start) : undefined,
    end: stroke.end ? map(stroke.end) : undefined,
  }
}

/** Mutable stroke layer composited into the recording canvas each frame. */
export class AnnotationLayer {
  private strokes: NormStroke[] = []
  private live: NormStroke | null = null
  private drawing = false
  revision = 0

  private bump() {
    this.revision += 1
  }

  clear() {
    this.strokes = []
    this.live = null
    this.drawing = false
    this.bump()
  }

  undo() {
    if (!this.strokes.length) return
    this.strokes.pop()
    this.bump()
  }

  beginStroke(state: DrawState, point: NormPoint) {
    this.drawing = true
    this.live = {
      tool: state.tool,
      color: state.tool === "eraser" ? "#000" : state.color,
      width: state.width,
      points: [point],
      start: point,
      end: point,
    }
    this.bump()
  }

  extendStroke(point: NormPoint) {
    if (!this.drawing || !this.live) return
    this.live.points.push(point)
    this.live.end = point
    this.bump()
  }

  endStroke() {
    if (!this.drawing || !this.live) return
    this.drawing = false
    this.strokes.push(this.live)
    this.live = null
    this.bump()
  }

  isEmpty() {
    return this.strokes.length === 0 && this.live === null
  }

  /** Paint all strokes onto a pixel canvas (recording compositor or preview). */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    for (const stroke of this.strokes) {
      drawStroke(ctx, toPixelStroke(stroke, w, h))
    }
    if (this.live) drawStroke(ctx, toPixelStroke(this.live, w, h))
  }

  /** Preview overlay at CSS pixel size (object-fit: contain area). */
  drawPreview(ctx: CanvasRenderingContext2D, cssW: number, cssH: number) {
    const cr = contentRectContain(cssW, cssH, RECORDING_ASPECT)
    ctx.clearRect(0, 0, cssW, cssH)
    ctx.save()
    ctx.translate(cr.x, cr.y)
    ctx.scale(cr.w, cr.h)
    for (const stroke of this.strokes) {
      drawStroke(ctx, toPixelStroke(stroke, 1, 1))
    }
    if (this.live) drawStroke(ctx, toPixelStroke(this.live, 1, 1))
    ctx.restore()
  }
}
