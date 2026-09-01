import { useState } from "react"
import { Check, FolderOpen, Keyboard, Layers, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { sk } from "@/lib/i18n/sk"
import { markOnboardingDone } from "@/lib/onboarding"

interface OnboardingModalProps {
  bloomDir: string
  onDone: () => void
}

export function OnboardingModal({ bloomDir, onDone }: OnboardingModalProps) {
  const [step, setStep] = useState(0)
  const steps = sk.onboarding.steps
  const isLast = step >= steps.length - 1

  const finish = () => {
    void markOnboardingDone()
    onDone()
  }

  const current = steps[step]

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
              {step === 0 && <FolderOpen className="size-5" />}
              {step === 1 && <Sparkles className="size-5" />}
              {step === 2 && <Keyboard className="size-5" />}
              {step === 3 && <Layers className="size-5" />}
            </span>
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold">{current.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {current.body}
              </p>
              {step === 0 && (
                <p className="mt-2 truncate rounded-lg bg-secondary/60 px-2.5 py-1.5 font-mono text-[11px] text-foreground">
                  {bloomDir}
                </p>
              )}
              {step === 2 && (
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
