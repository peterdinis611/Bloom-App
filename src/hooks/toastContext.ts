import { createContext, useContext } from "react"

export type ToastVariant = "success" | "error" | "info" | "warning"

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastInput {
  title: string
  description?: string
  actions?: ToastAction[]
}

export interface ToastContextValue {
  toast: (input: ToastInput & { variant?: ToastVariant }) => void
  success: (input: ToastInput) => void
  error: (input: ToastInput) => void
  info: (input: ToastInput) => void
  warning: (input: ToastInput) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}
