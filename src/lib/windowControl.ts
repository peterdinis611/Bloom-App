import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"

/** Minimize the main Bloom window (e.g. so it is not captured on screen). */
export async function minimizeMainWindow(): Promise<void> {
  try {
    await getCurrentWebviewWindow().minimize()
  } catch { /* ignore */ }
}

/** Restore and focus the main window after recording ends. */
export async function restoreMainWindow(): Promise<void> {
  try {
    const win = getCurrentWebviewWindow()
    await win.unminimize()
    await win.show()
    await win.setFocus()
  } catch { /* ignore */ }
}
