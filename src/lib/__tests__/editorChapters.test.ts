import { describe, expect, it } from "vitest"
import {
  chaptersToSubtitleCards,
  createChapter,
  sortChapters,
} from "@/lib/editorChapters"

describe("editorChapters", () => {
  it("sorts by time", () => {
    const a = createChapter(12, "B")
    const b = createChapter(3, "A")
    expect(sortChapters([a, b]).map((c) => c.title)).toEqual(["A", "B"])
  })

  it("maps chapters to burn-in cards", () => {
    const cards = chaptersToSubtitleCards([
      createChapter(1.5, "Intro"),
      createChapter(8, "Demo"),
    ], 2)
    expect(cards).toEqual([
      { text: "Intro", start_secs: 1.5, end_secs: 3.5 },
      { text: "Demo", start_secs: 8, end_secs: 10 },
    ])
  })
})
