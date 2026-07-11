import { useEffect, useState } from "react"
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { Video } from "lucide-react"
import { getSafeWebviewWindow } from "@/lib/windowControl"

export function TitleBar() {
  const [win, setWin] = useState<WebviewWindow | null>(null)

  useEffect(() => {
    setWin(getSafeWebviewWindow())
  }, [])

  return (
    <div
      data-tauri-drag-region
      className="mac-titlebar flex h-[40px] w-full shrink-0 items-center select-none"
    >
      <div className="flex items-center gap-2 pl-3" data-tauri-drag-region>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Close"
            onClick={() => void win?.close()}
            className="mac-traffic mac-traffic-close"
          />
          <button
            type="button"
            aria-label="Minimize"
            onClick={() => void win?.minimize()}
            className="mac-traffic mac-traffic-minimize"
          />
          <button
            type="button"
            aria-label="Zoom"
            onClick={() => void win?.toggleMaximize()}
            className="mac-traffic mac-traffic-maximize"
          />
        </div>
      </div>
      <div className="pointer-events-none flex flex-1 items-center justify-center gap-1.5" data-tauri-drag-region>
        <Video className="size-3.5 text-accent/70" />
        <span className="text-[13px] font-medium text-muted-foreground">Bloom</span>
      </div>
      <div className="w-[68px]" />
    </div>
  )
}
