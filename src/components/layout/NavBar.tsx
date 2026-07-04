import { Video, Library, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type AppView = "record" | "library" | "settings"

interface NavBarProps {
  view: AppView
  onChange: (v: AppView) => void
  locked?: boolean
}

const TABS: { id: AppView; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: "record",   label: "Record",   icon: Video    },
  { id: "library",  label: "Library",  icon: Library  },
  { id: "settings", label: "Settings", icon: Settings },
]

export function NavBar({ view, onChange, locked = false }: NavBarProps) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border/50 bg-[var(--titlebar)] px-3 py-2">
      {TABS.map((tab) => {
        const active = view === tab.id
        const disabled = locked && tab.id !== view
        const btn = (
          <button
            key={tab.id}
            onClick={() => !disabled && onChange(tab.id)}
            disabled={disabled}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all",
              active
                ? "bg-primary/15 text-primary"
                : disabled
                  ? "cursor-not-allowed text-muted-foreground/30"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <tab.icon className="size-3.5" />
            {tab.label}
          </button>
        )
        return disabled ? (
          <Tooltip key={tab.id}>
            <TooltipTrigger asChild>{btn}</TooltipTrigger>
            <TooltipContent>Finish the recording first</TooltipContent>
          </Tooltip>
        ) : (
          btn
        )
      })}
    </div>
  )
}
