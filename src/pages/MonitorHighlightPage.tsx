/** Fullscreen transparent overlay – orange border marks the selected display. */
export function MonitorHighlightPage() {
  return (
    <div className="pointer-events-none fixed inset-0 box-border border-[6px] border-primary shadow-[inset_0_0_80px_rgba(249,115,22,0.35)]">
      <div className="absolute left-1/2 top-8 -translate-x-1/2 rounded-full border border-primary/40 bg-black/70 px-4 py-2 text-sm font-bold text-primary backdrop-blur-md">
        Tento displej je vybraný
      </div>
    </div>
  )
}
