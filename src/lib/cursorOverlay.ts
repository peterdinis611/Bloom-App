import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { invoke } from "@tauri-apps/api/core"

let overlayWin: WebviewWindow | null = null

function overlayUrl(): string {
  if (import.meta.env.DEV) return `${window.location.origin}/#cursor-overlay`
  return "index.html#cursor-overlay"
}

async function waitForOverlay(win: WebviewWindow): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    win.once("tauri://created", () => resolve())
    win.once("tauri://error", (e: { payload?: string }) => {
      reject(new Error(e.payload ?? "cursor overlay failed"))
    })
  })
}

/** Full-screen transparent overlay for cursor spotlight + click ripples. */
export async function openCursorOverlay(): Promise<void> {
  try {
    const existing = await WebviewWindow.getByLabel("cursor-overlay").catch(() => null)
    if (existing) {
      overlayWin = existing
      await existing.show()
      await existing.setAlwaysOnTop(true)
      await invoke("start_cursor_tracker")
      return
    }

    if (overlayWin) {
      await overlayWin.show()
      await overlayWin.setAlwaysOnTop(true)
      await invoke("start_cursor_tracker")
      return
    }

    const win = new WebviewWindow("cursor-overlay", {
      url: overlayUrl(),
      fullscreen: true,
      transparent: true,
      decorations: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focus: false,
      visible: true,
    })

    overlayWin = win
    win.once("tauri://destroyed", () => { overlayWin = null })

    await waitForOverlay(win)
    await win.setAlwaysOnTop(true)
    await invoke("start_cursor_tracker")
  } catch {
    overlayWin = null
  }
}

export async function closeCursorOverlay(): Promise<void> {
  try {
    await invoke("stop_cursor_tracker")
    if (overlayWin) await overlayWin.close()
    else {
      const existing = await WebviewWindow.getByLabel("cursor-overlay").catch(() => null)
      await existing?.close()
    }
  } catch { /* ignore */ }
  overlayWin = null
}
