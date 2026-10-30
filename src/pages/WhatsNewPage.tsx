import { useMemo, useState } from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMessages } from "@/lib/i18n/I18nProvider"
import { WHATS_NEW } from "@/lib/whatsNewContent"
import { PageScrollArea } from "@/components/layout/PageScrollArea"
import { markNewsSeen } from "@/lib/whatsNew"

function displayTitle(raw: string): string {
  return raw.replace(/^Bloom\s+[\d.]+\s*[—–-]\s*/i, "").trim() || raw
}

function formatDate(iso: string, locale: string): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
}

export function WhatsNewPage({ active = true }: { active?: boolean }) {
  const sk = useMessages()
  const [selected, setSelected] = useState(WHATS_NEW[0]?.version ?? "")
  const item = WHATS_NEW.find((n) => n.version === selected) ?? WHATS_NEW[0]
  const latest = WHATS_NEW[0]?.version
  const locale = typeof document !== "undefined" ? document.documentElement.lang || "sk" : "sk"

  const versions = useMemo(
    () => WHATS_NEW.map((n) => ({ value: n.version, label: `v${n.version}` })),
    [],
  )

  const select = (version: string) => {
    setSelected(version)
    void markNewsSeen(version)
  }

  return (
    <div className="news-page flex h-full min-h-0 flex-col overflow-hidden">
      <header className="news-page__header shrink-0 px-7 pb-1 pt-6 sm:px-10">
        <p className="page-eyebrow">{sk.pageEyebrow.news}</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-foreground sm:text-[32px]">
            {sk.news.title}
          </h1>
          {item && (
            <p className="pb-1 text-[13px] text-muted-foreground">
              {formatDate(item.date, locale)}
            </p>
          )}
        </div>
      </header>

      <div className="shrink-0 px-7 pb-4 pt-3 sm:px-10">
        <div className="news-versions" role="tablist" aria-label={sk.news.title}>
          {versions.map((v) => {
            const on = v.value === selected
            return (
              <button
                key={v.value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => select(v.value)}
                className={cn("news-versions__btn", on && "news-versions__btn--on")}
              >
                {v.label}
                {v.value === latest && on && (
                  <span className="news-versions__live" aria-hidden />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <PageScrollArea active={active} className="flex-1">
        {item && (
          <article key={item.version} className="news-sheet bay-enter mx-auto w-full max-w-[44rem] px-7 pb-14 pt-2 sm:px-10">
            <div className="news-sheet__meta">
              <span className="news-sheet__version">v{item.version}</span>
              {item.version === latest && (
                <span className="news-sheet__badge">{sk.news.latest}</span>
              )}
            </div>

            <h2 className="news-sheet__title">{displayTitle(item.title)}</h2>

            {item.body?.map((p) => (
              <p key={p} className="news-sheet__lead">
                {p}
              </p>
            ))}

            <section className="news-sheet__list" aria-label={sk.news.highlights}>
              <h3 className="news-sheet__list-label">{sk.news.highlights}</h3>
              <ul>
                {item.highlights.map((h, i) => (
                  <li
                    key={h}
                    className="news-sheet__row"
                    style={{ animationDelay: `${40 + i * 35}ms` }}
                  >
                    <span className="news-sheet__check" aria-hidden>
                      <Check className="size-3" strokeWidth={2.75} />
                    </span>
                    <span className="news-sheet__text">{h}</span>
                  </li>
                ))}
              </ul>
            </section>
          </article>
        )}
      </PageScrollArea>
    </div>
  )
}
