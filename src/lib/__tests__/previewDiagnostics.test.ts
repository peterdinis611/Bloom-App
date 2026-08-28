import { describe, it, expect } from "vitest"
import {
  buildPreviewFault,
  collectPreviewTechDetails,
  expectsPreviewStream,
  localizePlayError,
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

  it("localizes play errors to Slovak", () => {
    expect(localizePlayError("The operation was aborted.")).toContain("prerušené")
  })

  it("suppresses play_blocked during active recording with live stream", () => {
    const details = {
      ...base,
      hasStream: true,
      videoTracks: 1,
      trackState: "live",
      videoElementSize: "0×0",
      playError: "The operation was aborted.",
    }
    expect(buildPreviewFault("screen", "recording", details)).toEqual(
      expect.objectContaining({ kind: "no_frames" }),
    )
  })

  it("shows localized play_blocked when idle with play error", () => {
    const details = {
      ...collectPreviewTechDetails("camera", "idle", null, null, ""),
      hasStream: true,
      videoTracks: 1,
      trackState: "live",
      playError: "The operation was aborted.",
    }
    const fault = buildPreviewFault("camera", "idle", details)
    expect(fault?.kind).toBe("play_blocked")
    expect(fault?.body).toContain("prerušené")
    expect(fault?.body).not.toContain("aborted")
  })
})
