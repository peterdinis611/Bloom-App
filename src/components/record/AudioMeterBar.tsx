import { cn } from "@/lib/utils"

export function AudioMeterBar({ label, level, active }: {
  label: string
  level: number
  active: boolean
}) {
  const pct = Math.round(Math.min(1, level) * 100)
  return (
    <div className={cn("flex flex-1 flex-col gap-1", !active && "opacity-40")}>
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
        <span>{label}</span>
        {active && <span className="font-mono tabular-nums">{pct}%</span>}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-75",
            pct > 85 ? "bg-red-500" : pct > 60 ? "bg-amber-400" : "bg-emerald-400",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
