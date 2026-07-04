import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDebouncedValue } from "@tanstack/react-pacer"
import { useCloseOnEscape } from "@/hooks/useCloseOnEscape"
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
  getThumbnail,
  fileSrc,
  formatBytes,
  formatDurationSecs,
} from "@/hooks/useBloomBackend"
import { OptimizeModal } from "@/components/OptimizeModal"
import { TrimModal } from "@/components/TrimModal"
import { BatchOptimizeModal } from "@/components/BatchOptimizeModal"
import { ConfirmDeleteAll } from "@/components/library/ConfirmDeleteAll"

// ── Helpers ────────────────────────────────────────────────────────────────
function relativeDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "Unknown date"
  const now = Date.now()
  const diffMs = now - d.getTime()
  const day = 24 * 60 * 60 * 1000
  const days = Math.floor(diffMs / day)
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  if (days <= 0 && new Date(now).getDate() === d.getDate()) return `Today, ${time}`
  if (days <= 1) return `Yesterday, ${time}`
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const SOURCE_META: Record<string, { icon: React.FC<{ className?: string }>; label: string; tint: string }> = {
  screen: { icon: Monitor, label: "Screen", tint: "text-accent bg-primary/12" },
  camera: { icon: Camera, label: "Camera", tint: "text-emerald-400 bg-emerald-500/12" },
  both: { icon: Layers, label: "Screen + Cam", tint: "text-sky-400 bg-sky-500/12" },
}

