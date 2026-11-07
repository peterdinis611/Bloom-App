const MS_PER_DAY = 86_400_000

/** Whether the library backup reminder banner should show. */
export function isBackupReminderDue(
  lastBackupAt: string | null,
  reminderDays: number,
  now = new Date(),
): boolean {
  if (reminderDays <= 0) return false
  if (!lastBackupAt) return true
  const last = new Date(lastBackupAt)
  if (Number.isNaN(last.getTime())) return true
  const daysSince = (now.getTime() - last.getTime()) / MS_PER_DAY
  return daysSince >= reminderDays
}
