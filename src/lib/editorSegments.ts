export interface EditorSegment {
  start: number
  end: number
}

/** Normalized spatial crop (0–1), relative to full frame. */
export interface EditorCrop {
  x: number
  y: number
  w: number
  h: number
}

export const MAX_SEGMENTS = 8
export const MIN_SEGMENT_SECS = 0.5
export const MIN_CROP = 0.05

export function segmentDuration(seg: EditorSegment): number {
  return Math.max(0, seg.end - seg.start)
}

export function totalSegmentsDuration(segments: EditorSegment[]): number {
  return segments.reduce((sum, s) => sum + segmentDuration(s), 0)
}

export function defaultSegments(duration: number): EditorSegment[] {
  return [{ start: 0, end: Math.max(0, duration) }]
}

export function isFullFrameCrop(crop: EditorCrop | null | undefined): boolean {
  if (!crop) return true
  return crop.x <= 0.001 && crop.y <= 0.001 && crop.w >= 0.999 && crop.h >= 0.999
}

export function splitSegmentAt(
  segments: EditorSegment[],
  index: number,
  time: number,
): EditorSegment[] | null {
  if (segments.length >= MAX_SEGMENTS) return null
  const seg = segments[index]
  if (!seg) return null
  if (time <= seg.start + MIN_SEGMENT_SECS || time >= seg.end - MIN_SEGMENT_SECS) return null
  const next = [...segments]
  next.splice(index, 1, { start: seg.start, end: time }, { start: time, end: seg.end })
  return next
}

/** Remove [cutStart, cutEnd) from every keep-segment (vystrihnúť stred). */
export function cutOutRange(
  segments: EditorSegment[],
  cutStart: number,
  cutEnd: number,
): EditorSegment[] | null {
  const cutS = Math.min(cutStart, cutEnd)
  const cutE = Math.max(cutStart, cutEnd)
  if (cutE - cutS < MIN_SEGMENT_SECS) return null

  const result: EditorSegment[] = []
  for (const seg of segments) {
    if (cutE <= seg.start || cutS >= seg.end) {
      result.push({ ...seg })
      continue
    }
    if (cutS - seg.start >= MIN_SEGMENT_SECS) {
      result.push({ start: seg.start, end: cutS })
    }
    if (seg.end - cutE >= MIN_SEGMENT_SECS) {
      result.push({ start: cutE, end: seg.end })
    }
  }
  if (result.length === 0 || result.length > MAX_SEGMENTS) return null
  return result
}

export function deleteSegment(segments: EditorSegment[], index: number): EditorSegment[] {
  if (segments.length <= 1 || index < 0 || index >= segments.length) return segments
  return segments.filter((_, i) => i !== index)
}

export function moveSegment(segments: EditorSegment[], from: number, to: number): EditorSegment[] {
  if (from === to || from < 0 || to < 0 || from >= segments.length || to >= segments.length) {
    return segments
  }
  const next = [...segments]
  const [item] = next.splice(from, 1)
  if (!item) return segments
  next.splice(to, 0, item)
  return next
}

/** Update bounds without overlapping neighbours (gaps allowed). */
export function updateSegment(
  segments: EditorSegment[],
  index: number,
  start: number,
  end: number,
  duration: number,
): EditorSegment[] {
  const seg = segments[index]
  if (!seg) return segments

  const minStart = index > 0 ? segments[index - 1]!.end : 0
  const maxEnd = index < segments.length - 1 ? segments[index + 1]!.start : duration

  let s = Math.max(minStart, Math.min(start, end - MIN_SEGMENT_SECS))
  let e = Math.min(maxEnd, Math.max(end, s + MIN_SEGMENT_SECS))
  if (e - s < MIN_SEGMENT_SECS) {
    e = Math.min(maxEnd, s + MIN_SEGMENT_SECS)
    s = Math.max(minStart, e - MIN_SEGMENT_SECS)
  }
  return segments.map((item, i) => (i === index ? { start: s, end: e } : item))
}

export function mergeSegment(segments: EditorSegment[], index: number): EditorSegment[] {
  if (segments.length <= 1 || index <= 0) return segments
  const prev = segments[index - 1]!
  const cur = segments[index]!
  return [
    ...segments.slice(0, index - 1),
    { start: prev.start, end: Math.max(prev.end, cur.end) },
    ...segments.slice(index + 1),
  ]
}

export function clampCrop(crop: EditorCrop): EditorCrop {
  const w = Math.max(MIN_CROP, Math.min(1, crop.w))
  const h = Math.max(MIN_CROP, Math.min(1, crop.h))
  const x = Math.max(0, Math.min(1 - w, crop.x))
  const y = Math.max(0, Math.min(1 - h, crop.y))
  return { x, y, w, h }
}
