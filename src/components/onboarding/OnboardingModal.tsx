import { useEffect, useState } from "react"
import {
  Check, FolderOpen, Keyboard, Layers, Shield, Sparkles, X, Video, Mic,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { sk } from "@/lib/i18n/sk"
import { markOnboardingDone } from "@/lib/onboarding"
import { openPrivacySettings } from "@/lib/privacySettings"
import { checkFfmpeg, installFfmpeg } from "@/hooks/useBloomBackend"
import { localizeError } from "@/lib/i18n/localizeError"
import { cn } from "@/lib/utils"

interface OnboardingModalProps {
  bloomDir: string
  onDone: () => void
}

export function OnboardingModal({ bloomDir, onDone }: OnboardingModalProps) {
  const [step, setStep] = useState(0)
  const [camGranted, setCamGranted] = useState(false)
  const [ffmpegReady, setFfmpegReady] = useState<boolean | null>(null)
  const [ffmpegBusy, setFfmpegBusy] = useState(false)
  const [ffmpegMsg, setFfmpegMsg] = useState<string | null>(null)
  const steps = sk.onboarding.steps
  const isLast = step >= steps.length - 1

  // Step indices after inserting permissions as step 1:
  // 0 library, 1 permissions, 2 ffmpeg, 3 shortcuts, 4 export queue
  const isPermissions = step === 1
  const isFfmpeg = step === 2
  const isShortcuts = step === 3

  useEffect(() => {
    if (!isFfmpeg) return
    void checkFfmpeg()
      .then((s) => setFfmpegReady(s.available))
      .catch(() => setFfmpegReady(false))
  }, [isFfmpeg])

  const finish = () => {
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

  const current = steps[step]

  const stepIcon = () => {
    if (step === 0) return <FolderOpen className="size-5" />
    if (step === 1) return <Shield className="size-5" />
    if (step === 2) return <Sparkles className="size-5" />
    if (step === 3) return <Keyboard className="size-5" />
    return <Layers className="size-5" />
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className="bloom-card w-full max-w-md overflow-hidden shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <div className="flex items-start justify-between border-b border-border/60 px-5 py-4">
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
          <div className="flex items-center gap-2">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= step ? "bg-accent" : "bg-border"
                }`}
              />
            ))}
          </div>

          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
              {stepIcon()}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold">{current.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {current.body}
              </p>

              {step === 0 && (
                <p className="mt-2 truncate rounded-lg bg-secondary/60 px-2.5 py-1.5 font-mono text-[11px] text-foreground">
                  {bloomDir}
                </p>
              )}

              {isPermissions && (
                <div className="mt-3 flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={() => void requestCamMic()}
                  >
                    {camGranted ? <Check className="size-3.5" /> : <Mic className="size-3.5" />}
                    {camGranted ? sk.privacy.granted : sk.onboarding.permissions.camMic}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={() => void openPrivacySettings("screen")}
                  >
                    <Video className="size-3.5" />
                    {sk.onboarding.permissions.screen}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    {sk.onboarding.permissions.screenBody}
                  </p>
                </div>
              )}

              {isFfmpeg && (
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={ffmpegBusy}
                      onClick={() => void recheckFfmpeg()}
                    >
                      {ffmpegBusy ? sk.onboarding.ffmpeg.checking : sk.onboarding.ffmpeg.check}
                    </Button>
                    {ffmpegReady === false && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={ffmpegBusy}
                        onClick={() => void runInstallFfmpeg()}
                      >
                        {ffmpegBusy ? sk.onboarding.ffmpeg.installing : sk.onboarding.ffmpeg.install}
                      </Button>
                    )}
                  </div>
                  {ffmpegMsg && (
                    <p className="text-[11px] text-muted-foreground">{ffmpegMsg}</p>
                  )}
                </div>
              )}

              {isShortcuts && (
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

        <div className="flex items-center justify-between border-t border-border/60 px-5 py-4">
          <Button variant="ghost" size="sm" onClick={finish} className="text-muted-foreground">
            {sk.onboarding.skip}
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                {sk.onboarding.back}
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={finish}>
                <Check className="size-3.5" /> {sk.onboarding.done}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                {sk.onboarding.next}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
