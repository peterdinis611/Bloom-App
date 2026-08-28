import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDebouncedValue } from "@tanstack/react-pacer"
import { PACER } from "@/lib/pacer"
import {
  Film,
  Play,
  Trash2,
  Pencil,
  FolderOpen,
  X,
  Clock,
  HardDrive,
  RefreshCw,
  Search,
  Monitor,
  Camera,
  Layers,
  Mic,
  Volume2,
  Video,
  ScanSearch,
  Check,
  CircleAlert,
  Sparkles,
  Terminal,
  Copy,
  Star,
  Tag,
  Share2,
  CheckSquare,
  Square,
  Folder,
  Scissors,
  Download,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { FfmpegStatus, LibraryStats, RecordingEntry, ValidationResult } from "@/types"
import {
  listRecordings,
  getLibraryStats,
  deleteRecording,
  renameRecording,
  updateRecordingMeta,
  batchDeleteRecordings,
  deleteAllRecordings,
  shareRecording,
  revealInFinder,
  validateRecording,
  checkFfmpeg,
  installFfmpeg,
  getThumbnail,
  fileSrc,
  formatBytes,
  formatDurationSecs,
} from "@/hooks/useBloomBackend"
import { useExportQueue } from "@/hooks/useExportQueue"
import { VideoPlayerModal } from "@/components/video/VideoPlayerModal"
import { EditorModal } from "@/components/editor/EditorModal"
import { BatchOptimizeModal } from "@/components/BatchOptimizeModal"
import { ConfirmDeleteAll } from "@/components/library/ConfirmDeleteAll"
import { PageScrollArea } from "@/components/layout/PageScrollArea"
import { MacPageHeader } from "@/components/mac/MacUIKit"
import { MacSelect } from "@/components/mac/MacSelect"
import { sk } from "@/lib/i18n/sk"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/useToast"

// ── Helpers ────────────────────────────────────────────────────────────────
function relativeDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return sk.library.dates.unknown
  const now = Date.now()
  const diffMs = now - d.getTime()
  const day = 24 * 60 * 60 * 1000
  const days = Math.floor(diffMs / day)
  const time = d.toLocaleTimeString("sk-SK", { hour: "numeric", minute: "2-digit" })
  if (days <= 0 && new Date(now).getDate() === d.getDate()) return sk.library.dates.today(time)
  if (days <= 1) return sk.library.dates.yesterday(time)
  if (days < 7) return sk.library.dates.daysAgo(days)
  return d.toLocaleDateString("sk-SK", { month: "short", day: "numeric", year: "numeric" })
}

const SOURCE_META: Record<string, { icon: React.FC<{ className?: string }>; label: string; tint: string }> = {
  screen: { icon: Monitor, label: sk.library.sources.screen, tint: "text-accent bg-primary/12" },
  camera: { icon: Camera, label: sk.library.sources.camera, tint: "text-emerald-400 bg-emerald-500/12" },
  both: { icon: Layers, label: sk.library.sources.both, tint: "text-sky-400 bg-sky-500/12" },
}

