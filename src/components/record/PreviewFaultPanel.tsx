import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Monitor, Video } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import type { PreviewFault, PreviewTechDetails } from "@/lib/previewDiagnostics"

interface PreviewFaultPanelProps {
  fault: PreviewFault
  details: PreviewTechDetails
  compact?: boolean
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[11px] leading-snug">
      <span className="w-[7.5rem] shrink-0 text-white/45">{label}</span>
      <span className="min-w-0 flex-1 break-all font-mono text-white/85">{value}</span>
    </div>
  )
}

export function PreviewFaultPanel({ fault, details, compact }: PreviewFaultPanelProps) {
  const [showTech, setShowTech] = useState(true)
  const isInfo = fault.kind === "idle_screen"

  return (
    <div
      className={cn(
        "absolute inset-0 z-20 flex items-center justify-center p-4",
        isInfo ? "bg-black/50" : "bg-black/75 backdrop-blur-[2px]",
      )}
    >
      <div
        className={cn(
          "flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-xl border shadow-2xl",
          isInfo
            ? "border-white/15 bg-[#1c1c1e]/95"
            : "border-amber-500/35 bg-[#1a1408]/95",
        )}
      >
        <div className={cn("flex items-start gap-3 px-4 py-3.5", !isInfo && "border-b border-amber-500/20 bg-amber-500/8")}>
          {isInfo ? (
            <Monitor className="mt-0.5 size-5 shrink-0 text-white/60" />
          ) : (
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-400" />
          )}
          <div className="min-w-0 flex-1">
            <h3 className={cn("text-[13px] font-bold", isInfo ? "text-white/90" : "text-amber-100")}>
              {fault.title}
            </h3>
            <p className="mt-1 text-[12px] leading-relaxed text-white/70">{fault.body}</p>
          </div>
        </div>

        {fault.steps.length > 0 && (
          <div className="border-b border-white/8 px-4 py-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
              {isInfo ? "Čo urobiť" : "Skús toto"}
            </p>
            <ol className="flex flex-col gap-1.5">
              {fault.steps.map((step, i) => (
                <li key={i} className="flex gap-2 text-[12px] leading-snug text-white/80">
                  <span className="mt-px shrink-0 font-mono text-[10px] text-white/35">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {fault.recordingMayWork && !isInfo && (
          <div className="flex items-start gap-2 border-b border-white/8 px-4 py-2.5">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400/90" />
            <p className="text-[11px] leading-relaxed text-emerald-200/80">
              Nahrávanie môže stále fungovať — skontroluj súbor v Library po ukončení.
            </p>
          </div>
        )}

        {!compact && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowTech((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white/40 hover:text-white/60"
            >
              Technické detaily
              {showTech ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
            {showTech && (
              <div className="space-y-1.5 border-t border-white/8 px-4 py-3">
                <DetailRow label="Stav" value={details.status} />
                <DetailRow label="Zdroj" value={details.source} />
                <DetailRow label="Stream" value={details.hasStream ? `áno (${details.streamId}…)` : "nie"} />
                <DetailRow label="Video tracks" value={String(details.videoTracks)} />
                <DetailRow label="Track" value={details.trackLabel} />
                <DetailRow label="Track state" value={details.trackState} />
                <DetailRow label="Track muted" value={details.trackMuted ? "áno" : "nie"} />
                <DetailRow label="Display surface" value={details.displaySurface} />
                <DetailRow label="Track size" value={details.trackSize} />
                <DetailRow label="Video element" value={details.videoElementSize} />
                <DetailRow label="readyState" value={details.readyState} />
                {details.playError && <DetailRow label="Play error" value={details.playError} />}
              </div>
            )}
          </div>
        )}

        {!isInfo && (
          <div className="flex items-center gap-2 border-t border-white/8 px-4 py-2 text-[10px] text-white/35">
            <Video className="size-3 shrink-0" />
            Ak sa detaily nemenia, problém je na strane macOS / WebKit, nie UI.
          </div>
        )}
      </div>
    </div>
  )
}
