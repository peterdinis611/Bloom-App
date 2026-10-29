import { FileWarning, Loader2, RotateCcw, Trash2 } from "lucide-react"
import type { IncompleteSession } from "@/types"
import { formatBytes } from "@/hooks/useBloomBackend"
import { Button } from "@/components/ui/button"
import { useMessages } from "@/lib/i18n/I18nProvider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface IncompleteSessionsDialogProps {
  open: boolean
  sessions: IncompleteSession[]
  /** Filename currently being recovered / discarded. */
  busyFilename: string | null
  onRecover: (session: IncompleteSession) => void
  onDiscard: (session: IncompleteSession) => void
  onDismiss: () => void
}

/** Launch dialog offering to recover recordings left behind by a crash. */
export function IncompleteSessionsDialog({
  open,
  sessions,
  busyFilename,
  onRecover,
  onDiscard,
  onDismiss,
}: IncompleteSessionsDialogProps) {
  const sk = useMessages()
  const busy = busyFilename !== null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onDismiss()}>
      <DialogContent className="z-[150] max-w-md [&>button]:hidden">
        <DialogHeader>
          <div className="flex size-11 items-center justify-center rounded-xl tone-soft-warning border">
            <FileWarning className="size-5" />
          </div>
          <DialogTitle className="mt-3">{sk.ux.incomplete.title}</DialogTitle>
          <DialogDescription>{sk.ux.incomplete.body(sessions.length)}</DialogDescription>
        </DialogHeader>

        <ul className="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
          {sessions.map((s) => {
            const rowBusy = busyFilename === s.filename
            return (
              <li
                key={s.filename}
                className="flex items-center gap-2 rounded-xl border border-border/50 bg-[var(--surface)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[12px] font-semibold text-foreground">{s.filename}</p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">{formatBytes(s.size_bytes)}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onRecover(s)}
                  className="text-[11px] font-bold"
                >
                  {rowBusy ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                  {sk.ux.incomplete.recover}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onDiscard(s)}
                  className="border tone-soft-error text-[11px] font-bold"
                >
                  <Trash2 className="size-3" />
                  {sk.ux.incomplete.discard}
                </Button>
              </li>
            )
          })}
        </ul>

        <DialogFooter className="mt-2">
          <Button variant="outline" className="flex-1" onClick={onDismiss} disabled={busy}>
            {sk.ux.incomplete.dismiss}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
