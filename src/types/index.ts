import type { PipPosition, PipSize } from "@/lib/capture"
import type { RecordingQuality } from "@/lib/videoOptions"

// ── App state ──────────────────────────────────────────────────────────────
export type RecordingStatus = "idle" | "preparing" | "countdown" | "recording" | "paused" | "processing" | "done"

export type RecordingSource = "screen" | "camera" | "both"

export interface ScreenTarget {
  id: string
  label: string
  type: "screen" | "window"
  index?: number
  appName?: string
}

export interface RecordingSettings {
  source: RecordingSource
  screenTarget: ScreenTarget
  microphone: boolean
  systemAudio: boolean
  quality: RecordingQuality
  countdown: 0 | 3 | 5
  /** Selected camera deviceId (empty = system default). */
  cameraDeviceId: string
  /** Selected microphone deviceId (empty = system default). */
  micDeviceId: string
  /** Highlight cursor with spotlight overlay during recording. */
  cursorHighlight: boolean
  /** Blur camera background in PiP / camera-only mode. */
  cameraBlur: boolean
  pipSize: PipSize
  pipPosition: PipPosition
}

// ── Backend API types (mirror Rust structs) ────────────────────────────────

/** Passed to open_session – mirrors SessionMeta in Rust */
export interface SessionMeta {
  source: string
  quality: string
  has_microphone: boolean
  has_system_audio: boolean
  target_label: string
}

/** Mirrors RecordingMeta in Rust */
export interface RecordingMeta {
  id: string
  title: string
  filename: string
  created_at: string        // ISO-8601 UTC
  duration_secs: number
  file_size_bytes: number
  source: string
  quality: string
  has_microphone: boolean
  has_system_audio: boolean
  target_label: string
  starred?: boolean
  tags?: string[]
  folder?: string
}

/** Mirrors RecordingEntry in Rust */
export interface RecordingEntry {
  meta: RecordingMeta
  path: string
  meta_path: string
}

/** Mirrors LibraryStats in Rust */
export interface LibraryStats {
  total_recordings: number
  total_size_bytes: number
  total_duration_secs: number
  oldest_created_at: string | null
  newest_created_at: string | null
}

/** Mirrors DiskInfo in Rust */
export interface DiskInfo {
  available_bytes: number
  total_bytes: number
  used_bytes: number
  bloom_dir_size_bytes: number
}

/** Mirrors MonitorInfo in Rust */
export interface MonitorInfo {
  id: string
  name: string
  width: number
  height: number
  scale_factor: number
  is_primary: boolean
  x: number
  y: number
  physical_width: number
  physical_height: number
}

/** A selectable audio/video input device (camera or microphone). */
export interface MediaInputDevice {
  deviceId: string
  label: string
  kind: "videoinput" | "audioinput"
}

// ── Video optimisation (ffmpeg) ─────────────────────────────────────────────

/** Mirrors FfmpegStatus in Rust. */
export interface FfmpegStatus {
  available: boolean
  ffmpeg_path: string | null
  ffprobe_path: string | null
  version: string | null
  install_hint: string
  can_auto_install: boolean
}

/** Result of an automatic ffmpeg install attempt. */
export interface FfmpegInstallResult {
  success: boolean
  message: string
  status: FfmpegStatus
}

/** Mirrors VideoInfo in Rust. */
export interface VideoInfo {
  width: number
  height: number
  fps: number
  codec: string
  duration_secs: number
  bitrate_bps: number
  size_bytes: number
  has_audio: boolean
}

export type OptimizePreset = "small" | "medium" | "high"
export type OptimizeResolution = "480p" | "720p" | "1080p" | "original"
export type OptimizeFormat = "mp4" | "webm" | "gif"

/** Payload sent to optimize_video (mirrors OptimizeOptions in Rust). */
export interface OptimizeOptions {
  input_path: string
  preset: OptimizePreset
  resolution: OptimizeResolution
  format: OptimizeFormat
  trim_start?: number | null
  trim_end?: number | null
  /** Playback speed multiplier (1 = normal, 2 = 2× faster). */
  speed?: number
  output_name?: string | null
  add_to_library?: boolean
}

/** Mirrors OptimizeProgress event payload in Rust. */
export interface OptimizeProgress {
  job_id: string
  percent: number
  done: boolean
  cancelled: boolean
  output_path: string | null
  output_size_bytes: number | null
  error: string | null
}

/** Mirrors ValidationResult in Rust */
export interface ValidationResult {
  id: string
  exists: boolean
  size_bytes: number
  meta_exists: boolean
  is_valid: boolean
  error: string | null
}
