/**
 * useBloomBackend
 *
 * Thin typed wrappers around every Tauri command exposed by the Rust backend.
 * Import this hook anywhere in the app instead of calling invoke() directly.
 *
 * All functions are async and throw on Rust errors (string message).
 */

import { invoke, convertFileSrc } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import type {
  DiskInfo,
  FfmpegStatus,
  LibraryStats,
  MonitorInfo,
  OptimizeOptions,
  OptimizeProgress,
  RecordingEntry,
  RecordingMeta,
  SessionMeta,
  ValidationResult,
  VideoInfo,
} from "@/types"

// ── Directory / setup ──────────────────────────────────────────────────────

/** Returns (and creates if needed) the ~/Movies/Bloom path. */
export async function getBloomDir(): Promise<string> {
  return invoke<string>("get_bloom_dir")
}

/** Disk space info for the volume that holds ~/Movies/Bloom. */
export async function getDiskSpace(): Promise<DiskInfo> {
  return invoke<DiskInfo>("get_disk_space")
}

/** Enumerate the physical displays connected to the machine. */
export async function listMonitors(): Promise<MonitorInfo[]> {
  return invoke<MonitorInfo[]>("list_monitors")
}

/**
 * Convert an absolute file path into a URL the webview can load
 * (e.g. as a <video src>) via the Tauri asset protocol.
 */
export function fileSrc(path: string): string {
  return convertFileSrc(path)
}

// ── Streaming session ──────────────────────────────────────────────────────

/**
 * Opens a new recording file on disk and returns a numeric session ID.
 * All subsequent video chunks must be sent via writeChunk(sessionId, …).
 */
export async function openSession(filename: string, meta: SessionMeta): Promise<number> {
  return invoke<number>("open_session", { filename, meta })
}

/**
 * Streams a raw binary chunk into the open session file.
 * Returns the cumulative bytes written (useful for a live progress indicator).
 */
export async function writeChunk(sessionId: number, data: number[]): Promise<number> {
  return invoke<number>("write_chunk", { sessionId, data })
}

/**
 * Flushes and closes the session file, writes the .bloom.json sidecar,
 * and returns the finalised RecordingMeta.
 */
export async function closeSession(sessionId: number): Promise<RecordingMeta> {
  return invoke<RecordingMeta>("close_session", { sessionId })
}

/**
 * Cancels an in-progress session and deletes the partial file.
 */
export async function cancelSession(sessionId: number): Promise<void> {
  return invoke<void>("cancel_session", { sessionId })
}

// ── Library ────────────────────────────────────────────────────────────────

/** All recordings in ~/Movies/Bloom, sorted newest-first. */
export async function listRecordings(): Promise<RecordingEntry[]> {
  return invoke<RecordingEntry[]>("list_recordings")
}

/** Aggregate stats (count, total size, total duration). */
export async function getLibraryStats(): Promise<LibraryStats> {
  return invoke<LibraryStats>("get_library_stats")
}

/**
 * Save a still-frame PNG snapshot into ~/Movies/Bloom. Returns the saved path.
 * `data` is the raw PNG bytes as a number array.
 */
export async function saveSnapshot(filename: string, data: number[]): Promise<string> {
  return invoke<string>("save_snapshot", { filename, data })
}

// ── Recording management ───────────────────────────────────────────────────

/** Fetch a single recording by its UUID. */
export async function getRecording(id: string): Promise<RecordingEntry> {
  return invoke<RecordingEntry>("get_recording", { id })
}

/** Permanently delete a recording (video + sidecar). */
export async function deleteRecording(id: string): Promise<void> {
  return invoke<void>("delete_recording", { id })
}

/**
 * Update the human-readable title stored in the sidecar.
 * Returns the updated RecordingMeta.
 */
export async function renameRecording(id: string, newTitle: string): Promise<RecordingMeta> {
  return invoke<RecordingMeta>("rename_recording", { id, newTitle })
}

export interface RecordingMetaPatch {
  starred?: boolean
  tags?: string[]
  folder?: string
}

export async function updateRecordingMeta(id: string, patch: RecordingMetaPatch): Promise<RecordingMeta> {
  return invoke<RecordingMeta>("update_recording_meta", { id, patch })
}

export async function batchDeleteRecordings(ids: string[]): Promise<number> {
  return invoke<number>("batch_delete_recordings", { ids })
}

/** Permanently delete every recording in the library. Returns count removed. */
export async function deleteAllRecordings(): Promise<number> {
  return invoke<number>("delete_all_recordings")
}

/** Reveal recording in Finder for sharing (AirDrop, Mail, …). */
export async function shareRecording(id: string): Promise<string> {
  return invoke<string>("share_recording", { id })
}

/**
 * Checks whether a recording's video file and sidecar actually exist on disk
 * and are non-empty. Useful for health-checks or pre-upload validation.
 */
export async function validateRecording(id: string): Promise<ValidationResult> {
  return invoke<ValidationResult>("validate_recording", { id })
}

/**
 * Opens the recording's parent folder in Finder / Explorer / file-manager
 * with the file highlighted.
 */
export async function revealInFinder(path: string): Promise<void> {
  return invoke<void>("reveal_in_finder", { path })
}

// ── Video optimisation (ffmpeg) ─────────────────────────────────────────────

/** Detect a system ffmpeg/ffprobe install. */
export async function checkFfmpeg(): Promise<FfmpegStatus> {
  return invoke<FfmpegStatus>("check_ffmpeg")
}

/** Probe a video file for resolution, fps, codec, bitrate and duration. */
export async function getVideoInfo(path: string): Promise<VideoInfo> {
  return invoke<VideoInfo>("get_video_info", { path })
}

/**
 * Return a JPEG thumbnail path for a recording (generating it if missing).
 * Wrap in fileSrc() before using as an <img src>.
 */
export async function getThumbnail(id: string, atSecs?: number): Promise<string> {
  return invoke<string>("get_thumbnail", { id, atSecs })
}

/**
 * Start an async transcode job. Returns a job id immediately; subscribe to
 * progress via onOptimizeProgress() and match on the job id.
 */
export async function optimizeVideo(options: OptimizeOptions): Promise<string> {
  return invoke<string>("optimize_video", { options })
}

/** Request cancellation of a running transcode job. */
export async function cancelOptimize(jobId: string): Promise<void> {
  return invoke<void>("cancel_optimize", { jobId })
}

/** Subscribe to transcode progress events. Returns an unlisten function. */
export async function onOptimizeProgress(cb: (p: OptimizeProgress) => void): Promise<UnlistenFn> {
  return listen<OptimizeProgress>("video-progress", (e) => cb(e.payload))
}

// ── Convenience helpers ────────────────────────────────────────────────────

/** Format bytes into a human-readable string (e.g. "2.4 GB"). */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/** Format seconds into mm:ss or hh:mm:ss. */
export function formatDurationSecs(secs: number): string {
  const s = Math.floor(secs)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  return `${m}:${String(sec).padStart(2, "0")}`
}

/** Disk space usage percentage (0–100). */
export function diskUsagePercent(info: DiskInfo): number {
  if (info.total_bytes === 0) return 0
  return Math.round((info.used_bytes / info.total_bytes) * 100)
}

/** Returns true when available disk space drops below `thresholdMB` MB. */
export function isLowDiskSpace(info: DiskInfo, thresholdMB = 500): boolean {
  return info.available_bytes < thresholdMB * 1024 * 1024
}
