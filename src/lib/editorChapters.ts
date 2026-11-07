/** Named chapter markers on the editor timeline. */

export interface EditorChapter {
  id: string
  time: number
  title: string
}

export function createChapter(time: number, title: string): EditorChapter {
  return {
    id: crypto.randomUUID(),
    time: Math.max(0, time),
    title: title.trim() || "Kapitola",
  }
}

export function sortChapters(chapters: EditorChapter[]): EditorChapter[] {
  return [...chapters].sort((a, b) => a.time - b.time)
}

/** Burn-in cards for export (short on-screen titles at each chapter). */
export function chaptersToSubtitleCards(
  chapters: EditorChapter[],
  holdSecs = 2.4,
): { text: string; start_secs: number; end_secs: number }[] {
  return sortChapters(chapters)
    .filter((c) => c.title.trim())
    .map((c) => ({
      text: c.title.trim(),
      start_secs: c.time,
      end_secs: c.time + holdSecs,
    }))
}

function pad2(n: number): string {
  return String(Math.floor(n)).padStart(2, "0")
}

function formatSrtTimestamp(secs: number): string {
  const clamped = Math.max(0, secs)
  const totalMs = Math.round(clamped * 1000)
  const ms = totalMs % 1000
  const totalSecs = Math.floor(totalMs / 1000)
  const s = totalSecs % 60
  const totalMins = Math.floor(totalSecs / 60)
  const m = totalMins % 60
  const h = Math.floor(totalMins / 60)
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${String(ms).padStart(3, "0")}`
}

/** Chapter markers as a standard SubRip (.srt) document. */
export function chaptersToSrt(chapters: EditorChapter[], holdSecs = 2.4): string {
  const sorted = sortChapters(chapters).filter((c) => c.title.trim())
  return sorted
    .map((c, i) => {
      const start = c.time
      const end = start + holdSecs
      return `${i + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${c.title.trim()}\n`
    })
    .join("\n")
    .trim()
}

function formatYouTubeTimestamp(secs: number): string {
  const clamped = Math.max(0, secs)
  const totalSecs = Math.floor(clamped)
  const s = totalSecs % 60
  const totalMins = Math.floor(totalSecs / 60)
  const m = totalMins % 60
  const h = Math.floor(totalMins / 60)
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`
  return `${m}:${pad2(s)}`
}

/** YouTube chapter lines: `M:SS Title` or `H:MM:SS Title`. */
export function chaptersToYouTube(chapters: EditorChapter[]): string {
  return sortChapters(chapters)
    .filter((c) => c.title.trim())
    .map((c) => `${formatYouTubeTimestamp(c.time)} ${c.title.trim()}`)
    .join("\n")
}
