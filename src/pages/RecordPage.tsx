import { useState, useEffect, useRef, useCallback } from "react"
import {
  Monitor,
  MonitorDot,
  Camera,
  Layers,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Video,
  Square,
  Pause,
  Play,
  ChevronDown,
  CheckCircle2,
  LayoutGrid,
  AppWindow,
  ChevronRight,
  Pencil,
  FolderOpen,
  X,
} from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { cn, formatDuration } from "@/lib/utils"
import type { RecordingSettings, RecordingSource, RecordingStatus, ScreenTarget } from "@/types"

// ── Mock screen / window targets ─────────────────────────────────────────────
const SCREEN_TARGETS: ScreenTarget[] = [
  { id: "screen-1", label: "Built-in Retina Display", type: "screen", index: 1 },
  { id: "screen-2", label: "External Monitor",        type: "screen", index: 2 },
  { id: "win-1",    label: "Google Chrome",           type: "window", appName: "Chrome"   },
  { id: "win-2",    label: "Visual Studio Code",      type: "window", appName: "VSCode"   },
  { id: "win-3",    label: "Figma",                   type: "window", appName: "Figma"    },
  { id: "win-4",    label: "Terminal",                type: "window", appName: "Terminal" },
]

// ── Annotation window helper ──────────────────────────────────────────────────
let annotateWin: WebviewWindow | null = null

async function openAnnotateWindow() {
  try {
    if (annotateWin) {
      await annotateWin.show()
      await annotateWin.setFocus()
      return
    }
    annotateWin = new WebviewWindow("annotate", {
      url: "index.html#annotate",
      transparent: true,
      fullscreen: true,
      alwaysOnTop: true,
      decorations: false,
      skipTaskbar: true,
      resizable: false,
    })
    annotateWin.once("tauri://error", () => { annotateWin = null })
  } catch {
    annotateWin = null
  }
}

async function closeAnnotateWindow() {
  try { await annotateWin?.hide() } catch {}
}

