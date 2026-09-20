import { useEffect, useState } from "react"
import {
  Check, FolderOpen, Keyboard, Layers, Shield, Sparkles, X, Video, Mic,
  Scale, Film,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { sk } from "@/lib/i18n/sk"
import { markOnboardingDone, markPrivacyAccepted } from "@/lib/onboarding"
import { openPrivacySettings } from "@/lib/privacySettings"
import { checkFfmpeg, installFfmpeg } from "@/hooks/useBloomBackend"
import { localizeError } from "@/lib/i18n/localizeError"
import { cn } from "@/lib/utils"
import { PrivacyPolicyModal } from "@/components/legal/PrivacyPolicyModal"

interface OnboardingModalProps {
  bloomDir: string
  onDone: () => void
}

type StepId = "welcome" | "privacy" | "permissions" | "ffmpeg" | "shortcuts" | "export"

const STEP_ORDER: StepId[] = ["welcome", "privacy", "permissions", "ffmpeg", "shortcuts", "export"]

export function OnboardingModal({ bloomDir, onDone }: OnboardingModalProps) {
  const [stepIdx, setStepIdx] = useState(0)
  const [privacyOk, setPrivacyOk] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [camGranted, setCamGranted] = useState(false)
  const [ffmpegReady, setFfmpegReady] = useState<boolean | null>(null)
  const [ffmpegBusy, setFfmpegBusy] = useState(false)
  const [ffmpegMsg, setFfmpegMsg] = useState<string | null>(null)

  const stepId = STEP_ORDER[stepIdx] ?? "welcome"
  const isLast = stepIdx >= STEP_ORDER.length - 1
  const copy = sk.onboarding.stepsById[stepId]

  useEffect(() => {
    if (stepId !== "ffmpeg") return
    void checkFfmpeg()
      .then((s) => setFfmpegReady(s.available))
      .catch(() => setFfmpegReady(false))
  }, [stepId])

  const finish = () => {
    void markPrivacyAccepted()
    void markOnboardingDone()
    onDone()
  }

  const requestCamMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      stream.getTracks().forEach((t) => t.stop())
      setCamGranted(true)
    } catch {
      setCamGranted(false)
      void openPrivacySettings("camera").catch(() => {})
    }
  }

  const runInstallFfmpeg = async () => {
    setFfmpegBusy(true)
    setFfmpegMsg(null)
    try {
      const result = await installFfmpeg()
      setFfmpegReady(result.success)
      setFfmpegMsg(localizeError(result.message))
    } catch (e) {
      setFfmpegReady(false)
      setFfmpegMsg(localizeError(e))
    } finally {
      setFfmpegBusy(false)
    }
  }

  const recheckFfmpeg = async () => {
    setFfmpegBusy(true)
    try {
      const s = await checkFfmpeg()
      setFfmpegReady(s.available)
      setFfmpegMsg(s.available ? sk.onboarding.ffmpeg.ready : sk.onboarding.ffmpeg.missing)
    } catch (e) {
      setFfmpegReady(false)
      setFfmpegMsg(localizeError(e))
    } finally {
      setFfmpegBusy(false)
    }
  }

  const canAdvance =
    stepId !== "privacy" || privacyOk

  const stepIcon = () => {
    switch (stepId) {
      case "welcome": return <Film className="size-5" />
      case "privacy": return <Scale className="size-5" />
      case "permissions": return <Shield className="size-5" />
      case "ffmpeg": return <Sparkles className="size-5" />
      case "shortcuts": return <Keyboard className="size-5" />
      default: return <Layers className="size-5" />
    }
  }

  return (
    <>
      <div className="onboard-overlay fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div
          className="onboard-card bloom-card relative w-full max-w-md overflow-hidden shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
        >
          <div className="onboard-leader" aria-hidden />

          <div className="flex items-start justify-between border-b border-border/50 px-5 py-4">
            <div>
              <p className="page-eyebrow !mb-1">{sk.onboarding.eyebrow}</p>
              <h2 id="onboarding-title" className="font-display text-xl font-bold tracking-tight">
                {sk.onboarding.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={finish}
              className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label={sk.onboarding.skip}
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-4 px-5 py-5">
            <div className="flex items-center gap-1.5">
              {STEP_ORDER.map((id, i) => (
                <span
                  key={id}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors duration-300",
                    i <= stepIdx ? "bg-accent" : "bg-border/80",
                  )}
                />
              ))}
            </div>

            <div
              key={stepId}
              className="onboard-step flex items-start gap-3"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/20 to-primary/10 text-accent shadow-inner">
                {stepIcon()}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-[17px] font-bold tracking-tight">{copy.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {copy.body}
                </p>

                {stepId === "welcome" && (
                  <p className="mt-3 truncate rounded-xl border border-border/50 bg-secondary/40 px-3 py-2 font-mono text-[11px] text-foreground">
                    <FolderOpen className="mr-1.5 inline size-3 opacity-60" />
                    {bloomDir}
                  </p>
                )}

                {stepId === "privacy" && (
                  <div className="mt-3 space-y-3">
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={privacyOk}
                        onChange={(e) => setPrivacyOk(e.target.checked)}
                        className="mt-0.5 size-4 accent-[var(--accent)]"
                      />
                      <span className="text-[12px] leading-snug text-foreground">
                        {sk.onboarding.privacyConsent}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="text-[12px] font-semibold text-primary hover:underline"
                      onClick={() => setShowPrivacy(true)}
                    >
                      {sk.legal.readPolicy}
                    </button>
                  </div>
                )}

                {stepId === "permissions" && (
                  <div className="mt-3 flex flex-col gap-2">
                    <Button type="button" variant="outline" size="sm" className="justify-start" onClick={() => void requestCamMic()}>
                      {camGranted ? <Check className="size-3.5" /> : <Mic className="size-3.5" />}
                      {camGranted ? sk.privacy.granted : sk.onboarding.permissions.camMic}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="justify-start" onClick={() => void openPrivacySettings("screen")}>
                      <Video className="size-3.5" />
                      {sk.onboarding.permissions.screen}
                    </Button>
                    <p className="text-[11px] text-muted-foreground">{sk.onboarding.permissions.screenBody}</p>
                  </div>
                )}

                {stepId === "ffmpeg" && (
                  <div className="mt-3 flex flex-col gap-2">
                    <p className={cn(
                      "text-[12px] font-medium",
                      ffmpegReady === true && "tone-fg-success",
                      ffmpegReady === false && "text-muted-foreground",
                    )}>
                      {ffmpegReady === true
                        ? sk.onboarding.ffmpeg.ready
                        : ffmpegReady === false
                          ? sk.onboarding.ffmpeg.missing
                          : "…"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={ffmpegBusy} onClick={() => void recheckFfmpeg()}>
                        {ffmpegBusy ? sk.onboarding.ffmpeg.checking : sk.onboarding.ffmpeg.check}
                      </Button>
                      {ffmpegReady === false && (
                        <Button type="button" size="sm" disabled={ffmpegBusy} onClick={() => void runInstallFfmpeg()}>
                          {ffmpegBusy ? sk.onboarding.ffmpeg.installing : sk.onboarding.ffmpeg.install}
                        </Button>
                      )}
                    </div>
                    {ffmpegMsg && <p className="text-[11px] text-muted-foreground">{ffmpegMsg}</p>}
                  </div>
                )}

                {stepId === "shortcuts" && (
                  <ul className="mt-3 space-y-1.5">
                    {sk.onboarding.shortcuts.map((s) => (
                      <li key={s.keys} className="flex items-center justify-between gap-3 text-[12px]">
                        <span className="text-muted-foreground">{s.label}</span>
                        <kbd className="rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[11px]">
                          {s.keys}
                        </kbd>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border/50 px-5 py-4">
            <Button variant="ghost" size="sm" onClick={finish} className="text-muted-foreground">
              {sk.onboarding.skip}
            </Button>
            <div className="flex gap-2">
              {stepIdx > 0 && (
                <Button variant="outline" size="sm" onClick={() => setStepIdx((s) => s - 1)}>
                  {sk.onboarding.back}
                </Button>
              )}
              {isLast ? (
                <Button size="sm" disabled={!canAdvance} onClick={finish}>
                  <Check className="size-3.5" /> {sk.onboarding.done}
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={!canAdvance}
                  onClick={() => setStepIdx((s) => s + 1)}
                >
                  {sk.onboarding.next}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <PrivacyPolicyModal open={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </>
  )
}
