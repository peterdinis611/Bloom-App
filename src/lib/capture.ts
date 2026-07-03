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
  /** Fired when the captured screen surface ends (user clicks "Stop sharing"). */
  onEnded?: () => void
}

export interface CaptureHandle {
  /** Stream to feed MediaRecorder. */
  recordStream: MediaStream
  /** Stream to show in the live preview <video>. */
  previewStream: MediaStream
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
      deviceId: deviceId ? { exact: deviceId } : undefined,
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
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      video: false,
    })
  } catch {
    return null
  }
}

async function openScreenStream(quality: Quality, systemAudio: boolean): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: qualityFrameRate(quality) } as MediaTrackConstraints,
    audio: systemAudio,
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

/**
 * Composites `screen` (background) + `camera` (rounded PiP, bottom-right) onto
 * a canvas and returns a captured stream plus a stop() to end the raf loop.
 */
async function startCompositor(
  screen: MediaStream,
  camera: MediaStream,
  quality: Quality,
): Promise<{ stream: MediaStream; stop: () => void }> {
  const { w, h } = DIMENSIONS[quality]
  const fps = qualityFrameRate(quality)

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!

  const [screenVideo, camVideo] = await Promise.all([playHidden(screen), playHidden(camera)])

  const pipW = Math.round(w * 0.24)
  const margin = Math.round(w * 0.02)
  const radius = Math.round(pipW * 0.12)

  let raf = 0
  const render = () => {
    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, w, h)
    drawCover(ctx, screenVideo, 0, 0, w, h)

    const aspect = camVideo.videoWidth && camVideo.videoHeight ? camVideo.videoHeight / camVideo.videoWidth : 9 / 16
    const pipH = Math.round(pipW * aspect)
    const px = w - pipW - margin
    const py = h - pipH - margin

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
 */
export async function startCapture(config: CaptureConfig): Promise<CaptureHandle> {
  const { source, quality } = config
  const cleanups: Array<() => void> = []

  // Mic audio (shared across sources)
  let micStream: MediaStream | null = null
  if (config.microphone) {
    micStream = await openMicStream(config.micDeviceId)
    if (micStream) cleanups.push(() => micStream!.getTracks().forEach((t) => t.stop()))
  }
  const micTracks = micStream?.getAudioTracks() ?? []

  if (source === "camera") {
    const ownsCamera = !config.cameraStream
    const camera = config.cameraStream ?? (await openCameraStream(config.cameraDeviceId, quality))
    if (ownsCamera) cleanups.push(() => camera.getTracks().forEach((t) => t.stop()))

    const recordStream = new MediaStream([...camera.getVideoTracks(), ...micTracks])
    return {
      recordStream,
      previewStream: recordStream,
      stop: () => cleanups.forEach((fn) => fn()),
    }
  }

  // screen + both both need a screen capture
  const screen = await openScreenStream(quality, config.systemAudio)
  cleanups.push(() => screen.getTracks().forEach((t) => t.stop()))
  const systemAudioTracks = config.systemAudio ? screen.getAudioTracks() : []

  if (config.onEnded) {
    screen.getVideoTracks()[0]?.addEventListener("ended", config.onEnded, { once: true })
  }

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

  const compositor = await startCompositor(screen, camera, quality)
  cleanups.push(compositor.stop)

  const recordStream = new MediaStream([
    ...compositor.stream.getVideoTracks(),
    ...systemAudioTracks,
    ...micTracks,
  ])
  return {
    recordStream,
    previewStream: compositor.stream,
    stop: () => cleanups.forEach((fn) => fn()),
  }
}
