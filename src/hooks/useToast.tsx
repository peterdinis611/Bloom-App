import { createContext, useCallback, useContext, useRef, useState, type CSSProperties } from "react"
import { Check, CircleAlert, Info, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { sk } from "@/lib/i18n/sk"

export type ToastVariant = "success" | "error" | "info"

const TOAST_DURATION_MS = 4800
const TOAST_EXIT_MS = 240

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
  info: (input: ToastInput) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const VARIANT_ICONS = {
  success: Check,
  error: CircleAlert,
  info: Info,
} as const

function ToastCard({
  item,
  index,
  exiting,
  onDismiss,
}: {
  item: ToastItem
  index: number
  exiting: boolean
  onDismiss: (id: number) => void
}) {
  const Icon = VARIANT_ICONS[item.variant]

  return (
    <div
      className={cn(
        "bloom-toast",
        `bloom-toast--${item.variant}`,
        exiting ? "bloom-toast--exit" : "bloom-toast--enter",
      )}
      style={{ "--toast-stagger": `${index * 70}ms` } as CSSProperties}
      role="status"
    >
      <div className="bloom-toast__sheen" aria-hidden />
      <div className="bloom-toast__accent" aria-hidden />

      <div className="bloom-toast__body">
        <div className="bloom-toast__icon-wrap" aria-hidden>
          <Icon className="bloom-toast__icon" strokeWidth={2.25} />
        </div>

        <div className="bloom-toast__content">
          <p className="bloom-toast__title">{item.title}</p>
          {item.description && <p className="bloom-toast__desc">{item.description}</p>}
        </div>

        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          className="bloom-toast__close"
          aria-label={sk.toast.dismiss}
        >
          <X className="size-3.5" strokeWidth={2.25} />
        </button>
      </div>

      {!exiting && (
        <div
          className="bloom-toast__progress"
          style={{ animationDuration: `${TOAST_DURATION_MS}ms` }}
          aria-hidden
        />
      )}
    </div>
  )
}

function ToastViewport({
  toasts,
  exitingIds,
  onDismiss,
}: {
  toasts: ToastItem[]
  exitingIds: Set<number>
  onDismiss: (id: number) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div
      className="bloom-toast-viewport"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((t, i) => (
        <ToastCard
          key={t.id}
          item={t}
          index={i}
          exiting={exitingIds.has(t.id)}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [exitingIds, setExitingIds] = useState<Set<number>>(() => new Set())
  const timersRef = useRef<Map<number, number>>(new Map())

  const clearTimer = useCallback((id: number) => {
    const t = timersRef.current.get(id)
    if (t !== undefined) {
      window.clearTimeout(t)
      timersRef.current.delete(id)
    }
  }, [])

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id)
      setExitingIds((prev) => new Set(prev).add(id))
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
        setExitingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }, TOAST_EXIT_MS)
    },
    [clearTimer],
  )

  const scheduleDismiss = useCallback(
    (id: number) => {
      clearTimer(id)
      const timer = window.setTimeout(() => dismiss(id), TOAST_DURATION_MS)
      timersRef.current.set(id, timer)
    },
    [clearTimer, dismiss],
  )

  const push = useCallback(
    (input: ToastInput & { variant?: ToastVariant }) => {
      const id = Date.now() + Math.random()
      const item: ToastItem = {
        id,
        title: input.title,
        description: input.description,
        variant: input.variant ?? "info",
      }
      setToasts((prev) => [...prev.slice(-4), item])
      scheduleDismiss(id)
    },
    [scheduleDismiss],
  )

  const value: ToastContextValue = {
    toast: push,
    success: (input) => push({ ...input, variant: "success" }),
    error: (input) => push({ ...input, variant: "error" }),
    info: (input) => push({ ...input, variant: "info" }),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} exitingIds={exitingIds} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}
