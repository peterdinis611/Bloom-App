import { useState } from "react"
import {
  BookmarkPlus,
  Clapperboard,
  FileVideo,
  FlipHorizontal2,
  FlipVertical2,
  Gauge,
  MousePointerClick,
  RotateCcw,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  Wand2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useMessages } from "@/lib/i18n/I18nProvider"
import { formatBytes, formatDurationSecs } from "@/hooks/useBloomBackend"
import type { VideoAnalyze, VideoInfo } from "@/types"

export interface EditorChapter {
  id: string
  t: number
  label: string
}

export type RotateDeg = 0 | 90 | 180 | 270

interface EditorStudioBayProps {
  title: string
  info: VideoInfo | null
  clipDuration: number
  playhead: number
  chapters: EditorChapter[]
  onAddChapter: (label: string) => void
  onSeekChapter: (t: number) => void
  onRemoveChapter: (id: string) => void
  clickCount: number
  spotlightPreview: boolean
  onToggleSpotlightPreview: () => void
  onApplySpotlight: () => void
  spotlightBusy: boolean
  denoise: boolean
  normalizeAudio: boolean
  removeAudio: boolean
  useHevc: boolean
  flipH: boolean
  flipV: boolean
  rotate: RotateDeg
  fadeIn: number
  fadeOut: number
  volume: number
  onToggleDenoise: () => void
  onToggleNormalize: () => void
  onToggleRemoveAudio: () => void
  onToggleHevc: () => void
  onToggleFlipH: () => void
  onToggleFlipV: () => void
  onRotate: (deg: RotateDeg) => void
  onFadeIn: (secs: number) => void
  onFadeOut: (secs: number) => void
  onVolume: (v: number) => void
  analysis: VideoAnalyze | null
  onApplySuggestion?: () => void
  className?: string
}

const ROTATES: RotateDeg[] = [0, 90, 180, 270]
const FADE_OPTS = [0, 0.3, 0.6, 1, 1.5]
const VOLUME_OPTS = [
  { v: 0.5, label: "0.5×" },
  { v: 1, label: "1×" },
  { v: 1.5, label: "1.5×" },
  { v: 2, label: "2×" },
]

