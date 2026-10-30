import { useState } from "react"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMessages } from "@/lib/i18n/I18nProvider"
import { WHATS_NEW } from "@/lib/whatsNewContent"
import { PageScrollArea } from "@/components/layout/PageScrollArea"
import { MacPageHeader } from "@/components/mac/MacUIKit"
import { markNewsSeen } from "@/lib/whatsNew"

export function WhatsNewPage({ active = true }: { active?: boolean }) {
  const sk = useMessages()
  const [selected, setSelected] = useState(WHATS_NEW[0]?.version ?? "")
  const item = WHATS_NEW.find((n) => n.version === selected) ?? WHATS_NEW[0]
  const latest = WHATS_NEW[0]?.version

  const select = (version: string) => {
    setSelected(version)
    void markNewsSeen(version)
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <MacPageHeader
        eyebrow={sk.pageEyebrow.news}
        title={sk.news.title}
        subtitle={sk.news.subtitle}
      />

      {/* Mobile version strip */}
      <div className="flex gap-1.5 overflow-x-auto px-6 pb-2 sm:hidden">
        {WHATS_NEW.map((n) => {
          const on = n.version === selected
          return (
            <button
              key={n.version}
              type="button"
              onClick={() => select(n.version)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold tabular-nums transition-colors",
                on
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              v{n.version}
            </button>
          )
        })}
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="news-rail hidden w-[11.5rem] shrink-0 flex-col px-3 py-3 sm:flex">
          {WHATS_NEW.map((n, i) => {
            const on = n.version === selected
            const isLatest = n.version === latest
            return (
              <button
                key={n.version}
                type="button"
                onClick={() => select(n.version)}
                className={cn(
                  "news-rail__item relative flex gap-3 rounded-[10px] px-2 py-2.5 text-left transition-colors",
                  on ? "bg-secondary" : "hover:bg-secondary/60",
                  i < WHATS_NEW.length - 1 && "news-rail__item--line",
                )}
              >
                <span
                  className={cn(
                    "news-rail__dot mt-1.5 size-2 shrink-0 rounded-full",
                    on ? "bg-primary" : "bg-border",
                  )}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "font-mono text-[12px] font-semibold tabular-nums tracking-tight",
                        on ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      v{n.version}
                    </span>
                    {isLatest && (
                      <span className="rounded-md bg-primary/12 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                        {sk.news.latest}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{n.date}</span>
                </span>
              </button>
            )
          })}
        </nav>

        <PageScrollArea active={active} className="flex-1">
          {item && (
            <article key={item.version} className="news-article bay-enter mx-auto max-w-2xl px-6 pb-12 pt-2">
              <header className="mb-8">
                <div className="mb-4 flex items-center gap-2">
                  {item.version === latest ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-semibold text-primary">
                      <Sparkles className="size-3" />
                      {sk.news.latest}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {sk.news.release}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground/50">·</span>
                  <time className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {item.date}
                  </time>
                </div>

                <h2 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] text-foreground sm:text-[32px]">
                  {item.title.replace(/^Bloom\s+[\d.]+\s*[—–-]\s*/i, "") || item.title}
                </h2>
                <p className="mt-2 font-mono text-[12px] text-muted-foreground">
                  Bloom v{item.version}
                </p>

                {item.body?.map((p) => (
                  <p
                    key={p}
                    className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground"
                  >
                    {p}
                  </p>
                ))}
              </header>

              <div className="news-features">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                  {sk.news.highlights}
                </p>
                <ul className="flex flex-col">
                  {item.highlights.map((h, i) => (
                    <li
                      key={h}
                      className="news-feature flex gap-4 border-t border-border/60 py-3.5 first:border-t-0"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <span className="mt-0.5 w-6 shrink-0 font-mono text-[12px] font-medium tabular-nums text-primary/80">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[14px] leading-snug tracking-[-0.01em] text-foreground">
                        {h}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          )}
        </PageScrollArea>
      </div>
    </div>
  )
}
