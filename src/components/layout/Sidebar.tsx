import { Circle, Library, Settings, Video, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { sk } from "@/lib/i18n/sk"
import { ExportQueuePanel } from "@/components/layout/ExportQueuePanel"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type AppView = "record" | "library" | "settings" | "docs"

interface SidebarProps {
  view: AppView
  onChange: (v: AppView) => void
  locked?: boolean
  recording?: boolean
}

const ITEMS: { id: AppView; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: "record", label: sk.nav.record, icon: Video },
  { id: "library", label: sk.nav.library, icon: Library },
  { id: "docs", label: sk.nav.docs, icon: BookOpen },
  { id: "settings", label: sk.nav.settings, icon: Settings },
]

export function Sidebar({ view, onChange, locked = false, recording = false }: SidebarProps) {
  return (
    <aside className="mac-sidebar relative flex w-[204px] shrink-0 flex-col">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <div className="brand-icon flex size-9 items-center justify-center">
          <Video className="size-4 text-accent" />
        </div>
        <div className="min-w-0">
          <p className="brand-mark">
            {sk.app.name}
            <span className="brand-mark-dot" aria-hidden>.</span>
          </p>
          <p className="font-mono-bay text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
            {sk.app.tagline}
          </p>
        </div>
      </div>

      {recording && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-[8px] bg-[var(--status-error-bg)] px-2.5 py-2">
          <Circle className="rec-dot size-2 fill-[var(--rec-indicator)] text-[var(--rec-indicator)]" />
          <span className="text-[11px] font-medium text-[var(--status-error-fg)]">
            {sk.nav.recordingActive}
          </span>
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
                "h-8 w-full justify-start gap-2 rounded-[7px] px-2.5 text-[13px] font-normal",
                active
                  ? "bg-[var(--sidebar-active)] font-medium text-foreground"
                  : disabled
                    ? "text-muted-foreground/35"
                    : "text-foreground/80 hover:bg-[var(--sidebar-hover)] hover:text-foreground",
              )}
            >
              <item.icon className={cn("size-[15px] shrink-0", active ? "text-accent" : "opacity-70")} />
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

      <ExportQueuePanel />

      <div className="mt-auto px-4 py-3">
        <p className="text-[10px] text-muted-foreground/55">{sk.app.version}</p>
      </div>
    </aside>
  )
}
