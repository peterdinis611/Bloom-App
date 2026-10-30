import { useState } from "react"
import {
  BookOpen,
  Clapperboard,
  FolderOpen,
  Keyboard,
  Library,
  Pencil,
  Settings2,
  Sparkles,
  Video,
  Wrench,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useMessages } from "@/lib/i18n/I18nProvider"
import { DOC_SECTIONS, type DocBlock } from "@/lib/docsContent"
import { PageScrollArea } from "@/components/layout/PageScrollArea"
import { MacPageHeader } from "@/components/mac/MacUIKit"

const SECTION_ICONS: Record<string, React.FC<{ className?: string }>> = {
  start: Sparkles,
  record: Video,
  draw: Pencil,
  library: Library,
  editor: Clapperboard,
  settings: Settings2,
  troubleshoot: Wrench,
}

function DocBlockView({ block, shortcutsLabel }: { block: DocBlock; shortcutsLabel: string }) {
  if (block.type === "p") {
    return (
      <p className="text-[14px] leading-[1.65] tracking-[-0.01em] text-muted-foreground">
        {block.text}
      </p>
    )
  }

  if (block.type === "ul") {
    return (
      <ul className="space-y-2.5">
        {block.items.map((item) => (
          <li key={item} className="flex gap-3 text-[14px] leading-snug text-foreground/90">
            <span className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    )
  }

  if (block.type === "table") {
    return (
      <div className="overflow-hidden rounded-[12px] bg-secondary/50">
        <table className="w-full min-w-[280px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-border/50">
              <th className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {block.headers[0]}
              </th>
              <th className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {block.headers[1]}
              </th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map(([a, b]) => (
              <tr key={a} className="border-b border-border/40 last:border-b-0">
                <td className="px-3.5 py-2.5 font-medium text-foreground">{a}</td>
                <td className="px-3.5 py-2.5 text-muted-foreground">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (block.type === "example") {
    return (
      <div className="docs-example rounded-[14px] p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <FolderOpen className="size-3.5" />
          </span>
          <p className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">
            {block.title}
          </p>
        </div>
        <ol className="space-y-2.5">
          {block.steps.map((step, i) => (
            <li key={step} className="flex gap-3 text-[13px] leading-snug text-foreground/90">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[12px] bg-secondary/50">
      <div className="flex items-center gap-2 border-b border-border/40 px-3.5 py-2">
        <Keyboard className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {shortcutsLabel}
        </span>
      </div>
      <div className="divide-y divide-border/40">
        {block.rows.map((row) => (
          <div key={row.keys} className="flex items-center justify-between gap-4 px-3.5 py-2.5">
            <span className="text-[13px] text-foreground">{row.label}</span>
            <kbd className="docs-kbd shrink-0 rounded-[7px] px-2 py-1 font-mono text-[11px] font-medium tracking-tight text-foreground">
              {row.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DocsPage({ active = true }: { active?: boolean }) {
  const sk = useMessages()
  const [sectionId, setSectionId] = useState(DOC_SECTIONS[0]?.id ?? "start")
  const section = DOC_SECTIONS.find((s) => s.id === sectionId) ?? DOC_SECTIONS[0]
  const Icon = SECTION_ICONS[section.id] ?? BookOpen

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <MacPageHeader
        eyebrow={sk.pageEyebrow.docs}
        title={sk.docs.title}
        subtitle={sk.docs.subtitle}
      />

      <div className="flex gap-1.5 overflow-x-auto px-6 pb-2 sm:hidden">
        {DOC_SECTIONS.map((s) => {
          const on = s.id === sectionId
          const TabIcon = SECTION_ICONS[s.id] ?? BookOpen
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSectionId(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors",
                on
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              <TabIcon className="size-3" />
              {s.title}
            </button>
          )
        })}
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="docs-toc hidden w-[13.5rem] shrink-0 flex-col gap-0.5 px-3 py-3 sm:flex">
          <p className="mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/65">
            {sk.docs.contents}
          </p>
          {DOC_SECTIONS.map((s) => {
            const on = s.id === sectionId
            const TabIcon = SECTION_ICONS[s.id] ?? BookOpen
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSectionId(s.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] transition-colors",
                  on
                    ? "bg-secondary font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:bg-secondary/55 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg",
                    on ? "bg-primary/12 text-primary" : "bg-background/60 text-muted-foreground",
                  )}
                >
                  <TabIcon className="size-3.5" />
                </span>
                {s.title}
              </button>
            )
          })}
        </nav>

        <PageScrollArea active={active} className="flex-1 pb-10">
          <article key={section.id} className="docs-article bay-enter mx-auto max-w-2xl px-6 pt-2">
            <header className="mb-7">
              <div className="mb-4 flex size-11 items-center justify-center rounded-[14px] bg-secondary text-primary">
                <Icon className="size-5" />
              </div>
              <h2 className="text-[26px] font-semibold tracking-[-0.028em] text-foreground sm:text-[28px]">
                {section.title}
              </h2>
              {section.blurb && (
                <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-muted-foreground">
                  {section.blurb}
                </p>
              )}
            </header>

            <div className="space-y-6">
              {section.blocks.map((block, i) => (
                <DocBlockView
                  key={`${section.id}-${i}`}
                  block={block}
                  shortcutsLabel={sk.docs.shortcutsLabel}
                />
              ))}
            </div>

            <p className="mt-10 text-[11px] leading-relaxed text-muted-foreground/65">
              {sk.docs.footer}
            </p>
          </article>
        </PageScrollArea>
      </div>
    </div>
  )
}
