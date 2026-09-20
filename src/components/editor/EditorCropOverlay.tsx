import { useCallback, useRef, useState } from "react"
import { Check, RotateCcw, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { sk } from "@/lib/i18n/sk"
import { clampCrop, type EditorCrop } from "@/lib/editorSegments"

interface EditorCropOverlayProps {
  value: EditorCrop | null
  onChange: (crop: EditorCrop | null) => void
  className?: string
}

/** Drag a rectangle over the editor preview for spatial crop. */
export function EditorCropOverlay({ value, onChange, className }: EditorCropOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<EditorCrop | null>(null)

  const toNorm = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const root = rootRef.current
    if (!root) return null
    const r = root.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return null
    return {
      x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toNorm(e.clientX, e.clientY)
    if (!p) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStart.current = p
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragStart.current
    if (!start) return
    const p = toNorm(e.clientX, e.clientY)
    if (!p) return
    const x = Math.min(start.x, p.x)
    const y = Math.min(start.y, p.y)
    const w = Math.abs(p.x - start.x)
    const h = Math.abs(p.y - start.y)
    setDraft({ x, y, w, h })
  }

  const onPointerUp = () => {
    const d = draft
    dragStart.current = null
    setDraft(null)
    if (d && d.w >= 0.05 && d.h >= 0.05) {
      onChange(clampCrop(d))
    }
  }

  const shown = draft ?? value

  return (
    <div ref={rootRef} className={cn("absolute inset-0 z-20", className)}>
      <div
        className="absolute inset-0 cursor-crosshair"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ touchAction: "none" }}
      >
        <div className="pointer-events-none absolute inset-0 bg-black/40" />
        {shown && shown.w > 0 && shown.h > 0 && (
          <div
            className="pointer-events-none absolute border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            style={{
              left: `${shown.x * 100}%`,
              top: `${shown.y * 100}%`,
              width: `${shown.w * 100}%`,
              height: `${shown.h * 100}%`,
            }}
          >
            <div className="absolute -top-6 left-0 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white">
              {Math.round(shown.w * 100)}% × {Math.round(shown.h * 100)}%
            </div>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-2">
        <button
          type="button"
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg bg-black/75 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-black/90"
          onClick={() => onChange(null)}
        >
          <RotateCcw className="size-3" /> {sk.editor.cropReset}
        </button>
        {value && (
          <span className="pointer-events-none inline-flex items-center gap-1 rounded-lg bg-accent/90 px-2.5 py-1.5 text-[11px] font-semibold text-white">
            <Check className="size-3" /> {sk.editor.cropActive}
          </span>
        )}
        {!value && (
          <span className="pointer-events-none inline-flex items-center gap-1 rounded-lg bg-black/60 px-2.5 py-1.5 text-[11px] text-white/80">
            <X className="size-3 opacity-60" /> {sk.editor.cropHint}
          </span>
        )}
      </div>
    </div>
  )
}
