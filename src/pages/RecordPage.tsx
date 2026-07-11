import { useState, useEffect, useRef, useCallback } from "react"
import {
  Camera,
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
  Pencil,
  FolderOpen,
  X,
  AlertCircle,
  RefreshCw,
  Info,
  Zap,
  MousePointer2,
  Sparkles,
} from "lucide-react"
import { openRecordingHud, closeRecordingHud } from "@/lib/recordingHud"
import { openCursorOverlay, closeCursorOverlay } from "@/lib/cursorOverlay"
import { minimizeMainWindow, restoreMainWindow } from "@/lib/windowControl"
import { AnnotationLayer, type DrawState } from "@/lib/annotation"
import { LiveDrawOverlay } from "@/components/record/LiveDrawOverlay"
import { findPreset } from "@/lib/presets"
import { defaultPipRect, type PipRect, type PipPosition, type PipSize } from "@/lib/capture"
import { createAudioMeter } from "@/lib/audioMeter"
import { AudioMeterBar } from "@/components/record/AudioMeterBar"
import { MacButton, MacGroup, MacGroupHeader, MacPageHeader, MacSegmented, ChoiceGroup } from "@/components/mac/MacUIKit"
import { PageScrollArea } from "@/components/layout/PageScrollArea"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  formatBytes,
  isLowDiskSpace,
} from "@/hooks/useBloomBackend"
import { useMediaDevices } from "@/hooks/useMediaDevices"
import { useSettings } from "@/hooks/useSettings"
import { startCapture, openCameraStream, type CaptureHandle } from "@/lib/capture"
import { highlightMonitor, dismissMonitorHighlight } from "@/lib/monitorHighlight"
import { MonitorPicker } from "@/components/record/MonitorPicker"
import { PreviewFaultPanel } from "@/components/record/PreviewFaultPanel"
import {
  buildPreviewFault,
  collectPreviewTechDetails,
  expectsPreviewStream,
} from "@/lib/previewDiagnostics"
import { sk } from "@/lib/i18n/sk"
import { RECORDING_QUALITIES } from "@/lib/videoOptions"

function captureErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name ?? ""
  const msg = (err as { message?: string })?.message ?? String(err)
  if (name === "NotAllowedError" || name === "AbortError") {
    return sk.record.errors.permission
  }
  if (name === "NotFoundError") {
    return sk.record.errors.notFound
  }
  if (name === "NotSupportedError" || msg.includes("MediaRecorder")) {
    return sk.record.errors.notSupported
  }
  return sk.record.errors.failed(msg)
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
    label: `${m.name}${m.is_primary ? sk.record.primarySuffix : ""}`,
    type: "screen",
    index: index + 1,
    appName: `${m.width}×${m.height}`,
  }
}

