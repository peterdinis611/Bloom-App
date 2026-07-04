/**
 * capture.ts
 *
 * Builds the MediaStream that gets fed to MediaRecorder for each recording
 * source:
 *
 *   • "screen"  – getDisplayMedia video (+ optional system audio) + optional mic
 *   • "camera"  – getUserMedia camera video + optional mic
 *   • "both"    – screen + camera composited onto a <canvas> (camera as a
 *                 rounded picture-in-picture in the bottom-right) captured via
 *                 canvas.captureStream(), + optional system audio + mic
 *
 * The compositor runs a requestAnimationFrame loop drawing both video
 * elements with object-fit: cover semantics so nothing is stretched.
 */

import type { RecordingSource } from "@/types"

type Quality = "720p" | "1080p"

export type PipSize = "small" | "medium" | "large"
export type PipPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left"

/** Normalised PiP rectangle (0–1) relative to canvas. */
export interface PipRect {
  x: number
  y: number
  w: number
  h: number
}

export function defaultPipRect(size: PipSize, position: PipPosition): PipRect {
  const w = pipWidthFraction(size)
  const aspect = 9 / 16
  const h = w * aspect
  const margin = 0.02
  let x = 1 - w - margin
  let y = 1 - h - margin
  if (position === "bottom-left") x = margin
  else if (position === "top-right") y = margin
  else if (position === "top-left") { x = margin; y = margin }
  return { x, y, w, h }
}

const DIMENSIONS: Record<Quality, { w: number; h: number }> = {
  "720p": { w: 1280, h: 720 },
  "1080p": { w: 1920, h: 1080 },
}

export interface CaptureConfig {
  source: RecordingSource
  quality: Quality
  microphone: boolean
  systemAudio: boolean
  cameraDeviceId?: string
  micDeviceId?: string
  /** Existing (preview-owned) camera stream to reuse instead of re-opening. */
  cameraStream?: MediaStream | null
  /** PiP size when source is "both". */
  pipSize?: PipSize
  pipPosition?: PipPosition
  /** Blur camera background (PiP halo or camera-only framing). */
  cameraBlur?: boolean
  /** Live-updated PiP layout (overrides pipSize/pipPosition when set). */
  pipLayoutRef?: { current: PipRect }
  /** Fired when the captured screen surface ends (user clicks "Stop sharing"). */
  onEnded?: () => void
}

export interface CaptureHandle {
  /** Stream to feed MediaRecorder. */
  recordStream: MediaStream
  /** Stream to show in the live preview <video>. */
  previewStream: MediaStream
  /** Live PiP layout ref (when source is "both"). */
  pipLayoutRef?: { current: PipRect }
  /** Tears down everything this handle created (not the passed-in camera). */
  stop: () => void
}

export function qualityFrameRate(quality: Quality): number {
  return quality === "1080p" ? 30 : 24
}

/** Open a camera stream for the given device (video only). */
export async function openCameraStream(deviceId: string | undefined, quality: Quality): Promise<MediaStream> {
  const { w, h } = DIMENSIONS[quality]
  return navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: deviceId ? { ideal: deviceId } : undefined,
      width: { ideal: w },
      height: { ideal: h },
      frameRate: { ideal: qualityFrameRate(quality) },
    },
    audio: false,
  })
}

async function openMicStream(deviceId: string | undefined): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { ideal: deviceId } } : true,
      video: false,
    })
  } catch {
    return null
  }
}

async function openScreenStream(quality: Quality, systemAudio: boolean): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: qualityFrameRate(quality) },
      // Prefer full displays over individual windows/tabs in the OS picker.
      displaySurface: "monitor",
    } as MediaTrackConstraints,
    audio: systemAudio,
    // @ts-expect-error – Chromium / WebKit extension
    monitorTypeSurfaces: "include",
    preferCurrentTab: false,
  })
}

