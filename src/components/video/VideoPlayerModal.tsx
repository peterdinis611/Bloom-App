import { ExternalLink, FolderOpen } from "lucide-react"
import type { RecordingEntry } from "@/types"
import {
  formatBytes,
  formatDurationSecs,
  openWithSystemApp,
  revealInFinder,
} from "@/hooks/useBloomBackend"
import { sk } from "@/lib/i18n/sk"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { BloomVideoPlayer } from "@/components/video/BloomVideoPlayer"

interface VideoPlayerModalProps {
  entry: RecordingEntry
  open: boolean
  onClose: () => void
}

/** Modal s docked ovládaním a rozšírenými možnosťami prehrávania. */
export function VideoPlayerModal({ entry, open, onClose }: VideoPlayerModalProps) {
  const meta = entry.meta

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex h-[min(94vh,880px)] w-[min(98vw,980px)] max-w-none flex-col gap-0 overflow-hidden border-white/10 bg-[#0a0a0a] p-0 [&>button]:text-white/60 [&>button]:hover:text-white">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-white">{meta.title}</p>
            <p className="text-[11px] text-white/45">
              {formatDurationSecs(meta.duration_secs)} · {formatBytes(meta.file_size_bytes)} · {meta.quality}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => openWithSystemApp(entry.path).catch(() => {})}
              className="mac-btn-ghost inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-white/70 hover:bg-white/10 hover:text-white"
            >
              <ExternalLink className="size-3.5" />
              <span className="hidden sm:inline">{sk.video.openInSystem}</span>
            </button>
            <button
              type="button"
              onClick={() => revealInFinder(entry.path).catch(() => {})}
              className="mac-btn-ghost inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-white/70 hover:bg-white/10 hover:text-white"
            >
              <FolderOpen className="size-3.5" />
              <span className="hidden sm:inline">{sk.video.openInFinder}</span>
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <BloomVideoPlayer
            path={entry.path}
            autoPlay
            controlsLayout="docked"
            showSpeedControl
            showAdvancedOptions
            onReveal={() => revealInFinder(entry.path).catch(() => {})}
            onOpenExternal={() => openWithSystemApp(entry.path).catch(() => {})}
            className="h-full rounded-none"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