// ── Empty library hero ───────────────────────────────────────────────────────
function EmptyLibrary({ onStartRecording, ffmpeg, onRecheckFfmpeg, checkingFfmpeg }: {
  onStartRecording?: () => void
  ffmpeg: FfmpegStatus | null
  onRecheckFfmpeg: () => void
  checkingFfmpeg: boolean
}) {
  const hints = [
    { icon: Monitor, label: "Screen capture", tint: "text-accent bg-primary/12 border-primary/20" },
    { icon: Camera, label: "Webcam", tint: "text-emerald-400 bg-emerald-500/12 border-emerald-500/20" },
    { icon: Sparkles, label: "Optimise & trim", tint: "text-sky-400 bg-sky-500/12 border-sky-500/20" },
  ]

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 scale-150 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex size-20 items-center justify-center rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 to-[var(--surface)] shadow-xl shadow-primary/10">
          <Film className="size-9 text-accent/80" />
        </div>
      </div>

      <h2 className="text-lg font-black tracking-tight text-foreground">Your library is empty</h2>
      <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-muted-foreground">
        Record your screen, camera, or both — clips show up here automatically.
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
        Start your first recording
      </button>

      {/* ffmpeg status – compact, not a big warning banner */}
      {ffmpeg && (
        <div className="mt-8 w-full max-w-sm">
          {ffmpeg.available ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-[11px] font-semibold text-emerald-300">
              <Check className="size-3.5" />
              ffmpeg ready · optimise &amp; thumbnails enabled
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 bg-[var(--surface)] px-3.5 py-3 text-left">
              <p className="text-[11px] font-bold text-muted-foreground">Optional: install ffmpeg</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground/70">
                Needed for video optimisation and thumbnails.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-black/40 px-2 py-1 font-mono text-[10px] text-foreground/70">
                  brew install ffmpeg
                </code>
                <button
                  onClick={onRecheckFfmpeg}
                  disabled={checkingFfmpeg}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                >
                  <RefreshCw className={cn("size-3", checkingFfmpeg && "animate-spin")} />
                  Recheck
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
    <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-border/50 bg-[var(--surface)] px-3 py-2.5">
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
function ConfirmDelete({ title, onCancel, onConfirm }: {
  title: string; onCancel: () => void; onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6 fade-up" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex size-11 items-center justify-center rounded-xl bg-red-500/15">
          <Trash2 className="size-5 text-red-400" />
        </div>
        <h3 className="mt-3 text-base font-bold text-foreground">Delete recording?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground/80">{title}</span> and its metadata will be permanently removed from disk. This can't be undone.
        </p>
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-border/60 bg-[var(--surface)] py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-500">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Player modal ─────────────────────────────────────────────────────────────
function PlayerModal({ entry, onClose }: { entry: RecordingEntry; onClose: () => void }) {
  const meta = entry.meta
  useCloseOnEscape(onClose)

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/85 fade-up" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{meta.title}</p>
          <p className="text-[11px] text-white/50">
            {formatDurationSecs(meta.duration_secs)} · {formatBytes(meta.file_size_bytes)} · {meta.quality}
          </p>
        </div>
        <button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-5 min-h-0" onClick={(e) => e.stopPropagation()}>
        <video
          key={entry.path}
          src={fileSrc(entry.path)}
          controls
          autoPlay
          className="max-h-full max-w-full rounded-xl border border-white/10 bg-black shadow-2xl"
        />
      </div>
    </div>
  )
}

// ── Recording card ─────────────────────────────────────────────────────────
function RecordingCard({ entry, onPlay, onDelete, onReveal, onRename, onValidate, onOptimize, onTrim, onToggleStar, onShare, validation, busy, ffmpegReady, batchMode, selected, onSelect }: {
  entry: RecordingEntry
  onPlay: () => void
  onDelete: () => void
  onReveal: () => void
  onRename: (title: string) => void
  onValidate: () => void
  onOptimize: () => void
  onTrim: () => void
  onToggleStar: () => void
  onShare: () => void
  validation?: ValidationResult
  busy: boolean
  ffmpegReady: boolean
  batchMode?: boolean
  selected?: boolean
  onSelect?: () => void
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
      "group flex flex-col gap-3 rounded-2xl border bg-[var(--surface)] p-3 transition-colors hover:border-border",
      selected ? "border-primary/50 ring-1 ring-primary/25" : "border-border/50",
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
              <button onClick={() => setEditing(true)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" title="Click to rename">
                <span className="truncate text-sm font-bold text-foreground">{meta.title}</span>
                <Pencil className="size-3 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60" />
              </button>
              <button
                type="button"
                onClick={onToggleStar}
                className="shrink-0"
                title={starred ? "Unstar" : "Star"}
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
              {validation.is_valid ? "File healthy" : validation.error ?? "Invalid"}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 border-t border-border/40 pt-2">
        <ActionBtn icon={Play} label="Play" onClick={onPlay} />
        {ffmpegReady && <ActionBtn icon={Sparkles} label="Optimise" onClick={onOptimize} accent />}
        {ffmpegReady && <ActionBtn icon={Scissors} label="Trim" onClick={onTrim} />}
        <ActionBtn icon={ScanSearch} label="Verify" onClick={onValidate} disabled={busy} />
        <ActionBtn icon={FolderOpen} label="Reveal" onClick={onReveal} />
        <ActionBtn icon={Share2} label="Share" onClick={onShare} />
        <div className="flex-1" />
        <ActionBtn icon={Trash2} label="Delete" onClick={onDelete} danger />
      </div>
    </div>
  )
}

function ActionBtn({ icon: Icon, label, onClick, danger, accent, disabled }: {
  icon: React.FC<{ className?: string }>; label: string; onClick: () => void; danger?: boolean; accent?: boolean; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
        danger
          ? "text-muted-foreground hover:bg-red-500/15 hover:text-red-400"
          : accent
            ? "text-primary hover:bg-primary/15 hover:text-primary"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
interface LibraryPageProps {
  onStartRecording?: () => void
}

export function LibraryPage({ onStartRecording }: LibraryPageProps) {
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
  const [optimizing, setOptimizing] = useState<RecordingEntry | null>(null)
  const [trimming, setTrimming] = useState<RecordingEntry | null>(null)
  const [batchOptimizing, setBatchOptimizing] = useState<RecordingEntry[] | null>(null)
  const [copied, setCopied] = useState(false)
  const [starredOnly, setStarredOnly] = useState(false)
  const [folderFilter, setFolderFilter] = useState<string>("")
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [tagDraft, setTagDraft] = useState<Record<string, string>>({})

  const recheckFfmpeg = useCallback(async () => {
    setCheckingFfmpeg(true)
    try {
      const status = await checkFfmpeg()
      setFfmpeg(status)
    } catch {
      /* keep previous status */
    } finally {
      setCheckingFfmpeg(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [recs, st] = await Promise.all([listRecordings(), getLibraryStats()])
      setEntries(recs)
      setStats(st)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { recheckFfmpeg() }, [recheckFfmpeg])

  const copyInstall = useCallback(() => {
    const cmd = ffmpeg?.install_hint.split(/:\s+/).pop() ?? "brew install ffmpeg"
    navigator.clipboard?.writeText(cmd).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }, [ffmpeg])

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
    } catch (e) {
      setError(String(e))
    }
  }

  const handleDelete = async (id: string) => {
    setConfirmId(null)
    try {
      await deleteRecording(id)
      setEntries((prev) => prev.filter((e) => e.meta.id !== id))
      const st = await getLibraryStats().catch(() => null)
      if (st) setStats(st)
    } catch (e) {
      setError(String(e))
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
    } catch (e) {
      setError(String(e))
    }
  }

  const handleDeleteAll = async () => {
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
    } catch (e) {
      setError(String(e))
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
    try {
      const meta = await updateRecordingMeta(id, { folder: folder.trim() })
      setEntries((prev) => prev.map((e) => (e.meta.id === id ? { ...e, meta } : e)))
    } catch (e) {
      setError(String(e))
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
    } catch (e) {
      setError(String(e))
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
    } catch (e) {
      setError(String(e))
    } finally {
      setBusyId(null)
    }
  }

  const confirmEntry = entries.find((e) => e.meta.id === confirmId)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mac-page-header !pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">Library</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {loading ? "Loading…" : stats ? `${stats.total_recordings} recordings` : "Your recordings"}
            </p>
          </div>
          <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <button
              onClick={() => setConfirmDeleteAll(true)}
              className="hidden items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/8 px-2.5 py-1.5 text-[10px] font-bold text-red-300 transition-colors hover:bg-red-500/15 sm:flex"
              title="Delete all recordings"
            >
              <Trash2 className="size-3" /> Delete all
            </button>
          )}
          {entries.length > 0 && (
            <button
              onClick={() => { setBatchMode((b) => !b); setSelectedIds(new Set()) }}
              className={cn(
                "hidden items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-colors sm:flex",
                batchMode ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              <CheckSquare className="size-3" /> Select
            </button>
          )}
          {ffmpeg?.available && (
            <span className="hidden items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-2 py-1 text-[10px] font-bold text-emerald-300 sm:flex">
              <Sparkles className="size-3" /> ffmpeg
            </span>
          )}
          <button
            onClick={load}
            className="flex size-9 items-center justify-center rounded-xl border border-border/60 bg-[var(--surface)] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </button>
        </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 pb-5">
      {/* Stats */}
      {stats && stats.total_recordings > 0 && (
        <div className="flex gap-2">
          <StatPill icon={Film} label="Clips" value={String(stats.total_recordings)} />
          <StatPill icon={Clock} label="Duration" value={formatDurationSecs(stats.total_duration_secs)} />
          <StatPill icon={HardDrive} label="Size" value={formatBytes(stats.total_size_bytes)} />
        </div>
      )}

      {/* ffmpeg missing – only when library has clips (empty state handles its own) */}
      {ffmpeg && !ffmpeg.available && entries.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-[var(--surface)] px-3.5 py-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-foreground">Install ffmpeg to optimise videos</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Resizing, compression and thumbnails need ffmpeg on your system.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-md bg-black/40 px-2 py-1 font-mono text-[11px] text-foreground/80">
                <Terminal className="size-3 shrink-0 text-muted-foreground" />
                {ffmpeg.install_hint.split(/:\s+/).pop()}
              </code>
              <button
                onClick={copyInstall}
                className="flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-[var(--surface)] px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={recheckFfmpeg}
                disabled={checkingFfmpeg}
                className="flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              >
                <RefreshCw className={cn("size-3", checkingFfmpeg && "animate-spin")} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStarredOnly((s) => !s)}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors",
              starredOnly ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-border/60 text-muted-foreground hover:text-foreground",
            )}
          >
            <Star className={cn("size-3", starredOnly && "fill-current")} /> Starred
          </button>
          <select
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
            className="rounded-lg border border-border/60 bg-[var(--surface)] px-2.5 py-1.5 text-[11px] font-semibold text-foreground outline-none"
          >
            <option value="">All folders</option>
            {folders.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          {batchMode && selectedIds.size > 0 && ffmpeg?.available && (
            <button
              onClick={() => {
                const picked = entries.filter((e) => selectedIds.has(e.meta.id))
                setBatchOptimizing(picked)
              }}
              className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/15"
            >
              <Sparkles className="size-3" /> Optimise {selectedIds.size}
            </button>
          )}
          {batchMode && selectedIds.size > 0 && (
            <button
              onClick={handleBatchDelete}
              className="ml-auto flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-bold text-red-300 hover:bg-red-500/20"
            >
              <Trash2 className="size-3" /> Delete {selectedIds.size}
            </button>
          )}
        </div>
      )}

      {/* Search */}
      {entries.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recordings…"
            className={cn(
              "w-full rounded-xl border border-border/60 bg-[var(--surface)] py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40",
              searchPending && "opacity-80",
            )}
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
      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
            <p className="text-sm">Loading library…</p>
          </div>
        ) : entries.length === 0 ? (
          <EmptyLibrary
            onStartRecording={onStartRecording}
            ffmpeg={ffmpeg}
            onRecheckFfmpeg={recheckFfmpeg}
            checkingFfmpeg={checkingFfmpeg}
          />
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Search className="size-6 opacity-40" />
            <p className="text-sm">No matches for “{query}”</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((entry) => (
              <div key={entry.meta.id} className="flex flex-col gap-1">
                <RecordingCard
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
                  onShare={() => shareRecording(entry.meta.id).catch((e) => setError(String(e)))}
                  onRename={(title) => handleRename(entry.meta.id, title)}
                  onValidate={() => handleValidate(entry.meta.id)}
                  onOptimize={() => setOptimizing(entry)}
                  onTrim={() => setTrimming(entry)}
                  onToggleStar={() => handleToggleStar(entry.meta.id, entry.meta.starred ?? false)}
                />
                {!batchMode && (
                  <div className="flex flex-wrap items-center gap-2 px-1">
                    <input
                      value={tagDraft[entry.meta.id] ?? ""}
                      onChange={(e) => setTagDraft((d) => ({ ...d, [entry.meta.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddTag(entry.meta.id) }}
                      placeholder="Add tag…"
                      className="min-w-0 flex-1 rounded-lg border border-border/50 bg-[var(--surface)] px-2 py-1 text-[10px] outline-none focus:border-primary/40"
                    />
                    <input
                      defaultValue={entry.meta.folder ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v !== (entry.meta.folder ?? "")) handleSetFolder(entry.meta.id, v)
                      }}
                      placeholder="Folder"
                      className="w-24 rounded-lg border border-border/50 bg-[var(--surface)] px-2 py-1 text-[10px] outline-none focus:border-primary/40"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      {playing && <PlayerModal entry={playing} onClose={() => setPlaying(null)} />}
      {confirmEntry && (
        <ConfirmDelete
          title={confirmEntry.meta.title}
          onCancel={() => setConfirmId(null)}
          onConfirm={() => handleDelete(confirmEntry.meta.id)}
        />
      )}
      {optimizing && (
        <OptimizeModal
          entry={optimizing}
          onClose={() => setOptimizing(null)}
          onComplete={load}
        />
      )}
      {trimming && (
        <TrimModal
          entry={trimming}
          onClose={() => setTrimming(null)}
          onComplete={load}
        />
      )}
      {confirmDeleteAll && (
        <ConfirmDeleteAll
          count={stats?.total_recordings ?? entries.length}
          sizeLabel={formatBytes(
            stats?.total_size_bytes ?? entries.reduce((sum, e) => sum + e.meta.file_size_bytes, 0),
          )}
          busy={deleteAllBusy}
          onCancel={() => setConfirmDeleteAll(false)}
          onConfirm={() => { void handleDeleteAll() }}
        />
      )}
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
