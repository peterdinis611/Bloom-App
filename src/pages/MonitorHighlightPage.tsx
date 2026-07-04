/** Fullscreen transparent overlay – orange border marks the selected display. */
export function MonitorHighlightPage() {
  return (
    <div className="pointer-events-none fixed inset-0 box-border border-[5px] border-orange-500/90 shadow-[inset_0_0_60px_rgba(249,115,22,0.25)]">
      <div className="absolute left-1/2 top-8 -translate-x-1/2 rounded-full border border-orange-400/50 bg-black/70 px-4 py-2 text-sm font-bold text-orange-300 backdrop-blur-md">
        This display
      </div>
    </div>
  )
}
