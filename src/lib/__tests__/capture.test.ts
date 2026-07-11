import { describe, it, expect } from "vitest"
import { qualityFrameRate } from "@/lib/capture"

describe("qualityFrameRate", () => {
  it("uses 30fps for 1080p", () => {
    expect(qualityFrameRate("1080p")).toBe(30)
  })

  it("uses 24fps for 720p", () => {
    expect(qualityFrameRate("720p")).toBe(24)
  })

  it("uses 15fps for 480p", () => {
    expect(qualityFrameRate("480p")).toBe(15)
  })
})
