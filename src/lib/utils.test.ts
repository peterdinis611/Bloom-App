import { describe, it, expect, vi, afterEach } from "vitest"
import { cn, formatDuration, formatFileSize, formatDate } from "@/lib/utils"

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b")
  })

  it("dedupes conflicting tailwind classes (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })

  it("drops falsy values", () => {
    expect(cn("a", false && "b", undefined, null, "c")).toBe("a c")
  })
})

describe("formatDuration", () => {
  it("formats sub-hour durations as m:ss", () => {
    expect(formatDuration(0)).toBe("0:00")
    expect(formatDuration(5)).toBe("0:05")
    expect(formatDuration(65)).toBe("1:05")
    expect(formatDuration(600)).toBe("10:00")
  })

  it("formats hour+ durations as h:mm:ss", () => {
    expect(formatDuration(3661)).toBe("1:01:01")
    expect(formatDuration(3600)).toBe("1:00:00")
  })
})

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(512)).toBe("512 B")
  })

  it("formats kilobytes", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB")
  })

  it("formats megabytes", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB")
  })
})

describe("formatDate", () => {
  afterEach(() => vi.useRealTimers())

  it("labels today / yesterday / this week", () => {
    vi.useFakeTimers()
    const now = new Date("2024-06-15T12:00:00Z")
    vi.setSystemTime(now)

    expect(formatDate(new Date("2024-06-15T09:00:00Z"))).toBe("Today")
    expect(formatDate(new Date("2024-06-14T09:00:00Z"))).toBe("Yesterday")
    expect(formatDate(new Date("2024-06-12T09:00:00Z"))).toBe("3 days ago")
  })

  it("falls back to a short date for older entries", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"))
    // 2 weeks earlier → localised "Jun 1" style string, not a relative label.
    const label = formatDate(new Date("2024-06-01T12:00:00Z"))
    expect(label).not.toMatch(/ago|Today|Yesterday/)
  })
})
