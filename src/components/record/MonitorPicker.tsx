import { Check, Monitor } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MonitorInfo } from "@/types"

interface MonitorPickerProps {
  monitors: MonitorInfo[]
  selectedId: string
  onChange: (id: string, index: number) => void
  onHighlight?: (monitor: MonitorInfo) => void
}

export function MonitorPicker({ monitors, selectedId, onChange, onHighlight }: MonitorPickerProps) {
  if (monitors.length === 0) {
    return (
      <div className="mac-group !mx-0">
        <div className="mac-row text-[13px] text-muted-foreground">
          <Monitor className="size-4 shrink-0 opacity-50" />
          No displays detected
        </div>
      </div>
    )
  }

  return (
    <div className="mac-group !mx-0">
      {monitors.map((m, index) => {
        const active = m.id === selectedId
        return (
          <div
            key={m.id}
            className={cn(
              "flex items-center gap-3 px-3.5 py-2.5",
              index > 0 && "border-t border-border",
              active && "bg-[var(--sidebar-active)]",
            )}
          >
            <button
              type="button"
              onClick={() => {
                onChange(m.id, index)
              }}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span
                className={cn(
                  "flex size-[18px] shrink-0 items-center justify-center rounded-full border",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)]"
                    : "border-[var(--muted-foreground)]/40 bg-transparent",
                )}
              >
                {active && <Check className="size-2.5 text-white" strokeWidth={3} />}
              </span>

              <Monitor className="size-4 shrink-0 text-muted-foreground" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-foreground">
                  {m.name}
                  {m.is_primary && (
                    <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">Primary</span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {m.width} × {m.height}
                </p>
              </div>
            </button>

            {onHighlight && (
              <button
                type="button"
                onClick={() => onHighlight(m)}
                className="shrink-0 text-[12px] font-medium text-[var(--accent)] hover:underline"
              >
                Identify
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
