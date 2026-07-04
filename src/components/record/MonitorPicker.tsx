import { useMemo } from "react"
import { Monitor, Eye } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MonitorInfo } from "@/types"

interface MonitorPickerProps {
  monitors: MonitorInfo[]
  selectedId: string
  onChange: (id: string, index: number) => void
  onHighlight?: (monitor: MonitorInfo) => void
}

export function MonitorPicker({ monitors, selectedId, onChange, onHighlight }: MonitorPickerProps) {
  const bounds = useMemo(() => {
    if (monitors.length === 0) return { minX: 0, minY: 0, w: 1, h: 1 }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const m of monitors) {
      minX = Math.min(minX, m.x)
      minY = Math.min(minY, m.y)
      maxX = Math.max(maxX, m.x + m.physical_width)
      maxY = Math.max(maxY, m.y + m.physical_height)
    }
    return {
      minX,
      minY,
      w: Math.max(maxX - minX, 1),
      h: Math.max(maxY - minY, 1),
    }
  }, [monitors])

  const selected = monitors.find((m) => m.id === selectedId) ?? monitors[0]

  if (monitors.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-[var(--surface)] px-3.5 py-3 text-sm text-muted-foreground">
        <Monitor className="size-4 shrink-0" />
        No displays detected
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Mini layout map */}
      <div className="relative h-28 overflow-hidden rounded-xl border border-border/60 bg-[#0a0a0c] p-3">
        <div className="absolute inset-3">
          {monitors.map((m, index) => {
            const active = m.id === selectedId
            const left = ((m.x - bounds.minX) / bounds.w) * 100
            const top = ((m.y - bounds.minY) / bounds.h) * 100
            const width = (m.physical_width / bounds.w) * 100
            const height = (m.physical_height / bounds.h) * 100
            return (
              <button
                key={m.id}
                type="button"
                title={m.name}
                onClick={() => {
                  onChange(m.id, index)
                  onHighlight?.(m)
                }}
                style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                className={cn(
                  "absolute flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border-2 px-1 transition-all",
                  active
                    ? "z-10 border-primary bg-primary/25 shadow-lg shadow-primary/20"
                    : "border-border/50 bg-secondary/40 hover:border-border hover:bg-secondary/70",
                )}
              >
                <Monitor className={cn("size-3.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                <span className={cn(
                  "max-w-full truncate text-[9px] font-bold leading-none",
                  active ? "text-primary" : "text-muted-foreground",
                )}>
                  {index + 1}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected monitor details + highlight on display */}
      {selected && (
        <div className={cn(
          "flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors",
          "border-primary/40 bg-primary/8",
        )}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/20">
            <Monitor className="size-4 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-primary">
              {selected.name}{selected.is_primary ? " · Primary" : ""}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {selected.width}×{selected.height} · Display {monitors.indexOf(selected) + 1}
            </p>
          </div>
          {onHighlight && (
            <button
              type="button"
              onClick={() => onHighlight(selected)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20"
            >
              <Eye className="size-3.5" />
              Ukázať
            </button>
          )}
        </div>
      )}
    </div>
  )
}
