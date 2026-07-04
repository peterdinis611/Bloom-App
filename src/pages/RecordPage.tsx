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
  CheckCircle2 as CheckIcon,
  ChevronRight,
  Pencil,
  FolderOpen,
  X,
  AlertCircle,
  RefreshCw,
  Info,
  Image as ImageIcon,
  Zap,
  MousePointer2,
  Sparkles,
} from "lucide-react"
import { openAnnotateWindow, closeAnnotateWindow } from "@/lib/annotateWindow"
import { openRecordingHud, closeRecordingHud } from "@/lib/recordingHud"
import { openCursorOverlay, closeCursorOverlay } from "@/lib/cursorOverlay"
import { minimizeMainWindow, restoreMainWindow } from "@/lib/windowControl"
import { findPreset } from "@/lib/presets"
import { defaultPipRect, type PipRect, type PipPosition, type PipSize } from "@/lib/capture"
import { createAudioMeter } from "@/lib/audioMeter"
import { AudioMeterBar } from "@/components/record/AudioMeterBar"
import { PipOverlay } from "@/components/record/PipOverlay"
import { emit, listen } from "@tauri-apps/api/event"
import { cn, formatDuration } from "@/lib/utils"
import type { MonitorInfo, RecordingSettings, RecordingSource, RecordingStatus, ScreenTarget } from "@/types"
import {
  getBloomDir,
  openSession,
  writeChunk,
  closeSession,
  cancelSession,
  getDiskSpace,
  revealInFinder,
  saveSnapshot,
  formatBytes,
  isLowDiskSpace,
} from "@/hooks/useBloomBackend"
import { useMediaDevices } from "@/hooks/useMediaDevices"
import { useSettings } from "@/hooks/useSettings"
import { startCapture, openCameraStream, type CaptureHandle } from "@/lib/capture"
import { highlightMonitor } from "@/lib/monitorHighlight"
import { MonitorPicker } from "@/components/record/MonitorPicker"

function captureErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name ?? ""
  const msg = (err as { message?: string })?.message ?? String(err)
  if (name === "NotAllowedError" || name === "AbortError") {
    return "Prístup bol zamietnutý. Povoľ Screen Recording a kameru v Systémové nastavenia → Súkromie a zabezpečenie."
  }
  if (name === "NotFoundError") {
    return "Zariadenie sa nenašlo. Skontroluj pripojenie kamery / mikrofónu."
  }
  if (name === "NotSupportedError" || msg.includes("MediaRecorder")) {
    return "Formát nahrávania nie je podporovaný v tomto prehliadači. Skús zmeniť kvalitu alebo reštartovať app."
  }
  return `Nahrávanie sa nepodarilo spustiť: ${msg}`
}
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

/** Build a ScreenTarget from a real display returned by the backend. */
function monitorToTarget(m: MonitorInfo, index: number): ScreenTarget {
  return {
    id: m.id,
    label: `${m.name}${m.is_primary ? " (Primary)" : ""}`,
    type: "screen",
    index: index + 1,
    appName: `${m.width}×${m.height}`,
  }
}

const DEFAULT_TARGET: ScreenTarget = { id: "default", label: "Primary Display", type: "screen", index: 1 }

// ── Generic dropdown select ────────────────────────────────────────────────────
interface SelectOption {
  id: string
  label: string
  sub?: string
  icon?: React.FC<{ className?: string }>
}

