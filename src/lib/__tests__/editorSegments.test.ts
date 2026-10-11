import { describe, expect, it } from "vitest"
import {
  cutOutRange,
  defaultSegments,
  deleteSegment,
  moveSegment,
  splitSegmentAt,
  updateSegment,
  MAX_SEGMENTS,
} from "@/lib/editorSegments"

describe("editorSegments", () => {
  it("splits at playhead into two parts", () => {
    const next = splitSegmentAt([{ start: 0, end: 10 }], 0, 4)
    expect(next).toEqual([
      { start: 0, end: 4 },
      { start: 4, end: 10 },
    ])
  })

  it("cuts out a middle range", () => {
    const next = cutOutRange([{ start: 0, end: 20 }], 5, 12)
    expect(next).toEqual([
      { start: 0, end: 5 },
      { start: 12, end: 20 },
    ])
  })

  it("deletes a segment", () => {
    const segs = [
      { start: 0, end: 5 },
      { start: 8, end: 12 },
      { start: 15, end: 20 },
    ]
    expect(deleteSegment(segs, 1)).toEqual([
      { start: 0, end: 5 },
      { start: 15, end: 20 },
    ])
  })

  it("reorders segments", () => {
    const segs = [
      { start: 0, end: 2 },
      { start: 4, end: 6 },
      { start: 8, end: 10 },
    ]
    expect(moveSegment(segs, 2, 0).map((s) => s.start)).toEqual([8, 0, 4])
  })

  it("clamps update against neighbours", () => {
    const segs = [
      { start: 0, end: 5 },
      { start: 10, end: 15 },
    ]
    const next = updateSegment(segs, 1, 4, 20, 20)
    // Cannot overlap previous part — may close the gap down to prev.end
    expect(next[1]!.start).toBe(5)
    expect(next[1]!.end).toBe(20)
  })

  it("respects max segments on split", () => {
    let segs = defaultSegments(100)
    for (let i = 0; i < MAX_SEGMENTS + 2; i++) {
      const mid = (segs[0]!.start + segs[0]!.end) / 2
      const next = splitSegmentAt(segs, 0, mid)
      if (!next) break
      segs = next
    }
    expect(segs.length).toBeLessThanOrEqual(MAX_SEGMENTS)
  })
})
