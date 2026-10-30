import { useCallback, useEffect, useState } from "react"
import { open } from "@tauri-apps/plugin-dialog"
import {
  CheckCircle2,
  Clock,
  FileUp,
  Film,
  Loader2,
  PlayCircle,
  Scissors,
  Upload,
} from "lucide-react"
import { MacButton, MacGroup, MacGroupHeader, MacPageHeader } from "@/components/mac/MacUIKit"
import { PageScrollArea } from "@/components/layout/PageScrollArea"
import { EditorModal } from "@/components/editor/EditorModal"
import {
  checkFfmpeg,
  ensureDemoRecording,
  fileSrc,
  formatDurationSecs,
  getThumbnail,
  importRecording,
  listRecordings,
} from "@/hooks/useBloomBackend"
import { useToast } from "@/hooks/useToast"
import { useMessages } from "@/lib/i18n/I18nProvider"
import { localizeError } from "@/lib/i18n/localizeError"
import { cn } from "@/lib/utils"
import type { FfmpegStatus, RecordingEntry } from "@/types"

const VIDEO_EXTENSIONS = [
  "mp4", "m4v", "mov", "webm", "mkv", "avi", "mpeg", "mpg", "ts", "mts", "m2ts",
  "flv", "f4v", "wmv", "asf", "3gp", "ogv", "vob", "mxf",
]

function PickCard({
  entry,
  onEdit,
  ffmpegReady,
}: {
  entry: RecordingEntry
  onEdit: () => void
  ffmpegReady: boolean
}) {
  const [thumb, setThumb] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    if (!ffmpegReady) return
    getThumbnail(entry.meta.id)
      .then((p) => { if (alive) setThumb(fileSrc(p)) })
      .catch(() => {})
    return () => { alive = false }
  }, [entry.meta.id, ffmpegReady])

  return (
    <button
      type="button"
      onClick={onEdit}
      disabled={!ffmpegReady}
      className={cn(
        "bloom-card group flex w-full items-center gap-3 p-2.5 text-left",
        !ffmpegReady && "opacity-50",
      )}
    >
      <div className="relative aspect-video w-[5.5rem] shrink-0 overflow-hidden rounded-[8px] bg-secondary">
        {thumb ? (
          <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film className="size-5 text-muted-foreground/50" />
          </div>
        )}
        <span className="absolute bottom-1 right-1 rounded-md bg-black/65 px-1 py-0.5 text-[9px] font-medium tabular-nums text-white">
          {formatDurationSecs(entry.meta.duration_secs)}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
          {entry.meta.title}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="size-3" />
          {new Date(entry.meta.created_at).toLocaleString()}
        </p>
      </div>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Scissors className="size-3.5" />
      </span>
    </button>
  )
}

interface EditorPageProps {
  active?: boolean
  /** Open this recording in the editor once entries load. */
  editRecordingId?: string | null
  onEditRecordingHandled?: () => void
}

