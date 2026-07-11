import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

/** macOS-style inset grouped section */
export function MacGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Card className={className}>{children}</Card>
}

export function MacGroupHeader({ children }: { children: React.ReactNode }) {
  return <p className="mac-group-header">{children}</p>
}

export function MacRow({
  label,
  hint,
  children,
  onClick,
  border = true,
}: {
  label: string
  hint?: string
  children?: React.ReactNode
  onClick?: () => void
  border?: boolean
}) {
  const Tag = onClick ? "button" : "div"
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("mac-row", onClick && "mac-row-clickable", !border && "border-none")}
    >
      <div className="min-w-0 flex-1 text-left">
        <Label className="cursor-[inherit]">{label}</Label>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </Tag>
  )
}

export function MacRowSeparator() {
  return <Separator className="bg-border" />
}

export function MacSegmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={className}>
      <TabsList className="w-full">
        {options.map((o) => (
          <TabsTrigger key={o.value} value={o.value}>
            {o.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

const MAC_BTN_VARIANT = {
  default: "outline",
  primary: "default",
  destructive: "destructive",
  ghost: "ghost",
} as const

export function MacButton({
  children,
  variant = "default",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof MAC_BTN_VARIANT
}) {
  return (
    <Button
      variant={MAC_BTN_VARIANT[variant]}
      size="sm"
      className={cn(variant === "primary" && "shadow-md shadow-primary/20", className)}
      {...props}
    >
      {children}
    </Button>
  )
}

export function MacToggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return <Switch checked={on} onCheckedChange={onChange} />
}

export function MacPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <header className="mac-page-header shrink-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