// ── Screen picker ─────────────────────────────────────────────────────────────
function ScreenPicker({ value, onChange }: { value: ScreenTarget; onChange: (t: ScreenTarget) => void }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab]   = useState<"screen" | "window">("screen")
  const ref             = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  const filtered = SCREEN_TARGETS.filter((t) => t.type === tab)

  return (
    <div ref={ref} className="relative w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left text-sm transition-all",
          open
            ? "border-orange-500/50 bg-orange-500/5 ring-1 ring-orange-500/20"
            : "border-border bg-[var(--surface)] hover:border-border/80 hover:bg-[var(--surface-hover)]"
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/15">
            {value.type === "screen"
              ? <Monitor className="size-4 text-orange-400" />
              : <AppWindow className="size-4 text-orange-400" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{value.label}</p>
            <p className="text-xs text-muted-foreground">
              {value.type === "screen" ? `Display ${value.index}` : "Window"}
            </p>
          </div>
        </div>
        <ChevronDown className={cn("size-4 text-muted-foreground shrink-0 transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="fade-up absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/70 z-50">
          <div className="flex border-b border-border">
            {(["screen", "window"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors",
                  tab === t ? "border-b-2 border-orange-500 text-orange-400" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "screen" ? <><LayoutGrid className="size-3.5" /> Screens</> : <><AppWindow className="size-3.5" /> Windows</>}
              </button>
            ))}
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.map((target) => {
              const active = value.id === target.id
              return (
                <button
                  key={target.id}
                  onClick={() => { onChange(target); setOpen(false) }}
                  className={cn(
                    "flex w-full items-center gap-3 px-3.5 py-2.5 text-sm transition-colors hover:bg-secondary",
                    active && "bg-orange-500/8"
                  )}
                >
                  <div className={cn(
                    "flex h-10 w-16 shrink-0 items-center justify-center rounded-lg border",
                    active ? "border-orange-500/40 bg-orange-500/10" : "border-border/50 bg-secondary/80"
                  )}>
                    {target.type === "screen"
                      ? <Monitor className={cn("size-5", active ? "text-orange-400" : "text-muted-foreground/40")} />
                      : <AppWindow className={cn("size-5", active ? "text-orange-400" : "text-muted-foreground/40")} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate font-semibold text-sm", active ? "text-orange-300" : "text-foreground")}>
                      {target.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {target.type === "screen" ? `Display ${target.index}` : target.appName}
                    </p>
                  </div>
                  {active && <CheckCircle2 className="size-4 shrink-0 text-orange-400" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Audio toggle ───────────────────────────────────────────────────────────────
function AudioToggle({ active, onIcon: OnIcon, offIcon: OffIcon, label, onChange }: {
  active: boolean; onIcon: React.FC<{ className?: string }>; offIcon: React.FC<{ className?: string }>
  label: string; onChange: () => void
}) {
  const Icon = active ? OnIcon : OffIcon
  return (
    <button
      onClick={onChange}
      className={cn(
        "flex flex-1 items-center gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-medium transition-all",
        active
          ? "border-orange-500/40 bg-orange-500/10 text-orange-300"
          : "border-border/60 bg-[var(--surface)] text-muted-foreground hover:border-border hover:text-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      <div className={cn("flex h-5 w-9 items-center rounded-full p-0.5 transition-colors", active ? "bg-orange-500" : "bg-secondary")}>
        <div className={cn("size-4 rounded-full bg-white shadow-sm transition-transform", active ? "translate-x-4" : "translate-x-0")} />
      </div>
    </button>
  )
}

// ── Option group ───────────────────────────────────────────────────────────────
function OptionGroup<T extends string>({ label, options, value, onChange }: {
  label: string; options: { v: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">{label}</span>
      <div className="flex rounded-xl border border-border/60 bg-[var(--surface)] p-1">
        {options.map((o) => (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={cn(
              "flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-all",
              o.v === value ? "bg-secondary text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Preview canvas ─────────────────────────────────────────────────────────────
function PreviewCanvas({ source, status, elapsed, countdown }: {
  source: RecordingSource; status: RecordingStatus; elapsed: number; countdown: number
}) {
  const isRecording = status === "recording"
  const isPaused    = status === "paused"
  const isActive    = isRecording || isPaused

  return (
    <div className={cn(
      "relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl transition-all duration-500",
      isRecording ? "border-2 border-red-500/70 glow-red" : "border border-border/50 glow-orange"
    )}>
      <div className="absolute inset-0">
        <div className={cn("absolute inset-0 transition-opacity duration-700", isRecording ? "opacity-100" : "opacity-0")}
          style={{ background: "radial-gradient(ellipse 80% 70% at 50% 50%, rgba(239,68,68,0.06) 0%, transparent 70%)" }}
        />
        <div className="absolute inset-0" style={{
          background: source === "camera"
            ? "radial-gradient(ellipse 120% 100% at 30% 80%, rgba(16,185,129,0.10) 0%, transparent 60%)"
            : "radial-gradient(ellipse 120% 100% at 30% 80%, rgba(234,88,12,0.10) 0%, transparent 60%), radial-gradient(ellipse 80% 80% at 80% 20%, rgba(249,115,22,0.07) 0%, transparent 60%)",
        }} />
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: "radial-gradient(circle, rgba(249,115,22,0.9) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }} />
        {status === "idle" && <div className="absolute inset-0 shimmer" />}
      </div>

      {status === "idle" && (
        <div className="relative flex flex-col items-center gap-4">
          <div className={cn(
            "flex items-center justify-center rounded-2xl border",
            source === "camera" ? "size-20 border-emerald-500/20 bg-emerald-500/10" : "size-20 border-orange-500/20 bg-orange-500/10"
          )}>
            {source === "screen" && <MonitorDot className="size-10 text-orange-400/60" />}
            {source === "camera" && <Camera     className="size-10 text-emerald-400/60" />}
            {source === "both"   && <Layers     className="size-10 text-orange-400/60" />}
          </div>
          <p className="text-sm text-muted-foreground/50 font-medium">
            {source === "screen" ? "Screen capture ready" : source === "camera" ? "Camera preview" : "Screen + camera"}
          </p>
        </div>
      )}

      {status === "countdown" && (
        <div className="relative flex flex-col items-center gap-4">
          <div key={countdown} className="count-pop flex size-24 items-center justify-center rounded-full border-2 border-orange-500/40 bg-orange-500/10 shadow-xl shadow-orange-500/15">
            <span className="text-6xl font-black text-orange-300 tabular-nums">{countdown}</span>
          </div>
          <p className="text-sm font-medium text-muted-foreground">Starting soon…</p>
        </div>
      )}

      {isActive && (
        <div className="relative flex flex-col items-center gap-3">
          <div className={cn(
            "font-mono tabular-nums font-black tracking-tight text-5xl",
            isPaused ? "text-amber-300 opacity-70" : "text-white"
          )}>
            {formatDuration(elapsed)}
          </div>
          {isPaused && <span className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Paused</span>}
          {isRecording && (
            <div className="flex items-end gap-0.5 h-7">
              {[3,5,9,6,4,8,5,3,7,4,6,3].map((h, i) => (
                <div key={i} className="w-0.5 rounded-full bg-red-400/70" style={{
                  height: `${h * 2.5}px`,
                  animation: `rec-pulse ${0.5 + i * 0.08}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 55}ms`,
                }} />
              ))}
            </div>
          )}
        </div>
      )}

      {status === "processing" && (
        <div className="relative flex flex-col items-center gap-4">
          <div className="relative flex size-16 items-center justify-center">
            <div className="absolute size-16 animate-spin rounded-full border-2 border-transparent border-t-orange-500" />
            <div className="size-10 rounded-full border border-border/60 bg-[var(--surface)]" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Saving to ~/Movies/Bloom…</p>
        </div>
      )}

      {status === "done" && (
        <div className="relative fade-up flex flex-col items-center gap-3">
          <div className="flex size-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 shadow-lg shadow-emerald-500/10">
            <CheckCircle2 className="size-8 text-emerald-400" />
          </div>
          <p className="text-sm font-semibold text-emerald-300">Saved!</p>
        </div>
      )}

      {isRecording && (
        <div className="absolute top-4 left-4 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 backdrop-blur-md">
          <span className="rec-dot size-2.5 rounded-full bg-red-500" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">Rec</span>
        </div>
      )}

      {source === "both" && status === "idle" && (
        <div className="absolute bottom-4 right-4 flex size-12 items-center justify-center rounded-xl border border-border/40 bg-black/40 backdrop-blur-sm">
          <Camera className="size-5 text-white/30" />
        </div>
      )}
    </div>
  )
}

// ── Save location banner ───────────────────────────────────────────────────────
function SaveBanner({ path, onDismiss }: { path: string; onDismiss: () => void }) {
  return (
    <div className="fade-up flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3.5 py-3">
      <FolderOpen className="size-4 shrink-0 text-emerald-400" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-emerald-300">Recordings saved to</p>
        <p className="truncate text-[11px] text-muted-foreground font-mono">{path}</p>
      </div>
      <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
interface RecordPageProps {
  onRecordingChange?: (active: boolean) => void
}

export function RecordPage({ onRecordingChange }: RecordPageProps) {
  const [settings, setSettings] = useState<RecordingSettings>({
    source: "screen",
    screenTarget: SCREEN_TARGETS[0],
    microphone: true,
    systemAudio: false,
    quality: "1080p",
    countdown: 3,
  })

  const [status,    setStatus]    = useState<RecordingStatus>("idle")
  const [elapsed,   setElapsed]   = useState(0)
  const [countdown, setCountdown] = useState(0)
  const [bloomDir,  setBloomDir]  = useState<string | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [annotating, setAnnotating] = useState(false)

  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const mediaRef     = useRef<MediaRecorder | null>(null)
  const chunksRef    = useRef<Blob[]>([])
  const streamRef    = useRef<MediaStream | null>(null)

  // Fetch save dir on mount
  useEffect(() => {
    invoke<string>("get_bloom_dir")
      .then((dir) => { setBloomDir(dir); setShowBanner(true) })
      .catch(() => setBloomDir("~/Movies/Bloom"))
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const isActive   = status === "recording" || status === "paused"
  const isBusy     = status === "countdown" || status === "processing" || status === "done"
  const showConfig = !isActive && !isBusy
  const needsScreen = settings.source === "screen" || settings.source === "both"

  // ── Recording helpers ───────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  async function captureScreen(): Promise<MediaStream | null> {
    try {
      const constraints: DisplayMediaStreamOptions = {
        video: { frameRate: settings.quality === "1080p" ? 30 : 24 } as MediaTrackConstraints,
        audio: settings.systemAudio,
      }
      const screenStream = await navigator.mediaDevices.getDisplayMedia(constraints)

      if (settings.microphone) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          const combined  = new MediaStream([
            ...screenStream.getTracks(),
            ...micStream.getAudioTracks(),
          ])
          return combined
        } catch {
          return screenStream
        }
      }
      return screenStream
    } catch {
      return null
    }
  }

  async function startCapture() {
    const stream = await captureScreen()
    if (!stream) return false
    streamRef.current = stream
    chunksRef.current = []

    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" })
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.start(500)
    mediaRef.current = recorder
    return true
  }

  async function saveCapture() {
    const chunks  = chunksRef.current
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    mediaRef.current  = null

    if (!chunks.length) return
    const blob     = new Blob(chunks, { type: "video/webm" })
    const filename = `recording-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`

    // Convert to base64 for Rust command
    const buffer  = await blob.arrayBuffer()
    const bytes   = new Uint8Array(buffer)
    let b64 = ""
    const chunk   = 8192
    for (let i = 0; i < bytes.length; i += chunk) {
      b64 += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    const data_b64 = btoa(b64)

    try {
      await invoke("save_recording", { filename, data_b64 })
    } catch {
      // fallback: browser download
      const url = URL.createObjectURL(blob)
      const a   = document.createElement("a")
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  // ── State machine ───────────────────────────────────────────────────────────
  function startCountdown() {
    if (settings.countdown === 0) { doStartRecording(); return }
    setCountdown(settings.countdown)
    setStatus("countdown")
    const tick = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(tick); doStartRecording(); return 0 }
        return c - 1
      })
    }, 1000)
  }

  async function doStartRecording() {
    const ok = await startCapture()
    if (!ok) { setStatus("idle"); return }
    setStatus("recording")
    setElapsed(0)
    onRecordingChange?.(true)
    startTimer()
  }

  function pauseRecording() {
    stopTimer()
    mediaRef.current?.pause()
    setStatus("paused")
  }

  function resumeRecording() {
    mediaRef.current?.resume()
    setStatus("recording")
    startTimer()
  }

  async function stopRecording() {
    stopTimer()
    setAnnotating(false)
    closeAnnotateWindow()
    onRecordingChange?.(false)
    setStatus("processing")

    // Wait for final chunk
    await new Promise<void>((res) => {
      if (!mediaRef.current) { res(); return }
      mediaRef.current.onstop = () => res()
      mediaRef.current.stop()
    })

    await saveCapture()
    setStatus("done")
    setTimeout(() => { setStatus("idle"); setElapsed(0) }, 2500)
  }

  function cancelCountdown() { setStatus("idle"); setCountdown(0) }

  async function toggleAnnotate() {
    if (annotating) {
      await closeAnnotateWindow()
      setAnnotating(false)
    } else {
      await openAnnotateWindow()
      setAnnotating(true)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-5">

      {/* Save banner */}
      {showBanner && bloomDir && (
        <SaveBanner path={bloomDir} onDismiss={() => setShowBanner(false)} />
      )}

      {/* Preview */}
      <PreviewCanvas source={settings.source} status={status} elapsed={elapsed} countdown={countdown} />

      {/* Config panel (idle only) */}
      {showConfig && (
        <div className="fade-up flex flex-col gap-3">
          {/* Source tabs */}
          <div className="flex gap-1 rounded-xl border border-border/50 bg-[var(--surface)] p-1">
            {([
              { id: "screen" as RecordingSource, label: "Screen",       icon: Monitor },
              { id: "camera" as RecordingSource, label: "Camera",       icon: Camera  },
              { id: "both"   as RecordingSource, label: "Screen + Cam", icon: Layers  },
            ]).map((src) => {
              const active = settings.source === src.id
              return (
                <button
                  key={src.id}
                  onClick={() => setSettings((p) => ({ ...p, source: src.id }))}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all",
                    active ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <src.icon className="size-3.5" />
                  {src.label}
                </button>
              )
            })}
          </div>

          {/* Screen/window picker */}
          {needsScreen && (
            <ScreenPicker value={settings.screenTarget} onChange={(t) => setSettings((p) => ({ ...p, screenTarget: t }))} />
          )}

          {/* Audio */}
          <div className="flex gap-2">
            <AudioToggle active={settings.microphone} onIcon={Mic} offIcon={MicOff} label="Microphone"
              onChange={() => setSettings((p) => ({ ...p, microphone: !p.microphone }))} />
            <AudioToggle active={settings.systemAudio} onIcon={Volume2} offIcon={VolumeX} label="System audio"
              onChange={() => setSettings((p) => ({ ...p, systemAudio: !p.systemAudio }))} />
          </div>

          {/* Quality + countdown */}
          <div className="flex gap-3">
            <OptionGroup label="Quality" value={settings.quality}
              options={[{ v: "720p", label: "720p" }, { v: "1080p", label: "1080p" }]}
              onChange={(v) => setSettings((p) => ({ ...p, quality: v }))}
            />
            <OptionGroup label="Countdown" value={String(settings.countdown) as "0" | "3" | "5"}
              options={[{ v: "0", label: "Off" }, { v: "3", label: "3 s" }, { v: "5", label: "5 s" }]}
              onChange={(v) => setSettings((p) => ({ ...p, countdown: Number(v) as 0 | 3 | 5 }))}
            />
          </div>
        </div>
      )}

      {/* Annotate toolbar – during recording / paused */}
      {isActive && (
        <div className="fade-up flex items-center gap-2 rounded-xl border border-border/50 bg-[var(--surface)] px-3 py-2">
          <Pencil className={cn("size-4", annotating ? "text-orange-400" : "text-muted-foreground")} />
          <span className="flex-1 text-xs font-semibold text-muted-foreground">Annotation overlay</span>
          <button
            onClick={toggleAnnotate}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all",
              annotating
                ? "border-orange-500/40 bg-orange-500/15 text-orange-300 hover:bg-orange-500/25"
                : "border-border/60 bg-secondary text-foreground hover:bg-secondary/60"
            )}
          >
            {annotating ? "Close overlay" : "Open overlay"}
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {status === "idle" && (
          <button onClick={startCountdown}
            className="group flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 py-4 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition-all hover:bg-orange-400 hover:shadow-orange-500/35 active:scale-[0.98]"
          >
            <Video className="size-4 transition-transform group-hover:scale-110" />
            Start Recording
            <ChevronRight className="size-4 opacity-60" />
          </button>
        )}

        {status === "countdown" && (
          <button onClick={cancelCountdown}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border/60 bg-[var(--surface)] py-4 text-sm font-bold text-muted-foreground transition-all hover:border-border hover:text-foreground"
          >
            Cancel
          </button>
        )}

        {isActive && (
          <>
            {status === "recording" ? (
              <button onClick={pauseRecording}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border/60 bg-[var(--surface)] py-4 text-sm font-bold text-foreground transition-all hover:bg-secondary active:scale-[0.98]"
              >
                <Pause className="size-4" /> Pause
              </button>
            ) : (
              <button onClick={resumeRecording}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 py-4 text-sm font-bold text-amber-300 transition-all hover:bg-amber-500/15 active:scale-[0.98]"
              >
                <Play className="size-4" /> Resume
              </button>
            )}
            <button onClick={stopRecording}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-4 text-sm font-bold text-white shadow-lg shadow-red-500/20 transition-all hover:bg-red-500 active:scale-[0.98]"
            >
              <Square className="size-4 fill-current" /> Stop & Save
            </button>
          </>
        )}

        {(status === "processing" || status === "done") && (
          <div className={cn(
            "flex flex-1 items-center justify-center gap-2.5 rounded-xl py-4 text-sm font-semibold",
            status === "done"
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border border-border/50 bg-[var(--surface)] text-muted-foreground"
          )}>
            {status === "processing"
              ? <><div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" /> Saving…</>
              : <><CheckCircle2 className="size-4" /> Saved to ~/Movies/Bloom</>
            }
          </div>
        )}
      </div>
    </div>
  )
}
