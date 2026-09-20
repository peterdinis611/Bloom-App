import { useState } from "react"
import { Newspaper, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { sk } from "@/lib/i18n/sk"
import { WHATS_NEW } from "@/lib/whatsNewContent"
import { PageScrollArea } from "@/components/layout/PageScrollArea"
import { MacPageHeader } from "@/components/mac/MacUIKit"
import { markNewsSeen } from "@/lib/whatsNew"

export function WhatsNewPage({ active = true }: { active?: boolean }) {
  const [selected, setSelected] = useState(WHATS_NEW[0]?.version ?? "")
  const item = WHATS_NEW.find((n) => n.version === selected) ?? WHATS_NEW[0]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <MacPageHeader
        eyebrow={sk.pageEyebrow.news}
        title={sk.news.title}
        subtitle={sk.news.subtitle}
      />

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-44 shrink-0 flex-col gap-0.5 border-r border-border/50 px-2 py-2 sm:flex">
          {WHATS_NEW.map((n) => {
            const on = n.version === selected
            return (
              <button
                key={n.version}
                type="button"
                onClick={() => {
                  setSelected(n.version)
                  void markNewsSeen(n.version)
                }}
                className={cn(
                  "rounded-lg px-2.5 py-2 text-left transition-colors",
                  on ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <p className="font-mono text-[11px] font-semibold">v{n.version}</p>
                <p className="mt-0.5 text-[10px] opacity-70">{n.date}</p>
              </button>
            )
          })}
        </nav>

        <PageScrollArea active={active}>
          <div className="news-hero bay-enter px-6 pb-8 pt-4">
            {item && (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                    {item.version === WHATS_NEW[0]?.version ? (
                      <Sparkles className="size-4" />
                    ) : (
                      <Newspaper className="size-4" />
                    )}
                  </span>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      v{item.version} · {item.date}
                    </p>
                    <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
                      {item.title}
                    </h2>
                  </div>
                </div>

                {item.body?.map((p) => (
                  <p key={p} className="mb-3 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                    {p}
                  </p>
                ))}

                <ul className="mt-4 space-y-2">
                  {item.highlights.map((h, i) => (
                    <li
                      key={h}
                      className="news-bullet flex gap-3 text-[13px] text-foreground"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                      {h}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </PageScrollArea>
      </div>
    </div>
  )
}
