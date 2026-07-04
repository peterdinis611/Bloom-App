import { describe, it, expect } from "vitest"
import {
  buildPreviewFault,
  collectPreviewTechDetails,
  expectsPreviewStream,
} from "@/lib/previewDiagnostics"

describe("expectsPreviewStream", () => {
  it("expects camera preview while idle", () => {
    expect(expectsPreviewStream("camera", "idle")).toBe(true)
    expect(expectsPreviewStream("both", "idle")).toBe(true)
    expect(expectsPreviewStream("screen", "idle")).toBe(false)
  })
})

describe("buildPreviewFault", () => {
  const base = collectPreviewTechDetails("screen", "recording", null, null, "")

  it("explains idle screen state", () => {
    const fault = buildPreviewFault("screen", "idle", base)
    expect(fault?.kind).toBe("idle_screen")
  })

  it("detects missing frames during recording", () => {
    const details = {
      ...base,
      hasStream: true,
      videoTracks: 1,
      trackState: "live",
      videoElementSize: "0×0",
      readyState: "HAVE_NOTHING",
    }
    const fault = buildPreviewFault("screen", "recording", details)
    expect(fault?.kind).toBe("no_frames")
    expect(fault?.recordingMayWork).toBe(true)
  })

  it("returns null when video element has frames", () => {
    const details = {
      ...base,
      hasStream: true,
      videoTracks: 1,
      trackState: "live",
      videoElementSize: "1920×1080",
      readyState: "HAVE_ENOUGH_DATA",
    }
    expect(buildPreviewFault("screen", "recording", details)).toBeNull()
  })
})
