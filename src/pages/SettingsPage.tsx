import { Palette, Paintbrush, Video, RotateCcw, MousePointer2, Sparkles, Keyboard } from "lucide-react"
import { cn } from "@/lib/utils"
import { THEMES, type ThemeId } from "@/lib/themes"
import { ANNOTATION_COLORS, useSettings, type AnnotationTool } from "@/hooks/useSettings"
import type { PipPosition, PipSize } from "@/lib/capture"
import { PresetEditor } from "@/components/settings/PresetEditor"

const TOOLS: { id: AnnotationTool; label: string }[] = [
  { id: "pen", label: "Pen" },
  { id: "highlighter", label: "Highlighter" },
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
  { id: "rect", label: "Rectangle" },
  { id: "circle", label: "Circle" },
]

function Section({ icon: Icon, title, children }: {
  icon: React.FC<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-[var(--surface)] p-4">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/12">
          <Icon className="size-4 text-primary" />
        </div>
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function ToggleDot({ on }: { on: boolean }) {
  return (
    <div className={cn(
      "ml-3 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
      on ? "bg-primary" : "bg-secondary",
    )}>
      <div className={cn(
        "size-5 rounded-full bg-white shadow transition-transform",
        on ? "translate-x-5" : "translate-x-0",
      )} />
    </div>
  )
}

function MiniOptionGroup<T extends string>({ label, options, value, onChange }: {
  label: string; options: { v: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">{label}</span>
      <div className="flex rounded-xl border border-border/60 bg-card p-1">
        {options.map((o) => (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-semibold transition-all",
              o.v === value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SettingsPage() {
  const { settings, setTheme, updateAnnotation, updateRecording, resetSettings } = useSettings()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border/40 px-5 py-4">
        <h1 className="text-lg font-black tracking-tight text-foreground">Settings</h1>
        <p className="text-xs text-muted-foreground">Appearance, drawing defaults &amp; recording</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        {/* Themes */}
        <Section icon={Palette} title="Theme">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {THEMES.map((t) => {
              const active = settings.theme === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id as ThemeId)}
                  className={cn(
                    "group flex flex-col gap-2 rounded-xl border p-3 text-left transition-all active:scale-[0.98]",
                    active
                      ? "border-primary/60 bg-primary/10 ring-1 ring-primary/25"
                      : "border-border/60 bg-card hover:border-border hover:bg-[var(--surface-hover)]",
                  )}
                >
                  <div
                    className="h-10 w-full rounded-lg border border-border/40"
                    style={{ background: `linear-gradient(135deg, ${t.swatch[0]} 0%, ${t.swatch[1]} 100%)` }}
                  />
                  <div>
                    <p className={cn("text-xs font-bold", active ? "text-primary" : "text-foreground")}>{t.name}</p>
                    <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{t.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </Section>

        {/* Drawing defaults */}
        <Section icon={Paintbrush} title="Drawing defaults">
          <div className="flex flex-col gap-3">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Default colour</label>
            <div className="flex flex-wrap gap-2">
              {ANNOTATION_COLORS.map((c) => (
                <button
                  key={c.id}
                  title={c.label}
                  onClick={() => updateAnnotation({ defaultColor: c.hex })}
                  className={cn(
                    "size-8 rounded-full border-2 transition-all hover:scale-110",
                    settings.annotation.defaultColor === c.hex
                      ? "border-primary scale-110 shadow-md ring-2 ring-primary/30"
                      : "border-border/60",
                  )}
                  style={{ background: c.hex }}
                />
              ))}
            </div>

            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Stroke width</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={12}
                value={settings.annotation.defaultWidth}
                onChange={(e) => updateAnnotation({ defaultWidth: Number(e.target.value) })}
                className="flex-1 accent-primary"
              />
              <span className="w-6 text-center font-mono text-sm font-bold tabular-nums text-foreground">
                {settings.annotation.defaultWidth}
              </span>
            </div>

            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Default tool</label>
            <div className="flex flex-wrap gap-1.5">
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => updateAnnotation({ defaultTool: t.id })}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                    settings.annotation.defaultTool === t.id
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Recording defaults */}
        <Section icon={Video} title="Recording defaults">
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Quality</span>
              <div className="flex rounded-xl border border-border/60 bg-card p-1">
                {(["720p", "1080p"] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => updateRecording({ defaultQuality: q })}
                    className={cn(
                      "flex-1 rounded-lg py-2 text-xs font-semibold transition-all",
                      settings.recording.defaultQuality === q
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Countdown</span>
              <div className="flex rounded-xl border border-border/60 bg-card p-1">
                {([0, 3, 5] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => updateRecording({ defaultCountdown: c })}
                    className={cn(
                      "flex-1 rounded-lg py-2 text-xs font-semibold transition-all",
                      settings.recording.defaultCountdown === c
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {c === 0 ? "Off" : `${c}s`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => updateRecording({ minimizeOnRecord: !settings.recording.minimizeOnRecord })}
            className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-3.5 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
          >
            <div>
              <p className="text-xs font-bold text-foreground">Hide window when recording</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Minimizes Bloom after you pick a screen — a small HUD stays for stop/pause.
              </p>
            </div>
            <div className={cn(
              "ml-3 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
              settings.recording.minimizeOnRecord ? "bg-primary" : "bg-secondary",
            )}>
              <div className={cn(
                "size-5 rounded-full bg-white shadow transition-transform",
                settings.recording.minimizeOnRecord ? "translate-x-5" : "translate-x-0",
              )} />
            </div>
          </button>

          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border/60 bg-card px-3.5 py-3">
            <div className="flex items-center gap-2">
              <Keyboard className="size-4 text-muted-foreground" />
              <p className="text-xs font-bold text-foreground">Global shortcuts</p>
            </div>
            <div className="grid grid-cols-1 gap-1.5 text-[11px] text-muted-foreground">
              <p><span className="font-mono text-foreground/80">⌘⇧R</span> — focus &amp; arm recording</p>
              <p><span className="font-mono text-foreground/80">⌘⇧P</span> — pause / resume</p>
              <p><span className="font-mono text-foreground/80">⌘⇧S</span> — stop &amp; save</p>
            </div>
            <p className="text-[10px] text-muted-foreground/70">Tray icon in menu bar: Start, Pause, Stop without opening the window.</p>
          </div>
        </Section>

        {/* Webcam & cursor defaults */}
        <Section icon={Sparkles} title="Capture extras">
          <button
            type="button"
            onClick={() => updateRecording({ cursorHighlight: !settings.recording.cursorHighlight })}
            className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-3.5 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
          >
            <div className="flex items-center gap-2.5">
              <MousePointer2 className="size-4 text-primary" />
              <div>
                <p className="text-xs font-bold text-foreground">Cursor spotlight by default</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Orange ring + click animation during recording</p>
              </div>
            </div>
            <ToggleDot on={settings.recording.cursorHighlight} />
          </button>
          <button
            type="button"
            onClick={() => updateRecording({ cameraBlur: !settings.recording.cameraBlur })}
            className="mt-2 flex items-center justify-between rounded-xl border border-border/60 bg-card px-3.5 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="size-4 text-primary" />
              <div>
                <p className="text-xs font-bold text-foreground">Camera blur by default</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Soft background for PiP and camera-only mode</p>
              </div>
            </div>
            <ToggleDot on={settings.recording.cameraBlur} />
          </button>
          <div className="mt-3 flex gap-3">
            <MiniOptionGroup label="Default PiP size" value={settings.recording.pipSize}
              options={[{ v: "small" as PipSize, label: "S" }, { v: "medium" as PipSize, label: "M" }, { v: "large" as PipSize, label: "L" }]}
              onChange={(v) => updateRecording({ pipSize: v })}
            />
            <MiniOptionGroup label="Default PiP position" value={settings.recording.pipPosition}
              options={[
                { v: "bottom-right" as PipPosition, label: "BR" },
                { v: "bottom-left" as PipPosition, label: "BL" },
                { v: "top-right" as PipPosition, label: "TR" },
                { v: "top-left" as PipPosition, label: "TL" },
              ]}
              onChange={(v) => updateRecording({ pipPosition: v })}
            />
          </div>
        </Section>

        {/* Presets */}
        <Section icon={Video} title="Recording presets">
          <PresetEditor
            presets={settings.recording.presets}
            onChange={(presets) => updateRecording({ presets })}
          />
        </Section>

        {/* Auto-stop */}
        <Section icon={Video} title="Auto-stop">
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Max duration (minutes, 0 = off)</span>
              <input
                type="number"
                min={0}
                max={240}
                value={Math.round(settings.recording.maxDurationSecs / 60) || ""}
                placeholder="0"
                onChange={(e) => updateRecording({ maxDurationSecs: Math.max(0, Number(e.target.value) || 0) * 60 })}
                className="rounded-xl border border-border/60 bg-card px-3 py-2 text-sm outline-none focus:border-primary/40"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Idle timeout (minutes, 0 = off)</span>
              <input
                type="number"
                min={0}
                max={60}
                value={Math.round(settings.recording.idleStopSecs / 60) || ""}
                placeholder="0"
                onChange={(e) => updateRecording({ idleStopSecs: Math.max(0, Number(e.target.value) || 0) * 60 })}
                className="rounded-xl border border-border/60 bg-card px-3 py-2 text-sm outline-none focus:border-primary/40"
              />
              <p className="text-[10px] text-muted-foreground">Stops recording after no mouse or keyboard activity.</p>
            </label>
          </div>
        </Section>

        <button
          onClick={resetSettings}
          className="flex items-center justify-center gap-2 rounded-xl border border-border/60 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <RotateCcw className="size-4" />
          Reset to defaults
        </button>
      </div>
    </div>
  )
}
