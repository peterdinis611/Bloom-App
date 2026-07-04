import { Trash2 } from "lucide-react"

interface ConfirmDeleteAllProps {
  count: number
  sizeLabel: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** Strong confirmation before wiping the entire recordings library. */
export function ConfirmDeleteAll({ count, sizeLabel, busy, onCancel, onConfirm }: ConfirmDeleteAllProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6 fade-up" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex size-11 items-center justify-center rounded-xl bg-red-500/15">
          <Trash2 className="size-5 text-red-400" />
        </div>
        <h3 className="mt-3 text-base font-bold text-foreground">Delete all recordings?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          This will permanently remove{" "}
          <span className="font-semibold text-foreground/80">
            {count} recording{count === 1 ? "" : "s"}
          </span>
          {" "}({sizeLabel}) from disk. This can&apos;t be undone.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-border/60 bg-[var(--surface)] py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete all"}
          </button>
        </div>
      </div>
    </div>
  )
}
