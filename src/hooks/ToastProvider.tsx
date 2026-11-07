import { useCallback, useRef, useState, type CSSProperties } from "react"
import { Check, CircleAlert, Info, TriangleAlert, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { feedback } from "@/lib/feedback"
import { getMessagesSync } from "@/lib/i18n/messagesSync"
import {
  ToastContext,
  type ToastAction,
  type ToastInput,
  type ToastVariant,
} from "@/hooks/toastContext"

const TOAST_DURATION_MS = 3600
const TOAST_WITH_ACTIONS_MS = 7800
const TOAST_EXIT_MS = 180

interface ToastItem {
  id: number
  title: string
  description?: string
  variant: ToastVariant
  actions?: ToastAction[]
}

const VARIANT_ICONS = {
  success: Check,
  error: CircleAlert,
  info: Info,
  warning: TriangleAlert,
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
  const sk = getMessagesSync()
  const Icon = VARIANT_ICONS[item.variant]
  const duration = item.actions?.length ? TOAST_WITH_ACTIONS_MS : TOAST_DURATION_MS

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
      <div className="bloom-toast__accent" aria-hidden />

      <div className="bloom-toast__body">
        <div className="bloom-toast__icon-wrap" aria-hidden>
          <Icon className="bloom-toast__icon" strokeWidth={2.25} />
        </div>

        <div className="bloom-toast__content">
          <p className="bloom-toast__title">{item.title}</p>
          {item.description && <p className="bloom-toast__desc">{item.description}</p>}
          {item.actions && item.actions.length > 0 && (
            <div className="bloom-toast__actions">
              {item.actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="bloom-toast__action"
                  onClick={() => {
                    action.onClick()
                    onDismiss(item.id)
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
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
          style={{ animationDuration: `${duration}ms` }}
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
    (id: number, ms: number) => {
      clearTimer(id)
      const timer = window.setTimeout(() => dismiss(id), ms)
      timersRef.current.set(id, timer)
    },
    [clearTimer, dismiss],
  )

  const push = useCallback(
    (input: ToastInput & { variant?: ToastVariant }) => {
      const id = Date.now() + Math.random()
      const variant = input.variant ?? "info"
      const item: ToastItem = {
        id,
        title: input.title,
        description: input.description,
        variant,
        actions: input.actions,
      }
      setToasts((prev) => [...prev.slice(-4), item])
      const ms = input.actions?.length ? TOAST_WITH_ACTIONS_MS : TOAST_DURATION_MS
      scheduleDismiss(id, ms)
      if (variant === "success") feedback("success")
      else if (variant === "error") feedback("error")
      else if (variant === "warning") feedback("warning")
      else feedback("select")
    },
    [scheduleDismiss],
  )

  const value = {
    toast: push,
    success: (input: ToastInput) => push({ ...input, variant: "success" as const }),
    error: (input: ToastInput) => push({ ...input, variant: "error" as const }),
    info: (input: ToastInput) => push({ ...input, variant: "info" as const }),
    warning: (input: ToastInput) => push({ ...input, variant: "warning" as const }),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} exitingIds={exitingIds} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}
