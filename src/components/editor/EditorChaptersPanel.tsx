import { BookmarkPlus, Bookmark, Trash2, Pencil } from "lucide-react"
import { useState } from "react"
import { useMessages } from "@/lib/i18n/I18nProvider"
import { formatDurationSecs } from "@/hooks/useBloomBackend"
import { cn } from "@/lib/utils"
import {
  createChapter,
  sortChapters,
  type EditorChapter,
} from "@/lib/editorChapters"

interface EditorChaptersPanelProps {
  chapters: EditorChapter[]
  playhead: number
  duration: number
  onChange: (chapters: EditorChapter[]) => void
  onSeek: (t: number) => void
}

export function EditorChaptersPanel({
  chapters,
  playhead,
  duration,
  onChange,
  onSeek,
}: EditorChaptersPanelProps) {
  const sk = useMessages()
  const [draftTitle, setDraftTitle] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")

  const sorted = sortChapters(chapters)

  const addAtPlayhead = () => {
    const title = draftTitle.trim() || sk.editor.chapters.defaultTitle(sorted.length + 1)
    onChange([...chapters, createChapter(Math.min(playhead, duration), title)])
    setDraftTitle("")
  }

  const remove = (id: string) => {
    onChange(chapters.filter((c) => c.id !== id))
    if (editingId === id) setEditingId(null)
  }

  const commitEdit = (id: string) => {
    const title = editTitle.trim()
    if (!title) {
      setEditingId(null)
      return
    }
    onChange(chapters.map((c) => (c.id === id ? { ...c, title } : c)))
    setEditingId(null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">
          {sk.editor.chapters.title}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {sk.editor.chapters.hint}
        </p>
      </div>

      <div className="rounded-xl border border-border/50 bg-[var(--surface)]/80 p-2.5">
        <p className="mb-2 font-mono text-[10px] tabular-nums text-muted-foreground">
          {sk.editor.chapters.atPlayhead}: {formatDurationSecs(playhead)}
        </p>
        <div className="flex gap-2">
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAtPlayhead()}
            placeholder={sk.editor.chapters.placeholder}
            className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-2.5 py-2 text-[12px]"
          />
          <button
            type="button"
            onClick={addAtPlayhead}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-primary-foreground transition-colors hover:bg-accent"
          >
            <BookmarkPlus className="size-3.5" />
            {sk.editor.chapters.add}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
            <Bookmark className="size-5 text-muted-foreground/50" />
            <p className="text-[12px] text-muted-foreground">{sk.editor.chapters.empty}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {sorted.map((ch, i) => (
              <li
                key={ch.id}
                className={cn(
                  "group flex items-start gap-2 rounded-xl border border-border/40 bg-[var(--surface)]/60 px-2.5 py-2 transition-colors hover:border-border",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSeek(ch.time)}
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 font-mono text-[10px] font-bold text-accent hover:bg-accent/25"
                  title={sk.editor.chapters.seek}
                >
                  {i + 1}
                </button>
                <div className="min-w-0 flex-1">
                  {editingId === ch.id ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => commitEdit(ch.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(ch.id)
                        if (e.key === "Escape") setEditingId(null)
                      }}
                      className="w-full rounded-md border border-border/60 bg-background px-2 py-1 text-[12px] font-semibold"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSeek(ch.time)}
                      className="w-full truncate text-left text-[12px] font-semibold text-foreground hover:text-accent"
                    >
                      {ch.title}
                    </button>
                  )}
                  <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {formatDurationSecs(ch.time)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(ch.id)
                      setEditTitle(ch.title)
                    }}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    aria-label={sk.editor.chapters.rename}
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(ch.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error)]"
                    aria-label={sk.editor.chapters.remove}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {sorted.length > 0 && (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {sk.editor.chapters.exportNote(sorted.length)}
        </p>
      )}
    </div>
  )
}
