/** Parse mm:ss.ms, m:ss.ms, or hh:mm:ss.ms into seconds. */
export function parseEditorTime(text: string): number | null {
  const trimmed = text.trim().replace(",", ".")
  if (!trimmed) return null

  const parts = trimmed.split(":")
  if (parts.length < 2 || parts.length > 3) return null

  const parseSecMs = (raw: string): number | null => {
    const [secPart, msPart] = raw.split(".")
    const sec = Number(secPart)
    if (!Number.isFinite(sec) || sec < 0) return null
    if (msPart === undefined || msPart === "") return sec
    const ms = Number(msPart.padEnd(2, "0").slice(0, 2))
    if (!Number.isFinite(ms) || ms < 0) return null
    return sec + ms / 100
  }

  if (parts.length === 2) {
    const minutes = Number(parts[0])
    const seconds = parseSecMs(parts[1]!)
    if (!Number.isFinite(minutes) || minutes < 0 || seconds === null) return null
    return minutes * 60 + seconds
  }

  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  const seconds = parseSecMs(parts[2]!)
  if (!Number.isFinite(hours) || hours < 0 || !Number.isFinite(minutes) || minutes < 0 || seconds === null) {
    return null
  }
  return hours * 3600 + minutes * 60 + seconds
}

/** Format seconds as mm:ss.ms (centiseconds). */
export function formatEditorTime(secs: number): string {
  const clamped = Math.max(0, secs)
  const h = Math.floor(clamped / 3600)
  const m = Math.floor((clamped % 3600) / 60)
  const s = clamped % 60
  const secInt = Math.floor(s)
  const cs = Math.round((s - secInt) * 100)
  const secStr = `${secInt}.${String(cs).padStart(2, "0")}`
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${secStr.padStart(5, "0")}`
  return `${m}:${secStr.padStart(4, "0")}`
}

export function clampTrimRange(
  duration: number,
  start: number,
  end: number,
  minGap = 0.25,
): { start: number; end: number } {
  if (duration <= 0) return { start: 0, end: 0 }
  let s = Math.max(0, Math.min(start, duration))
  let e = Math.max(0, Math.min(end, duration))
  if (e - s < minGap) {
    if (e + minGap <= duration) e = s + minGap
    else s = Math.max(0, e - minGap)
  }
  return { start: s, end: e }
}
