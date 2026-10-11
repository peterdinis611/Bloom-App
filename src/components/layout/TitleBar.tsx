import { useCallback, useEffect, useRef, useState } from "react"
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { LogicalPosition, LogicalSize, currentMonitor } from "@tauri-apps/api/window"
import { getSafeWebviewWindow } from "@/lib/windowControl"
import { cn } from "@/lib/utils"

type RestoreFrame = { x: number; y: number; w: number; h: number }

/** Expand window to the current monitor work area (macOS zoom fallback). */
async function fillMonitorWorkArea(win: WebviewWindow): Promise<void> {
  const monitor = await currentMonitor()
  if (!monitor) {
    await win.maximize()
    return
  }
  const scale = monitor.scaleFactor || 1
  const work = monitor.workArea
  const pos = work.position.toLogical(scale)
  const size = work.size.toLogical(scale)
  await win.setPosition(new LogicalPosition(pos.x, pos.y))
  await win.setSize(new LogicalSize(Math.max(720, size.width), Math.max(560, size.height)))
}

export function TitleBar() {
  const [win, setWin] = useState<WebviewWindow | null>(null)
  const [maximized, setMaximized] = useState(false)
  const restoreRef = useRef<RestoreFrame | null>(null)
  const filledRef = useRef(false)

  useEffect(() => {
    const w = getSafeWebviewWindow()
    setWin(w)
    if (!w) return

    void w.setResizable(true).catch(() => {})
    void w.setMaximizable(true).catch(() => {})

    const refresh = () => {
      void w.isMaximized().then((m) => {
        setMaximized(m || filledRef.current)
        if (!m) filledRef.current = false
      }).catch(() => {})
    }
    refresh()

    const unsubs: Array<() => void> = []
    void w.onResized(() => refresh()).then((fn) => unsubs.push(fn))
    void w.onScaleChanged(() => refresh()).then((fn) => unsubs.push(fn))
    return () => unsubs.forEach((fn) => fn())
  }, [])

  const toggleMaximize = useCallback(() => {
    if (!win) return
    void (async () => {
      try {
        const isMax = await win.isMaximized()
        if (isMax || filledRef.current) {
          if (isMax) await win.unmaximize()
          const restore = restoreRef.current
          if (restore) {
            await win.setPosition(new LogicalPosition(restore.x, restore.y))
            await win.setSize(new LogicalSize(restore.w, restore.h))
          }
          filledRef.current = false
          setMaximized(false)
          return
        }

        const pos = await win.outerPosition()
        const size = await win.outerSize()
        const factor = await win.scaleFactor()
        const logicalPos = pos.toLogical(factor)
        const logicalSize = size.toLogical(factor)
        restoreRef.current = {
          x: logicalPos.x,
          y: logicalPos.y,
          w: logicalSize.width,
          h: logicalSize.height,
        }

        try {
          await win.maximize()
          const nowMax = await win.isMaximized()
          if (nowMax) {
            setMaximized(true)
            return
          }
        } catch {
          /* fall through */
        }

        await fillMonitorWorkArea(win)
        filledRef.current = true
        setMaximized(true)
      } catch {
        try {
          await fillMonitorWorkArea(win)
          filledRef.current = true
          setMaximized(true)
        } catch {
          /* ignore */
        }
      }
    })()
  }, [win])

  return (
    <div
      data-tauri-drag-region
      className="mac-titlebar flex h-[38px] w-full shrink-0 items-center select-none"
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return
        toggleMaximize()
      }}
    >
      <div className="relative z-10 flex items-center gap-2 pl-[14px]">
        <div className="flex items-center gap-[8px]">
          <button
            type="button"
            aria-label="Zavrieť"
            onClick={(e) => {
              e.stopPropagation()
              void win?.close()
            }}
            className="mac-traffic mac-traffic-close"
          />
          <button
            type="button"
            aria-label="Minimalizovať"
            onClick={(e) => {
              e.stopPropagation()
              void win?.minimize()
            }}
            className="mac-traffic mac-traffic-minimize"
          />
          <button
            type="button"
            aria-label={maximized ? "Obnoviť veľkosť" : "Zväčšiť na celé okno"}
            onClick={(e) => {
              e.stopPropagation()
              toggleMaximize()
            }}
            className={cn("mac-traffic mac-traffic-maximize", maximized && "mac-traffic-maximized")}
          />
        </div>
      </div>
      <div className="pointer-events-none flex flex-1 items-center justify-center" data-tauri-drag-region>
        <span className="font-mono-bay text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/75">
          Bloom
        </span>
      </div>
      <div className="w-[70px]" data-tauri-drag-region />
    </div>
  )
}
