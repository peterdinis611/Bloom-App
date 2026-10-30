/**
 * Lightweight multimodal feedback (Apple-style: causality + utility).
 * Visual press is CSS; this adds optional Vibration API on commit actions.
 */

export type FeedbackKind = "select" | "commit" | "success" | "error" | "warning"

const PATTERNS: Record<FeedbackKind, number | number[]> = {
  select: 8,
  commit: 12,
  success: [10, 40, 14],
  error: [18, 30, 18],
  warning: [12, 24, 12],
}

let reducedMotion = false

export function setFeedbackReducedMotion(on: boolean) {
  reducedMotion = on
}

function syncReducedMotionFromOs() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
  setFeedbackReducedMotion(mq.matches)
  const onChange = () => setFeedbackReducedMotion(mq.matches)
  mq.addEventListener?.("change", onChange)
}

if (typeof window !== "undefined") {
  syncReducedMotionFromOs()
}

/** Fire a short haptic (no-op when unsupported / reduced motion / no permission). */
export function feedback(kind: FeedbackKind = "select") {
  if (reducedMotion) return
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return
  try {
    navigator.vibrate(PATTERNS[kind])
  } catch {
    /* ignore */
  }
}
