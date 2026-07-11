import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { sk } from "@/lib/i18n/sk"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ConfirmDeleteAllProps {
  count: number
  sizeLabel: string
  busy?: boolean
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** Strong confirmation before wiping the entire recordings library. */
export function ConfirmDeleteAll({ count, sizeLabel, busy, open, onCancel, onConfirm }: ConfirmDeleteAllProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="[&>button]:hidden">
        <DialogHeader>
          <div className="flex size-11 items-center justify-center rounded-xl bg-red-500/15">
            <Trash2 className="size-5 text-red-400" />
          </div>
          <DialogTitle className="mt-3">{sk.library.deleteAllTitle}</DialogTitle>
          <DialogDescription>
            {sk.library.deleteAllBody(count, sizeLabel)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>
            {sk.library.cancel}
          </Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm} disabled={busy}>
            {busy ? sk.library.deleting : sk.settings.deleteAllBtn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