export function EditorStudioBay({
  title,
  info,
  clipDuration,
  playhead,
  chapters,
  onAddChapter,
  onSeekChapter,
  onRemoveChapter,
  clickCount,
  spotlightPreview,
  onToggleSpotlightPreview,
  onApplySpotlight,
  spotlightBusy,
  denoise,
  normalizeAudio,
  removeAudio,
  useHevc,
  flipH,
  flipV,
  rotate,
  fadeIn,
  fadeOut,
  volume,
  onToggleDenoise,
  onToggleNormalize,
  onToggleRemoveAudio,
  onToggleHevc,
  onToggleFlipH,
  onToggleFlipV,
  onRotate,
  onFadeIn,
  onFadeOut,
  onVolume,
  analysis,
  onApplySuggestion,
  className,
}: EditorStudioBayProps) {
  const sk = useMessages()
  const [draft, setDraft] = useState("")

  const commitChapter = () => {
    const label = draft.trim() || sk.editor.studio.chapterDefault(chapters.length + 1)
    onAddChapter(label)
    setDraft("")
  }

  return (
    <aside
      className={cn(
        "editor-studio flex min-h-0 w-full flex-col overflow-hidden border-border/50 bg-[var(--surface)] lg:w-[min(100%,22rem)] lg:border-l",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/12">
          <Clapperboard className="size-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/80">
            {sk.editor.studio.eyebrow}
          </p>
          <p className="truncate text-[13px] font-semibold text-foreground">{sk.editor.studio.title}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <section className="rounded-xl border border-border/40 bg-background/40 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
            <FileVideo className="size-3" />
            {sk.editor.studio.clip}
          </div>
          <p className="truncate text-[13px] font-semibold text-foreground">{title}</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
            <span>{info ? `${info.width}×${info.height}` : "—"}</span>
            <span className="text-right">{info?.fps ? `${info.fps.toFixed(0)} fps` : "—"}</span>
            <span>{formatDurationSecs(clipDuration)}</span>
            <span className="text-right">{info ? formatBytes(info.size_bytes) : "—"}</span>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {sk.editor.studio.playhead}:{" "}
            <span className="font-mono text-foreground">{formatDurationSecs(playhead)}</span>
          </p>
        </section>

        <section className="rounded-xl border border-border/40 bg-background/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
              <BookmarkPlus className="size-3" />
              {sk.editor.studio.chapters}
            </div>
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
              {chapters.length}
            </span>
          </div>
          <p className="mb-2 text-[11px] leading-snug text-muted-foreground">{sk.editor.studio.chaptersHint}</p>
          <div className="flex gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitChapter()
              }}
              placeholder={sk.editor.studio.chapterPlaceholder}
              className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-2.5 py-2 text-[12px]"
            />
            <button
              type="button"
              onClick={commitChapter}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-2 text-[11px] font-bold text-primary-foreground hover:bg-accent"
            >
              <BookmarkPlus className="size-3.5" />
              {sk.editor.studio.addChapter}
            </button>
          </div>
          {chapters.length === 0 ? (
            <p className="mt-3 text-[11px] italic text-muted-foreground/80">{sk.editor.studio.noChapters}</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {chapters.map((ch) => (
                <li key={ch.id} className="group flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSeekChapter(ch.t)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary"
                  >
                    <span className="font-mono text-[10px] tabular-nums text-primary">
                      {formatDurationSecs(ch.t)}
                    </span>
                    <span className="truncate text-[12px] font-medium text-foreground">{ch.label}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveChapter(ch.id)}
                    className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-fg)] group-hover:opacity-100"
                    aria-label={sk.editor.studio.removeChapter}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {clickCount > 0 && (
          <section className="rounded-xl border border-primary/25 bg-primary/5 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              <MousePointerClick className="size-3" />
              {sk.ux.editor.spotlightTitle}
            </div>
            <p className="mb-2 text-[11px] text-muted-foreground">{sk.ux.editor.spotlightHint(clickCount)}</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={onToggleSpotlightPreview}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                  spotlightPreview
                    ? "border-primary/40 bg-primary/20 text-primary"
                    : "border-border/60 bg-background text-foreground hover:bg-secondary",
                )}
              >
                {spotlightPreview ? sk.ux.editor.previewOn : sk.ux.editor.previewSpotlight}
              </button>
              <button
                type="button"
                disabled={spotlightBusy}
                onClick={onApplySpotlight}
                className="rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground hover:bg-accent disabled:opacity-50"
              >
                {spotlightBusy ? sk.ux.editor.applying : sk.ux.editor.applySpotlight}
              </button>
            </div>
          </section>
        )}

        {/* Transform */}
        <section className="rounded-xl border border-border/40 bg-background/40 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
            <RotateCcw className="size-3" />
            {sk.editor.studio.transform}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={onToggleFlipH}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-[11px] font-semibold transition-colors",
                flipH
                  ? "border-primary/40 bg-primary/12 text-foreground"
                  : "border-border/50 bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              <FlipHorizontal2 className={cn("size-3.5", flipH && "text-primary")} />
              {sk.editor.transform.flipH}
            </button>
            <button
              type="button"
              onClick={onToggleFlipV}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-[11px] font-semibold transition-colors",
                flipV
                  ? "border-primary/40 bg-primary/12 text-foreground"
                  : "border-border/50 bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              <FlipVertical2 className={cn("size-3.5", flipV && "text-primary")} />
              {sk.editor.transform.flipV}
            </button>
          </div>
          <p className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {sk.editor.transform.rotate}
          </p>
          <div className="flex flex-wrap gap-1">
            {ROTATES.map((deg) => (
              <button
                key={deg}
                type="button"
                onClick={() => onRotate(deg)}
                className={cn(
                  "min-w-[2.75rem] rounded-md px-2 py-1.5 text-[11px] font-semibold tabular-nums transition-colors",
                  rotate === deg
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {deg}°
              </button>
            ))}
          </div>
        </section>

        {/* Fade + volume */}
        <section className="rounded-xl border border-border/40 bg-background/40 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
            <Volume2 className="size-3" />
            {sk.editor.studio.audioMotion}
          </div>
          <p className="mb-1.5 text-[10px] font-semibold text-muted-foreground">{sk.editor.transform.fadeIn}</p>
          <div className="mb-2.5 flex flex-wrap gap-1">
            {FADE_OPTS.map((s) => (
              <button
                key={`in-${s}`}
                type="button"
                onClick={() => onFadeIn(s)}
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] font-semibold tabular-nums transition-colors",
                  Math.abs(fadeIn - s) < 0.01
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {s === 0 ? sk.editor.transform.off : `${s}s`}
              </button>
            ))}
          </div>
          <p className="mb-1.5 text-[10px] font-semibold text-muted-foreground">{sk.editor.transform.fadeOut}</p>
          <div className="mb-2.5 flex flex-wrap gap-1">
            {FADE_OPTS.map((s) => (
              <button
                key={`out-${s}`}
                type="button"
                onClick={() => onFadeOut(s)}
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] font-semibold tabular-nums transition-colors",
                  Math.abs(fadeOut - s) < 0.01
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {s === 0 ? sk.editor.transform.off : `${s}s`}
              </button>
            ))}
          </div>
          <p className="mb-1.5 text-[10px] font-semibold text-muted-foreground">{sk.editor.transform.volume}</p>
          <div className="flex flex-wrap gap-1">
            {VOLUME_OPTS.map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => onVolume(o.v)}
                disabled={removeAudio}
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] font-semibold tabular-nums transition-colors disabled:opacity-40",
                  Math.abs(volume - o.v) < 0.01
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border/40 bg-background/40 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
            <Wand2 className="size-3" />
            {sk.editor.studio.enhance}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                [denoise, onToggleDenoise, sk.editor.enhance.denoise, Sparkles],
                [normalizeAudio, onToggleNormalize, sk.editor.enhance.normalizeAudio, Volume2],
                [removeAudio, onToggleRemoveAudio, sk.editor.enhance.removeAudio, VolumeX],
                [useHevc, onToggleHevc, sk.editor.enhance.useHevc, Gauge],
              ] as const
            ).map(([on, toggle, label, Icon]) => (
              <button
                key={label}
                type="button"
                onClick={toggle}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors",
                  on
                    ? "border-primary/40 bg-primary/12 text-foreground"
                    : "border-border/50 bg-background text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <Icon className={cn("size-3.5", on && "text-primary")} />
                <span className="text-[10px] font-semibold leading-tight">{label}</span>
              </button>
            ))}
          </div>
          {analysis && onApplySuggestion && (
            <button
              type="button"
              onClick={onApplySuggestion}
              className="mt-2 w-full rounded-lg border border-border/60 bg-secondary px-2.5 py-2 text-[11px] font-semibold hover:bg-secondary/80"
            >
              {sk.editor.applySuggestion}
            </button>
          )}
        </section>
      </div>
    </aside>
  )
}
