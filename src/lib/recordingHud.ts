import { LogicalPosition } from "@tauri-apps/api/dpi"
import { primaryMonitor } from "@tauri-apps/api/window"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"

let hudWin: WebviewWindow | null = null

const HUD_W = 220
const HUD_H = 52

function hudUrl(): string {
  if (import.meta.env.DEV) return `${window.location.origin}/#recording-hud`
  return "index.html#recording-hud"
}

async function positionHudBottomRight(win: WebviewWindow) {
  try {
    const monitor = await primaryMonitor()
    if (!monitor) return
    const scale = monitor.scaleFactor
    const x = monitor.position.x + Math.round(monitor.size.width / scale) - HUD_W - 20
    const y = monitor.position.y + Math.round(monitor.size.height / scale) - HUD_H - 20
    await win.setPosition(new LogicalPosition(x, y))
  } catch { /* ignore */ }
}

async function waitForHud(win: WebviewWindow): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    win.once("tauri://created", () => resolve())
    win.once("tauri://error", (e: { payload?: string }) => {
      reject(new Error(e.payload ?? "recording HUD failed"))
    })
  })
}

/** Small always-on-top bar for stop/pause while the main window is minimized. */
export async function openRecordingHud(): Promise<void> {
  try {
    const existing = await WebviewWindow.getByLabel("recording-hud").catch(() => null)
    if (existing) {
      hudWin = existing
      await existing.show()
      await existing.setAlwaysOnTop(true)
      return
    }

    if (hudWin) {
      await hudWin.show()
      await hudWin.setAlwaysOnTop(true)
      return
    }

    const win = new WebviewWindow("recording-hud", {
      url: hudUrl(),
      width: HUD_W,
      height: HUD_H,
      transparent: true,
      decorations: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focus: false,
      visible: true,
    })

    hudWin = win
    win.once("tauri://destroyed", () => { hudWin = null })

    await waitForHud(win)
    await positionHudBottomRight(win)
    await win.setAlwaysOnTop(true)
  } catch {
    hudWin = null
  }
}

export async function closeRecordingHud(): Promise<void> {
  try {
    if (hudWin) await hudWin.close()
    else {
      const existing = await WebviewWindow.getByLabel("recording-hud").catch(() => null)
      await existing?.close()
    }
  } catch { /* ignore */ }
  hudWin = null
}
