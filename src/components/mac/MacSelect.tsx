import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface MacSelectOption {
  value: string
  label: string
}

interface MacSelectProps {
  value: string
  onChange: (value: string) => void
  options: MacSelectOption[]
  placeholder: string
  icon?: React.FC<{ className?: string }>
  className?: string
  /** Zvýrazni trigger, keď je zvolená nenulová hodnota */
  highlightWhenSet?: boolean
}

export function MacSelect({
  value,
  onChange,
  options,
  placeholder,
  icon: Icon,
  className,
  highlightWhenSet = true,
}: MacSelectProps) {
  const selected = options.find((o) => o.value === value)
  const label = selected?.label ?? placeholder
  const isSet = highlightWhenSet && value !== ""

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "mac-select-trigger flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "data-[state=open]:border-accent/40 data-[state=open]:bg-accent-muted/80 data-[state=open]:text-foreground",
            isSet
              ? "border-accent/35 bg-accent-muted text-foreground"
              : "border-border/60 bg-[var(--surface)] text-muted-foreground hover:border-border hover:text-foreground",
            className,
          )}
        >
          {Icon && (
            <Icon className={cn("size-3 shrink-0", isSet ? "text-accent" : "opacity-70")} />
          )}
          <span className="max-w-[180px] truncate">{label}</span>
          <ChevronDown className="size-3 shrink-0 opacity-55" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="min-w-[var(--radix-dropdown-menu-trigger-width)] p-1"
      >
        {options.map((opt) => {
          const active = opt.value === value
          return (
            <DropdownMenuItem
              key={opt.value || "__all__"}
              onClick={() => onChange(opt.value)}
              className={cn(
                "gap-2 rounded-md px-2.5 py-2 text-[12px]",
                active && "bg-accent-muted/60",
              )}
            >
              {Icon && (
                <Icon
                  className={cn(
                    "size-3 shrink-0",
                    active ? "text-accent" : "text-muted-foreground",
                  )}
                />
              )}
              <span className={cn("min-w-0 flex-1 truncate", active && "font-semibold")}>
                {opt.label}
              </span>
              {active && <Check className="size-3 shrink-0 text-accent" strokeWidth={2.5} />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
