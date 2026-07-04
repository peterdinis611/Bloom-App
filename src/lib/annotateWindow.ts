import { WebviewWindow, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"

let annotateWin: WebviewWindow | null = null

function annotateUrl(): string {
  // In dev the child webview must load the Vite origin, not a bare index.html path.
  if (import.meta.env.DEV) {
    return `${window.location.origin}/#annotate`
  }
  return "index.html#annotate"
}

async function waitForWindow(win: WebviewWindow): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    win.once("tauri://created", () => resolve())
    win.once("tauri://error", (e: { payload?: string }) => {
      reject(new Error(e.payload ?? "annotate window failed"))
    })
  })
}

/** Lower the main window so the fullscreen annotate overlay sits above it. */
async function pushMainBelowOverlay() {
  try {
    const main = getCurrentWebviewWindow()
    await main.setAlwaysOnTop(false)
  } catch { /* ignore */ }
}

async function restoreMainOnTop() {
  // Main window is not always-on-top by default — no stacking to restore.
}

/** Open (or focus) the transparent fullscreen drawing overlay. */
export async function openAnnotateWindow(): Promise<void> {
  await pushMainBelowOverlay()

  try {
    const existing = await WebviewWindow.getByLabel("annotate").catch(() => null)
    if (existing) {
      annotateWin = existing
      await existing.show()
      await existing.setAlwaysOnTop(true)
      await existing.setFocus()
      return
    }

    if (annotateWin) {
      await annotateWin.show()
      await annotateWin.setAlwaysOnTop(true)
      await annotateWin.setFocus()
      return
    }

    const win = new WebviewWindow("annotate", {
      url: annotateUrl(),
      transparent: true,
      fullscreen: true,
      alwaysOnTop: true,
      decorations: false,
      skipTaskbar: true,
      resizable: false,
      focus: true,
      visible: true,
    })

    annotateWin = win
    win.once("tauri://destroyed", () => {
      annotateWin = null
      restoreMainOnTop()
    })

    await waitForWindow(win)
    await win.setAlwaysOnTop(true)
    await win.setFocus()
  } catch (e) {
    annotateWin = null
    await restoreMainOnTop()
    throw e
  }
}

/** Hide the drawing overlay and restore main window stacking. */
export async function closeAnnotateWindow(): Promise<void> {
  try {
    if (annotateWin) {
      await annotateWin.hide()
    } else {
      const existing = await WebviewWindow.getByLabel("annotate").catch(() => null)
      await existing?.hide()
    }
  } catch { /* ignore */ }
  await restoreMainOnTop()
}
