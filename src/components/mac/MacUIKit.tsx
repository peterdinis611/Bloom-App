import { cn } from "@/lib/utils"

/** macOS-style inset grouped section */
export function MacGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mac-group overflow-hidden", className)}>
      {children}
    </div>
  )
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
      className={cn("mac-row", border && "mac-row-border", onClick && "mac-row-clickable")}
    >
      <div className="min-w-0 flex-1 text-left">
        <p className="text-[13px] text-foreground">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </Tag>
  )
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
    <div className={cn("mac-segmented", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn("mac-segment", o.value === value && "mac-segment-active")}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function MacButton({
  children,
  variant = "default",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "destructive" | "ghost"
}) {
  return (
    <button
      type="button"
      className={cn(
        "mac-btn",
        variant === "primary" && "mac-btn-primary",
        variant === "destructive" && "mac-btn-destructive",
        variant === "ghost" && "mac-btn-ghost",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function MacToggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      className={cn("mac-toggle", on && "mac-toggle-on")}
    >
      <span className="mac-toggle-knob" />
    </button>
  )
}

export function MacPageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mac-page-header">
      <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{title}</h1>
      {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
    </header>
  )
}
