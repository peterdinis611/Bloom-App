import { useEffect, useState } from "react"
import { sk } from "@/lib/i18n/sk"
import { useSettings } from "@/hooks/useSettings"
import { setGlobalShortcuts } from "@/hooks/useBloomBackend"
import { MacGroup, MacGroupHeader, MacButton } from "@/components/mac/MacUIKit"
import { useToast } from "@/hooks/useToast"
import { cn } from "@/lib/utils"
import { localizeError } from "@/lib/i18n/localizeError"

type ShortcutId = "arm" | "pause" | "stop"

const EDITABLE: { id: ShortcutId; label: string }[] = [
  { id: "arm", label: sk.shortcuts.editable.arm },
  { id: "pause", label: sk.shortcuts.editable.pause },
  { id: "stop", label: sk.shortcuts.editable.stop },
]

function formatChord(key: string): string {
  return `⌘⇧${key.toUpperCase()}`
}

export function ShortcutsPanel() {
  const { settings, updateShortcuts } = useSettings()
  const { success: toastSuccess, error: toastError } = useToast()
  const [listening, setListening] = useState<ShortcutId | null>(null)
  const [saving, setSaving] = useState(false)

  const shortcuts = settings.shortcuts

  useEffect(() => {
    if (!listening) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === "Escape") {
        setListening(null)
        return
      }
      const letter = e.key.length === 1 ? e.key.toUpperCase() : ""
      if (!/^[A-Z]$/.test(letter)) return

      const next = { ...shortcuts, [listening]: letter }
      const values = [next.arm, next.pause, next.stop]
      if (new Set(values).size !== 3) {
        toastError({ title: sk.shortcuts.duplicate })
        setListening(null)
        return
      }

      setSaving(true)
      setGlobalShortcuts(next.arm, next.pause, next.stop)
        .then(() => {
          updateShortcuts(next)
          toastSuccess({ title: sk.shortcuts.saved, description: formatChord(letter) })
        })
        .catch((err) => {
          toastError({ title: sk.shortcuts.saveFailed, description: localizeError(err) })
        })
        .finally(() => {
          setSaving(false)
          setListening(null)
        })
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [listening, shortcuts, toastError, toastSuccess, updateShortcuts])

  return (
    <>
      <MacGroupHeader>{sk.shortcuts.title}</MacGroupHeader>
      <MacGroup>
        <div className="border-b border-border/60 px-4 py-3">
          <p className="text-[11px] text-muted-foreground">{sk.shortcuts.editableHint}</p>
        </div>
        <ul className="divide-y divide-border/40">
          {EDITABLE.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <span className="text-[13px] text-foreground">{item.label}</span>
              <MacButton
                variant="ghost"
                className={cn(
                  "!py-1 font-mono text-[11px]",
                  listening === item.id && "ring-2 ring-accent/40",
                )}
                disabled={saving}
                onClick={() => setListening(item.id)}
              >
                {listening === item.id ? sk.shortcuts.pressKey : formatChord(shortcuts[item.id])}
              </MacButton>
            </li>
          ))}
        </ul>

        {sk.shortcuts.sections
          .filter((s) => s.title !== "Nahrávanie")
          .map((section) => (
            <div key={section.title} className="border-t border-border/60">
              <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </p>
              <ul className="divide-y divide-border/40">
                {section.items.map((item) => (
                  <li
                    key={`${section.title}-${item.keys}`}
                    className="flex items-center justify-between gap-4 px-4 py-2.5"
                  >
                    <span className="text-[13px] text-foreground">{item.label}</span>
                    <kbd className="shrink-0 rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {item.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </MacGroup>
    </>
  )
}
