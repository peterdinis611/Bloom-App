import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MutableRefObject,
  type Ref,
} from "react"
import {
  ExternalLink,
  FolderOpen,
  LoaderCircle,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { sk } from "@/lib/i18n/sk"
import { fileSrc, formatDurationSecs } from "@/hooks/useBloomBackend"

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const
type FitMode = "contain" | "cover"
type ControlsLayout = "overlay" | "docked"

export interface BloomVideoPlayerHandle {
  play: () => Promise<void>
  pause: () => void
  toggle: () => Promise<void>
  seek: (seconds: number) => void
  getCurrentTime: () => number
  getDuration: () => number
  getVideoElement: () => HTMLVideoElement | null
}

export interface BloomVideoPlayerProps {
  path?: string
  src?: string
  autoPlay?: boolean
  loop?: boolean
  muted?: boolean
  className?: string
  videoClassName?: string
  showControls?: boolean
  showPlayOverlay?: boolean
  showSpeedControl?: boolean
  showAdvancedOptions?: boolean
  controlsLayout?: ControlsLayout
  autoHideControls?: boolean
  onReveal?: () => void
  onOpenExternal?: () => void
  onTimeUpdate?: (currentTime: number) => void
  onDurationChange?: (duration: number) => void
  onPlayStateChange?: (playing: boolean) => void
  onClick?: () => void
}

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (value: T | null) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === "function") ref(value as T)
      else (ref as MutableRefObject<T | null>).current = value
    }
  }
}

function localizeVideoElementError(video: HTMLVideoElement): string {
  switch (video.error?.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return sk.video.errors.aborted
    case MediaError.MEDIA_ERR_NETWORK:
      return sk.video.errors.network
    case MediaError.MEDIA_ERR_DECODE:
      return sk.video.errors.decode
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return sk.video.errors.unsupported
    default:
      return sk.video.errors.unknown
  }
}

function speedLabel(rate: number): string {
  const key = String(rate) as keyof typeof sk.video.speeds
  return sk.video.speeds[key] ?? `${rate}×`
}

interface ControlsBarProps {
  docked: boolean
  visible: boolean
  isPlaying: boolean
  current: number
  duration: number
  progress: number
  scrubbing: boolean
  rate: number
  volume: number
  muted: boolean
  looping: boolean
  fit: FitMode
  showSpeedControl: boolean
  showAdvancedOptions: boolean
  onScrubStart: () => void
  onScrubEnd: () => void
  onSeek: (t: number) => void
  onTogglePlay: () => void
  onSkip: (delta: number) => void
  onRate: (r: number) => void
  onVolume: (v: number) => void
  onToggleMute: () => void
  onToggleLoop: () => void
  onToggleFit: () => void
  onReveal?: () => void
  onOpenExternal?: () => void
  onBumpControls: () => void
}

