import { useEffect, useState } from "react"
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { getSafeWebviewWindow } from "@/lib/windowControl"

export function TitleBar() {
  const [win, setWin] = useState<WebviewWindow | null>(null)

  useEffect(() => {
    setWin(getSafeWebviewWindow())
  }, [])

  return (
    <div
      data-tauri-drag-region
      className="mac-titlebar flex h-[38px] w-full shrink-0 items-center select-none"
    >
      <div className="flex items-center gap-2 pl-[14px]" data-tauri-drag-region>
        <div className="flex items-center gap-[8px]">
          <button
            type="button"
            aria-label="Zavrieť"
            onClick={() => void win?.close()}
            className="mac-traffic mac-traffic-close"
          />
          <button
            type="button"
            aria-label="Minimalizovať"
            onClick={() => void win?.minimize()}
            className="mac-traffic mac-traffic-minimize"
          />
          <button
            type="button"
            aria-label="Zväčšiť"
            onClick={() => void win?.toggleMaximize()}
            className="mac-traffic mac-traffic-maximize"
          />
        </div>
      </div>
      <div className="pointer-events-none flex flex-1 items-center justify-center" data-tauri-drag-region>
        <span className="text-[13px] font-medium text-muted-foreground">Bloom</span>
      </div>
      <div className="w-[70px]" />
    </div>
  )
}
