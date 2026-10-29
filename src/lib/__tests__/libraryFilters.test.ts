import { describe, expect, it } from "vitest"
import { entryInFolder } from "@/lib/libraryFilters"
import type { RecordingEntry } from "@/types"

function entry(path: string, folder?: string): RecordingEntry {
  return {
    path,
    meta_path: "",
    meta: {
      id: "x",
      title: "t",
      filename: "f.mp4",
      created_at: "",
      duration_secs: 0,
      file_size_bytes: 0,
      source: "screen",
      quality: "1080p",
      has_microphone: false,
      has_system_audio: false,
      target_label: "",
      folder,
    },
  }
}

describe("entryInFolder", () => {
  it("matches everything for an empty filter", () => {
    expect(entryInFolder(entry("/a/b.mp4"), "")).toBe(true)
  })

  it("matches sidecar folder", () => {
    expect(entryInFolder(entry("/lib/b.mp4", "demos"), "demos")).toBe(true)
    expect(entryInFolder(entry("/lib/b.mp4", "other"), "demos")).toBe(false)
  })

  it("matches path segments", () => {
    expect(entryInFolder(entry("/lib/demos/b.mp4"), "demos")).toBe(true)
    expect(entryInFolder(entry("C:\\lib\\demos\\b.mp4"), "demos")).toBe(true)
    expect(entryInFolder(entry("/lib/demosx/b.mp4"), "demos")).toBe(false)
  })
})