function Dropdown({ value, options, onChange, icon: HeaderIcon, emptyLabel, onRefresh }: {
  value: string
  options: SelectOption[]
  onChange: (id: string) => void
  icon: React.FC<{ className?: string }>
  emptyLabel: string
  onRefresh?: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.id === value) ?? options[0]

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  return (
    <div ref={ref} className="relative w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left text-sm transition-all",
          open
            ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
            : "border-border bg-[var(--surface)] hover:border-border/80 hover:bg-[var(--surface-hover)]",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
            {(() => { const I = selected?.icon ?? HeaderIcon; return <I className="size-4 text-accent" /> })()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{selected?.label ?? emptyLabel}</p>
            {selected?.sub && <p className="truncate text-xs text-muted-foreground">{selected.sub}</p>}
          </div>
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="fade-up absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/70">
          {onRefresh && (
            <button
              onClick={() => { onRefresh(); }}
              className="flex w-full items-center gap-2 border-b border-border/60 px-3.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <RefreshCw className="size-3" /> Refresh devices
            </button>
          )}
          <div className="max-h-48 overflow-y-auto py-1">
            {options.length === 0 && (
              <p className="px-3.5 py-3 text-xs text-muted-foreground">{emptyLabel}</p>
            )}
            {options.map((opt) => {
              const active = opt.id === value
              const I = opt.icon ?? HeaderIcon
              return (
                <button
                  key={opt.id}
                  onClick={() => { onChange(opt.id); setOpen(false) }}
                  className={cn(
                    "flex w-full items-center gap-3 px-3.5 py-2.5 text-sm transition-colors hover:bg-secondary",
                    active && "bg-primary/8",
                  )}
                >
                  <div className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                    active ? "border-primary/40 bg-primary/10" : "border-border/50 bg-secondary/80",
                  )}>
                    <I className={cn("size-4", active ? "text-accent" : "text-muted-foreground/50")} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-semibold", active ? "text-primary" : "text-foreground")}>{opt.label}</p>
                    {opt.sub && <p className="truncate text-xs text-muted-foreground">{opt.sub}</p>}
                  </div>
                  {active && <CheckIcon className="size-4 shrink-0 text-accent" />}
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
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/60 bg-[var(--surface)] text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      <div className={cn("flex h-5 w-9 items-center rounded-full p-0.5 transition-colors", active ? "bg-primary" : "bg-secondary")}>
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
              o.v === value ? "bg-secondary text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
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
function PreviewCanvas({ source, status, elapsed, countdown, stream, summary }: {
  source: RecordingSource; status: RecordingStatus; elapsed: number; countdown: number
  stream: MediaStream | null; summary?: string
}) {
  const isRecording = status === "recording"
  const isPaused    = status === "paused"
  const isActive    = isRecording || isPaused
  const videoRef    = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.srcObject = stream
    if (stream) v.play().catch(() => {})
  }, [stream])

  const showVideo = !!stream

  return (
    <div className={cn(
      "relative flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl transition-all duration-500",
      isRecording ? "border-2 border-red-500/70 glow-red" : "border border-border/50 glow-accent",
    )}>
      {/* Live video layer */}
      <video
        ref={videoRef}
        muted
        playsInline
        className={cn("absolute inset-0 h-full w-full bg-black object-contain transition-opacity duration-300", showVideo ? "opacity-100" : "opacity-0")}
      />

      {/* Decorative background (only without live video) */}
      {!showVideo && (
        <div className="absolute inset-0">
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
      )}

      {status === "preparing" && (
        <div className="relative flex flex-col items-center gap-4 rounded-2xl bg-black/40 px-6 py-4 backdrop-blur-md">
          <div className="size-10 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          <p className="text-sm font-medium text-muted-foreground">Pripravujem zachytenie…</p>
          <p className="max-w-xs text-center text-[11px] text-muted-foreground/70">
            {source === "camera"
              ? "Povoľ prístup ku kamere."
              : "Vyber displej alebo okno v systémovom dialógu."}
          </p>
        </div>
      )}

      {status === "idle" && !showVideo && (
        <div className="relative flex flex-col items-center gap-4">
          <div className={cn(
            "flex size-20 items-center justify-center rounded-2xl border",
            source === "camera" ? "border-emerald-500/20 bg-emerald-500/10" : "border-primary/20 bg-primary/10",
          )}>
            {source === "screen" && <MonitorDot className="size-10 text-accent/60" />}
            {source === "camera" && <Camera     className="size-10 text-emerald-400/60" />}
            {source === "both"   && <Layers     className="size-10 text-accent/60" />}
          </div>
          <p className="text-sm font-medium text-muted-foreground/50">
            {source === "screen" ? "Screen capture ready" : source === "camera" ? "Starting camera…" : "Screen + camera"}
          </p>
        </div>
      )}

      {status === "countdown" && (
        <div className="relative flex flex-col items-center gap-4">
          <div key={countdown} className="count-pop flex size-24 items-center justify-center rounded-full border-2 border-primary/40 bg-primary/10 shadow-xl shadow-primary/15 backdrop-blur-sm">
            <span className="text-6xl font-black tabular-nums text-primary">{countdown}</span>
          </div>
          <p className="text-sm font-medium text-muted-foreground">Starting soon…</p>
        </div>
      )}

      {isActive && (
        <div className="relative flex flex-col items-center gap-3 rounded-2xl bg-black/45 px-6 py-4 backdrop-blur-md">
          <div className={cn(
            "font-mono text-5xl font-black tabular-nums tracking-tight",
            isPaused ? "text-amber-300 opacity-70" : "text-white",
          )}>
            {formatDuration(elapsed)}
          </div>
          {isPaused && <span className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Paused</span>}
          {isRecording && (
            <div className="flex h-7 items-end gap-0.5">
              {[3,5,9,6,4,8,5,3,7,4,6,3].map((h, i) => (
                <div key={i} className="w-0.5 rounded-full bg-red-400/80" style={{
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
        <div className="relative flex flex-col items-center gap-4 rounded-2xl bg-black/40 px-6 py-4 backdrop-blur-md">
          <div className="relative flex size-16 items-center justify-center">
            <div className="absolute size-16 animate-spin rounded-full border-2 border-transparent border-t-primary" />
            <div className="size-10 rounded-full border border-border/60 bg-[var(--surface)]" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Saving to ~/Movies/Bloom…</p>
        </div>
      )}

      {status === "done" && (
        <div className="fade-up relative flex flex-col items-center gap-3 rounded-2xl bg-black/40 px-6 py-4 backdrop-blur-md">
          <div className="flex size-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 shadow-lg shadow-emerald-500/10">
            <CheckCircle2 className="size-8 text-emerald-400" />
          </div>
          <p className="text-sm font-semibold text-emerald-300">Saved!</p>
        </div>
      )}

      {isRecording && (
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 backdrop-blur-md">
          <span className="rec-dot size-2.5 rounded-full bg-red-500" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">Rec</span>
        </div>
      )}

      {/* Config summary chip (idle only) */}
      {status === "idle" && summary && (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 text-[11px] font-semibold text-white/75 backdrop-blur-md">
          {summary}
        </div>
      )}
    </div>
  )
}

// ── Section label ──────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50">
      {children}
    </span>
  )
}

// ── Source selector card ─────────────────────────────────────────────────────────
const SOURCES: { id: RecordingSource; title: string; desc: string; icon: React.FC<{ className?: string }> }[] = [
  { id: "screen", title: "Screen", desc: "Display or window", icon: Monitor },
  { id: "camera", title: "Camera", desc: "Webcam only",       icon: Camera  },
  { id: "both",   title: "Both",   desc: "Screen + camera",    icon: Layers  },
]

function SourceCard({ active, title, desc, icon: Icon, onClick }: {
  active: boolean; title: string; desc: string; icon: React.FC<{ className?: string }>; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center gap-2 overflow-hidden rounded-xl border px-2 py-3.5 text-center transition-all active:scale-[0.98]",
        active
          ? "border-primary/60 bg-primary/10 shadow-lg shadow-primary/10"
          : "border-border/60 bg-[var(--surface)] hover:border-border hover:bg-[var(--surface-hover)]",
      )}
    >
      <div className={cn(
        "flex size-9 items-center justify-center rounded-lg transition-all",
        active
          ? "bg-primary text-white shadow-md shadow-primary/30"
          : "bg-secondary text-muted-foreground group-hover:text-foreground",
      )}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className={cn("truncate text-xs font-bold", active ? "text-primary" : "text-foreground")}>{title}</p>
        <p className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground/70">{desc}</p>
      </div>
      {active && <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent" />}
    </button>
  )
}

// ── Save location banner ───────────────────────────────────────────────────────
function SaveBanner({ path, onDismiss }: { path: string; onDismiss: () => void }) {
  return (
    <div className="fade-up flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3.5 py-3">
      <FolderOpen className="size-4 shrink-0 text-emerald-400" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-emerald-300">Recordings saved to</p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">{path}</p>
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
  const { cameras, microphones, monitors, hasLabels, requestPermission, refresh } = useMediaDevices()
  const { settings: appSettings, updateRecording } = useSettings()

  const [settings, setSettings] = useState<RecordingSettings>({
    source: "screen",
    screenTarget: DEFAULT_TARGET,
    microphone: true,
    systemAudio: false,
    quality: appSettings.recording.defaultQuality,
    countdown: appSettings.recording.defaultCountdown,
    cameraDeviceId: "",
    micDeviceId: "",
    cursorHighlight: appSettings.recording.cursorHighlight,
    cameraBlur: appSettings.recording.cameraBlur,
    pipSize: appSettings.recording.pipSize,
    pipPosition: appSettings.recording.pipPosition,
  })

  const pipLayoutRef = useRef<PipRect>(defaultPipRect(appSettings.recording.pipSize, appSettings.recording.pipPosition))
  const [pipRect, setPipRectState] = useState<PipRect>(() => pipLayoutRef.current)
  const setPipRect = useCallback((r: PipRect) => {
    pipLayoutRef.current = r
    setPipRectState({ ...r })
  }, [])
  const [armHighlight, setArmHighlight] = useState(false)

  const [micLevel, setMicLevel] = useState(0)
  const [sysLevel, setSysLevel] = useState(0)
  const metersRef = useRef<Array<{ stop: () => void }>>([])
  const lastActivityRef = useRef(Date.now())
  const elapsedRef = useRef(0)

  const [status,     setStatus]     = useState<RecordingStatus>("idle")
  const [elapsed,    setElapsed]    = useState(0)
  const [countdown,  setCountdown]  = useState(0)
  const [bloomDir,   setBloomDir]   = useState<string | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [annotating, setAnnotating] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [diskWarn,   setDiskWarn]   = useState<string | null>(null)
  const [savedMeta,  setSavedMeta]  = useState<{ title: string; size: string } | null>(null)
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const [snapshot,   setSnapshot]   = useState<{ path: string } | null>(null)
  const previewStreamRef = useRef<MediaStream | null>(null)

  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const cdTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownVal   = useRef(0)
  const mediaRef       = useRef<MediaRecorder | null>(null)
  const captureRef     = useRef<CaptureHandle | null>(null)
  const liveCamRef     = useRef<MediaStream | null>(null)
  const mimeTypeRef    = useRef("")
  const sessionIdRef   = useRef<number | null>(null)
  const filenameRef    = useRef("")
  const stopRecordingRef = useRef<() => Promise<void>>(async () => {})
  const pauseRecordingRef = useRef<() => void>(() => {})
  const resumeRecordingRef = useRef<() => void>(() => {})
  const startCountdownRef = useRef<() => void>(() => {})
  const statusRef = useRef<RecordingStatus>("idle")

  const isActive    = status === "recording" || status === "paused"
  const isBusy      = status === "preparing" || status === "countdown" || status === "processing" || status === "done"
  const showConfig  = !isActive && !isBusy
  const needsScreen = settings.source === "screen" || settings.source === "both"
  const needsCamera = settings.source === "camera" || settings.source === "both"

  useEffect(() => {
    if (isActive) return
    setPipRect(defaultPipRect(settings.pipSize, settings.pipPosition))
  }, [settings.pipSize, settings.pipPosition, isActive, setPipRect])

  useEffect(() => {
    if (!isActive) return
    const bump = () => { lastActivityRef.current = Date.now() }
    window.addEventListener("mousemove", bump)
    window.addEventListener("keydown", bump)
    window.addEventListener("mousedown", bump)
    return () => {
      window.removeEventListener("mousemove", bump)
      window.removeEventListener("keydown", bump)
      window.removeEventListener("mousedown", bump)
    }
  }, [isActive])

  useEffect(() => {
    if (!isActive) return
    let raf = 0
    const tick = () => {
      const meters = metersRef.current as Array<{ level: number; stop: () => void }>
      if (meters[0]) setMicLevel(meters[0].level)
      if (meters[1]) setSysLevel(meters[1].level)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isActive])

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
      liveCamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // Default screen target to the primary/first real monitor once loaded.
  useEffect(() => {
    if (monitors.length === 0) return
    setSettings((p) => {
      if (p.screenTarget.id !== DEFAULT_TARGET.id && monitors.some((m) => m.id === p.screenTarget.id)) return p
      const primaryIdx = Math.max(0, monitors.findIndex((m) => m.is_primary))
      return { ...p, screenTarget: monitorToTarget(monitors[primaryIdx], primaryIdx) }
    })
  }, [monitors])

  // Default device selections once real labels are known.
  useEffect(() => {
    setSettings((p) => {
      let next = p
      if (!p.cameraDeviceId && cameras[0]) next = { ...next, cameraDeviceId: cameras[0].deviceId }
      if (!p.micDeviceId && microphones[0]) next = { ...next, micDeviceId: microphones[0].deviceId }
      return next
    })
  }, [cameras, microphones])

  // Live camera preview while idle (camera / both).
  useEffect(() => {
    let cancelled = false
    function stopLive() {
      liveCamRef.current?.getTracks().forEach((t) => t.stop())
      liveCamRef.current = null
    }
    async function run() {
      if (status !== "idle") return  // keep the stream alive through recording
      if (settings.source === "camera" || settings.source === "both") {
        stopLive()
        try {
          const s = await openCameraStream(settings.cameraDeviceId || undefined, settings.quality)
          if (cancelled) { s.getTracks().forEach((t) => t.stop()); return }
          liveCamRef.current = s
          setPreviewStream(s)
        } catch {
          if (!cancelled) setPreviewStream(null)
        }
      } else {
        stopLive()
        setPreviewStream(null)
      }
    }
    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, settings.source, settings.cameraDeviceId, settings.quality])

  // Keep a ref to the current preview stream for snapshot compositing.
  useEffect(() => { previewStreamRef.current = previewStream }, [previewStream])

  function applyPreset(preset: NonNullable<ReturnType<typeof findPreset>>) {
    setSettings((p) => ({
      ...p,
      source: preset.source,
      quality: preset.quality,
      countdown: preset.countdown,
      microphone: preset.microphone,
      systemAudio: preset.systemAudio,
      cursorHighlight: preset.cursorHighlight,
      cameraBlur: preset.cameraBlur,
      pipSize: preset.pipSize,
      pipPosition: preset.pipPosition,
    }))
    setPipRect(defaultPipRect(preset.pipSize, preset.pipPosition))
    updateRecording({ activePresetId: preset.id })
  }

  async function startWithPreset(presetId: string) {
    const preset = findPreset(presetId, appSettings.recording.presets)
    if (preset) applyPreset(preset)
    startCountdownRef.current()
  }

  // ── Snapshot: composite current frame + annotation drawing → PNG ───────────────
  const compositeAndSave = useCallback(async (drawingPng: string) => {
    const stream = previewStreamRef.current
    const track = stream?.getVideoTracks()[0]
    if (!stream || !track) {
      setError("Snímku sa nepodarilo uložiť – žiadny živý obraz.")
      return
    }
    const s = track.getSettings()
    const w = Math.round(s.width ?? 1280)
    const h = Math.round(s.height ?? 720)

    const video = document.createElement("video")
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    try { await video.play() } catch { /* frame may still be drawable */ }
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    try { ctx.drawImage(video, 0, 0, w, h) } catch { /* ignore */ }

    if (drawingPng) {
      await new Promise<void>((res) => {
        const img = new Image()
        img.onload = () => { ctx.drawImage(img, 0, 0, w, h); res() }
        img.onerror = () => res()
        img.src = drawingPng
      })
    }
    video.srcObject = null

    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/png"))
    if (!blob) return
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    try {
      const path = await saveSnapshot(`snapshot-${ts}.png`, Array.from(bytes))
      setSnapshot({ path })
      setTimeout(() => setSnapshot(null), 5000)
    } catch (e) {
      setError(`Snímku sa nepodarilo uložiť: ${e}`)
    }
  }, [])

  // Listen for save requests coming from the annotation overlay window.
  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<{ png: string }>("annotation-save", (e) => { compositeAndSave(e.payload.png) })
      .then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [compositeAndSave])

  // Floating HUD + tray / global shortcut controls.
  useEffect(() => {
    const unsubs: Array<() => void> = []
    listen("hud-stop", () => { void stopRecordingRef.current() }).then((fn) => unsubs.push(fn))
    listen("hud-pause", () => { pauseRecordingRef.current() }).then((fn) => unsubs.push(fn))
    listen("hud-resume", () => { resumeRecordingRef.current() }).then((fn) => unsubs.push(fn))
    listen("rec-stop", () => { void stopRecordingRef.current() }).then((fn) => unsubs.push(fn))
    listen("rec-toggle-pause", () => {
      if (statusRef.current === "recording") pauseRecordingRef.current()
      else if (statusRef.current === "paused") resumeRecordingRef.current()
    }).then((fn) => unsubs.push(fn))
    listen("rec-arm", () => {
      setArmHighlight(true)
      setTimeout(() => setArmHighlight(false), 2500)
      const preset = findPreset(appSettings.recording.activePresetId, appSettings.recording.presets)
      if (preset) applyPreset(preset)
    }).then((fn) => unsubs.push(fn))
    return () => { unsubs.forEach((fn) => fn()) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings.recording.activePresetId])

  const syncHud = useCallback((payload: {
    phase: "countdown" | "recording" | "paused"
    countdown?: number
    elapsed?: number
  }) => {
    emit("hud-sync", payload).catch(() => {})
  }, [])

  const hideForRecording = useCallback(async () => {
    if (!appSettings.recording.minimizeOnRecord) return
    await openRecordingHud()
    await minimizeMainWindow()
  }, [appSettings.recording.minimizeOnRecord])

  const showAfterRecording = useCallback(async () => {
    await closeRecordingHud()
    await restoreMainWindow()
  }, [])

  // ── Timer helpers ────────────────────────────────────────────────────────────
  const startElapsedTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setElapsed((e) => {
        const next = e + 1
        elapsedRef.current = next
        emit("hud-tick", { elapsed: next }).catch(() => {})

        const max = appSettings.recording.maxDurationSecs
        if (max > 0 && next >= max) {
          void stopRecordingRef.current()
          return next
        }
        const idle = appSettings.recording.idleStopSecs
        if (idle > 0 && (Date.now() - lastActivityRef.current) / 1000 >= idle) {
          void stopRecordingRef.current()
        }
        return next
      })
    }, 1000)
  }, [appSettings.recording.maxDurationSecs, appSettings.recording.idleStopSecs])

  const stopElapsedTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  // ── Capture wiring ─────────────────────────────────────────────────────────────
  async function prepareCaptureFlow(): Promise<boolean> {
    let handle: CaptureHandle
    try {
      handle = await startCapture({
        source: settings.source,
        quality: settings.quality,
        microphone: settings.microphone,
        systemAudio: settings.systemAudio,
        cameraDeviceId: settings.cameraDeviceId || undefined,
        micDeviceId: settings.micDeviceId || undefined,
        cameraStream: needsCamera ? liveCamRef.current : null,
        pipSize: settings.pipSize,
        pipPosition: settings.pipPosition,
        cameraBlur: settings.cameraBlur,
        pipLayoutRef: settings.source === "both" ? pipLayoutRef : undefined,
        onEnded: () => { if (mediaRef.current?.state !== "inactive") stopRecording() },
      })
    } catch (err: unknown) {
      setError(captureErrorMessage(err))
      return false
    }

    captureRef.current = handle
    setPreviewStream(handle.previewStream)
    return true
  }

  async function beginRecording(): Promise<boolean> {
    const handle = captureRef.current
    if (!handle) return false

    mimeTypeRef.current = getSupportedMimeType()
    const ext           = mimeToExt(mimeTypeRef.current)
    const ts            = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    filenameRef.current = `recording-${ts}.${ext}`

    try {
      const id = await openSession(filenameRef.current, {
        source:           settings.source,
        quality:          settings.quality,
        has_microphone:   settings.microphone,
        has_system_audio: settings.systemAudio,
        target_label:     settings.source === "camera"
          ? (cameras.find((c) => c.deviceId === settings.cameraDeviceId)?.label ?? "Camera")
          : settings.screenTarget.label,
      })
      sessionIdRef.current = id
    } catch (e) {
      setError(`Could not open recording file: ${e}`)
      handle.stop()
      captureRef.current = null
      return false
    }

    try {
      const opts: MediaRecorderOptions = mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : {}
      const recorder = new MediaRecorder(handle.recordStream, opts)

      recorder.onerror = () => {
        setError("MediaRecorder zlyhal. Skús znova alebo zmeň kvalitu.")
        stopRecording()
      }

      recorder.ondataavailable = async (e) => {
        if (e.data.size === 0 || sessionIdRef.current === null) return
        try {
          const bytes = await blobToU8(e.data)
          await writeChunk(sessionIdRef.current, Array.from(bytes))
        } catch { /* single dropped chunk is tolerable */ }
      }

      recorder.start(500)
      mediaRef.current = recorder

      metersRef.current.forEach((m) => m.stop())
      metersRef.current = []
      const audioTracks = handle.recordStream.getAudioTracks()
      if (settings.microphone && audioTracks.length > 0) {
        const idx = settings.systemAudio ? 1 : 0
        const t = audioTracks[idx] ?? audioTracks[0]
        const m = createAudioMeter(new MediaStream([t]))
        if (m) metersRef.current.push(m)
      }
      if (settings.systemAudio && audioTracks.length > 0) {
        const m = createAudioMeter(new MediaStream([audioTracks[0]]))
        if (m) metersRef.current.push(m)
      }
      lastActivityRef.current = Date.now()

      return true
    } catch (err: unknown) {
      setError(captureErrorMessage(err))
      abortCapture()
      return false
    }
  }

  async function finaliseCapture() {
    captureRef.current?.stop()
    captureRef.current = null

    const sid = sessionIdRef.current
    sessionIdRef.current = null
    mediaRef.current     = null

    if (sid === null) return
    try {
      const meta = await closeSession(sid)
      setSavedMeta({ title: meta.title, size: formatBytes(meta.file_size_bytes) })
    } catch { /* non-critical */ }
  }

  function abortCapture() {
    captureRef.current?.stop()
    captureRef.current = null
    mediaRef.current   = null
    const sid = sessionIdRef.current
    sessionIdRef.current = null
    if (sid !== null) cancelSession(sid).catch(() => {})
  }

  // ── State machine ─────────────────────────────────────────────────────────────
  async function startCountdown() {
    // No setState before getDisplayMedia – must stay inside the click user-gesture window.

    const prepared = await prepareCaptureFlow()
    if (!prepared) {
      setStatus("idle")
      return
    }
    setError(null)

    await hideForRecording()

    if (settings.countdown === 0) {
      await doStartRecording()
      return
    }

    countdownVal.current = settings.countdown
    setCountdown(settings.countdown)
    setStatus("countdown")
    syncHud({ phase: "countdown", countdown: settings.countdown })

    cdTimerRef.current = setInterval(() => {
      countdownVal.current -= 1
      setCountdown(countdownVal.current)
      syncHud({ phase: "countdown", countdown: countdownVal.current })
      if (countdownVal.current <= 0) {
        clearInterval(cdTimerRef.current!)
        cdTimerRef.current = null
        doStartRecording()
      }
    }, 1000)
  }

  async function doStartRecording() {
    const ok = await beginRecording()
    if (!ok) {
      abortCapture()
      await showAfterRecording()
      setStatus("idle")
      return
    }
    setStatus("recording")
    setElapsed(0)
    syncHud({ phase: "recording", elapsed: 0 })
    onRecordingChange?.(true)
    if (settings.cursorHighlight) openCursorOverlay().catch(() => {})
    startElapsedTimer()
  }

  function pauseRecording() {
    stopElapsedTimer()
    try { mediaRef.current?.pause() } catch {}
    setStatus("paused")
    syncHud({ phase: "paused", elapsed })
  }

  function resumeRecording() {
    try { mediaRef.current?.resume() } catch {}
    setStatus("recording")
    syncHud({ phase: "recording", elapsed })
    startElapsedTimer()
  }

  /** Pause the recording and open the drawing overlay in one step. */
  async function pauseAndDraw() {
    pauseRecording()
    try {
      await openAnnotateWindow()
      setAnnotating(true)
    } catch (e) {
      setError(`Kreslenie sa nepodarilo otvoriť: ${e}`)
      setAnnotating(false)
    }
  }

  async function stopRecording() {
    stopElapsedTimer()
    setAnnotating(false)
    closeAnnotateWindow()
    closeCursorOverlay().catch(() => {})
    metersRef.current.forEach((m) => m.stop())
    metersRef.current = []
    onRecordingChange?.(false)
    setStatus("processing")

    await new Promise<void>((res) => {
      const rec = mediaRef.current
      if (!rec || rec.state === "inactive") { res(); return }
      rec.addEventListener("stop", () => res(), { once: true })
      rec.stop()
    })

    await finaliseCapture()

    setStatus("done")
    await showAfterRecording()
    setTimeout(() => { setStatus("idle"); setElapsed(0) }, 2500)
  }

  function cancelCountdown() {
    if (cdTimerRef.current) { clearInterval(cdTimerRef.current); cdTimerRef.current = null }
    abortCapture()
    closeCursorOverlay().catch(() => {})
    setPreviewStream(needsCamera ? liveCamRef.current : null)
    showAfterRecording()
    setStatus("idle")
    setCountdown(0)
  }

  async function toggleAnnotate() {
    if (annotating) {
      await closeAnnotateWindow()
      setAnnotating(false)
    } else {
      try {
        await openAnnotateWindow()
        setAnnotating(true)
      } catch (e) {
        setError(`Kreslenie sa nepodarilo otvoriť: ${e}`)
      }
    }
  }

  stopRecordingRef.current = stopRecording
  pauseRecordingRef.current = pauseRecording
  resumeRecordingRef.current = resumeRecording
  startCountdownRef.current = startCountdown
  statusRef.current = status

  const presets = appSettings.recording.presets

  // ── Device option lists ────────────────────────────────────────────────────────
  const cameraOptions: SelectOption[] = cameras.map((c) => ({ id: c.deviceId, label: c.label, icon: Camera }))
  const micOptions: SelectOption[]    = microphones.map((m) => ({ id: m.deviceId, label: m.label, icon: Mic }))

  const previewSummary = [
    settings.quality,
    settings.microphone ? "Mic" : null,
    settings.systemAudio ? "System audio" : null,
  ].filter(Boolean).join("  ·  ")

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">

      {showBanner && bloomDir && (
        <SaveBanner path={bloomDir} onDismiss={() => setShowBanner(false)} />
      )}

      {diskWarn && (
        <div className="fade-up flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3.5 py-2.5">
          <AlertCircle className="size-4 shrink-0 text-amber-400" />
          <p className="flex-1 text-xs font-medium text-amber-300">{diskWarn}</p>
          <button onClick={() => setDiskWarn(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="fade-up flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/8 px-3.5 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
          <p className="flex-1 text-xs font-medium leading-relaxed text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Snapshot saved */}
      {snapshot && (
        <div className="fade-up flex items-center gap-3 rounded-xl border border-sky-500/25 bg-sky-500/8 px-3.5 py-3">
          <ImageIcon className="size-4 shrink-0 text-sky-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-sky-300">Snímka uložená</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{snapshot.path}</p>
          </div>
          <button
            onClick={() => revealInFinder(snapshot.path).catch(() => {})}
            className="flex items-center gap-1.5 rounded-lg border border-sky-500/20 bg-sky-500/10 px-2.5 py-1.5 text-xs font-semibold text-sky-300 transition-all hover:bg-sky-500/20"
          >
            <FolderOpen className="size-3.5" /> Zobraziť
          </button>
          <button onClick={() => setSnapshot(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Preview */}
      <div className="relative shrink-0">
        <PreviewCanvas source={settings.source} status={status} elapsed={elapsed} countdown={countdown} stream={previewStream} summary={previewSummary} />
        {settings.source === "both" && isActive && (
          <PipOverlay rect={pipRect} onChange={setPipRect} disabled={status === "paused"} />
        )}
      </div>

      {/* Audio meters */}
      {isActive && (settings.microphone || settings.systemAudio) && (
        <div className="flex gap-3 rounded-xl border border-border/50 bg-[var(--surface)] px-3.5 py-2.5">
          {settings.microphone && <AudioMeterBar label="Microphone" level={micLevel} active={settings.microphone} />}
          {settings.systemAudio && <AudioMeterBar label="System audio" level={sysLevel} active={settings.systemAudio} />}
        </div>
      )}

      {/* Config panel (idle only) */}
      {showConfig && (
        <div className="fade-up flex flex-col gap-5">
          {/* Quick presets */}
          <section className="flex flex-col gap-2.5">
            <SectionLabel>Quick start</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  className={cn(
                    "flex flex-1 min-w-[100px] flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.98]",
                    appSettings.recording.activePresetId === p.id
                      ? "border-primary/50 bg-primary/10"
                      : "border-border/60 bg-[var(--surface)] hover:border-border",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Zap className="size-3 text-accent" /> {p.name}
                  </span>
                  <span className="text-[10px] leading-tight text-muted-foreground">{p.description}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => startWithPreset(appSettings.recording.activePresetId)}
              className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/8 py-2.5 text-xs font-bold text-primary transition-all hover:bg-primary/15"
            >
              <Zap className="size-3.5" />
              Record with {findPreset(appSettings.recording.activePresetId, appSettings.recording.presets)?.name ?? "preset"}
            </button>
          </section>

          {/* Source */}
          <section className="flex flex-col gap-2.5">
            <SectionLabel>Source</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              {SOURCES.map((src) => (
                <SourceCard
                  key={src.id}
                  active={settings.source === src.id}
                  title={src.title}
                  desc={src.desc}
                  icon={src.icon}
                  onClick={() => setSettings((p) => ({ ...p, source: src.id }))}
                />
              ))}
            </div>
          </section>

          {/* Devices */}
          <section className="flex flex-col gap-2.5">
            <SectionLabel>Devices</SectionLabel>

            {needsCamera && !hasLabels && (
              <button
                onClick={requestPermission}
                className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/8 px-3.5 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
              >
                <Info className="size-4 shrink-0" />
                Allow camera &amp; microphone access to list your devices
              </button>
            )}

          {needsScreen && (
            <div className="flex flex-col gap-1.5">
              <MonitorPicker
                monitors={monitors}
                selectedId={settings.screenTarget.id}
                onChange={(id, index) => {
                  const idx = monitors.findIndex((m) => m.id === id)
                  if (idx >= 0) setSettings((p) => ({ ...p, screenTarget: monitorToTarget(monitors[idx], idx) }))
                  else if (index >= 0 && monitors[index]) {
                    setSettings((p) => ({ ...p, screenTarget: monitorToTarget(monitors[index], index) }))
                  }
                }}
                onHighlight={(m) => highlightMonitor(m).catch(() => {})}
              />
              <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground/60">
                <Info className="size-3 shrink-0" />
                Klikni na displej v mape alebo „Ukázať“ — pri nahrávaní potvrdíš výber v systémovom dialógu.
              </p>
            </div>
          )}

            {needsCamera && (
              <Dropdown
                value={settings.cameraDeviceId}
                options={cameraOptions}
                icon={Camera}
                emptyLabel={hasLabels ? "No cameras found" : "Grant access to list cameras"}
                onRefresh={refresh}
                onChange={(id) => setSettings((p) => ({ ...p, cameraDeviceId: id }))}
              />
            )}
          </section>

          {/* Audio */}
          <section className="flex flex-col gap-2.5">
            <SectionLabel>Audio</SectionLabel>
            <div className="flex gap-2">
              <AudioToggle active={settings.microphone} onIcon={Mic} offIcon={MicOff} label="Microphone"
                onChange={() => setSettings((p) => ({ ...p, microphone: !p.microphone }))} />
              <AudioToggle active={settings.systemAudio} onIcon={Volume2} offIcon={VolumeX} label="System audio"
                onChange={() => setSettings((p) => ({ ...p, systemAudio: !p.systemAudio }))} />
            </div>
            {settings.microphone && micOptions.length > 0 && (
              <Dropdown
                value={settings.micDeviceId}
                options={micOptions}
                icon={Mic}
                emptyLabel="No microphones found"
                onRefresh={refresh}
                onChange={(id) => setSettings((p) => ({ ...p, micDeviceId: id }))}
              />
            )}
          </section>

          {/* Webcam / PiP */}
          {needsCamera && (
            <section className="flex flex-col gap-2.5">
              <SectionLabel>Camera</SectionLabel>
              <button
                type="button"
                onClick={() => setSettings((p) => ({ ...p, cameraBlur: !p.cameraBlur }))}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-colors",
                  settings.cameraBlur
                    ? "border-primary/40 bg-primary/10"
                    : "border-border/60 bg-[var(--surface)] hover:bg-[var(--surface-hover)]",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="size-4 text-accent" />
                  <div>
                    <p className="text-xs font-bold text-foreground">Blur background</p>
                    <p className="text-[10px] text-muted-foreground">Soft halo around PiP or camera framing</p>
                  </div>
                </div>
                <div className={cn(
                  "flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
                  settings.cameraBlur ? "bg-primary" : "bg-secondary",
                )}>
                  <div className={cn("size-4 rounded-full bg-white shadow-sm transition-transform", settings.cameraBlur ? "translate-x-4" : "translate-x-0")} />
                </div>
              </button>
              {settings.source === "both" && (
                <div className="flex gap-3">
                  <OptionGroup label="PiP size" value={settings.pipSize}
                    options={[
                      { v: "small" as PipSize, label: "S" },
                      { v: "medium" as PipSize, label: "M" },
                      { v: "large" as PipSize, label: "L" },
                    ]}
                    onChange={(v) => setSettings((p) => ({ ...p, pipSize: v }))}
                  />
                  <OptionGroup label="PiP position" value={settings.pipPosition}
                    options={[
                      { v: "bottom-right" as PipPosition, label: "BR" },
                      { v: "bottom-left" as PipPosition, label: "BL" },
                      { v: "top-right" as PipPosition, label: "TR" },
                      { v: "top-left" as PipPosition, label: "TL" },
                    ]}
                    onChange={(v) => setSettings((p) => ({ ...p, pipPosition: v }))}
                  />
                </div>
              )}
            </section>
          )}

          {/* Cursor highlight */}
          <section className="flex flex-col gap-2.5">
            <SectionLabel>Cursor</SectionLabel>
            <button
              type="button"
              onClick={() => setSettings((p) => ({ ...p, cursorHighlight: !p.cursorHighlight }))}
              className={cn(
                "flex items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-colors",
                settings.cursorHighlight
                  ? "border-primary/40 bg-primary/10"
                  : "border-border/60 bg-[var(--surface)] hover:bg-[var(--surface-hover)]",
              )}
            >
              <div className="flex items-center gap-2.5">
                <MousePointer2 className="size-4 text-accent" />
                <div>
                  <p className="text-xs font-bold text-foreground">Spotlight &amp; click rings</p>
                  <p className="text-[10px] text-muted-foreground">Great for tutorials — overlay during recording</p>
                </div>
              </div>
              <div className={cn(
                "flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
                settings.cursorHighlight ? "bg-primary" : "bg-secondary",
              )}>
                <div className={cn("size-4 rounded-full bg-white shadow-sm transition-transform", settings.cursorHighlight ? "translate-x-4" : "translate-x-0")} />
              </div>
            </button>
          </section>

          {/* Output */}
          <section className="flex flex-col gap-2.5">
            <SectionLabel>Output</SectionLabel>
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
          </section>
        </div>
      )}

      {/* Annotate toolbar – during recording / paused */}
      {isActive && (
        <div className="fade-up flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-[var(--surface)] px-3 py-2.5">
          <div className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
            annotating ? "bg-primary/15" : "bg-secondary",
          )}>
            <Pencil className={cn("size-4", annotating ? "text-primary" : "text-muted-foreground")} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-foreground">
              {annotating ? "Kreslenie aktívne" : "Anotácia"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {annotating ? "⌘S uloží snímku · Esc zavrie panel" : "Kresli priamo na obrazovku"}
            </p>
          </div>
          {status === "recording" && (
            <button
              onClick={pauseAndDraw}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 transition-all hover:bg-amber-500/20"
            >
              <Pause className="size-3.5" /> Pozastaviť a kresliť
            </button>
          )}
          <button
            onClick={toggleAnnotate}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all",
              annotating
                ? "border-primary/40 bg-primary/15 text-primary hover:bg-primary/25"
                : "border-border/60 bg-secondary text-foreground hover:bg-secondary/60",
            )}
          >
            <Pencil className="size-3.5" />
            {annotating ? "Zavrieť" : "Otvoriť panel"}
          </button>
        </div>
      )}

      </div>

      {/* Action buttons (pinned to bottom) */}
      <div className="shrink-0 border-t border-border/50 bg-background/60 px-5 py-4">
        <div className="flex gap-2">
        {status === "idle" && (
          <button onClick={startCountdown}
            className={cn(
              "group flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-4 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-all hover:bg-accent hover:shadow-primary/35 active:scale-[0.98]",
              armHighlight && "ring-2 ring-accent ring-offset-2 ring-offset-background animate-pulse",
            )}
          >
            <Video className="size-4 transition-transform group-hover:scale-110" />
            Start Recording
            <ChevronRight className="size-4 opacity-60" />
          </button>
        )}

        {(status === "countdown" || status === "preparing") && (
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
                <p className="truncate font-mono text-[11px] text-muted-foreground">
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
    </div>
  )
}
