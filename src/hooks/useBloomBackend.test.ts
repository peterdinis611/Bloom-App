import { describe, it, expect, vi } from "vitest"
import type { DiskInfo } from "@/types"

// The hook module imports from the Tauri API at load time; stub those so the
// module can be imported in a plain jsdom environment (we only test the pure
// formatting/derivation helpers here, which never touch the IPC layer).
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
}))
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}))

import {
  formatBytes,
  formatDurationSecs,
  diskUsagePercent,
  isLowDiskSpace,
} from "@/hooks/useBloomBackend"

function disk(partial: Partial<DiskInfo>): DiskInfo {
  return {
    available_bytes: 0,
    total_bytes: 0,
    used_bytes: 0,
    bloom_dir_size_bytes: 0,
    ...partial,
  }
}

describe("formatBytes", () => {
  it("handles zero", () => {
    expect(formatBytes(0)).toBe("0 B")
  })

  it("formats bytes without decimals", () => {
    expect(formatBytes(512)).toBe("512 B")
  })

  it("formats KB/MB/GB with one decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB")
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB")
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB")
  })
})

describe("formatDurationSecs", () => {
  it("formats m:ss below an hour", () => {
    expect(formatDurationSecs(0)).toBe("0:00")
    expect(formatDurationSecs(9)).toBe("0:09")
    expect(formatDurationSecs(75)).toBe("1:15")
  })

  it("formats h:mm:ss at/above an hour and floors fractional seconds", () => {
    expect(formatDurationSecs(3661.9)).toBe("1:01:01")
  })
})

describe("diskUsagePercent", () => {
  it("returns 0 when total is unknown", () => {
    expect(diskUsagePercent(disk({ total_bytes: 0 }))).toBe(0)
  })

  it("rounds used/total to a percentage", () => {
    expect(diskUsagePercent(disk({ total_bytes: 1000, used_bytes: 250 }))).toBe(25)
    expect(diskUsagePercent(disk({ total_bytes: 3, used_bytes: 1 }))).toBe(33)
  })
})

describe("isLowDiskSpace", () => {
  it("flags space below the default 500MB threshold", () => {
    expect(isLowDiskSpace(disk({ available_bytes: 100 * 1024 * 1024 }))).toBe(true)
    expect(isLowDiskSpace(disk({ available_bytes: 800 * 1024 * 1024 }))).toBe(false)
  })

  it("respects a custom threshold", () => {
    expect(isLowDiskSpace(disk({ available_bytes: 800 * 1024 * 1024 }), 1024)).toBe(true)
  })
})
