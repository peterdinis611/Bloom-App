import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Monitor, Video } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import type { PreviewFault, PreviewTechDetails } from "@/lib/previewDiagnostics"
import {
  localizePlayError,
  localizeRecordingSource,
  localizeRecordingStatus,
} from "@/lib/previewDiagnostics"

interface PreviewFaultPanelProps {
  fault: PreviewFault
  details: PreviewTechDetails
  compact?: boolean
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[11px] leading-snug">
      <span className="w-[7.5rem] shrink-0 text-white/40">{label}</span>
      <span className="min-w-0 flex-1 break-all font-mono text-[11px] text-white/75">{value}</span>
    </div>
  )
}

function TechDisclosure({ details }: { details: PreviewTechDetails }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mx-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-white/35 transition-colors hover:bg-white/5 hover:text-white/55"
      >
        Technické detaily
        {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      </button>
      {open && (
        <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto rounded-xl bg-black/35 px-3 py-2.5">
          <DetailRow label="Stav" value={localizeRecordingStatus(details.status)} />
          <DetailRow label="Zdroj" value={localizeRecordingSource(details.source)} />
          <DetailRow label="Stream" value={details.hasStream ? `áno (${details.streamId}…)` : "nie"} />
          <DetailRow label="Video stopy" value={String(details.videoTracks)} />
          <DetailRow label="Stopa" value={details.trackLabel} />
          <DetailRow label="Stav stopy" value={details.trackState} />
          <DetailRow label="Stlmená" value={details.trackMuted ? "áno" : "nie"} />
          <DetailRow label="Plocha displeja" value={details.displaySurface} />
          <DetailRow label="Veľkosť stopy" value={details.trackSize} />
          <DetailRow label="Video prvok" value={details.videoElementSize} />
          <DetailRow label="Stav prehrávania" value={details.readyState} />
          {details.playError && (
            <DetailRow label="Chyba prehrávania" value={localizePlayError(details.playError)} />
          )}
        </div>
      )}
    </div>
  )
}

/** Calm idle stage — not an error card. */
function IdleStage({ fault, details, compact }: PreviewFaultPanelProps) {
  return (
    <div className="preview-idle absolute inset-0 z-20 flex flex-col items-center justify-center px-6 py-8">
      <div className="preview-idle__glow" aria-hidden />

      <div className="relative z-[1] flex max-w-[22rem] flex-col items-center text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-[18px] bg-white/[0.07] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
          <Monitor className="size-6 text-white/70" strokeWidth={1.6} />
        </div>

        <h3 className="text-[17px] font-semibold tracking-[-0.022em] text-white/95">
          {fault.title}
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-white/50">
          {fault.body}
        </p>

        {fault.steps[0] && (
          <p className="mt-5 inline-flex max-w-full items-center gap-2 rounded-full bg-white/[0.08] px-3.5 py-2 text-left text-[12px] font-medium leading-snug text-white/75 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              1
            </span>
            <span className="min-w-0">{fault.steps[0]}</span>
          </p>
        )}

        {!compact && (
          <div className="mt-6 w-full max-w-sm">
            <TechDisclosure details={details} />
          </div>
        )}
      </div>
    </div>
  )
}

export function PreviewFaultPanel({ fault, details, compact }: PreviewFaultPanelProps) {
  const isInfo = fault.kind === "idle_screen"
  const isSoftWarning = fault.recordingMayWork

  if (isInfo) {
    return <IdleStage fault={fault} details={details} compact={compact} />
  }

  return (
    <div
      className={cn(
        "absolute inset-0 z-20 flex items-center justify-center p-5",
        isSoftWarning ? "bg-black/45" : "bg-black/65",
      )}
    >
      <div
        className={cn(
          "flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl",
          "bg-[#1c1c1e]/92 shadow-[0_20px_50px_rgba(0,0,0,0.45)]",
          "ring-1 ring-white/10 backdrop-blur-xl",
        )}
      >
        <div className="flex items-start gap-3 px-4 pb-3 pt-4">
          <div
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
              isSoftWarning ? "bg-white/8" : "bg-[var(--status-error-bg)]",
            )}
          >
            <AlertCircle
              className={cn(
                "size-4",
                isSoftWarning ? "text-white/55" : "text-[var(--status-error-fg)]",
              )}
              strokeWidth={1.75}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-white/95">
              {fault.title}
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">{fault.body}</p>
          </div>
        </div>

        {fault.steps.length > 0 && (
          <div className="mx-4 mb-3 rounded-xl bg-black/30 px-3 py-2.5">
            <ol className="flex flex-col gap-2">
              {fault.steps.map((step, i) => (
                <li key={i} className="flex gap-2.5 text-[12px] leading-snug text-white/75">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-white/50">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {fault.recordingMayWork && (
          <div className="mx-4 mb-3 flex items-start gap-2 rounded-xl bg-[var(--status-success-bg)] px-3 py-2.5">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--status-success-fg)]" />
            <p className="text-[11px] leading-relaxed text-[var(--status-success-fg)]">
              Nahrávanie môže stále fungovať — skontroluj súbor v Knižnici po ukončení.
            </p>
          </div>
        )}

        {!compact && (
          <div className="border-t border-white/6 px-3 py-2">
            <TechDisclosure details={details} />
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-white/6 px-4 py-2.5 text-[10px] text-white/30">
          <Video className="size-3 shrink-0" />
          Ak sa detaily nemenia, problém je na strane macOS / WebKit.
        </div>
      </div>
    </div>
  )
}