// ── Empty library hero ───────────────────────────────────────────────────────
function EmptyLibrary({ onStartRecording, ffmpeg, onRecheckFfmpeg, onInstallFfmpeg, checkingFfmpeg, installingFfmpeg }: {
  onStartRecording?: () => void
  ffmpeg: FfmpegStatus | null
  onRecheckFfmpeg: () => void
  onInstallFfmpeg: () => void
  checkingFfmpeg: boolean
  installingFfmpeg: boolean
}) {
  const hints = [
    { icon: Monitor, label: sk.library.screenCapture, tint: "text-accent bg-primary/12 border-primary/20" },
    { icon: Camera, label: sk.library.webcam, tint: "text-emerald-400 bg-emerald-500/12 border-emerald-500/20" },
    { icon: Sparkles, label: sk.library.optimiseTrim, tint: "text-sky-400 bg-sky-500/12 border-sky-500/20" },
  ]

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 scale-150 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex size-20 items-center justify-center rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 to-[var(--surface)] shadow-xl shadow-primary/10">
          <Film className="size-9 text-accent/80" />
        </div>
      </div>

      <h2 className="text-lg font-black tracking-tight text-foreground">{sk.library.emptyTitle}</h2>
      <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-muted-foreground">
        {sk.library.emptyBody}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {hints.map((h) => (
          <span key={h.label} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold", h.tint)}>
            <h.icon className="size-3.5" /> {h.label}
          </span>
        ))}
      </div>

      <button
        onClick={onStartRecording}
        className="group mt-8 flex items-center gap-2.5 rounded-2xl bg-primary px-6 py-3.5 text-sm font-bold text-white shadow-xl shadow-primary/25 transition-all hover:bg-accent hover:shadow-primary/35 active:scale-[0.98]"
      >
        <Video className="size-4 transition-transform group-hover:scale-110" />
        {sk.library.startFirst}
      </button>

      {/* ffmpeg status – compact, not a big warning banner */}
      {ffmpeg && (
        <div className="mt-8 w-full max-w-sm">
          {ffmpeg.available ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-[11px] font-semibold text-emerald-300">
              <Check className="size-3.5" />
              {sk.library.ffmpeg.ready}
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 bg-[var(--surface)] px-3.5 py-3 text-left">
              <p className="text-[11px] font-bold text-muted-foreground">{sk.library.ffmpeg.optionalTitle}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground/70">
                {sk.library.ffmpeg.optionalBody}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-black/40 px-2 py-1 font-mono text-[10px] text-foreground/70">
                  {ffmpeg.install_hint.split(/:\s+/).pop()}
                </code>
                {ffmpeg.can_auto_install && (
                  <button
                    type="button"
                    onClick={() => void onInstallFfmpeg()}
                    disabled={installingFfmpeg || checkingFfmpeg}
                    className="flex shrink-0 items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/25 disabled:opacity-40"
                  >
                    <Download className={cn("size-3", installingFfmpeg && "animate-pulse")} />
                    {installingFfmpeg ? sk.library.ffmpeg.installing : sk.library.ffmpeg.install}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void onRecheckFfmpeg()}
                  disabled={checkingFfmpeg || installingFfmpeg}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                >
                  <RefreshCw className={cn("size-3", checkingFfmpeg && "animate-spin")} />
                  {sk.library.ffmpeg.recheck}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Stat pill ────────────────────────────────────────────────────────────────
function StatPill({ icon: Icon, label, value }: {
  icon: React.FC<{ className?: string }>; label: string; value: string
}) {
  return (
    <div className="bloom-card flex flex-1 items-center gap-2.5 px-3 py-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12">
        <Icon className="size-4 text-accent" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-foreground tabular-nums">{value}</p>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{label}</p>
      </div>
    </div>
  )
}

// ── Confirm delete dialog ──────────────────────────────────────────────────
function ConfirmDelete({ title, open, onCancel, onConfirm }: {
  title: string; open: boolean; onCancel: () => void; onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="[&>button]:hidden">
        <DialogHeader>
          <div className="flex size-11 items-center justify-center rounded-xl bg-red-500/15">
            <Trash2 className="size-5 text-red-400" />
          </div>
          <DialogTitle className="mt-3">{sk.library.deleteOneTitle}</DialogTitle>
          <DialogDescription>
            {sk.library.deleteOneBody(title)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>{sk.library.cancel}</Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm}>{sk.library.delete}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Recording card ─────────────────────────────────────────────────────────
function RecordingCard({ entry, onPlay, onDelete, onReveal, onRename, onValidate, onEdit, onToggleStar, onShare, validation, busy, ffmpegReady, batchMode, selected, onSelect, tagValue, onTagChange, onTagCommit, onFolderChange, showMetaInputs }: {
  entry: RecordingEntry
  onPlay: () => void
  onDelete: () => void
  onReveal: () => void
  onRename: (title: string) => void
  onValidate: () => void
  onEdit: () => void
  onToggleStar: () => void
  onShare: () => void
  validation?: ValidationResult
  busy: boolean
  ffmpegReady: boolean
  batchMode?: boolean
  selected?: boolean
  onSelect?: () => void
  tagValue?: string
  onTagChange?: (value: string) => void
  onTagCommit?: () => void
  onFolderChange?: (folder: string) => void
  showMetaInputs?: boolean
}) {
  const meta = entry.meta
  const starred = meta.starred ?? false
  const tags = meta.tags ?? []
  const folder = meta.folder ?? ""
  const src = SOURCE_META[meta.source] ?? SOURCE_META.screen
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(meta.title)
  const [thumb, setThumb] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  // Lazily fetch a thumbnail (backend only regenerates if missing).
  useEffect(() => {
    let alive = true
    if (ffmpegReady) {
      getThumbnail(meta.id)
        .then((p) => { if (alive) setThumb(fileSrc(p)) })
        .catch(() => {})
    }
    return () => { alive = false }
  }, [ffmpegReady, meta.id])

  const commit = () => {
    const next = draft.trim()
    setEditing(false)
    if (next && next !== meta.title) onRename(next)
    else setDraft(meta.title)
  }

  return (
    <div className={cn(
      "bloom-card group flex flex-col gap-3 p-3 transition-colors hover:border-border",
      selected ? "bloom-card-active ring-1 ring-primary/25" : "",
    )}>
      <div className="flex items-start gap-3">
        {batchMode && (
          <button
            onClick={onSelect}
            className="mt-1 shrink-0 text-muted-foreground hover:text-primary"
          >
            {selected ? <CheckSquare className="size-5 text-primary" /> : <Square className="size-5" />}
          </button>
        )}
        {/* Thumbnail */}
        <button
          onClick={onPlay}
          className="relative flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-secondary to-black/60"
        >
          {thumb ? (
            <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <src.icon className={cn("size-6 opacity-40", src.tint.split(" ")[0])} />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
            <div className="flex size-9 scale-90 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-lg transition-all group-hover:scale-100 group-hover:opacity-100">
              <Play className="size-4 translate-x-0.5 fill-black text-black" />
            </div>
          </div>
          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
            {formatDurationSecs(meta.duration_secs)}
          </span>
        </button>

        {/* Info */}
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit()
                if (e.key === "Escape") { setDraft(meta.title); setEditing(false) }
              }}
              className="w-full rounded-md border border-primary/40 bg-black/40 px-2 py-1 text-sm font-semibold text-foreground outline-none ring-1 ring-primary/20"
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setEditing(true)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" title={sk.library.renameHint}>
                <span className="truncate text-sm font-bold text-foreground">{meta.title}</span>
                <Pencil className="size-3 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60" />
              </button>
              <button
                type="button"
                onClick={onToggleStar}
                className="shrink-0 rounded-md p-1 hover:bg-secondary"
                title={starred ? sk.library.unstar : sk.library.star}
              >
                <Star className={cn("size-3.5", starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40 hover:text-amber-400")} />
              </button>
            </div>
          )}

          <p className="mt-0.5 text-[11px] text-muted-foreground">{relativeDate(meta.created_at)}</p>

          {(folder || tags.length > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {folder && (
                <span className="flex items-center gap-0.5 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  <Folder className="size-2.5" /> {folder}
                </span>
              )}
              {tags.map((t) => (
                <span key={t} className="flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  <Tag className="size-2.5" /> {t}
                </span>
              ))}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={cn("flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold", src.tint)}>
              <src.icon className="size-3" /> {src.label}
            </span>
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{meta.quality}</span>
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{formatBytes(meta.file_size_bytes)}</span>
            {meta.has_microphone && <Mic className="size-3 text-muted-foreground/60" />}
            {meta.has_system_audio && <Volume2 className="size-3 text-muted-foreground/60" />}
          </div>

          {validation && (
            <div className={cn(
              "mt-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold",
              validation.is_valid ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"
            )}>
              {validation.is_valid ? <Check className="size-3" /> : <CircleAlert className="size-3" />}
              {validation.is_valid ? sk.library.validation.ok : validation.error ?? sk.library.validation.invalid}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 border-t border-border/40 pt-2">
        <div className="flex flex-wrap gap-1">
          <ActionBtn icon={Play} label={sk.library.actions.play} onClick={onPlay} primary />
          {ffmpegReady && <ActionBtn icon={Scissors} label={sk.library.actions.edit} onClick={onEdit} accent />}
          <ActionBtn icon={ScanSearch} label={sk.library.actions.verify} onClick={onValidate} disabled={busy} />
          <ActionBtn icon={FolderOpen} label={sk.library.actions.reveal} onClick={onReveal} />
          <ActionBtn icon={Share2} label={sk.library.actions.share} onClick={onShare} />
          <ActionBtn icon={Trash2} label={sk.library.delete} onClick={onDelete} danger />
        </div>

        {showMetaInputs && !batchMode && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={tagValue ?? ""}
              onChange={(e) => onTagChange?.(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onTagCommit?.() }}
              placeholder={sk.library.addTag}
              className="min-h-[36px] min-w-[140px] flex-1 rounded-lg border border-border/50 bg-[var(--surface)] px-3 py-2 text-[12px] outline-none focus:border-primary/40"
            />
            <input
              defaultValue={folder}
              onBlur={(e) => onFolderChange?.(e.target.value.trim())}
              placeholder={sk.library.folder}
              className="min-h-[36px] w-32 rounded-lg border border-border/50 bg-[var(--surface)] px-3 py-2 text-[12px] outline-none focus:border-primary/40"
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ActionBtn({ icon: Icon, label, onClick, danger, accent, primary, disabled }: {
  icon: React.FC<{ className?: string }>; label: string; onClick: () => void; danger?: boolean; accent?: boolean; primary?: boolean; disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-40",
        danger
          ? "text-muted-foreground hover:bg-red-500/15 hover:text-red-400"
          : primary
            ? "bg-primary/15 text-primary hover:bg-primary/22"
          : accent
            ? "text-primary hover:bg-primary/15 hover:text-primary"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {label}
    </button>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
interface LibraryPageProps {
  onStartRecording?: () => void
  active?: boolean
}

export function LibraryPage({ onStartRecording, active = true }: LibraryPageProps) {
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast()
  const [entries, setEntries] = useState<RecordingEntry[]>([])
  const [stats, setStats] = useState<LibraryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [debouncedQuery, searchDebouncer] = useDebouncedValue(
    query,
    { wait: PACER.search },
    (state) => ({ isPending: state.isPending }),
  )
  const searchPending = searchDebouncer.state.isPending ?? false
  const [playing, setPlaying] = useState<RecordingEntry | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deleteAllBusy, setDeleteAllBusy] = useState(false)
  const [validations, setValidations] = useState<Record<string, ValidationResult>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [ffmpeg, setFfmpeg] = useState<FfmpegStatus | null>(null)
  const [checkingFfmpeg, setCheckingFfmpeg] = useState(false)
  const [installingFfmpeg, setInstallingFfmpeg] = useState(false)
  const [editing, setEditing] = useState<RecordingEntry | null>(null)
  const [batchOptimizing, setBatchOptimizing] = useState<RecordingEntry[] | null>(null)
  const [copied, setCopied] = useState(false)
  const [starredOnly, setStarredOnly] = useState(false)
  const [folderFilter, setFolderFilter] = useState<string>("")
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [tagDraft, setTagDraft] = useState<Record<string, string>>({})

  const recheckFfmpeg = useCallback(async (showToast = false) => {
    setCheckingFfmpeg(true)
    try {
      const status = await checkFfmpeg()
      setFfmpeg(status)
      if (showToast) {
        if (status.available) {
          toastSuccess({
            title: sk.library.ffmpeg.toastInstalled,
            description: status.version ?? sk.library.ffmpeg.toastInstalledBody,
          })
        } else {
          toastError({
            title: sk.library.ffmpeg.toastNotFound,
            description: sk.library.ffmpeg.toastNotFoundBody,
          })
        }
      }
    } catch (e) {
      if (showToast) {
        toastError({
          title: sk.library.ffmpeg.toastCheckFailed,
          description: String(e),
        })
      }
    } finally {
      setCheckingFfmpeg(false)
    }
  }, [toastSuccess, toastError])

  const runInstallFfmpeg = useCallback(async () => {
    setInstallingFfmpeg(true)
    toastInfo({
      title: sk.library.ffmpeg.toastInstalling,
      description: sk.library.ffmpeg.toastInstallingBody,
    })
    try {
      const result = await installFfmpeg()
      setFfmpeg(result.status)
      if (result.success) {
        toastSuccess({
          title: sk.library.ffmpeg.toastInstalled,
          description: result.message,
        })
      } else {
        toastError({
          title: sk.library.ffmpeg.toastInstallFailed,
          description: result.message,
        })
      }
    } catch (e) {
      toastError({
        title: sk.library.ffmpeg.toastInstallFailed,
        description: String(e),
      })
    } finally {
      setInstallingFfmpeg(false)
    }
  }, [toastSuccess, toastError, toastInfo])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [recs, st] = await Promise.all([listRecordings(), getLibraryStats()])
      setEntries(recs)
      setStats(st)
    } catch (e) {
      const msg = String(e)
      setError(msg)
      toastError({ title: sk.toast.loadFailed, description: msg })
    } finally {
      setLoading(false)
    }
  }, [toastError])

  const { activeCount } = useExportQueue()
  const prevQueueActive = useRef(0)

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (prevQueueActive.current > 0 && activeCount === 0) void load()
    prevQueueActive.current = activeCount
  }, [activeCount, load])
  useEffect(() => { recheckFfmpeg() }, [recheckFfmpeg])

  const copyInstall = useCallback(() => {
    const cmd = ffmpeg?.install_hint.split(/:\s+/).pop() ?? "brew install ffmpeg"
    navigator.clipboard?.writeText(cmd).then(() => {
      setCopied(true)
      toastSuccess({ title: sk.toast.copied, description: cmd })
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }, [ffmpeg, toastSuccess])

  const filtered = useMemo(() => {
    let list = entries
    if (starredOnly) list = list.filter((e) => e.meta.starred)
    if (folderFilter) list = list.filter((e) => (e.meta.folder ?? "") === folderFilter)
    const q = debouncedQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter((e) =>
      e.meta.title.toLowerCase().includes(q)
      || e.meta.source.includes(q)
      || (e.meta.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    )
  }, [entries, debouncedQuery, starredOnly, folderFilter])

  const folders = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries) {
      const f = e.meta.folder?.trim()
      if (f) set.add(f)
    }
    return [...set].sort()
  }, [entries])

  const handleRename = async (id: string, title: string) => {
    try {
      const meta = await renameRecording(id, title)
      setEntries((prev) => prev.map((e) => (e.meta.id === id ? { ...e, meta } : e)))
      toastSuccess({ title: sk.toast.renamed(title) })
    } catch (e) {
      const msg = String(e)
      setError(msg)
      toastError({ title: sk.toast.actionFailed, description: msg })
    }
  }

  const handleDelete = async (id: string) => {
    setConfirmId(null)
    try {
      await deleteRecording(id)
      setEntries((prev) => prev.filter((e) => e.meta.id !== id))
      const st = await getLibraryStats().catch(() => null)
      if (st) setStats(st)
      toastSuccess({ title: sk.toast.deleted })
    } catch (e) {
      const msg = String(e)
      setError(msg)
      toastError({ title: sk.toast.actionFailed, description: msg })
    }
  }

  const handleBatchDelete = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    try {
      await batchDeleteRecordings(ids)
      setEntries((prev) => prev.filter((e) => !selectedIds.has(e.meta.id)))
      setSelectedIds(new Set())
      setBatchMode(false)
      const st = await getLibraryStats().catch(() => null)
      if (st) setStats(st)
      toastSuccess({ title: sk.toast.batchDeleted(ids.length) })
    } catch (e) {
      const msg = String(e)
      setError(msg)
      toastError({ title: sk.toast.actionFailed, description: msg })
    }
  }

  const handleDeleteAll = async () => {
    const count = entries.length
    setDeleteAllBusy(true)
    try {
      await deleteAllRecordings()
      setEntries([])
      setStats({
        total_recordings: 0,
        total_size_bytes: 0,
        total_duration_secs: 0,
        oldest_created_at: null,
        newest_created_at: null,
      })
      setSelectedIds(new Set())
      setBatchMode(false)
      setConfirmDeleteAll(false)
      setPlaying(null)
      setValidations({})
      toastSuccess({ title: sk.toast.deletedAll(count) })
    } catch (e) {
      const msg = String(e)
      setError(msg)
      toastError({ title: sk.toast.actionFailed, description: msg })
    } finally {
      setDeleteAllBusy(false)
    }
  }

  const handleToggleStar = async (id: string, starred: boolean) => {
    try {
      const meta = await updateRecordingMeta(id, { starred: !starred })
      setEntries((prev) => prev.map((e) => (e.meta.id === id ? { ...e, meta } : e)))
    } catch (e) {
      setError(String(e))
    }
  }

  const handleSetFolder = async (id: string, folder: string) => {
    const trimmed = folder.trim()
    try {
      const meta = await updateRecordingMeta(id, { folder: trimmed })
      setEntries((prev) => prev.map((e) => (e.meta.id === id ? { ...e, meta } : e)))
      toastSuccess({ title: sk.toast.folderSet(trimmed) })
    } catch (e) {
      const msg = String(e)
      setError(msg)
      toastError({ title: sk.toast.actionFailed, description: msg })
    }
  }

  const handleAddTag = async (id: string) => {
    const raw = tagDraft[id]?.trim()
    if (!raw) return
    const entry = entries.find((e) => e.meta.id === id)
    if (!entry) return
    const tags = [...new Set([...(entry.meta.tags ?? []), raw])]
    try {
      const meta = await updateRecordingMeta(id, { tags })
      setEntries((prev) => prev.map((e) => (e.meta.id === id ? { ...e, meta } : e)))
      setTagDraft((d) => ({ ...d, [id]: "" }))
      toastSuccess({ title: sk.toast.tagAdded(raw) })
    } catch (e) {
      const msg = String(e)
      setError(msg)
      toastError({ title: sk.toast.actionFailed, description: msg })
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleValidate = async (id: string) => {
    setBusyId(id)
    try {
      const res = await validateRecording(id)
      setValidations((prev) => ({ ...prev, [id]: res }))
      if (res.is_valid) {
        toastSuccess({ title: sk.toast.validateOk })
      } else {
        toastError({
          title: sk.toast.validateFail,
          description: res.error ?? undefined,
        })
      }
    } catch (e) {
      const msg = String(e)
      setError(msg)
      toastError({ title: sk.toast.validateFail, description: msg })
    } finally {
      setBusyId(null)
    }
  }

  const confirmEntry = entries.find((e) => e.meta.id === confirmId)

  return (
    <div className="flex h-full flex-col">
      <MacPageHeader
        eyebrow={sk.pageEyebrow.library}
        title={sk.library.title}
        subtitle={loading ? sk.library.loading : stats ? sk.library.recordingCount(stats.total_recordings) : sk.library.subtitle}
        actions={
          <>
            {entries.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDeleteAll(true)}
                className="hidden border-red-500/30 bg-red-500/8 text-[10px] font-bold text-red-300 hover:bg-red-500/15 hover:text-red-200 sm:flex"
              >
                <Trash2 className="size-3" /> {sk.library.deleteAllBtn}
              </Button>
            )}
            {entries.length > 0 && (
              <Button
                variant={batchMode ? "default" : "outline"}
                size="sm"
                onClick={() => { setBatchMode((b) => !b); setSelectedIds(new Set()) }}
                className="hidden text-[10px] font-bold sm:flex"
              >
                <CheckSquare className="size-3" /> {sk.library.select}
              </Button>
            )}
            {ffmpeg?.available && (
              <Badge variant="secondary" className="hidden border-emerald-500/20 bg-emerald-500/8 text-[10px] font-bold text-emerald-300 sm:flex">
                <Sparkles className="size-3" /> ffmpeg
              </Badge>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={load}
              title={sk.library.refresh}
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            </Button>
          </>
        }
      />

      <PageScrollArea active={active}>
      <div className="flex flex-col gap-3 px-6 pb-5">
      {/* Stats */}
      {stats && stats.total_recordings > 0 && (
        <div className="flex gap-2">
          <StatPill icon={Film} label={sk.library.stats.clips} value={String(stats.total_recordings)} />
          <StatPill icon={Clock} label={sk.library.stats.duration} value={formatDurationSecs(stats.total_duration_secs)} />
          <StatPill icon={HardDrive} label={sk.library.stats.size} value={formatBytes(stats.total_size_bytes)} />
        </div>
      )}

      {/* ffmpeg missing – only when library has clips (empty state handles its own) */}
      {ffmpeg && !ffmpeg.available && entries.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-[var(--surface)] px-3.5 py-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-foreground">{sk.library.ffmpeg.installTitle}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {sk.library.ffmpeg.installBody}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-md bg-black/40 px-2 py-1 font-mono text-[11px] text-foreground/80">
                <Terminal className="size-3 shrink-0 text-muted-foreground" />
                {ffmpeg.install_hint.split(/:\s+/).pop()}
              </code>
              {ffmpeg.can_auto_install && (
                <button
                  type="button"
                  onClick={() => void runInstallFfmpeg()}
                  disabled={installingFfmpeg || checkingFfmpeg}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/25 disabled:opacity-40"
                >
                  <Download className={cn("size-3", installingFfmpeg && "animate-pulse")} />
                  {installingFfmpeg ? sk.library.ffmpeg.installing : sk.library.ffmpeg.install}
                </button>
              )}
              <button
                type="button"
                onClick={copyInstall}
                className="flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-[var(--surface)] px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                {copied ? sk.library.ffmpeg.copied : sk.library.ffmpeg.copy}
              </button>
              <button
                type="button"
                onClick={() => void recheckFfmpeg(true)}
                disabled={checkingFfmpeg || installingFfmpeg}
                title={sk.library.ffmpeg.recheck}
                className="flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              >
                <RefreshCw className={cn("size-3", checkingFfmpeg && "animate-spin")} />
                {sk.library.ffmpeg.recheck}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStarredOnly((s) => !s)}
            className={cn(
              "flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors",
              starredOnly ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-border/60 text-muted-foreground hover:text-foreground",
            )}
          >
            <Star className={cn("size-3", starredOnly && "fill-current")} /> {sk.library.starred}
          </button>
          <MacSelect
            value={folderFilter}
            onChange={setFolderFilter}
            placeholder={sk.library.allFolders}
            icon={Folder}
            options={[
              { value: "", label: sk.library.allFolders },
              ...folders.map((f) => ({ value: f, label: f })),
            ]}
          />
          {batchMode && selectedIds.size > 0 && ffmpeg?.available && (
            <button
              onClick={() => {
                const picked = entries.filter((e) => selectedIds.has(e.meta.id))
                setBatchOptimizing(picked)
              }}
              className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/15"
            >
              <Sparkles className="size-3" /> {sk.library.optimiseSelected(selectedIds.size)}
            </button>
          )}
          {batchMode && selectedIds.size > 0 && (
            <button
              onClick={handleBatchDelete}
              className="ml-auto flex min-h-[36px] items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] font-bold text-red-300 hover:bg-red-500/20"
            >
              <Trash2 className="size-3" /> {sk.library.batchDelete(selectedIds.size)}
            </button>
          )}
        </div>
      )}

      {/* Search */}
      {entries.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={sk.library.searchPlaceholder}
            className={cn("min-h-[40px] pl-9", searchPending && "opacity-80")}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="fade-up banner-error flex items-start gap-3 rounded-xl px-3.5 py-2.5">
          <CircleAlert className="mt-0.5 size-4 shrink-0 opacity-80" />
          <p className="flex-1 text-xs font-medium">{error}</p>
          <button onClick={() => setError(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* List */}
      <div className="-mx-1 px-1">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
            <p className="text-sm">{sk.library.loadingLibrary}</p>
          </div>
        ) : entries.length === 0 ? (
          <EmptyLibrary
            onStartRecording={onStartRecording}
            ffmpeg={ffmpeg}
            onRecheckFfmpeg={() => void recheckFfmpeg(true)}
            onInstallFfmpeg={() => void runInstallFfmpeg()}
            checkingFfmpeg={checkingFfmpeg}
            installingFfmpeg={installingFfmpeg}
          />
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Search className="size-6 opacity-40" />
            <p className="text-sm">{sk.library.noMatches(query)}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((entry) => (
              <RecordingCard
                key={entry.meta.id}
                entry={entry}
                busy={busyId === entry.meta.id}
                ffmpegReady={!!ffmpeg?.available}
                validation={validations[entry.meta.id]}
                batchMode={batchMode}
                selected={selectedIds.has(entry.meta.id)}
                onSelect={() => toggleSelect(entry.meta.id)}
                onPlay={() => setPlaying(entry)}
                onDelete={() => setConfirmId(entry.meta.id)}
                onReveal={() => revealInFinder(entry.path).catch((e) => setError(String(e)))}
                onShare={async () => {
                  try {
                    const result = await shareRecording(entry.meta.id)
                    const title =
                      sk.library.shareSuccess[result.mode] ?? sk.library.shareOpened
                    toastSuccess({ title })
                  } catch (e) {
                    toastError({ title: sk.library.shareFailed, description: String(e) })
                  }
                }}
                onRename={(title) => handleRename(entry.meta.id, title)}
                onValidate={() => handleValidate(entry.meta.id)}
                onEdit={() => setEditing(entry)}
                onToggleStar={() => handleToggleStar(entry.meta.id, entry.meta.starred ?? false)}
                showMetaInputs
                tagValue={tagDraft[entry.meta.id] ?? ""}
                onTagChange={(value) => setTagDraft((d) => ({ ...d, [entry.meta.id]: value }))}
                onTagCommit={() => handleAddTag(entry.meta.id)}
                onFolderChange={(folder) => {
                  if (folder !== (entry.meta.folder ?? "")) handleSetFolder(entry.meta.id, folder)
                }}
              />
            ))}
          </div>
        )}
      </div>
      </div>
      </PageScrollArea>

      {playing && (
        <VideoPlayerModal entry={playing} open onClose={() => setPlaying(null)} />
      )}
      {confirmEntry && (
        <ConfirmDelete
          title={confirmEntry.meta.title}
          open
          onCancel={() => setConfirmId(null)}
          onConfirm={() => handleDelete(confirmEntry.meta.id)}
        />
      )}
      {editing && (
        <EditorModal
          entry={editing}
          onClose={() => setEditing(null)}
          onComplete={load}
        />
      )}
      <ConfirmDeleteAll
        open={confirmDeleteAll}
        count={stats?.total_recordings ?? entries.length}
        sizeLabel={formatBytes(
          stats?.total_size_bytes ?? entries.reduce((sum, e) => sum + e.meta.file_size_bytes, 0),
        )}
        busy={deleteAllBusy}
        onCancel={() => setConfirmDeleteAll(false)}
        onConfirm={() => { void handleDeleteAll() }}
      />
      {batchOptimizing && (
        <BatchOptimizeModal
          entries={batchOptimizing}
          onClose={() => setBatchOptimizing(null)}
          onComplete={load}
        />
      )}
    </div>
  )
}