/** Draw a video onto ctx using object-fit: cover into the given rect. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return
  const scale = Math.max(dw / vw, dh / vh)
  const sw = dw / scale
  const sh = dh / scale
  const sx = (vw - sw) / 2
  const sy = (vh - sh) / 2
  ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh)
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

async function playHidden(stream: MediaStream): Promise<HTMLVideoElement> {
  const v = document.createElement("video")
  v.srcObject = stream
  v.muted = true
  v.playsInline = true
  try {
    await v.play()
  } catch {
    /* autoplay may resolve later; the raf loop tolerates 0-dimension frames */
  }
  return v
}

function pipWidthFraction(size: PipSize): number {
  return size === "small" ? 0.18 : size === "large" ? 0.32 : 0.24
}

/** Camera-only output with optional blurred background framing. */
async function startCameraCompositor(
  camera: MediaStream,
  quality: Quality,
  blur: boolean,
): Promise<{ stream: MediaStream; stop: () => void }> {
  const { w, h } = DIMENSIONS[quality]
  const fps = qualityFrameRate(quality)

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!
  const camVideo = await playHidden(camera)

  let raf = 0
  const render = () => {
    ctx.fillStyle = "#111"
    ctx.fillRect(0, 0, w, h)

    if (blur) {
      ctx.save()
      ctx.filter = "blur(28px) brightness(0.85)"
      drawCover(ctx, camVideo, -w * 0.05, -h * 0.05, w * 1.1, h * 1.1)
      ctx.restore()
    }

    const inset = blur ? 0.08 : 0
    const dx = w * inset
    const dy = h * inset
    const dw = w * (1 - inset * 2)
    const dh = h * (1 - inset * 2)

    if (blur) {
      ctx.save()
      roundedRectPath(ctx, dx, dy, dw, dh, Math.round(w * 0.02))
      ctx.clip()
    }
    drawCover(ctx, camVideo, dx, dy, dw, dh)
    if (blur) ctx.restore()

    raf = requestAnimationFrame(render)
  }
  raf = requestAnimationFrame(render)

  const stream = canvas.captureStream(fps)
  const stop = () => {
    cancelAnimationFrame(raf)
    camVideo.srcObject = null
  }
  return { stream, stop }
}

/**
 * Composites `screen` (background) + `camera` (rounded PiP) onto
 * a canvas and returns a captured stream plus a stop() to end the raf loop.
 */
async function startCompositor(
  screen: MediaStream,
  camera: MediaStream,
  quality: Quality,
  pipSize: PipSize = "medium",
  pipPosition: PipPosition = "bottom-right",
  cameraBlur = false,
  pipLayoutRef?: { current: PipRect },
): Promise<{ stream: MediaStream; stop: () => void }> {
  const { w, h } = DIMENSIONS[quality]
  const fps = qualityFrameRate(quality)

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!

  const [screenVideo, camVideo] = await Promise.all([playHidden(screen), playHidden(camera)])

  const fallback = defaultPipRect(pipSize, pipPosition)

  let raf = 0
  const render = () => {
    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, w, h)
    drawCover(ctx, screenVideo, 0, 0, w, h)

    const layout = pipLayoutRef?.current ?? fallback
    const pipW = Math.round(layout.w * w)
    const pipH = Math.round(layout.h * h)
    const px = Math.round(layout.x * w)
    const py = Math.round(layout.y * h)
    const radius = Math.round(pipW * 0.12)

    if (cameraBlur) {
      ctx.save()
      ctx.filter = "blur(16px)"
      roundedRectPath(ctx, px - 4, py - 4, pipW + 8, pipH + 8, radius + 4)
      ctx.clip()
      drawCover(ctx, camVideo, px, py, pipW, pipH)
      ctx.restore()
    }

    ctx.save()
    roundedRectPath(ctx, px, py, pipW, pipH, radius)
    ctx.clip()
    drawCover(ctx, camVideo, px, py, pipW, pipH)
    ctx.restore()

    ctx.save()
    roundedRectPath(ctx, px, py, pipW, pipH, radius)
    ctx.lineWidth = Math.max(2, Math.round(w * 0.0015))
    ctx.strokeStyle = "rgba(255,255,255,0.85)"
    ctx.stroke()
    ctx.restore()

    raf = requestAnimationFrame(render)
  }
  raf = requestAnimationFrame(render)

  const stream = canvas.captureStream(fps)
  const stop = () => {
    cancelAnimationFrame(raf)
    screenVideo.srcObject = null
    camVideo.srcObject = null
  }
  return { stream, stop }
}

