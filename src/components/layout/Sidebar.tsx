import { Circle, Library, Settings, Video } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type AppView = "record" | "library" | "settings"

interface SidebarProps {
  view: AppView
  onChange: (v: AppView) => void
  locked?: boolean
  recording?: boolean
}

const ITEMS: { id: AppView; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: "record", label: "Record", icon: Video },
  { id: "library", label: "Library", icon: Library },
  { id: "settings", label: "Settings", icon: Settings },
]

export function Sidebar({ view, onChange, locked = false, recording = false }: SidebarProps) {
  return (
    <aside className="mac-sidebar flex w-[168px] shrink-0 flex-col pt-2">
      {recording && (
        <div className="mx-3 mb-3 flex items-center gap-2 rounded-md bg-[var(--sidebar-active)] px-2.5 py-1.5">
          <Circle className="size-2 fill-[var(--rec-indicator)] text-[var(--rec-indicator)]" />
          <span className="text-[11px] font-medium text-muted-foreground">Recording</span>
        </div>
      )}

      <nav className="flex flex-col gap-0.5 px-2">
        {ITEMS.map((item) => {
          const active = view === item.id
          const disabled = locked && item.id !== view
          const btn = (
            <button
              key={item.id}
              onClick={() => !disabled && onChange(item.id)}
              disabled={disabled}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                active
                  ? "bg-[var(--sidebar-active)] font-medium text-foreground"
                  : disabled
                    ? "cursor-not-allowed text-muted-foreground/40"
                    : "text-muted-foreground hover:bg-[var(--sidebar-hover)] hover:text-foreground",
              )}
            >
              <item.icon className={cn("size-4 shrink-0", active && "text-[var(--accent)]")} />
              {item.label}
            </button>
          )
          return disabled ? (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>{btn}</TooltipTrigger>
              <TooltipContent>Finish recording first</TooltipContent>
            </Tooltip>
          ) : (
            btn
          )
        })}
      </nav>
    </aside>
  )
}
