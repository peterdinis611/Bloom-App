import { describe, expect, it } from "vitest"
import { localizeError } from "@/lib/i18n/localizeError"

describe("localizeError", () => {
  it("maps ffmpeg missing", () => {
    expect(localizeError("ffmpeg not found")).toMatch(/ffmpeg/i)
    expect(localizeError("ffmpeg not found")).not.toMatch(/not found/)
  })

  it("maps recording not found", () => {
    expect(localizeError("Recording abc not found")).toMatch(/nenašla|nahrávka/i)
  })

  it("passes through Slovak messages", () => {
    expect(localizeError("Súbor neexistuje.")).toBe("Súbor neexistuje.")
  })

  it("maps permission errors", () => {
    expect(localizeError("NotAllowedError")).toMatch(/Prístup|oprávnen/i)
  })

  it("handles empty input", () => {
    expect(localizeError("")).toBeTruthy()
    expect(localizeError(null)).toBeTruthy()
  })
})
