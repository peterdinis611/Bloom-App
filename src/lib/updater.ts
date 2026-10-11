import { check } from "@tauri-apps/plugin-updater"
import { getMessagesSync } from "@/lib/i18n/I18nProvider"

export type UpdateCheckResult = "up-to-date" | "available" | "skipped" | "error"

/**
 * Check GitHub releases for an update.
 * Requires a real minisign pubkey in tauri.conf.json — placeholder fails softly.
 */
export async function checkForAppUpdate(opts?: {
  onAvailable?: (version: string) => void
}): Promise<UpdateCheckResult> {
  const sk = getMessagesSync()
  try {
    const update = await check()
    if (!update) return "up-to-date"
    opts?.onAvailable?.(update.version)
    const ok = window.confirm(sk.updater.confirm(update.version))
    if (!ok) return "skipped"
    await update.downloadAndInstall()
    window.alert(sk.updater.installed)
    return "available"
  } catch {
    return "error"
  }
}
