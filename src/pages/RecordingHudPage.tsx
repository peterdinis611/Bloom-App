import { useEffect, useState } from "react"
import { Square, Pause, Play } from "lucide-react"
import { emit, listen } from "@tauri-apps/api/event"
import { cn, formatDuration } from "@/lib/utils"
import { applyTheme, readStoredSettings } from "@/hooks/useSettings"

type HudPhase = "countdown" | "recording" | "paused"

export function RecordingHudPage() {
  const stored = readStoredSettings()
  applyTheme(stored.theme)

  const [phase, setPhase] = useState<HudPhase>("countdown")
  const [countdown, setCountdown] = useState(3)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    document.documentElement.style.background = "transparent"
    document.body.style.background = "transparent"
    document.body.style.setProperty("--background", "transparent")
  }, [])

  // Sync state from main window.
  useEffect(() => {
    const unsubs: Array<() => void> = []
    listen<{ phase: HudPhase; countdown?: number; elapsed?: number }>("hud-sync", (e) => {
      setPhase(e.payload.phase)
      if (e.payload.countdown !== undefined) setCountdown(e.payload.countdown)
      if (e.payload.elapsed !== undefined) setElapsed(e.payload.elapsed)
    }).then((fn) => unsubs.push(fn))
    listen<{ elapsed: number }>("hud-tick", (e) => {
      setElapsed(e.payload.elapsed)
      setPhase("recording")
    }).then((fn) => unsubs.push(fn))
    return () => unsubs.forEach((fn) => fn())
  }, [])

  return (
    <div
      className="flex h-screen w-screen items-center justify-center p-1"
      style={{ background: "transparent" }}
    >
      <div className="annot-dock flex items-center gap-2 rounded-2xl px-3 py-2 shadow-2xl">
        {phase === "countdown" ? (
          <>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Start</span>
            <span className="count-pop font-mono text-2xl font-black tabular-nums text-primary">{countdown}</span>
          </>
        ) : (
          <>
            <span className={cn("rec-dot size-2 shrink-0 rounded-full", phase === "paused" ? "bg-amber-400" : "bg-red-500")} />
            <span className="font-mono text-sm font-bold tabular-nums text-foreground">
              {formatDuration(elapsed)}
            </span>
            {phase === "recording" ? (
              <button
                onClick={() => emit("hud-pause")}
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="Pause"
              >
                <Pause className="size-3.5" />
              </button>
            ) : (
              <button
                onClick={() => emit("hud-resume")}
                className="flex size-8 items-center justify-center rounded-lg text-amber-400 transition-colors hover:bg-amber-500/15"
                title="Resume"
              >
                <Play className="size-3.5" />
              </button>
            )}
            <button
              onClick={() => emit("hud-stop")}
              className="flex size-8 items-center justify-center rounded-lg bg-red-600 text-white transition-colors hover:bg-red-500"
              title="Stop & save"
            >
              <Square className="size-3 fill-current" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
