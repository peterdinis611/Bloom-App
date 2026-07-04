import { getCurrentWindow } from "@tauri-apps/api/window"

export function TitleBar() {
  const win = getCurrentWindow()

  return (
    <div
      data-tauri-drag-region
      className="mac-titlebar flex h-[38px] w-full shrink-0 items-center select-none"
    >
      <div className="flex items-center gap-2 pl-3" data-tauri-drag-region>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Close"
            onClick={() => win.close()}
            className="mac-traffic mac-traffic-close"
          />
          <button
            type="button"
            aria-label="Minimize"
            onClick={() => win.minimize()}
            className="mac-traffic mac-traffic-minimize"
          />
          <button
            type="button"
            aria-label="Zoom"
            onClick={() => win.toggleMaximize()}
            className="mac-traffic mac-traffic-maximize"
          />
        </div>
      </div>
      <div className="pointer-events-none flex-1 text-center" data-tauri-drag-region>
        <span className="text-[13px] font-medium text-muted-foreground">Bloom</span>
      </div>
      <div className="w-[68px]" />
    </div>
  )
}
