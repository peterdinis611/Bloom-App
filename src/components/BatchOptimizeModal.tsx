import { useEffect, useRef } from "react"
import { X, Sparkles } from "lucide-react"
import { sk } from "@/lib/i18n/sk"
import type { OptimizePreset, RecordingEntry } from "@/types"
import { useExportQueue } from "@/hooks/useExportQueue"

interface BatchOptimizeModalProps {
  entries: RecordingEntry[]
  preset?: OptimizePreset
  onClose: () => void
  onComplete: () => void
}

/** Enqueues batch jobs and closes — progress lives in the sidebar queue. */
export function BatchOptimizeModal({ entries, preset = "medium", onClose, onComplete }: BatchOptimizeModalProps) {
  const { enqueue } = useExportQueue()
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    enqueue(
      entries.map((entry) => ({
        label: entry.meta.title,
        options: {
          input_path: entry.path,
          preset,
          resolution: "720p",
          format: "mp4",
          add_to_library: true,
        },
      })),
    )
    onComplete()
    onClose()
  }, [entries, preset, enqueue, onComplete, onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-5 fade-up">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15">
            <Sparkles className="size-5 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-foreground">{sk.batch.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {sk.batch.addedToQueue(entries.length)}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