const DEFAULT_TARGET: ScreenTarget = { id: "default", label: sk.record.primaryDisplay, type: "screen", index: 1 }

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
  const selected = options.find((o) => o.id === value) ?? options[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-auto w-full justify-between gap-2 rounded-xl px-3.5 py-3 text-left"
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
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        {onRefresh && (
          <>
            <DropdownMenuItem onClick={onRefresh}>
              <RefreshCw className="size-3" /> {sk.record.refreshDevices}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {options.length === 0 ? (
          <DropdownMenuLabel className="py-3 font-normal">{emptyLabel}</DropdownMenuLabel>
        ) : (
          <ScrollArea className="max-h-48">
            {options.map((opt) => {
              const active = opt.id === value
              const I = opt.icon ?? HeaderIcon
              return (
                <DropdownMenuItem
                  key={opt.id}
                  onClick={() => onChange(opt.id)}
                  className="gap-3 py-2.5"
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
                </DropdownMenuItem>
              )
            })}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
        "flex flex-1 items-center gap-2.5 rounded-xl border px-3.5 py-3.5 text-sm font-medium transition-all min-h-[52px] cursor-pointer",
        active
          ? "border-primary/50 bg-primary/10 text-primary ring-1 ring-primary/25"
          : "border-border/60 bg-[var(--surface)] text-muted-foreground hover:border-border hover:bg-secondary/40 hover:text-foreground",
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

// ── Preview canvas ─────────────────────────────────────────────────────────────
function PreviewCanvas({ source, status, elapsed, countdown, stream, summary, drawing, drawOverlay }: {
  source: RecordingSource; status: RecordingStatus; elapsed: number; countdown: number
  stream: MediaStream | null; summary?: string
  drawing?: boolean
  drawOverlay?: React.ReactNode
}) {
  const isRecording = status === "recording"
  const isPaused    = status === "paused"
  const isActive    = isRecording || isPaused
  const videoRef    = useRef<HTMLVideoElement>(null)
  const [playError, setPlayError] = useState("")
  const [poll, setPoll] = useState(0)
  const [streamReady, setStreamReady] = useState(false)

  useEffect(() => {
    setStreamReady(false)
    if (!stream) return
    const t = window.setTimeout(() => setStreamReady(true), 900)
    return () => window.clearTimeout(t)
  }, [stream, status])

  useEffect(() => {
    if (!expectsPreviewStream(source, status) && !(status === "idle" && source === "screen")) return
    const id = window.setInterval(() => setPoll((n) => n + 1), 400)
    return () => window.clearInterval(id)
  }, [source, status, stream])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    setPlayError("")
    v.srcObject = stream
    const tryPlay = () => {
      v.play().catch((e: unknown) => {
        setPlayError(e instanceof Error ? e.message : String(e))
      })
    }
    tryPlay()
    v.addEventListener("loadeddata", tryPlay)
    v.addEventListener("canplay", tryPlay)
    return () => {
      v.removeEventListener("loadeddata", tryPlay)
      v.removeEventListener("canplay", tryPlay)
    }
  }, [stream])

  void poll
  const details = collectPreviewTechDetails(source, status, stream, videoRef.current, playError)
  const fault = buildPreviewFault(source, status, details)
  const hasFrames = details.videoElementSize !== "0×0" && !details.videoElementSize.startsWith("0×")
  const showFault = fault != null && (
    fault.kind === "idle_screen"
    || fault.kind === "camera_missing"
    || fault.kind === "no_stream"
    || fault.kind === "track_ended"
    || (streamReady && (fault.kind === "no_frames" || fault.kind === "play_blocked"))
  ) && !(hasFrames && fault.kind === "no_frames")

  const showVideo = !!stream && hasFrames

  return (
    <div className={cn(
      "relative flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/90",
      isRecording && "ring-1 ring-[var(--rec-indicator)]/50",
    )}>
      <div className="absolute inset-0 z-0 bg-black" />
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={cn("absolute inset-0 z-[1] h-full w-full object-contain bg-black", showVideo ? "opacity-100" : "opacity-0")}
      />

      {showFault && fault && <PreviewFaultPanel fault={fault} details={details} />}

      {status === "preparing" && !showFault && (
        <div className="relative z-[2] flex flex-col items-center gap-2">
          <div className="size-8 animate-spin rounded-full border-2 border-transparent border-t-[var(--accent)]" />
          <p className="text-[12px] text-muted-foreground">{sk.record.preparing}</p>
        </div>
      )}

      {status === "countdown" && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/40">
          <div className="flex flex-col items-center gap-2">
            <span className="text-5xl font-semibold tabular-nums text-white">{countdown}</span>
            <p className="text-[12px] text-white/80">{sk.record.starting}</p>
          </div>
        </div>
      )}

      {isActive && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-30 rounded-lg bg-black/55 px-2.5 py-1.5">
          <div className="font-mono text-lg font-medium tabular-nums text-white">{formatDuration(elapsed)}</div>
          {isPaused && <span className="text-[10px] text-white/70">{sk.record.paused}</span>}
        </div>
      )}

      {status === "processing" && (
        <div className="relative z-[2] flex flex-col items-center gap-2">
          <div className="size-8 animate-spin rounded-full border-2 border-transparent border-t-[var(--accent)]" />
          <p className="text-[12px] text-muted-foreground">{sk.record.saving}</p>
        </div>
      )}

      {status === "done" && (
        <div className="relative z-[2] flex flex-col items-center gap-2">
          <CheckCircle2 className="size-8 text-[var(--status-success-fg)]" />
          <p className="text-[13px] font-medium text-[var(--status-success-fg)]">{sk.record.saved}</p>
        </div>
      )}

      {isRecording && (
        <div className="absolute left-3 top-3 z-30 flex items-center gap-1.5 rounded-md bg-black/50 px-2 py-1">
          <span className="rec-dot size-2 rounded-full" />
          <span className="text-[10px] font-medium text-white/90">REC</span>
        </div>
      )}

      {status === "idle" && summary && !showFault && (
        <div className="absolute bottom-2 left-2 z-[2] rounded-md bg-black/50 px-2 py-1 text-[10px] text-white/70">
          {summary}
        </div>
      )}

      {drawing && drawOverlay}
    </div>
  )
}

// ── Section label ──────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mac-group-header !px-0">{children}</p>
}

