import { useCallback, useEffect, useState, type ReactNode } from "react"
import type { OptimizeOptions } from "@/types"
import {
  cancelExportQueueItem,
  clearExportQueueFinished,
  enqueueExports,
  listExportQueue,
  onExportFinished,
  onExportQueueChanged,
  onOptimizeProgress,
  retryExportQueueItem,
  type ExportQueueItemDto,
} from "@/hooks/useBloomBackend"
import { useToast } from "@/hooks/toastContext"
import { getMessagesSync } from "@/lib/i18n/messagesSync"
import { localizeError } from "@/lib/i18n/localizeError"
import { SHARE_EXPORT_EVENT } from "@/lib/shareExportEvent"
import {
  ExportQueueContext,
  type EnqueueJob,
  type ExportQueueItem,
  type QueueItemStatus,
} from "@/hooks/exportQueueContext"

function mapDto(
  dto: ExportQueueItemDto,
  prev?: ExportQueueItem,
): ExportQueueItem {
  const status = (dto.status as QueueItemStatus) || "pending"
  return {
    id: dto.id,
    label: dto.label,
    options:
      dto.options ??
      prev?.options ??
      ({ input_path: "", preset: "medium", resolution: "original", format: "mp4" } as OptimizeOptions),
    status,
    percent: dto.percent,
    error: dto.error ?? undefined,
    outputPath: dto.outputPath ?? undefined,
    jobId: dto.jobId ?? undefined,
    outputSize: dto.outputSize ?? prev?.outputSize,
  }
}

export function ExportQueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ExportQueueItem[]>([])
  const { success, error, info } = useToast()

  useEffect(() => {
    let cancelled = false
    listExportQueue()
      .then((list) => {
        if (!cancelled) setItems(list.map((d) => mapDto(d)))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    onExportQueueChanged((list) => {
      setItems((prev) => {
        const byId = new Map(prev.map((i) => [i.id, i]))
        return list.map((d) => mapDto(d, byId.get(d.id)))
      })
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    onOptimizeProgress((p) => {
      if (!p.job_id || !p.done) {
        setItems((prev) =>
          prev.map((item) =>
            item.jobId === p.job_id && !p.done
              ? { ...item, percent: Math.max(0, p.percent) }
              : item,
          ),
        )
        return
      }
      const sk = getMessagesSync()
      setItems((prev) =>
        prev.map((item) => {
          if (item.jobId !== p.job_id) return item
          if (p.cancelled) {
            info({ title: sk.toast.exportCancelled, description: item.label })
            return { ...item, status: "cancelled", percent: 0 }
          }
          if (p.error) {
            error({
              title: sk.toast.exportFailed,
              description: `${item.label}: ${localizeError(p.error)}`,
            })
            return {
              ...item,
              status: "error",
              error: localizeError(p.error),
              percent: 0,
            }
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
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [success, error, info])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    onExportFinished((p) => {
      if (!p.auto_share || !p.path) return
      void import("@/lib/appSettings").then(({ readStoredSettings }) =>
        readStoredSettings().then((s) => {
          if (s.integrations.preferNativeShare) return
          if (document.visibilityState !== "visible") return
          window.dispatchEvent(
            new CustomEvent(SHARE_EXPORT_EVENT, { detail: { path: p.path } }),
          )
        }),
      )
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [])

  const enqueue = useCallback(
    (jobs: EnqueueJob | EnqueueJob[]) => {
      const list = Array.isArray(jobs) ? jobs : [jobs]
      const sk = getMessagesSync()
      info({
        title: sk.toast.exportQueued(list.length),
        description: sk.toast.exportQueuedBody,
      })
      void enqueueExports(
        list.map((j) => ({
          label: j.label,
          options: j.options,
          speechRanges: j.speechRanges,
          preferredStem: j.preferredStem,
        })),
      )
        .then((added) => {
          setItems((prev) => {
            const byId = new Map(prev.map((i) => [i.id, i]))
            const mapped = added.map((d, i) =>
              mapDto(d, {
                id: d.id,
                label: list[i]?.label ?? d.label,
                options: list[i]?.options ?? ({} as OptimizeOptions),
                status: "pending",
                percent: 0,
              }),
            )
            for (const m of mapped) byId.set(m.id, m)
            return Array.from(byId.values())
          })
        })
        .catch((e) => {
          error({ title: sk.toast.exportFailed, description: localizeError(e) })
        })
    },
    [info, error],
  )

  const enqueueBatch = useCallback(
    async (jobs: EnqueueJob[]) => {
      if (jobs.length === 0) return
      enqueue(jobs)
    },
    [enqueue],
  )

  const cancelItem = useCallback((id: string) => {
    cancelExportQueueItem(id).catch(() => {})
    setItems((prev) =>
      prev.map((i) =>
        i.id === id && i.status !== "done" ? { ...i, status: "cancelled" } : i,
      ),
    )
  }, [])

  const clearFinished = useCallback(() => {
    clearExportQueueFinished().catch(() => {})
    setItems((prev) =>
      prev.filter((i) => i.status === "pending" || i.status === "running"),
    )
  }, [])

  const retryItem = useCallback(
    (id: string) => {
      const sk = getMessagesSync()
      void retryExportQueueItem(id)
        .then((dto) => {
          setItems((prev) => {
            const without = prev.filter((i) => i.id !== id)
            return [...without, mapDto(dto, prev.find((i) => i.id === id))]
          })
          info({ title: sk.toast.exportQueued(1), description: sk.toast.exportQueuedBody })
        })
        .catch((e) => {
          error({ title: sk.toast.exportFailed, description: localizeError(e) })
        })
    },
    [info, error],
  )

  const activeCount = items.filter(
    (i) => i.status === "pending" || i.status === "running",
  ).length

  return (
    <ExportQueueContext.Provider
      value={{ items, activeCount, enqueue, enqueueBatch, cancelItem, clearFinished, retryItem }}
    >
      {children}
    </ExportQueueContext.Provider>
  )
}
