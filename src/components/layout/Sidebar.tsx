import { Circle, Library, Settings, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { sk } from "@/lib/i18n/sk"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type AppView = "record" | "library" | "settings"

interface SidebarProps {
  view: AppView
  onChange: (v: AppView) => void
  locked?: boolean
  recording?: boolean
}

const ITEMS: { id: AppView; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: "record", label: sk.nav.record, icon: Video },
  { id: "library", label: sk.nav.library, icon: Library },
  { id: "settings", label: sk.nav.settings, icon: Settings },
]

export function Sidebar({ view, onChange, locked = false, recording = false }: SidebarProps) {
  return (
    <aside className="mac-sidebar flex w-[188px] shrink-0 flex-col">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15 shadow-sm shadow-primary/10">
          <Video className="size-4 text-accent" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-tight text-foreground">{sk.app.name}</p>
          <p className="text-[10px] text-muted-foreground">{sk.app.tagline}</p>
        </div>
      </div>

      {recording && (
        <div className="mx-3 mb-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/8 px-2.5 py-2">
          <Circle className="rec-dot size-2 fill-[var(--rec-indicator)] text-[var(--rec-indicator)]" />
          <span className="text-[11px] font-semibold text-red-300">{sk.nav.recordingActive}</span>
        </div>
      )}

      <nav className="flex flex-col gap-0.5 px-2.5">
        {ITEMS.map((item) => {
          const active = view === item.id
          const disabled = locked && item.id !== view
          const btn = (
            <Button
              key={item.id}
              variant="ghost"
              onClick={() => !disabled && onChange(item.id)}
              disabled={disabled}
              className={cn(
                "relative h-9 w-full justify-start gap-2.5 px-2.5 text-[13px] font-normal",
                active
                  ? "bg-[var(--sidebar-active)] font-medium text-foreground shadow-sm"
                  : disabled
                    ? "text-muted-foreground/35"
                    : "text-muted-foreground hover:bg-[var(--sidebar-hover)] hover:text-foreground",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
              )}
              <item.icon className={cn("size-4 shrink-0", active ? "text-accent" : "opacity-70")} />
              {item.label}
            </Button>
          )
          return disabled ? (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>{btn}</TooltipTrigger>
              <TooltipContent>{sk.nav.recordingLocked}</TooltipContent>
            </Tooltip>
          ) : (
            btn
          )
        })}
      </nav>

      <div className="mt-auto px-4 py-4">
        <p className="text-[10px] text-muted-foreground/60">{sk.app.version}</p>
      </div>
    </aside>
  )
}
