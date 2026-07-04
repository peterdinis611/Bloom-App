import { useCallback, useEffect, useRef, useState } from "react"
import { X, Sparkles, LoaderCircle, Check, CircleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import type { OptimizePreset, RecordingEntry } from "@/types"
import { optimizeVideo, onOptimizeProgress, formatBytes } from "@/hooks/useBloomBackend"

interface BatchOptimizeModalProps {
  entries: RecordingEntry[]
  preset?: OptimizePreset
  onClose: () => void
  onComplete: () => void
}

type ItemState = "pending" | "running" | "done" | "error"

export function BatchOptimizeModal({ entries, preset = "medium", onClose, onComplete }: BatchOptimizeModalProps) {
  const [index, setIndex] = useState(0)
  const [percent, setPercent] = useState(0)
  const [states, setStates] = useState<ItemState[]>(() => entries.map(() => "pending"))
  const [savedBytes, setSavedBytes] = useState(0)
  const [done, setDone] = useState(false)
  const jobIdRef = useRef<string | null>(null)
  const indexRef = useRef(0)
  const startedRef = useRef(false)

  const runNext = useCallback(async (i: number) => {
    if (i >= entries.length) {
      setDone(true)
      return
    }
    indexRef.current = i
    setIndex(i)
    setStates((s) => s.map((st, idx) => (idx === i ? "running" : st)))
    setPercent(0)
    try {
      const id = await optimizeVideo({
        input_path: entries[i].path,
        preset,
        resolution: "720p",
        format: "mp4",
        add_to_library: true,
      })
      jobIdRef.current = id
    } catch {
      setStates((s) => s.map((st, idx) => (idx === i ? "error" : st)))
      runNext(i + 1)
    }
  }, [entries, preset])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    onOptimizeProgress((p) => {
      if (p.job_id !== jobIdRef.current) return
      if (!p.done) { setPercent(p.percent); return }
      const i = indexRef.current
      if (p.error) {
        setStates((s) => s.map((st, idx) => (idx === i ? "error" : st)))
      } else {
        setSavedBytes((b) => b + (p.output_size_bytes ?? 0))
        setStates((s) => s.map((st, idx) => (idx === i ? "done" : st)))
      }
      jobIdRef.current = null
      runNext(i + 1)
    }).then((fn) => { unlisten = fn })

    if (!startedRef.current) {
      startedRef.current = true
      runNext(0)
    }
    return () => { unlisten?.() }
  }, [runNext])

  const finished = states.filter((s) => s === "done" || s === "error").length

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-5 fade-up">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <Sparkles className="size-5 text-accent" />
          <div className="flex-1">
            <h3 className="text-sm font-bold">Batch optimise</h3>
            <p className="text-[11px] text-muted-foreground">{finished}/{entries.length} clips</p>
          </div>
          {done && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
          )}
        </div>

        <div className="flex flex-col gap-3 p-4">
          {!done && (
            <div className="flex items-center gap-2 text-sm">
              <LoaderCircle className="size-4 animate-spin text-accent" />
              <span className="truncate">{entries[index]?.meta.title ?? "…"}</span>
              <span className="ml-auto font-mono text-xs tabular-nums">{percent.toFixed(0)}%</span>
            </div>
          )}

          <div className="max-h-40 overflow-y-auto rounded-xl border border-border/50 bg-[var(--surface)] p-2">
            {entries.map((e, i) => (
              <div key={e.meta.id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                {states[i] === "done" && <Check className="size-3.5 text-emerald-400" />}
                {states[i] === "error" && <CircleAlert className="size-3.5 text-red-400" />}
                {states[i] === "running" && <LoaderCircle className="size-3.5 animate-spin text-accent" />}
                {states[i] === "pending" && <span className="size-3.5 rounded-full bg-secondary" />}
                <span className={cn("truncate", states[i] === "running" && "font-bold text-foreground")}>{e.meta.title}</span>
              </div>
            ))}
          </div>

          {done && (
            <div className="text-center">
              <p className="text-sm font-bold text-emerald-300">Batch complete</p>
              <p className="mt-1 text-xs text-muted-foreground">Output total ~{formatBytes(savedBytes)}</p>
              <button
                onClick={() => { onComplete(); onClose() }}
                className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
