import { sk } from "@/lib/i18n/sk"
import { MacGroup, MacGroupHeader } from "@/components/mac/MacUIKit"

export function ShortcutsPanel() {
  return (
    <>
      <MacGroupHeader>{sk.shortcuts.title}</MacGroupHeader>
      <MacGroup>
        {sk.shortcuts.sections.map((section) => (
          <div key={section.title} className="border-b border-border/60 last:border-b-0">
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