export function EditorPage({
  active = true,
  editRecordingId = null,
  onEditRecordingHandled,
}: EditorPageProps) {
  const sk = useMessages()
  const { success: toastSuccess, error: toastError } = useToast()
  const [entries, setEntries] = useState<RecordingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [importBusy, setImportBusy] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [editing, setEditing] = useState<RecordingEntry | null>(null)
  const [ffmpeg, setFfmpeg] = useState<FfmpegStatus | null>(null)
  const [demoBusy, setDemoBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listRecordings()
      setEntries(list)
    } catch (e) {
      toastError({ title: sk.toast.loadFailed, description: localizeError(e) })
    } finally {
      setLoading(false)
    }
  }, [toastError, sk.toast.loadFailed])

  useEffect(() => {
    if (!active) return
    void refresh()
    void checkFfmpeg().then(setFfmpeg).catch(() => setFfmpeg(null))
  }, [active, refresh])

  useEffect(() => {
    if (!editRecordingId || loading) return
    const found = entries.find((e) => e.meta.id === editRecordingId)
    if (found) setEditing(found)
    onEditRecordingHandled?.()
  }, [editRecordingId, entries, loading, onEditRecordingHandled])

  const importPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return
    setImportBusy(true)
    try {
      let last: RecordingEntry | null = null
      for (const path of paths) {
        last = await importRecording(path)
        setEntries((prev) => [last!, ...prev.filter((e) => e.meta.id !== last!.meta.id)])
      }
      toastSuccess({
        title: sk.library.importDone,
        description: paths.length === 1 ? paths[0].split(/[/\\]/).pop() : `${paths.length}`,
      })
      if (last && ffmpeg?.available) setEditing(last)
    } catch (e) {
      toastError({ title: sk.library.importFailed, description: localizeError(e) })
    } finally {
      setImportBusy(false)
      setDragActive(false)
    }
  }, [toastSuccess, toastError, sk.library.importDone, sk.library.importFailed, ffmpeg?.available])

  const handleImportClick = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }],
        title: sk.editorPage.importVideo,
      })
      if (!selected) return
      const path = Array.isArray(selected) ? selected[0] : selected
      await importPaths([path])
    } catch (e) {
      toastError({ title: sk.library.importFailed, description: localizeError(e) })
    }
  }, [importPaths, toastError, sk.editorPage.importVideo, sk.library.importFailed])

  const handleTryDemo = useCallback(async () => {
    setDemoBusy(true)
    try {
      const entry = await ensureDemoRecording()
      setEntries((prev) => [entry, ...prev.filter((e) => e.meta.id !== entry.meta.id)])
      setEditing(entry)
      toastSuccess({ title: sk.editorPage.demoReady, description: entry.meta.title })
    } catch (e) {
      toastError({ title: sk.editorPage.demoFailed, description: localizeError(e) })
    } finally {
      setDemoBusy(false)
    }
  }, [toastSuccess, toastError, sk.editorPage.demoReady, sk.editorPage.demoFailed])

  const ffmpegReady = Boolean(ffmpeg?.available)
  const recent = entries.slice(0, 24)

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragActive(false)
        const files = Array.from(e.dataTransfer.files)
        const paths = files
          .map((f) => ("path" in f ? String((f as File & { path?: string }).path ?? "") : ""))
          .filter(Boolean)
        if (paths.length) void importPaths(paths)
      }}
    >
      <MacPageHeader
        eyebrow={sk.pageEyebrow.editor}
        title={sk.editorPage.title}
        subtitle={sk.editorPage.subtitle}
      />

      <PageScrollArea active={active} className="pb-8">
        {dragActive && (
          <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
            <p className="text-sm font-semibold text-primary">{sk.editorPage.dropHint}</p>
          </div>
        )}

        <MacGroupHeader>{sk.editorPage.openSection}</MacGroupHeader>
        <MacGroup>
          <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              onClick={() => void handleTryDemo()}
              disabled={demoBusy || !ffmpegReady}
              className="bloom-card flex flex-col items-start gap-3 p-4 text-left"
            >
              <span className="flex size-10 items-center justify-center rounded-[12px] bg-primary text-primary-foreground">
                {demoBusy ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
              </span>
              <div>
                <p className="text-[14px] font-semibold tracking-[-0.015em] text-foreground">
                  {sk.editorPage.tryDemo}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {sk.editorPage.tryDemoHint}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => void handleImportClick()}
              disabled={importBusy}
              className="bloom-card flex flex-col items-start gap-3 p-4 text-left"
            >
              <span className="flex size-10 items-center justify-center rounded-[12px] bg-secondary text-primary">
                {importBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              </span>
              <div>
                <p className="text-[14px] font-semibold tracking-[-0.015em] text-foreground">
                  {sk.editorPage.importVideo}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {sk.editorPage.importHint}
                </p>
              </div>
            </button>

            <div className="bloom-card flex flex-col items-start gap-3 p-4 sm:col-span-2 lg:col-span-1">
              <span className="flex size-10 items-center justify-center rounded-[12px] bg-secondary text-primary">
                <FileUp className="size-4" />
              </span>
              <div>
                <p className="text-[14px] font-semibold tracking-[-0.015em] text-foreground">
                  {sk.editorPage.dropTitle}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {sk.editorPage.dropHint}
                </p>
              </div>
            </div>
          </div>
        </MacGroup>

        {!ffmpegReady && ffmpeg !== null && (
          <div className="mx-0 mt-3 flex items-start gap-2.5 rounded-[10px] bg-secondary px-3.5 py-3 text-[12px] text-muted-foreground">
            <Film className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>{sk.editorPage.ffmpegNeeded}</p>
          </div>
        )}

        <MacGroupHeader>{sk.editorPage.recent}</MacGroupHeader>
        <MacGroup>
          <div className="flex flex-col gap-1.5 p-2">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {sk.library.loading}
              </div>
            ) : recent.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-10 text-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-[14px] bg-secondary">
                  <Scissors className="size-5 text-primary" strokeWidth={1.75} />
                </div>
                <p className="text-[15px] font-semibold tracking-[-0.015em] text-foreground">
                  {sk.editorPage.emptyTitle}
                </p>
                <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-muted-foreground">
                  {sk.editorPage.emptyBody}
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <MacButton
                    variant="primary"
                    onClick={() => void handleTryDemo()}
                    disabled={demoBusy || !ffmpegReady}
                  >
                    {demoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                    {sk.editorPage.tryDemo}
                  </MacButton>
                  <MacButton
                    variant="ghost"
                    onClick={() => void handleImportClick()}
                    disabled={importBusy}
                  >
                    <Upload className="size-3.5" />
                    {sk.editorPage.importVideo}
                  </MacButton>
                </div>
              </div>
            ) : (
              recent.map((entry) => (
                <PickCard
                  key={entry.meta.id}
                  entry={entry}
                  ffmpegReady={ffmpegReady}
                  onEdit={() => setEditing(entry)}
                />
              ))
            )}
          </div>
        </MacGroup>

        {ffmpegReady && recent.length > 0 && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <CheckCircle2 className="size-3 text-[var(--status-success-fg)]" />
            {sk.editorPage.pickHint}
          </p>
        )}
      </PageScrollArea>

      {editing && (
        <EditorModal
          entry={editing}
          onClose={() => setEditing(null)}
          onComplete={() => {
            setEditing(null)
            void refresh()
          }}
        />
      )}
    </div>
  )
}
