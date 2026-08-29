import { Check, CircleAlert, LoaderCircle, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { sk } from "@/lib/i18n/sk"
import { useExportQueue } from "@/hooks/useExportQueue"

export function ExportQueuePanel() {
  const { items, activeCount, cancelItem, clearFinished } = useExportQueue()
  const visible = items.length > 0

  if (!visible) return null

  const finished = items.some((i) => i.status === "done" || i.status === "error" || i.status === "cancelled")

  return (
    <div className="mx-2.5 mb-2 rounded-[10px] border border-border/50 bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-2.5 py-2">
        <p className="text-[11px] font-bold text-foreground">
          {sk.queue.title}
          {activeCount > 0 && (
            <span className="ml-1.5 font-mono text-accent">{activeCount}</span>
          )}
        </p>
        {finished && (
          <button
            type="button"
            onClick={clearFinished}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title={sk.queue.clearDone}
          >
            <Trash2 className="size-3" />
          </button>
        )}
      </div>
      <ul className="max-h-36 space-y-0.5 overflow-y-auto p-1.5">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              {item.status === "running" && <LoaderCircle className="size-3 shrink-0 animate-spin text-accent" />}
              {item.status === "done" && <Check className="size-3 shrink-0 tone-fg-success" />}
              {item.status === "error" && <CircleAlert className="size-3 shrink-0 tone-fg-error" />}
              {item.status === "pending" && <span className="size-3 shrink-0 rounded-full bg-secondary" />}
              {item.status === "cancelled" && <X className="size-3 shrink-0 text-muted-foreground" />}
              <span className={cn("min-w-0 flex-1 truncate text-[10px]", item.status === "running" && "font-semibold text-foreground")}>
                {item.label}
              </span>
              {(item.status === "pending" || item.status === "running") && (
                <button
                  type="button"
                  onClick={() => cancelItem(item.id)}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={sk.queue.cancel}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
            {item.status === "running" && (
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${Math.min(100, item.percent)}%` }}
                />
              </div>
            )}
            {item.status === "error" && item.error && (
              <p className="mt-0.5 truncate text-[9px] tone-fg-error">{item.error}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
