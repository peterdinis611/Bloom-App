import { describe, expect, it } from "vitest"
import {
  chaptersToSrt,
  chaptersToSubtitleCards,
  chaptersToYouTube,
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

  it("maps chapters to SRT", () => {
    const srt = chaptersToSrt([
      createChapter(65.5, "Middle"),
      createChapter(1, "Start"),
    ])
    expect(srt).toBe(
      "1\n00:00:01,000 --> 00:00:03,400\nStart\n\n2\n00:01:05,500 --> 00:01:07,900\nMiddle",
    )
  })

  it("maps chapters to YouTube lines", () => {
    const lines = chaptersToYouTube([
      createChapter(3661, "Outro"),
      createChapter(90, "Demo"),
    ])
    expect(lines).toBe("1:30 Demo\n1:01:01 Outro")
  })
})
