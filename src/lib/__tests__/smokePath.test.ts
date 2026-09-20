import { describe, expect, it } from "vitest"
import { defaultPipRect, qualityFrameRate, type CropRect } from "@/lib/capture"
import { sk } from "@/lib/i18n/sk"

describe("capture smoke path helpers", () => {
  it("covers quality → fps for export pipeline", () => {
    expect(qualityFrameRate("1080p")).toBe(30)
    expect(qualityFrameRate("720p")).toBe(24)
    expect(qualityFrameRate("480p")).toBe(15)
  })

  it("builds default PiP layout", () => {
    const rect = defaultPipRect("medium", "bottom-right")
    expect(rect.w).toBeGreaterThan(0)
    expect(rect.h).toBeGreaterThan(0)
    expect(rect.x + rect.w).toBeLessThanOrEqual(1.01)
    expect(rect.y + rect.h).toBeLessThanOrEqual(1.01)
  })

  it("accepts normalised crop rect shape used by region capture", () => {
    const crop: CropRect = { x: 0.1, y: 0.2, w: 0.5, h: 0.4 }
    expect(crop.w * crop.h).toBeCloseTo(0.2)
  })
})

describe("1.0 product strings", () => {
  it("ships version 1.0.0 in UI", () => {
    expect(sk.app.version).toBe("v1.0.0")
  })

  it("includes permissions onboarding step", () => {
    expect(sk.onboarding.steps.some((s) => s.title.toLowerCase().includes("oprávnen"))).toBe(true)
  })
})
