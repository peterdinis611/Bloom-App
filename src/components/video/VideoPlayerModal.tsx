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

/** Modal s overlay ovládaním — viac miesta pre video, akcie v hlavičke. */
export function VideoPlayerModal({ entry, open, onClose }: VideoPlayerModalProps) {
  const meta = entry.meta

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex h-[min(94vh,900px)] w-[min(98vw,1000px)] max-w-none flex-col gap-0 overflow-hidden border-white/10 bg-black p-0 [&>button]:text-white/60 [&>button]:hover:text-white">
        <div className="absolute inset-x-0 top-0 z-20 flex shrink-0 items-center justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 py-3 pr-12">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-white">{meta.title}</p>
            <p className="text-[11px] text-white/45">
              {formatDurationSecs(meta.duration_secs)} · {formatBytes(meta.file_size_bytes)} · {meta.quality}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => openWithSystemApp(entry.path).catch(() => {})}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ExternalLink className="size-3.5" />
              <span className="hidden sm:inline">{sk.video.openInSystem}</span>
            </button>
            <button
              type="button"
              onClick={() => revealInFinder(entry.path).catch(() => {})}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white"
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
            controlsLayout="overlay"
            autoHideControls
            showSpeedControl
            showAdvancedOptions
            hideFileActions
            className="h-full rounded-none"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
