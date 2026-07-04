import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import type { MonitorInfo } from "@/types"

let highlightWin: WebviewWindow | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

/** Dismiss any active monitor identify overlay. */
export async function dismissMonitorHighlight(): Promise<void> {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  if (highlightWin) {
    await highlightWin.close().catch(() => {})
    highlightWin = null
  }
}

/** Flash an orange border overlay on the given physical display. */
export async function highlightMonitor(m: MonitorInfo): Promise<void> {
  try {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    if (highlightWin) {
      await highlightWin.close().catch(() => {})
      highlightWin = null
    }

    highlightWin = new WebviewWindow("monitor-highlight", {
      url: "index.html#monitor-highlight",
      x: m.x,
      y: m.y,
      width: m.physical_width,
      height: m.physical_height,
      transparent: true,
      decorations: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focus: false,
      visible: true,
    })

    highlightWin.once("tauri://error", () => {
      highlightWin = null
    })

    hideTimer = setTimeout(() => {
      void dismissMonitorHighlight()
    }, 2800)
  } catch {
    highlightWin = null
  }
}