/**
 * Builds record + preview streams for the requested source.
 * Throws if the user cancels/denies screen capture (caller shows guidance).
 *
 * WebKit requires getDisplayMedia / the first getUserMedia for a new capture to
 * run before any other `await` in the call chain (must stay inside the click
 * handler's user-gesture window). Mic is therefore opened *after* screen/camera.
 */
export async function startCapture(config: CaptureConfig): Promise<CaptureHandle> {
  const { source, quality } = config
  const pipSize = config.pipSize ?? "medium"
  const pipPosition = config.pipPosition ?? "bottom-right"
  const cameraBlur = config.cameraBlur ?? false
  const cleanups: Array<() => void> = []

  async function attachMic(): Promise<MediaStreamTrack[]> {
    if (!config.microphone) return []
    const micStream = await openMicStream(config.micDeviceId)
    if (micStream) cleanups.push(() => micStream.getTracks().forEach((t) => t.stop()))
    return micStream?.getAudioTracks() ?? []
  }

  if (source === "camera") {
    const ownsCamera = !config.cameraStream
    const camera = config.cameraStream ?? (await openCameraStream(config.cameraDeviceId, quality))
    if (ownsCamera) cleanups.push(() => camera.getTracks().forEach((t) => t.stop()))

    const micTracks = await attachMic()

    if (cameraBlur) {
      const compositor = await startCameraCompositor(camera, quality, true)
      cleanups.push(compositor.stop)
      const recordStream = new MediaStream([...compositor.stream.getVideoTracks(), ...micTracks])
      return {
        recordStream,
        previewStream: compositor.stream,
        stop: () => cleanups.forEach((fn) => fn()),
      }
    }

    const recordStream = new MediaStream([...camera.getVideoTracks(), ...micTracks])
    return {
      recordStream,
      previewStream: recordStream,
      stop: () => cleanups.forEach((fn) => fn()),
    }
  }

  // screen + both: getDisplayMedia must be the very first await.
  const screen = await openScreenStream(quality, config.systemAudio)
  cleanups.push(() => screen.getTracks().forEach((t) => t.stop()))
  const systemAudioTracks = config.systemAudio ? screen.getAudioTracks() : []

  if (config.onEnded) {
    screen.getVideoTracks()[0]?.addEventListener("ended", config.onEnded, { once: true })
  }

  const micTracks = await attachMic()

  if (source === "screen") {
    const recordStream = new MediaStream([
      ...screen.getVideoTracks(),
      ...systemAudioTracks,
      ...micTracks,
    ])
    return {
      recordStream,
      previewStream: recordStream,
      stop: () => cleanups.forEach((fn) => fn()),
    }
  }

  // source === "both"
  const ownsCamera = !config.cameraStream
  const camera = config.cameraStream ?? (await openCameraStream(config.cameraDeviceId, quality))
  if (ownsCamera) cleanups.push(() => camera.getTracks().forEach((t) => t.stop()))

  const compositor = await startCompositor(
    screen, camera, quality, pipSize, pipPosition, cameraBlur, config.pipLayoutRef,
  )
  cleanups.push(compositor.stop)

  const recordStream = new MediaStream([
    ...compositor.stream.getVideoTracks(),
    ...systemAudioTracks,
    ...micTracks,
  ])
  return {
    recordStream,
    previewStream: compositor.stream,
    pipLayoutRef: config.pipLayoutRef,
    stop: () => cleanups.forEach((fn) => fn()),
  }
}
