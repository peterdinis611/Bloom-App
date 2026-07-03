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
  AlertCircle,
} from "lucide-react"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { cn, formatDuration } from "@/lib/utils"
import type { RecordingSettings, RecordingSource, RecordingStatus, ScreenTarget } from "@/types"
import {
  getBloomDir,
  openSession,
  writeChunk,
  closeSession,
  cancelSession,
  getDiskSpace,
  revealInFinder,
  formatBytes,
  isLowDiskSpace,
} from "@/hooks/useBloomBackend"

// ── MediaRecorder helpers ─────────────────────────────────────────────────────
/**
 * Tauri on macOS uses WKWebView (WebKit) – no video/webm support.
 * Must use video/mp4 on macOS; webm works on Windows/Linux.
 */
function getSupportedMimeType(): string {
  const candidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=h264",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ]
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t
  }
  return ""
}

function mimeToExt(mime: string): string {
  return mime.includes("mp4") ? "mp4" : "webm"
}

/** Convert a Blob to Uint8Array without base64 encoding. */
async function blobToU8(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

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

  const [status,     setStatus]     = useState<RecordingStatus>("idle")
  const [elapsed,    setElapsed]    = useState(0)
  const [countdown,  setCountdown]  = useState(0)
  const [bloomDir,   setBloomDir]   = useState<string | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [annotating, setAnnotating] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [diskWarn,   setDiskWarn]   = useState<string | null>(null)
  const [savedMeta,  setSavedMeta]  = useState<{ title: string; size: string } | null>(null)

  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const cdTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownVal   = useRef(0)
  const mediaRef       = useRef<MediaRecorder | null>(null)
  const streamRef      = useRef<MediaStream | null>(null)
  const mimeTypeRef    = useRef("")
  const sessionIdRef   = useRef<number | null>(null)   // Rust streaming session
  const filenameRef    = useRef("")                     // current recording filename

  // Fetch save dir + disk info on mount
  useEffect(() => {
    getBloomDir()
      .then((dir) => { setBloomDir(dir); setShowBanner(true) })
      .catch(() => setBloomDir("~/Movies/Bloom"))

    getDiskSpace()
      .then((info) => {
        if (isLowDiskSpace(info, 500)) {
          setDiskWarn(`Low disk space: only ${formatBytes(info.available_bytes)} available`)
        }
      })
      .catch(() => {})

    return () => {
      if (timerRef.current)   clearInterval(timerRef.current)
      if (cdTimerRef.current) clearInterval(cdTimerRef.current)
    }
  }, [])

  const isActive   = status === "recording" || status === "paused"
  const isBusy     = status === "countdown" || status === "processing" || status === "done"
  const showConfig = !isActive && !isBusy
  const needsScreen = settings.source === "screen" || settings.source === "both"

  // ── Timer helpers ────────────────────────────────────────────────────────────
  const startElapsedTimer = useCallback(() => {
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
  }, [])

  const stopElapsedTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  // ── Screen / mic capture ─────────────────────────────────────────────────────
  async function captureScreen(): Promise<MediaStream | null> {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: settings.quality === "1080p" ? 30 : 24 } as MediaTrackConstraints,
        audio: settings.systemAudio,
      })
      if (settings.microphone) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          return new MediaStream([...screenStream.getTracks(), ...mic.getAudioTracks()])
        } catch { /* mic denied – continue */ }
      }
      return screenStream
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name ?? ""
      if (name !== "NotAllowedError" && name !== "AbortError") {
        setError("Screen capture failed. Go to System Settings → Privacy & Security → Screen Recording and allow Bloom.")
      }
      return null
    }
  }

  /**
   * Opens a Rust streaming session and wires MediaRecorder so each 500ms chunk
   * is sent directly to Rust (no JS-side accumulation).
   * Memory usage stays constant regardless of recording duration.
   */
  async function startCapture(): Promise<boolean> {
    const stream = await captureScreen()
    if (!stream) return false

    streamRef.current   = stream
    mimeTypeRef.current = getSupportedMimeType()
    const ext           = mimeToExt(mimeTypeRef.current)
    const ts            = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    filenameRef.current = `recording-${ts}.${ext}`

    // Open Rust streaming session with rich metadata
    try {
      const id = await openSession(filenameRef.current, {
        source:           settings.source,
        quality:          settings.quality,
        has_microphone:   settings.microphone,
        has_system_audio: settings.systemAudio,
        target_label:     settings.screenTarget.label,
      })
      sessionIdRef.current = id
    } catch (e) {
      setError(`Could not open recording file: ${e}`)
      stream.getTracks().forEach((t) => t.stop())
      return false
    }

    const opts: MediaRecorderOptions = mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : {}
    const recorder = new MediaRecorder(stream, opts)

    // Each 500ms chunk → Rust immediately (no JS-side accumulation)
    recorder.ondataavailable = async (e) => {
      if (e.data.size === 0 || sessionIdRef.current === null) return
      try {
        const bytes = await blobToU8(e.data)
        await writeChunk(sessionIdRef.current, Array.from(bytes))
      } catch { /* non-fatal: single chunk lost is tolerable */ }
    }

    // User clicks "Stop sharing" in macOS menu bar → auto-stop recording
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (mediaRef.current?.state !== "inactive") stopRecording()
    })

    recorder.start(500)
    mediaRef.current = recorder
    return true
  }

  async function finaliseCapture() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    const sid = sessionIdRef.current
    sessionIdRef.current = null
    mediaRef.current     = null

    if (sid === null) return

    try {
      const meta = await closeSession(sid)
      setSavedMeta({
        title: meta.title,
        size:  formatBytes(meta.file_size_bytes),
      })
      // Refresh bloom dir in case it changed
      if (bloomDir) setBloomDir(bloomDir)
    } catch { /* non-critical */ }
  }

  async function abortCapture() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    mediaRef.current  = null

    const sid = sessionIdRef.current
    sessionIdRef.current = null
    if (sid !== null) cancelSession(sid).catch(() => {})
  }

  // ── State machine ─────────────────────────────────────────────────────────────
  function startCountdown() {
    setError(null)
    if (settings.countdown === 0) { doStartRecording(); return }

    countdownVal.current = settings.countdown
    setCountdown(settings.countdown)
    setStatus("countdown")

    cdTimerRef.current = setInterval(() => {
      countdownVal.current -= 1
      setCountdown(countdownVal.current)
      if (countdownVal.current <= 0) {
        clearInterval(cdTimerRef.current!)
        cdTimerRef.current = null
        doStartRecording()
      }
    }, 1000)
  }

  async function doStartRecording() {
    const ok = await startCapture()
    if (!ok) { setStatus("idle"); return }
    setStatus("recording")
    setElapsed(0)
    onRecordingChange?.(true)
    startElapsedTimer()
  }

  function pauseRecording() {
    stopElapsedTimer()
    try { mediaRef.current?.pause() } catch {}
    setStatus("paused")
  }

  function resumeRecording() {
    try { mediaRef.current?.resume() } catch {}
    setStatus("recording")
    startElapsedTimer()
  }

  async function stopRecording() {
    stopElapsedTimer()
    setAnnotating(false)
    closeAnnotateWindow()
    onRecordingChange?.(false)
    setStatus("processing")

    // Stop MediaRecorder and wait for last ondataavailable to fire
    await new Promise<void>((res) => {
      const rec = mediaRef.current
      if (!rec || rec.state === "inactive") { res(); return }
      rec.addEventListener("stop", () => res(), { once: true })
      rec.stop()
    })

    // Flush + close the Rust file (all chunks already streamed)
    await finaliseCapture()

    setStatus("done")
    setTimeout(() => { setStatus("idle"); setElapsed(0) }, 2500)
  }

  function cancelCountdown() {
    if (cdTimerRef.current) { clearInterval(cdTimerRef.current); cdTimerRef.current = null }
    abortCapture()
    setStatus("idle")
    setCountdown(0)
  }

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

      {/* Disk space warning */}
      {diskWarn && (
        <div className="fade-up flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3.5 py-2.5">
          <AlertCircle className="size-4 shrink-0 text-amber-400" />
          <p className="flex-1 text-xs font-medium text-amber-300">{diskWarn}</p>
          <button onClick={() => setDiskWarn(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="fade-up flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/8 px-3.5 py-3">
          <AlertCircle className="size-4 shrink-0 text-red-400 mt-0.5" />
          <p className="flex-1 text-xs font-medium text-red-300 leading-relaxed">{error}</p>
          <button onClick={() => setError(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
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

        {status === "processing" && (
          <div className="flex flex-1 items-center justify-center gap-2.5 rounded-xl border border-border/50 bg-[var(--surface)] py-4 text-sm font-semibold text-muted-foreground">
            <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
            Saving…
          </div>
        )}

        {status === "done" && (
          <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-emerald-300">Saved!</p>
              {savedMeta && (
                <p className="truncate text-[11px] text-muted-foreground font-mono">
                  {savedMeta.title} · {savedMeta.size}
                </p>
              )}
            </div>
            {bloomDir && (
              <button
                onClick={() => revealInFinder(bloomDir)}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-400 transition-all hover:bg-emerald-500/20"
              >
                <FolderOpen className="size-3.5" />
                Show
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
