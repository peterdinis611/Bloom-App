import { useCallback, useRef, useState } from "react"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { sk } from "@/lib/i18n/sk"
import type { CropRect } from "@/lib/capture"

interface RegionCropOverlayProps {
  onConfirm: (rect: CropRect) => void
  onCancel: () => void
}

/** Drag a rectangle over the live preview to crop the recorded area. */
export function RegionCropOverlay({ onConfirm, onCancel }: RegionCropOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<CropRect | null>(null)

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
    dragStart.current = null
  }

  const canConfirm = !!draft && draft.w >= 0.05 && draft.h >= 0.05

  return (
    <div ref={rootRef} className="absolute inset-0 z-30">
      <div
        className="absolute inset-0 cursor-crosshair"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ touchAction: "none" }}
      >
        <div className="pointer-events-none absolute inset-0 bg-black/45" />
        {draft && draft.w > 0 && draft.h > 0 && (
          <div
            className="pointer-events-none absolute border-2 border-[var(--accent)] shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
            style={{
              left: `${draft.x * 100}%`,
              top: `${draft.y * 100}%`,
              width: `${draft.w * 100}%`,
              height: `${draft.h * 100}%`,
            }}
          >
            <div className="absolute -top-6 left-0 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
              {Math.round(draft.w * 100)}% × {Math.round(draft.h * 100)}%
            </div>
          </div>
        )}
      </div>

      <div className="pointer-events-auto absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border/60 bg-black/80 px-3 py-2 shadow-lg backdrop-blur-md">
        <p className="mr-1 text-[11px] text-white/80">{sk.record.regionHint}</p>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X className="size-3.5" /> {sk.record.cancel}
        </button>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => draft && canConfirm && onConfirm(draft)}
          className={cn(
            "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold",
            canConfirm
              ? "bg-[var(--accent)] text-black hover:opacity-90"
              : "bg-white/10 text-white/40",
          )}
        >
          <Check className="size-3.5" /> {sk.record.regionConfirm}
        </button>
      </div>
    </div>
  )
}
