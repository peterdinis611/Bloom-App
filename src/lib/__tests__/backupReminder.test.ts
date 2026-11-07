import { describe, expect, it } from "vitest"
import { isBackupReminderDue } from "@/lib/backupReminder"

describe("isBackupReminderDue", () => {
  const now = new Date("2026-11-07T12:00:00Z")

  it("is off when reminderDays is 0", () => {
    expect(isBackupReminderDue(null, 0, now)).toBe(false)
  })

  it("is due when never backed up", () => {
    expect(isBackupReminderDue(null, 7, now)).toBe(true)
  })

  it("is due when last backup is older than reminder window", () => {
    expect(isBackupReminderDue("2026-10-01T12:00:00Z", 7, now)).toBe(true)
  })

  it("is not due when last backup is recent", () => {
    expect(isBackupReminderDue("2026-11-05T12:00:00Z", 7, now)).toBe(false)
  })
})
