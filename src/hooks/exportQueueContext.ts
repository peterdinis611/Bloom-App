import { createContext, useContext } from "react"
import type { OptimizeOptions } from "@/types"

export type QueueItemStatus = "pending" | "running" | "done" | "error" | "cancelled"

export interface ExportQueueItem {
  id: string
  label: string
  options: OptimizeOptions
  status: QueueItemStatus
  percent: number
  error?: string
  outputPath?: string
  outputSize?: number
  jobId?: string
}

export interface EnqueueJob {
  label: string
  options: OptimizeOptions
  speechRanges?: { start: number; end: number }[]
  preferredStem?: string
}

export interface ExportQueueContextValue {
  items: ExportQueueItem[]
  activeCount: number
  enqueue: (jobs: EnqueueJob | EnqueueJob[]) => void
  /** Start all jobs via Rust export queue (one worker, sequential). */
  enqueueBatch: (jobs: EnqueueJob[]) => Promise<void>
  cancelItem: (id: string) => void
  clearFinished: () => void
  retryItem: (id: string) => void
}

export const ExportQueueContext = createContext<ExportQueueContextValue | null>(null)

export function useExportQueue(): ExportQueueContextValue {
  const ctx = useContext(ExportQueueContext)
  if (!ctx) throw new Error("useExportQueue must be used within ExportQueueProvider")
  return ctx
}