const SOURCES: { id: RecordingSource; label: string }[] = [
  { id: "screen", label: sk.record.sources.screen },
  { id: "camera", label: sk.record.sources.camera },
  { id: "both", label: sk.record.sources.both },
]

// ── Save location banner ───────────────────────────────────────────────────────
function SaveBanner({ path, onDismiss }: { path: string; onDismiss: () => void }) {
  return (
    <div className="fade-up banner-success flex items-center gap-3 rounded-xl px-3.5 py-3">
      <FolderOpen className="size-4 shrink-0 opacity-80" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">{sk.record.savedTo}</p>
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
  active?: boolean
  onRecordingChange?: (active: boolean) => void
}

export function RecordPage({ active = true, onRecordingChange }: RecordPageProps) {
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
  const annotationLayerRef = useRef<AnnotationLayer>(new AnnotationLayer())
  const [pipRect, setPipRectState] = useState<PipRect>(() => pipLayoutRef.current)
  const setPipRect = useCallback((r: PipRect) => {
    pipLayoutRef.current = r
    setPipRectState({ ...r })
  }, [])
  useEffect(() => {
    setDrawState((s) => ({
      ...s,
      tool: appSettings.annotation.defaultTool,
      color: appSettings.annotation.defaultColor,
      width: appSettings.annotation.defaultWidth,
    }))
  }, [appSettings.annotation.defaultTool, appSettings.annotation.defaultColor, appSettings.annotation.defaultWidth])

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
  const [drawingMode, setDrawingMode] = useState(false)
  const [drawState, setDrawState] = useState<DrawState>(() => ({
    tool: appSettings.annotation.defaultTool,
    color: appSettings.annotation.defaultColor,
    width: appSettings.annotation.defaultWidth,
  }))
  const [error,      setError]      = useState<string | null>(null)
  const [diskWarn,   setDiskWarn]   = useState<string | null>(null)
  const [savedMeta,  setSavedMeta]  = useState<{ title: string; size: string } | null>(null)
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)

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
          setDiskWarn(sk.record.lowDisk(formatBytes(info.available_bytes)))
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
      setCameraStream(null)
    }
    async function run() {
      if (status !== "idle") return  // keep the stream alive through recording
      if (settings.source === "camera" || settings.source === "both") {
        stopLive()
        try {
          const s = await openCameraStream(settings.cameraDeviceId || undefined, settings.quality)
          if (cancelled) { s.getTracks().forEach((t) => t.stop()); return }
          liveCamRef.current = s
          setCameraStream(s)
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

  // Remove old overlay snapshot flow — strokes are baked into the recording.
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
    annotationLayerRef.current.clear()
    setDrawingMode(false)
    await dismissMonitorHighlight()
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
        annotationLayerRef,
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
      setError(sk.record.errors.openFile(e))
      handle.stop()
      captureRef.current = null
      return false
    }

    try {
      const opts: MediaRecorderOptions = mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : {}
      const recorder = new MediaRecorder(handle.recordStream, opts)

      recorder.onerror = () => {
        setError(sk.record.errors.mediaRecorder)
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
    setStatus("preparing")
    setError(null)

    const prepared = await prepareCaptureFlow()
    if (!prepared) {
      setStatus("idle")
      return
    }

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

  /** Toggle live drawing — strokes are composited into the recorded video. */
  function toggleDrawingMode() {
    setDrawingMode((on) => !on)
  }

  async function stopRecording() {
    stopElapsedTimer()
    setDrawingMode(false)
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
    annotationLayerRef.current.clear()
    setDrawingMode(false)
    closeCursorOverlay().catch(() => {})
    setPreviewStream(needsCamera ? liveCamRef.current : null)
    showAfterRecording()
    setStatus("idle")
    setCountdown(0)
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
    settings.microphone ? sk.record.microphone : null,
    settings.systemAudio ? sk.record.systemAudio : null,
  ].filter(Boolean).join("  ·  ")

  return (
    <div className="flex h-full flex-col">
      <MacPageHeader title={sk.record.title} subtitle={sk.record.subtitle} />

      <PageScrollArea active={active}>
      <div className="flex flex-col gap-3 px-6 pb-4">

      {showBanner && bloomDir && (
        <SaveBanner path={bloomDir} onDismiss={() => setShowBanner(false)} />
      )}

      {diskWarn && (
        <div className="fade-up banner-warning flex items-center gap-3 rounded-xl px-3.5 py-2.5">
          <AlertCircle className="size-4 shrink-0 opacity-80" />
          <p className="flex-1 text-xs font-medium">{diskWarn}</p>
          <button onClick={() => setDiskWarn(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="fade-up banner-error flex items-start gap-3 rounded-xl px-3.5 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 opacity-80" />
          <p className="flex-1 text-xs font-medium leading-relaxed">{error}</p>
          <button onClick={() => setError(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Preview */}
      <div className="relative shrink-0">
        <PreviewCanvas
          source={settings.source}
          status={status}
          elapsed={elapsed}
          countdown={countdown}
          stream={previewStream}
          summary={previewSummary}
          drawing={drawingMode && isActive}
          drawOverlay={
            drawingMode && isActive ? (
              <LiveDrawOverlay
                layer={annotationLayerRef.current}
                drawState={drawState}
                onToolChange={(tool) => setDrawState((s) => ({ ...s, tool }))}
                onColorChange={(color) => setDrawState((s) => ({ ...s, color, tool: s.tool === "eraser" ? "pen" : s.tool }))}
                onClose={() => setDrawingMode(false)}
              />
            ) : undefined
          }
        />
        {settings.source === "both" && isActive && (
          <PipOverlay
            rect={pipRect}
            onChange={setPipRect}
            disabled={status === "paused"}
            cameraStream={cameraStream}
          />
        )}
      </div>

      {/* Audio meters */}
      {isActive && (settings.microphone || settings.systemAudio) && (
        <div className="flex gap-3 rounded-xl border border-border/50 bg-[var(--surface)] px-3.5 py-2.5">
          {settings.microphone && <AudioMeterBar label={sk.record.microphone} level={micLevel} active={settings.microphone} />}
          {settings.systemAudio && <AudioMeterBar label={sk.record.systemAudio} level={sysLevel} active={settings.systemAudio} />}
        </div>
      )}

      {/* Config panel (idle only) */}
      {showConfig && (
        <div className="fade-up flex flex-col gap-5">
          {/* Quick presets */}
          <section className="flex flex-col gap-2.5">
            <SectionLabel>{sk.record.quickStart}</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => {
                const active = appSettings.recording.activePresetId === p.id
                return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={cn(
                    "bloom-card relative flex flex-1 min-w-[120px] flex-col items-start gap-1 px-3.5 py-3 text-left active:scale-[0.98]",
                    active && "bloom-card-active ring-2 ring-accent/30",
                  )}
                >
                  {active && (
                    <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-accent text-white">
                      <CheckIcon className="size-3" strokeWidth={3} />
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 pr-6 text-xs font-bold text-foreground">
                    <Zap className="size-3 text-accent" /> {p.name}
                  </span>
                  <span className="text-[10px] leading-tight text-muted-foreground">{p.description}</span>
                </button>
              )})}
            </div>
            <button
              onClick={() => startWithPreset(appSettings.recording.activePresetId)}
              className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/8 py-2.5 text-xs font-bold text-primary transition-all hover:bg-primary/15"
            >
              <Zap className="size-3.5" />
              {sk.record.recordWithPreset(findPreset(appSettings.recording.activePresetId, appSettings.recording.presets)?.name ?? "predvoľba")}
            </button>
          </section>

          {/* Source */}
          <section>
            <MacGroupHeader>{sk.record.source}</MacGroupHeader>
            <MacGroup>
              <div className="p-3">
                <MacSegmented
                  options={SOURCES.map((s) => ({ value: s.id, label: s.label }))}
                  value={settings.source}
                  onChange={(v) => setSettings((p) => ({ ...p, source: v }))}
                />
              </div>
            </MacGroup>
          </section>

          {/* Devices */}
          <section>
            <MacGroupHeader>{sk.record.display}</MacGroupHeader>
            {needsScreen && (
              <>
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
                <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
                  {sk.record.displayHint}
                </p>
              </>
            )}

            {needsCamera && !hasLabels && (
              <button
                onClick={requestPermission}
                className="mac-btn mac-btn-ghost mt-2 w-full justify-start text-[12px] text-muted-foreground"
              >
                <Info className="size-3.5" />
                {sk.record.allowAccess}
              </button>
            )}

            {needsCamera && (
              <div className="mt-2">
                <Dropdown
                  value={settings.cameraDeviceId}
                  options={cameraOptions}
                  icon={Camera}
                  emptyLabel={hasLabels ? sk.record.noCameras : sk.record.grantCameraAccess}
                  onRefresh={refresh}
                  onChange={(id) => setSettings((p) => ({ ...p, cameraDeviceId: id }))}
                />
              </div>
            )}
          </section>

          {/* Audio */}
          <section className="flex flex-col gap-2.5">
            <SectionLabel>{sk.record.audio}</SectionLabel>
            <div className="flex gap-2">
              <AudioToggle active={settings.microphone} onIcon={Mic} offIcon={MicOff} label={sk.record.microphone}
                onChange={() => setSettings((p) => ({ ...p, microphone: !p.microphone }))} />
              <AudioToggle active={settings.systemAudio} onIcon={Volume2} offIcon={VolumeX} label={sk.record.systemAudio}
                onChange={() => setSettings((p) => ({ ...p, systemAudio: !p.systemAudio }))} />
            </div>
            {settings.microphone && micOptions.length > 0 && (
              <Dropdown
                value={settings.micDeviceId}
                options={micOptions}
                icon={Mic}
                emptyLabel={sk.record.noMicrophones}
                onRefresh={refresh}
                onChange={(id) => setSettings((p) => ({ ...p, micDeviceId: id }))}
              />
            )}
          </section>

          {/* Webcam / PiP */}
          {needsCamera && (
            <section className="flex flex-col gap-2.5">
              <SectionLabel>{sk.record.camera}</SectionLabel>
              <button
                type="button"
                onClick={() => setSettings((p) => ({ ...p, cameraBlur: !p.cameraBlur }))}
                className={cn(
                  "bloom-card flex w-full items-center justify-between px-3.5 py-3.5 text-left min-h-[52px] cursor-pointer",
                  settings.cameraBlur && "bloom-card-active ring-2 ring-accent/25",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="size-4 text-accent" />
                  <div>
                    <p className="text-xs font-bold text-foreground">{sk.record.blurBackground}</p>
                    <p className="text-[10px] text-muted-foreground">{sk.record.blurBackgroundHint}</p>
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
                <div className="flex flex-col gap-4">
                  <ChoiceGroup
                    label={sk.record.pipSize}
                    value={settings.pipSize}
                    options={([
                      ["small", sk.record.pipSizes.small],
                      ["medium", sk.record.pipSizes.medium],
                      ["large", sk.record.pipSizes.large],
                    ] as const).map(([value, label]) => ({ value, label }))}
                    onChange={(v) => setSettings((p) => ({ ...p, pipSize: v as PipSize }))}
                  />
                  <ChoiceGroup
                    label={sk.record.pipPosition}
                    layout="wrap"
                    value={settings.pipPosition}
                    options={([
                      ["bottom-right", sk.record.pipPositions["bottom-right"]],
                      ["bottom-left", sk.record.pipPositions["bottom-left"]],
                      ["top-right", sk.record.pipPositions["top-right"]],
                      ["top-left", sk.record.pipPositions["top-left"]],
                    ] as const).map(([value, label]) => ({ value, label }))}
                    onChange={(v) => setSettings((p) => ({ ...p, pipPosition: v as PipPosition }))}
                  />
                </div>
              )}
            </section>
          )}

          {/* Cursor highlight */}
          <section className="flex flex-col gap-2.5">
            <SectionLabel>{sk.record.cursor}</SectionLabel>
            <button
              type="button"
              onClick={() => setSettings((p) => ({ ...p, cursorHighlight: !p.cursorHighlight }))}
              className={cn(
                "bloom-card flex w-full items-center justify-between px-3.5 py-3.5 text-left min-h-[52px] cursor-pointer",
                settings.cursorHighlight && "bloom-card-active ring-2 ring-accent/25",
              )}
            >
              <div className="flex items-center gap-2.5">
                <MousePointer2 className="size-4 text-accent" />
                <div>
                  <p className="text-xs font-bold text-foreground">{sk.record.cursorSpotlight}</p>
                  <p className="text-[10px] text-muted-foreground">{sk.record.cursorSpotlightHint}</p>
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
          <section className="flex flex-col gap-4">
            <SectionLabel>{sk.record.output}</SectionLabel>
            <ChoiceGroup
              label={sk.record.quality}
              value={settings.quality}
              options={RECORDING_QUALITIES.map((q) => ({ value: q, label: sk.qualities[q] }))}
              onChange={(v) => setSettings((p) => ({ ...p, quality: v }))}
            />
            <ChoiceGroup
              label={sk.record.countdown}
              value={String(settings.countdown)}
              options={[
                { value: "0", label: sk.record.countdownOff },
                { value: "3", label: "3 s" },
                { value: "5", label: "5 s" },
              ]}
              onChange={(v) => setSettings((p) => ({ ...p, countdown: Number(v) as 0 | 3 | 5 }))}
            />
          </section>
        </div>
      )}

      {/* Draw toolbar – during recording / paused */}
      {isActive && (
        <div className="fade-up flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-[var(--surface)] px-3 py-2.5">
          <div className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
            drawingMode ? "bg-primary/15" : "bg-secondary",
          )}>
            <Pencil className={cn("size-4", drawingMode ? "text-primary" : "text-muted-foreground")} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-foreground">
              {drawingMode ? sk.record.drawingOn : sk.record.annotate}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {drawingMode ? sk.record.drawingHint : sk.record.drawingHintOff}
            </p>
          </div>
          <button
            onClick={toggleDrawingMode}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all",
              drawingMode
                ? "border-primary/40 bg-primary/15 text-primary hover:bg-primary/25"
                : "border-border/60 bg-secondary text-foreground hover:bg-secondary/60",
            )}
          >
            <Pencil className="size-3.5" />
            {drawingMode ? sk.record.done : sk.record.draw}
          </button>
        </div>
      )}

      </div>
      </PageScrollArea>
      <div className="shrink-0 border-t border-border px-6 py-3">
        <div className="flex justify-end gap-2">
        {status === "idle" && (
          <MacButton variant="primary" onClick={startCountdown} className={cn("min-w-[140px] py-2", armHighlight && "ring-2 ring-[var(--accent)]")}>
            <Video className="size-4" /> {sk.record.record}
          </MacButton>
        )}

        {(status === "countdown" || status === "preparing") && (
          <MacButton onClick={cancelCountdown} className="min-w-[100px]">{sk.record.cancel}</MacButton>
        )}

        {isActive && (
          <>
            {status === "recording" ? (
              <MacButton onClick={pauseRecording}><Pause className="size-4" /> {sk.record.pause}</MacButton>
            ) : (
              <MacButton onClick={resumeRecording}><Play className="size-4" /> {sk.record.resume}</MacButton>
            )}
            <MacButton variant="destructive" onClick={stopRecording}>
              <Square className="size-3.5 fill-current" /> {sk.record.stop}
            </MacButton>
          </>
        )}

        {status === "processing" && (
          <MacButton disabled className="opacity-60">
            <div className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {sk.record.saving}
          </MacButton>
        )}

        {status === "done" && (
          <div className="banner-success flex flex-1 items-center gap-2 rounded-lg px-3 py-2">
            <CheckCircle2 className="size-4 opacity-80" />
            <span className="text-[13px] font-medium">{sk.record.saved}{savedMeta ? ` · ${savedMeta.size}` : ""}</span>
            {bloomDir && (
              <MacButton variant="ghost" className="ml-auto !py-1" onClick={() => revealInFinder(bloomDir)}>
                <FolderOpen className="size-3.5" /> {sk.record.show}
              </MacButton>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
