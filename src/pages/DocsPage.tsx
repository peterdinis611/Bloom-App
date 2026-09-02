import { useState } from "react"
import { BookOpen, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { sk } from "@/lib/i18n/sk"
import { DOC_SECTIONS, type DocBlock } from "@/lib/docsContent"
import { PageScrollArea } from "@/components/layout/PageScrollArea"
import { MacGroup, MacPageHeader } from "@/components/mac/MacUIKit"

function DocBlockView({ block }: { block: DocBlock }) {
  if (block.type === "p") {
    return <p className="text-[13px] leading-relaxed text-muted-foreground">{block.text}</p>
  }
  if (block.type === "ul") {
    return (
      <ul className="list-inside list-disc space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    )
  }
  if (block.type === "table") {
    return (
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full min-w-[280px] text-left text-[12px]">
          <thead>
            <tr className="border-b border-border/60 bg-secondary/40">
              <th className="px-3 py-2 font-semibold text-foreground">{block.headers[0]}</th>
              <th className="px-3 py-2 font-semibold text-foreground">{block.headers[1]}</th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map(([a, b]) => (
              <tr key={a} className="border-b border-border/40 last:border-b-0">
                <td className="px-3 py-2 font-medium text-foreground">{a}</td>
                <td className="px-3 py-2 text-muted-foreground">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <div className="divide-y divide-border/50 rounded-xl border border-border/60 bg-secondary/20">
      {block.rows.map((row) => (
        <div key={row.keys} className="flex items-center justify-between gap-4 px-3 py-2">
          <span className="text-[13px] text-foreground">{row.label}</span>
          <kbd className="shrink-0 rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            {row.keys}
          </kbd>
        </div>
      ))}
    </div>
  )
}

export function DocsPage({ active = true }: { active?: boolean }) {
  const [sectionId, setSectionId] = useState(DOC_SECTIONS[0]?.id ?? "start")
  const section = DOC_SECTIONS.find((s) => s.id === sectionId) ?? DOC_SECTIONS[0]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <MacPageHeader
        eyebrow={sk.pageEyebrow.docs}
        title={sk.docs.title}
        subtitle={sk.docs.subtitle}
      />

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-52 shrink-0 flex-col gap-0.5 border-r border-border/50 px-2 py-2 sm:flex">
          {DOC_SECTIONS.map((s) => {
            const activeSection = s.id === sectionId
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSectionId(s.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                  activeSection
                    ? "bg-[var(--sidebar-active)] font-medium text-foreground"
                    : "text-muted-foreground hover:bg-[var(--sidebar-hover)] hover:text-foreground",
                )}
              >
                <ChevronRight className={cn("size-3.5 shrink-0", activeSection ? "text-accent" : "opacity-40")} />
                {s.title}
              </button>
            )
          })}
        </nav>

        <PageScrollArea active={active} className="flex-1 pb-8">
          <div className="mb-4 flex gap-2 overflow-x-auto sm:hidden">
            {DOC_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSectionId(s.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors",
                  s.id === sectionId
                    ? "border-accent/40 bg-accent/10 text-foreground"
                    : "border-border/60 text-muted-foreground",
                )}
              >
                {s.title}
              </button>
            ))}
          </div>

          <article className="max-w-2xl space-y-5 px-6">
            <header className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <BookOpen className="size-4" />
              </span>
              <h2 className="font-display text-xl font-bold tracking-tight">{section.title}</h2>
            </header>

            <MacGroup className="!mx-0 space-y-4 p-4">
              {section.blocks.map((block, i) => (
                <DocBlockView key={`${section.id}-${i}`} block={block} />
              ))}
            </MacGroup>

            <p className="text-[11px] text-muted-foreground/70">
              {sk.docs.footer}
            </p>
          </article>
        </PageScrollArea>
      </div>
    </div>
  )
}
