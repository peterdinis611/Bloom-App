import { createContext, useCallback, useContext, useState } from "react"
import { Check, CircleAlert, X } from "lucide-react"
import { cn } from "@/lib/utils"

export type ToastVariant = "success" | "error" | "info"

interface ToastItem {
  id: number
  title: string
  description?: string
  variant: ToastVariant
}

interface ToastInput {
  title: string
  description?: string
}

interface ToastContextValue {
  toast: (input: ToastInput & { variant?: ToastVariant }) => void
  success: (input: ToastInput) => void
  error: (input: ToastInput) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  error: "border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)]",
  info: "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
}

const VARIANT_ICONS = {
  success: Check,
  error: CircleAlert,
  info: CircleAlert,
} as const

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(100vw-2rem,22rem)] flex-col gap-2"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((t) => {
        const Icon = VARIANT_ICONS[t.variant]
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-xl backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2",
              VARIANT_STYLES[t.variant],
            )}
            role="status"
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{t.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((input: ToastInput & { variant?: ToastVariant }) => {
    const id = Date.now() + Math.random()
    const item: ToastItem = {
      id,
      title: input.title,
      description: input.description,
      variant: input.variant ?? "info",
    }
    setToasts((prev) => [...prev, item])
    window.setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  const value: ToastContextValue = {
    toast: push,
    success: (input) => push({ ...input, variant: "success" }),
    error: (input) => push({ ...input, variant: "error" }),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}
