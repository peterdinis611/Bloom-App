import { Minus, X } from "lucide-react"
import { getCurrentWindow } from "@tauri-apps/api/window"

interface TitleBarProps {
  recording?: boolean
}

export function TitleBar({ recording = false }: TitleBarProps) {
  const appWindow = getCurrentWindow()

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 w-full shrink-0 items-center justify-between select-none border-b border-border/50 bg-[#09090b] px-3"
    >
      {/* Logo + status */}
      <div className="flex items-center gap-2 pointer-events-none" data-tauri-drag-region>
        <div className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-orange-400 to-orange-600">
          <span className="text-[10px] font-black text-white leading-none">B</span>
        </div>
        <span className="text-xs font-semibold text-foreground/70 tracking-wide">
          Bloom
        </span>
        {recording && (
          <div className="flex items-center gap-1.5">
            <span className="rec-dot size-1.5 rounded-full bg-red-500" />
            <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">
              Recording
            </span>
          </div>
        )}
      </div>

      {/* Window controls */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => appWindow.minimize()}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Minus className="size-3" />
        </button>
        <button
          onClick={() => appWindow.close()}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/20 hover:text-red-400"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  )
}
