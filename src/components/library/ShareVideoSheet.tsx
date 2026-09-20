import { useState, type ComponentType } from "react"
import {
  Share2, Copy, ClipboardCopy, FolderOpen, ExternalLink, Download, Loader2,
} from "lucide-react"
import { save } from "@tauri-apps/plugin-dialog"
import type { RecordingEntry } from "@/types"
import {
  shareRecording,
  copyText,
  copyFile,
  copyFileTo,
  revealInFinder,
  openWithSystemApp,
  formatBytes,
  formatDurationSecs,
} from "@/hooks/useBloomBackend"
import { useToast } from "@/hooks/useToast"
import { sk } from "@/lib/i18n/sk"
import { localizeError } from "@/lib/i18n/localizeError"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface ShareVideoSheetProps {
  entry: RecordingEntry | null
  open: boolean
  onClose: () => void
}

function fileNameFromPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/")
  return parts[parts.length - 1] || "video.mp4"
}

function extFromPath(path: string): string {
  const name = fileNameFromPath(path)
  const i = name.lastIndexOf(".")
  return i >= 0 ? name.slice(i + 1) : "mp4"
}

export function ShareVideoSheet({ entry, open, onClose }: ShareVideoSheetProps) {
  const { success: toastSuccess, error: toastError } = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  if (!entry) return null
  const meta = entry.meta
  const fileName = fileNameFromPath(entry.path)

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id)
    try {
      await fn()
    } catch (e) {
      toastError({ title: sk.share.failed, description: localizeError(e) })
    } finally {
      setBusy(null)
    }
  }

  const handleNative = () =>
    run("native", async () => {
      const result = await shareRecording(meta.id)
      const title = sk.library.shareSuccess[result.mode] ?? sk.library.shareOpened
      toastSuccess({ title })
      onClose()
    })

  const handleCopyFile = () =>
    run("file", async () => {
      await copyFile(entry.path)
      toastSuccess({ title: sk.toast.fileCopied })
      onClose()
    })

  const handleCopyPath = () =>
    run("path", async () => {
      await copyText(entry.path)
      toastSuccess({ title: sk.toast.pathCopied })
      onClose()
    })

  const handleSaveCopy = () =>
    run("save", async () => {
      const dest = await save({
        defaultPath: fileName,
        title: sk.share.saveCopy,
        filters: [{
          name: "Video",
          extensions: [
            extFromPath(entry.path),
            "mp4", "m4v", "mov", "mkv", "avi", "mpeg", "mpg", "ts", "flv", "3gp", "ogv", "webm",
          ],
        }],
      })
      if (!dest) return
      await copyFileTo(entry.path, dest)
      toastSuccess({ title: sk.share.savedCopy, description: dest })
      onClose()
    })

  const handleReveal = () =>
    run("reveal", async () => {
      await revealInFinder(entry.path)
      toastSuccess({ title: sk.share.revealed })
      onClose()
    })

  const handleOpen = () =>
    run("open", async () => {
      await openWithSystemApp(entry.path)
      onClose()
    })

  const actions: {
    id: string
    label: string
    hint: string
    icon: ComponentType<{ className?: string }>
    onClick: () => void
    primary?: boolean
  }[] = [
    {
      id: "native",
      label: sk.share.native,
      hint: sk.share.nativeHint,
      icon: Share2,
      onClick: () => { void handleNative() },
      primary: true,
    },
    {
      id: "file",
      label: sk.share.copyFile,
      hint: sk.share.copyFileHint,
      icon: ClipboardCopy,
      onClick: () => { void handleCopyFile() },
    },
    {
      id: "path",
      label: sk.share.copyPath,
      hint: sk.share.copyPathHint,
      icon: Copy,
      onClick: () => { void handleCopyPath() },
    },
    {
      id: "save",
      label: sk.share.saveCopy,
      hint: sk.share.saveCopyHint,
      icon: Download,
      onClick: () => { void handleSaveCopy() },
    },
    {
      id: "reveal",
      label: sk.share.reveal,
      hint: sk.share.revealHint,
      icon: FolderOpen,
      onClick: () => { void handleReveal() },
    },
    {
      id: "open",
      label: sk.share.openSystem,
      hint: sk.share.openSystemHint,
      icon: ExternalLink,
      onClick: () => { void handleOpen() },
    },
  ]

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="z-[60] max-w-md gap-0 overflow-hidden p-0">
        <div className="share-sheet-hero border-b border-border/60 px-5 pb-4 pt-5">
          <DialogHeader className="space-y-1 text-left">
            <p className="page-eyebrow !mb-0">{sk.share.eyebrow}</p>
            <DialogTitle className="font-display text-xl font-bold tracking-tight">
              {sk.share.title}
            </DialogTitle>
            <DialogDescription className="text-[12.5px] text-muted-foreground">
              {meta.title}
              <span className="mx-1.5 text-muted-foreground/40">·</span>
              {formatDurationSecs(meta.duration_secs)}
              <span className="mx-1.5 text-muted-foreground/40">·</span>
              {formatBytes(meta.file_size_bytes)}
            </DialogDescription>
          </DialogHeader>
          <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground/70">{fileName}</p>
        </div>

        <div className="flex flex-col gap-1 p-3">
          {actions.map((a) => {
            const Icon = a.icon
            const isBusy = busy === a.id
            return (
              <button
                key={a.id}
                type="button"
                disabled={busy !== null}
                onClick={a.onClick}
                className={cn(
                  "flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-50",
                  a.primary
                    ? "bg-primary/12 text-foreground hover:bg-primary/18"
                    : "hover:bg-secondary",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
                    a.primary ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">{a.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {a.hint}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
