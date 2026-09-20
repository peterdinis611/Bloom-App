import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { sk } from "@/lib/i18n/sk"
import { PRIVACY_SECTIONS } from "@/lib/privacyContent"
import { PageScrollArea } from "@/components/layout/PageScrollArea"

interface PrivacyPolicyModalProps {
  open: boolean
  onClose: () => void
}

export function PrivacyPolicyModal({ open, onClose }: PrivacyPolicyModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div
        className="bloom-card flex max-h-[min(88vh,640px)] w-full max-w-lg flex-col overflow-hidden shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
      >
        <div className="flex items-start justify-between border-b border-border/60 px-5 py-4">
          <div>
            <p className="page-eyebrow !mb-1">{sk.legal.eyebrow}</p>
            <h2 id="privacy-title" className="font-display text-xl font-bold tracking-tight">
              {sk.legal.privacyTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={sk.toast.dismiss}
          >
            <X className="size-4" />
          </button>
        </div>

        <PageScrollArea active className="min-h-0 flex-1">
          <div className="space-y-5 px-5 py-4">
            {PRIVACY_SECTIONS.map((s) => (
              <section key={s.title}>
                <h3 className="text-[13px] font-semibold text-foreground">{s.title}</h3>
                {s.paragraphs.map((p) => (
                  <p key={p} className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {p}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </PageScrollArea>

        <div className="border-t border-border/60 px-5 py-3">
          <Button className="w-full" onClick={onClose}>
            {sk.legal.close}
          </Button>
        </div>
      </div>
    </div>
  )
}
