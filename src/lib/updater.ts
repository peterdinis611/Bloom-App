import { ask, message } from "@tauri-apps/plugin-dialog"
import { check } from "@tauri-apps/plugin-updater"
import { getMessagesSync } from "@/lib/i18n/I18nProvider"

export type UpdateCheckResult = "up-to-date" | "available" | "skipped" | "error"

function isPubkeyPlaceholderError(err: unknown): boolean {
  const text = String(err instanceof Error ? err.message : err).toLowerCase()
  return (
    text.includes("replace_with_minisign") ||
    text.includes("minisign") ||
    (text.includes("pubkey") && (text.includes("invalid") || text.includes("verify") || text.includes("replace")))
  )
}

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
    const ok = await ask(sk.updater.confirm(update.version), {
      title: "Bloom",
      kind: "info",
    })
    if (!ok) return "skipped"
    await update.downloadAndInstall()
    await message(sk.updater.installed, { title: "Bloom", kind: "info" })
    return "available"
  } catch (err) {
    if (isPubkeyPlaceholderError(err)) {
      await message(sk.updater.pubkeyNotConfigured, { title: "Bloom", kind: "warning" })
    }
    return "error"
  }
}
