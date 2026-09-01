import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { OptimizeOptions } from "@/types"
import { cancelOptimize, onOptimizeProgress, optimizeVideo } from "@/hooks/useBloomBackend"
import { useToast } from "@/hooks/useToast"
import { sk } from "@/lib/i18n/sk"

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
}

interface ExportQueueContextValue {
  items: ExportQueueItem[]
  activeCount: number
  enqueue: (jobs: EnqueueJob | EnqueueJob[]) => void
  cancelItem: (id: string) => void
  clearFinished: () => void
}

const ExportQueueContext = createContext<ExportQueueContextValue | null>(null)

function newId(): string {
  return crypto.randomUUID()
}

export function ExportQueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ExportQueueItem[]>([])
  const { success, error, info } = useToast()
  const itemsRef = useRef(items)
  const processingRef = useRef(false)
  const jobResolversRef = useRef(new Map<string, (done: boolean) => void>())

  itemsRef.current = items

  const pump = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true
    try {
      while (true) {
        const next = itemsRef.current.find((i) => i.status === "pending")
        if (!next) break

        setItems((prev) =>
          prev.map((i) => (i.id === next.id ? { ...i, status: "running", percent: 0 } : i)),
        )

        let jobId: string
        try {
          jobId = await optimizeVideo(next.options)
        } catch (e) {
          error({ title: sk.toast.exportFailed, description: String(e) })
          setItems((prev) =>
            prev.map((i) =>
              i.id === next.id ? { ...i, status: "error", error: String(e), percent: 0 } : i,
            ),
          )
          continue
        }

        setItems((prev) => prev.map((i) => (i.id === next.id ? { ...i, jobId } : i)))

        await new Promise<void>((resolve) => {
          jobResolversRef.current.set(jobId, () => resolve())
        })
      }
    } finally {
      processingRef.current = false
    }
  }, [error])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    onOptimizeProgress((p) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.jobId !== p.job_id) return item
          if (!p.done) return { ...item, percent: Math.max(0, p.percent) }
          const resolver = jobResolversRef.current.get(p.job_id)
          resolver?.(true)
          jobResolversRef.current.delete(p.job_id)
          if (p.cancelled) {
            info({ title: sk.toast.exportCancelled, description: item.label })
            return { ...item, status: "cancelled", percent: 0 }
          }
          if (p.error) {
            error({ title: sk.toast.exportFailed, description: `${item.label}: ${p.error}` })
            return { ...item, status: "error", error: p.error, percent: 0 }
          }
          success({ title: sk.toast.exportDone, description: item.label })
          return {
            ...item,
            status: "done",
            percent: 100,
            outputPath: p.output_path ?? undefined,
            outputSize: p.output_size_bytes ?? undefined,
          }
        }),
      )
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [success, error, info])

  useEffect(() => {
    if (items.some((i) => i.status === "pending")) void pump()
  }, [items, pump])

  const enqueue = useCallback((jobs: EnqueueJob | EnqueueJob[]) => {
    const list = Array.isArray(jobs) ? jobs : [jobs]
    info({
      title: sk.toast.exportQueued(list.length),
      description: sk.toast.exportQueuedBody,
    })
    setItems((prev) => [
      ...prev,
      ...list.map((job) => ({
        id: newId(),
        label: job.label,
        options: job.options,
        status: "pending" as const,
        percent: 0,
      })),
    ])
  }, [info])

  const cancelItem = useCallback((id: string) => {
    const item = itemsRef.current.find((i) => i.id === id)
    if (!item) return
    if (item.status === "running" && item.jobId) {
      cancelOptimize(item.jobId).catch(() => {})
    }
    setItems((prev) =>
      prev.map((i) => (i.id === id && i.status !== "done" ? { ...i, status: "cancelled" } : i)),
    )
  }, [])

  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter((i) => i.status === "pending" || i.status === "running"))
  }, [])

  const activeCount = items.filter((i) => i.status === "pending" || i.status === "running").length

  return (
    <ExportQueueContext.Provider value={{ items, activeCount, enqueue, cancelItem, clearFinished }}>
      {children}
    </ExportQueueContext.Provider>
  )
}

export function useExportQueue(): ExportQueueContextValue {
  const ctx = useContext(ExportQueueContext)
  if (!ctx) throw new Error("useExportQueue must be used within ExportQueueProvider")
  return ctx
}
