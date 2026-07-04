import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWebviewWindow, type WebviewWindow } from "@tauri-apps/api/webviewWindow"

/** Safe accessor — Tauri metadata may be absent in Vite-only dev or before init. */
export function getSafeWebviewWindow(): WebviewWindow | null {
  if (!isTauri()) return null
  try {
    const meta = (window as Window & { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } })
      .__TAURI_INTERNALS__?.metadata
    if (!meta?.currentWindow?.label) return null
    return getCurrentWebviewWindow()
  } catch {
    return null
  }
}

/** Minimize the main Bloom window (e.g. so it is not captured on screen). */
export async function minimizeMainWindow(): Promise<void> {
  try {
    await getSafeWebviewWindow()?.minimize()
  } catch { /* ignore */ }
}

/** Restore and focus the main window after recording ends. */
export async function restoreMainWindow(): Promise<void> {
  try {
    const win = getSafeWebviewWindow()
    if (!win) return
    await win.unminimize()
    await win.show()
    await win.setFocus()
  } catch { /* ignore */ }
}
