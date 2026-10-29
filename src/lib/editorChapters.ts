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
