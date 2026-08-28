export interface EditorSegment {
  start: number
  end: number
}

export const MAX_SEGMENTS = 3
export const MIN_SEGMENT_SECS = 0.5

export function segmentDuration(seg: EditorSegment): number {
  return Math.max(0, seg.end - seg.start)
}

export function totalSegmentsDuration(segments: EditorSegment[]): number {
  return segments.reduce((sum, s) => sum + segmentDuration(s), 0)
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

export function updateSegment(
  segments: EditorSegment[],
  index: number,
  start: number,
  end: number,
  duration: number,
): EditorSegment[] {
  const seg = segments[index]
  if (!seg) return segments
  const s = Math.max(seg.start, Math.min(start, end - MIN_SEGMENT_SECS))
  const e = Math.min(duration, Math.max(end, s + MIN_SEGMENT_SECS))
  return segments.map((item, i) => (i === index ? { start: s, end: e } : item))
}

export function mergeSegment(segments: EditorSegment[], index: number): EditorSegment[] {
  if (segments.length <= 1 || index <= 0) return segments
  const prev = segments[index - 1]!
  const cur = segments[index]!
  return [
    ...segments.slice(0, index - 1),
    { start: prev.start, end: cur.end },
    ...segments.slice(index + 1),
  ]
}

export function defaultSegments(duration: number): EditorSegment[] {
  return [{ start: 0, end: Math.max(0, duration) }]
}