function ControlsBar({
  docked,
  visible,
  isPlaying,
  current,
  duration,
  progress,
  scrubbing,
  rate,
  volume,
  muted,
  looping,
  fit,
  showSpeedControl,
  showAdvancedOptions,
  onScrubStart,
  onScrubEnd,
  onSeek,
  onTogglePlay,
  onSkip,
  onRate,
  onVolume,
  onToggleMute,
  onToggleLoop,
  onToggleFit,
  onReveal,
  onOpenExternal,
  onBumpControls,
}: ControlsBarProps) {
  const shell = docked
    ? "shrink-0 space-y-3 border-t border-white/10 bg-[#121212] px-4 py-3"
    : cn(
        "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/92 via-black/60 to-transparent px-3 pb-3 pt-12 transition-opacity duration-300",
        visible || !isPlaying || scrubbing ? "opacity-100" : "opacity-0",
      )

  return (
    <div className={shell}>
      <div className={cn(!docked && "pointer-events-auto space-y-2", docked && "space-y-3")}>
        {/* Scrubber */}
        <div className="relative h-5">
          <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-75"
              style={{ width: `${progress}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.05}
            value={Math.min(current, duration || 0)}
            onPointerDown={() => { onScrubStart(); onBumpControls() }}
            onPointerUp={onScrubEnd}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="bloom-player-scrub absolute inset-0 w-full cursor-pointer opacity-0"
            aria-label={sk.video.play}
          />
        </div>

        {/* Transport */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex size-9 items-center justify-center rounded-lg text-white hover:bg-white/12"
            aria-label={isPlaying ? sk.video.pause : sk.video.play}
          >
            {isPlaying ? <Pause className="size-[18px]" /> : <Play className="size-[18px] translate-x-px" />}
          </button>

          <button
            type="button"
            onClick={() => onSkip(-10)}
            className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium text-white/75 hover:bg-white/12"
          >
            <RotateCcw className="size-3.5" />
            {sk.video.skipBack}
          </button>

          <button
            type="button"
            onClick={() => onSkip(10)}
            className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium text-white/75 hover:bg-white/12"
          >
            <RotateCw className="size-3.5" />
            {sk.video.skipForward}
          </button>

          <span className="min-w-[6.5rem] px-1 font-mono text-[11px] tabular-nums text-white/75">
            {formatDurationSecs(current)} / {formatDurationSecs(duration)}
          </span>

          <div className="flex-1" />

          {onOpenExternal && (
            <button
              type="button"
              onClick={onOpenExternal}
              className="hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-white/70 hover:bg-white/12 hover:text-white md:flex"
              title={sk.video.openInSystem}
            >
              <ExternalLink className="size-3.5" />
              {sk.video.openInSystem}
            </button>
          )}

          {onReveal && (
            <button
              type="button"
              onClick={onReveal}
              className="flex size-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/12 hover:text-white"
              title={sk.video.openInFinder}
            >
              <FolderOpen className="size-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onToggleMute}
            className="flex size-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/12 hover:text-white"
            aria-label={muted ? sk.video.unmute : sk.video.mute}
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
        </div>

        {/* Speed — single row, horizontal scroll */}
        {showSpeedControl && (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white/40">
              {sk.video.speed}
            </span>
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {PLAYBACK_RATES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => { onRate(r); onBumpControls() }}
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                    rate === r
                      ? "bg-[var(--accent)] text-white"
                      : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white",
                  )}
                >
                  {speedLabel(r)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Advanced options */}
        {showAdvancedOptions && (
          <div className="flex flex-wrap items-center gap-3 border-t border-white/8 pt-3">
            <button
              type="button"
              onClick={onToggleLoop}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                looping ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-white/8 text-white/65 hover:bg-white/12",
              )}
            >
              <Repeat className={cn("size-3.5", looping && "fill-current")} />
              {looping ? sk.video.loop : sk.video.loopOff}
            </button>

            <button
              type="button"
              onClick={onToggleFit}
              className="rounded-lg bg-white/8 px-2.5 py-1.5 text-[11px] font-medium text-white/65 hover:bg-white/12"
            >
              {fit === "contain" ? sk.video.fitContain : sk.video.fitFill}
            </button>

            <label className="flex min-w-[140px] flex-1 items-center gap-2">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                {sk.video.volume}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => onVolume(Number(e.target.value))}
                className="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--accent)]"
              />
            </label>
          </div>
        )}

        {docked && (
          <p className="text-[10px] text-white/30">{sk.video.shortcuts}</p>
        )}
      </div>
    </div>
  )
}

export const BloomVideoPlayer = forwardRef<BloomVideoPlayerHandle, BloomVideoPlayerProps>(
  function BloomVideoPlayer(
    {
      path,
      src,
      autoPlay = false,
      loop: loopProp = false,
      muted: mutedProp = false,
      className,
      videoClassName,
      showControls = true,
      showPlayOverlay = false,
      showSpeedControl = false,
      showAdvancedOptions = false,
      controlsLayout = "overlay",
      autoHideControls = false,
      onReveal,
      onOpenExternal,
      onTimeUpdate,
      onDurationChange,
      onPlayStateChange,
      onClick,
    },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const playAttempts = useRef(0)
    const hideTimer = useRef<number | undefined>(undefined)

    const [status, setStatus] = useState<"loading" | "ready" | "playing" | "paused" | "error">("loading")
    const [error, setError] = useState("")
    const [current, setCurrent] = useState(0)
    const [duration, setDuration] = useState(0)
    const [muted, setMuted] = useState(mutedProp)
    const [volume, setVolume] = useState(1)
    const [rate, setRate] = useState(1)
    const [looping, setLooping] = useState(loopProp)
    const [fit, setFit] = useState<FitMode>("contain")
    const [reloadKey, setReloadKey] = useState(0)
    const [controlsVisible, setControlsVisible] = useState(true)
    const [scrubbing, setScrubbing] = useState(false)

    const docked = controlsLayout === "docked"
    const resolvedSrc = path ? fileSrc(path) : src ?? ""

    const scheduleHideControls = useCallback((playing: boolean) => {
      if (docked) return
      window.clearTimeout(hideTimer.current)
      if (!autoHideControls || !playing) {
        setControlsVisible(true)
        return
      }
      hideTimer.current = window.setTimeout(() => setControlsVisible(false), 2600)
    }, [autoHideControls, docked])

    const revealControls = useCallback(() => {
      setControlsVisible(true)
      if (status === "playing") scheduleHideControls(true)
    }, [scheduleHideControls, status])

    const tryPlay = useCallback(async () => {
      const v = videoRef.current
      if (!v) return
      try {
        await v.play()
        playAttempts.current = 0
        setStatus("playing")
        setError("")
        onPlayStateChange?.(true)
        scheduleHideControls(true)
      } catch (e) {
        const name = e instanceof DOMException ? e.name : ""
        if (name === "AbortError" && playAttempts.current < 5) {
          playAttempts.current += 1
          window.setTimeout(() => { void tryPlay() }, 60 * playAttempts.current)
          return
        }
        if (name === "NotAllowedError") {
          setStatus("paused")
          onPlayStateChange?.(false)
          setControlsVisible(true)
          return
        }
        setError(e instanceof Error ? e.message : String(e))
        setStatus("error")
        onPlayStateChange?.(false)
        setControlsVisible(true)
      }
    }, [onPlayStateChange, scheduleHideControls])

    useImperativeHandle(ref, () => ({
      play: tryPlay,
      pause: () => {
        videoRef.current?.pause()
        setStatus("paused")
        onPlayStateChange?.(false)
        setControlsVisible(true)
        window.clearTimeout(hideTimer.current)
      },
      toggle: async () => {
        const v = videoRef.current
        if (!v) return
        if (v.paused) await tryPlay()
        else {
          v.pause()
          setStatus("paused")
          onPlayStateChange?.(false)
          setControlsVisible(true)
          window.clearTimeout(hideTimer.current)
        }
      },
      seek: (seconds: number) => {
        const v = videoRef.current
        if (!v) return
        v.currentTime = Math.max(0, Math.min(v.duration || 0, seconds))
      },
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      getDuration: () => videoRef.current?.duration ?? 0,
      getVideoElement: () => videoRef.current,
    }), [tryPlay, onPlayStateChange])

    useEffect(() => {
      const v = videoRef.current
      if (!v || !resolvedSrc) return

      playAttempts.current = 0
      setStatus("loading")
      setError("")
      setCurrent(0)
      setDuration(0)
      setControlsVisible(true)

      const onLoadedMeta = () => {
        const d = Number.isFinite(v.duration) ? v.duration : 0
        setDuration(d)
        onDurationChange?.(d)
      }
      const onCanPlay = () => {
        setStatus(v.paused ? "paused" : "playing")
        if (autoPlay && v.paused) void tryPlay()
      }
      const onPlaying = () => {
        setStatus("playing")
        onPlayStateChange?.(true)
        scheduleHideControls(true)
      }
      const onPause = () => {
        setStatus((s) => (s === "error" ? s : "paused"))
        onPlayStateChange?.(false)
        setControlsVisible(true)
        window.clearTimeout(hideTimer.current)
      }
      const onTime = () => {
        if (!scrubbing) setCurrent(v.currentTime)
        onTimeUpdate?.(v.currentTime)
      }
      const onMediaError = () => {
        setError(localizeVideoElementError(v))
        setStatus("error")
        onPlayStateChange?.(false)
        setControlsVisible(true)
      }

      v.src = resolvedSrc
      v.load()

      v.addEventListener("loadedmetadata", onLoadedMeta)
      v.addEventListener("canplay", onCanPlay)
      v.addEventListener("playing", onPlaying)
      v.addEventListener("pause", onPause)
      v.addEventListener("timeupdate", onTime)
      v.addEventListener("error", onMediaError)

      return () => {
        v.removeEventListener("loadedmetadata", onLoadedMeta)
        v.removeEventListener("canplay", onCanPlay)
        v.removeEventListener("playing", onPlaying)
        v.removeEventListener("pause", onPause)
        v.removeEventListener("timeupdate", onTime)
        v.removeEventListener("error", onMediaError)
        v.pause()
        v.removeAttribute("src")
        v.load()
        window.clearTimeout(hideTimer.current)
      }
    }, [resolvedSrc, autoPlay, reloadKey, tryPlay, onDurationChange, onPlayStateChange, onTimeUpdate, scheduleHideControls, scrubbing])

    useEffect(() => {
      const v = videoRef.current
      if (!v) return
      v.muted = muted || volume === 0
      v.volume = Math.max(0, Math.min(1, volume))
      v.playbackRate = rate
      v.loop = looping
    }, [muted, volume, rate, looping])

    const togglePlay = useCallback(() => {
      if (onClick) {
        onClick()
        return
      }
      void (async () => {
        const v = videoRef.current
        if (!v) return
        if (v.paused) await tryPlay()
        else {
          v.pause()
          setStatus("paused")
          onPlayStateChange?.(false)
          setControlsVisible(true)
        }
      })()
    }, [onClick, tryPlay, onPlayStateChange])

    const seekTo = (value: number) => {
      const v = videoRef.current
      if (!v || !Number.isFinite(v.duration)) return
      v.currentTime = value
      setCurrent(value)
    }

    const nudge = useCallback((delta: number) => {
      const v = videoRef.current
      if (!v) return
      seekTo(Math.max(0, Math.min(v.duration || 0, v.currentTime + delta)))
      revealControls()
    }, [revealControls])

    useEffect(() => {
      const root = rootRef.current
      if (!root || !showControls) return

      const onKey = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement) return

        switch (e.key) {
          case " ":
          case "k":
            e.preventDefault()
            void togglePlay()
            break
          case "ArrowLeft":
            e.preventDefault()
            nudge(-5)
            break
          case "ArrowRight":
            e.preventDefault()
            nudge(5)
            break
          case "j":
          case "J":
            e.preventDefault()
            nudge(-10)
            break
          case "l":
          case "L":
            e.preventDefault()
            nudge(10)
            break
          case "m":
          case "M":
            e.preventDefault()
            setMuted((m) => !m)
            revealControls()
            break
          default:
            break
        }
      }

      root.addEventListener("keydown", onKey)
      return () => root.removeEventListener("keydown", onKey)
    }, [showControls, togglePlay, nudge, revealControls])

    const retry = () => setReloadKey((k) => k + 1)
    const isPlaying = status === "playing"
    const progress = duration > 0 ? (current / duration) * 100 : 0

    const controlsProps: ControlsBarProps = {
      docked,
      visible: controlsVisible,
      isPlaying,
      current,
      duration,
      progress,
      scrubbing,
      rate,
      volume,
      muted,
      looping,
      fit,
      showSpeedControl,
      showAdvancedOptions,
      onScrubStart: () => setScrubbing(true),
      onScrubEnd: () => setScrubbing(false),
      onSeek: seekTo,
      onTogglePlay: () => void togglePlay(),
      onSkip: nudge,
      onRate: setRate,
      onVolume: (v) => {
        setVolume(v)
        if (v > 0) setMuted(false)
      },
      onToggleMute: () => setMuted((m) => !m),
      onToggleLoop: () => setLooping((l) => !l),
      onToggleFit: () => setFit((f) => (f === "contain" ? "cover" : "contain")),
      onReveal,
      onOpenExternal,
      onBumpControls: revealControls,
    }

    return (
      <div
        ref={rootRef}
        tabIndex={0}
        role="application"
        aria-label={sk.video.play}
        onMouseMove={docked ? undefined : revealControls}
        onMouseLeave={docked ? undefined : () => { if (isPlaying && autoHideControls) scheduleHideControls(true) }}
        className={cn(
          "bloom-player relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl bg-black outline-none",
          className,
        )}
      >
        <div className="relative min-h-0 flex-1">
          <video
            ref={mergeRefs(videoRef)}
            loop={looping}
            muted={muted}
            playsInline
            preload="auto"
            className={cn(
              "h-full w-full",
              fit === "contain" ? "object-contain" : "object-cover",
              videoClassName,
            )}
            onClick={() => { revealControls(); togglePlay() }}
          />

          {status === "loading" && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
              <LoaderCircle className="size-9 animate-spin text-white/70" />
              <p className="text-[12px] text-white/55">{sk.video.loading}</p>
            </div>
          )}

          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center">
              <p className="text-[13px] font-semibold text-white">{sk.video.errorTitle}</p>
              <p className="max-w-sm text-[12px] leading-relaxed text-white/65">{error || sk.video.errors.unknown}</p>
              <p className="max-w-sm text-[11px] text-white/45">{sk.video.errorHint}</p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                <button type="button" onClick={retry} className="mac-btn inline-flex items-center gap-1.5 border-white/15 bg-white/10 text-white hover:bg-white/15">
                  <RotateCcw className="size-3.5" />
                  {sk.video.retry}
                </button>
                {onOpenExternal && (
                  <button type="button" onClick={onOpenExternal} className="mac-btn inline-flex items-center gap-1.5 border-white/15 bg-white/10 text-white hover:bg-white/15">
                    <ExternalLink className="size-3.5" />
                    {sk.video.openInSystem}
                  </button>
                )}
                {onReveal && (
                  <button type="button" onClick={onReveal} className="mac-btn inline-flex items-center gap-1.5 border-white/15 bg-white/10 text-white hover:bg-white/15">
                    <FolderOpen className="size-3.5" />
                    {sk.video.openInFinder}
                  </button>
                )}
              </div>
            </div>
          )}

          {showPlayOverlay && !isPlaying && status !== "loading" && status !== "error" && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void tryPlay() }}
              className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30"
              aria-label={sk.video.play}
            >
              <span className="flex size-16 items-center justify-center rounded-full bg-white/92 shadow-xl">
                <Play className="size-7 translate-x-0.5 fill-black text-black" />
              </span>
            </button>
          )}

          {showControls && !docked && status !== "error" && (
            <ControlsBar {...controlsProps} />
          )}
        </div>

        {showControls && docked && status !== "error" && (
          <ControlsBar {...controlsProps} />
        )}
      </div>
    )
  },
)
