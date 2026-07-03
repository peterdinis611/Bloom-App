import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { LibraryStats, RecordingEntry, ValidationResult } from "@/types"
import {
  listRecordings,
  getLibraryStats,
  deleteRecording,
  renameRecording,
  revealInFinder,
  validateRecording,
  fileSrc,
  formatBytes,
  formatDurationSecs,
} from "@/hooks/useBloomBackend"

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
  screen: { icon: Monitor, label: "Screen", tint: "text-orange-400 bg-orange-500/12" },
  camera: { icon: Camera, label: "Camera", tint: "text-emerald-400 bg-emerald-500/12" },
  both: { icon: Layers, label: "Screen + Cam", tint: "text-sky-400 bg-sky-500/12" },
}

// ── Stat pill ────────────────────────────────────────────────────────────────
function StatPill({ icon: Icon, label, value }: {
  icon: React.FC<{ className?: string }>; label: string; value: string
}) {
  return (
    <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-border/50 bg-[var(--surface)] px-3 py-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/12">
        <Icon className="size-4 text-orange-400" />
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

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
function RecordingCard({ entry, onPlay, onDelete, onReveal, onRename, onValidate, validation, busy }: {
  entry: RecordingEntry
  onPlay: () => void
  onDelete: () => void
  onReveal: () => void
  onRename: (title: string) => void
  onValidate: () => void
  validation?: ValidationResult
  busy: boolean
}) {
  const meta = entry.meta
  const src = SOURCE_META[meta.source] ?? SOURCE_META.screen
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(meta.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const commit = () => {
    const next = draft.trim()
    setEditing(false)
    if (next && next !== meta.title) onRename(next)
    else setDraft(meta.title)
  }

  return (
    <div className="group flex flex-col gap-3 rounded-2xl border border-border/50 bg-[var(--surface)] p-3 transition-colors hover:border-border">
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        <button
          onClick={onPlay}
          className="relative flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-secondary to-black/60"
        >
          <src.icon className={cn("size-6 opacity-40", src.tint.split(" ")[0])} />
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
              className="w-full rounded-md border border-orange-500/40 bg-black/40 px-2 py-1 text-sm font-semibold text-foreground outline-none ring-1 ring-orange-500/20"
            />
          ) : (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-left" title="Click to rename">
              <span className="truncate text-sm font-bold text-foreground">{meta.title}</span>
              <Pencil className="size-3 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60" />
            </button>
          )}

          <p className="mt-0.5 text-[11px] text-muted-foreground">{relativeDate(meta.created_at)}</p>

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
        <ActionBtn icon={ScanSearch} label="Verify" onClick={onValidate} disabled={busy} />
        <ActionBtn icon={FolderOpen} label="Reveal" onClick={onReveal} />
        <div className="flex-1" />
        <ActionBtn icon={Trash2} label="Delete" onClick={onDelete} danger />
      </div>
    </div>
  )
}

function ActionBtn({ icon: Icon, label, onClick, danger, disabled }: {
  icon: React.FC<{ className?: string }>; label: string; onClick: () => void; danger?: boolean; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
        danger
          ? "text-muted-foreground hover:bg-red-500/15 hover:text-red-400"
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
  const [playing, setPlaying] = useState<RecordingEntry | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [validations, setValidations] = useState<Record<string, ValidationResult>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => e.meta.title.toLowerCase().includes(q) || e.meta.source.includes(q))
  }, [entries, query])

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
    <div className="flex h-full flex-col gap-3 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-foreground">Library</h1>
          <p className="text-xs text-muted-foreground">
            {stats ? `${stats.total_recordings} recording${stats.total_recordings === 1 ? "" : "s"}` : "Loading…"}
          </p>
        </div>
        <button
          onClick={load}
          className="flex size-9 items-center justify-center rounded-xl border border-border/60 bg-[var(--surface)] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="Refresh"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Stats */}
      {stats && stats.total_recordings > 0 && (
        <div className="flex gap-2">
          <StatPill icon={Film} label="Clips" value={String(stats.total_recordings)} />
          <StatPill icon={Clock} label="Duration" value={formatDurationSecs(stats.total_duration_secs)} />
          <StatPill icon={HardDrive} label="Size" value={formatBytes(stats.total_size_bytes)} />
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
            className="w-full rounded-xl border border-border/60 bg-[var(--surface)] py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-orange-500/40"
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/8 px-3.5 py-2.5">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-400" />
          <p className="flex-1 text-xs font-medium text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="size-8 animate-spin rounded-full border-2 border-border border-t-orange-500" />
            <p className="text-sm">Loading library…</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl border border-border/50 bg-[var(--surface)]">
              <Film className="size-7 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">No recordings yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Your captured videos will appear here.</p>
            </div>
            <button
              onClick={onStartRecording}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition-colors hover:bg-orange-400"
            >
              <Video className="size-4" /> Start Recording
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Search className="size-6 opacity-40" />
            <p className="text-sm">No matches for “{query}”</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((entry) => (
              <RecordingCard
                key={entry.meta.id}
                entry={entry}
                busy={busyId === entry.meta.id}
                validation={validations[entry.meta.id]}
                onPlay={() => setPlaying(entry)}
                onDelete={() => setConfirmId(entry.meta.id)}
                onReveal={() => revealInFinder(entry.path).catch((e) => setError(String(e)))}
                onRename={(title) => handleRename(entry.meta.id, title)}
                onValidate={() => handleValidate(entry.meta.id)}
              />
            ))}
          </div>
        )}
      </div>

      {playing && <PlayerModal entry={playing} onClose={() => setPlaying(null)} />}
      {confirmEntry && (
        <ConfirmDelete
          title={confirmEntry.meta.title}
          onCancel={() => setConfirmId(null)}
          onConfirm={() => handleDelete(confirmEntry.meta.id)}
        />
      )}
    </div>
  )
}
