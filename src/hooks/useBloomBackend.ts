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
  ExportEstimate,
  FfmpegStatus,
  FfmpegInstallResult,
  AutoOptimizeDone,
  CapturePermissions,
  CaptureWindow,
  ClickSpotlightOptions,
  ClickTrackInfo,
  ClickTrackSummary,
  IncompleteSession,
  LibraryDirectoryInfo,
  LibraryStats,
  MonitorInfo,
  OptimizeOptions,
  OptimizeProgress,
  RecordingEntry,
  RecordingMeta,
  SessionMeta,
  ShareResult,
  ValidationResult,
  VideoAnalyze,
  VideoInfo,
} from "@/types"

// ── Directory / setup ──────────────────────────────────────────────────────

/** Returns (and creates if needed) the active Bloom library path. */
export async function getBloomDir(): Promise<string> {
  return invoke<string>("get_bloom_dir")
}

export async function getLibraryDirectory(): Promise<LibraryDirectoryInfo> {
  return invoke<LibraryDirectoryInfo>("get_library_directory")
}

/**
 * Switch the library folder (null = default). With `migrate`, existing
 * recordings are moved to the new folder; `migrated_files` reports the count.
 */
export async function setLibraryDirectory(
  path: string | null,
  migrate = false,
): Promise<LibraryDirectoryInfo> {
  return invoke<LibraryDirectoryInfo>("set_library_directory", { path, migrate })
}

/** Disk space info for the volume that holds the library directory. */
export async function getDiskSpace(): Promise<DiskInfo> {
  return invoke<DiskInfo>("get_disk_space")
}

/** Enumerate the physical displays connected to the machine. */
export async function listMonitors(): Promise<MonitorInfo[]> {
  return invoke<MonitorInfo[]>("list_monitors")
}

export interface LocaleInfo {
  id: string
  nativeLabel: string
  englishLabel: string
}

/** Available UI / tray locales from the Rust i18n module. */
export async function listLocales(): Promise<LocaleInfo[]> {
  return invoke<LocaleInfo[]>("list_locales")
}

/** Current backend locale (tray + error strings). */
export async function getLocale(): Promise<string> {
  return invoke<string>("get_locale")
}

/** Persist locale, refresh tray menu, emit locale-changed. */
export async function setLocale(locale: string): Promise<string> {
  return invoke<string>("set_locale", { locale })
}

export async function getSystemLocale(): Promise<string> {
  return invoke<string>("get_system_locale")
}

export async function refreshTray(): Promise<void> {
  return invoke("refresh_tray")
}

export async function getTrayRecentCount(): Promise<number> {
  return invoke<number>("get_tray_recent_count")
}

export async function setTrayRecentCount(count: number): Promise<number> {
  return invoke<number>("set_tray_recent_count", { count })
}

export interface FilenamePreview {
  template: string
  example: string
  tokens: string[]
}

export async function getFilenameTemplate(): Promise<FilenamePreview> {
  return invoke<FilenamePreview>("get_filename_template")
}

export async function setFilenameTemplate(template: string): Promise<FilenamePreview> {
  return invoke<FilenamePreview>("set_filename_template", { template })
}

export async function suggestRecordingFilename(
  source: string,
  quality: string,
  extension: string,
): Promise<string> {
  return invoke<string>("suggest_recording_filename", { source, quality, extension })
}

export interface AppInfo {
  version: string
  name: string
  platform: string
  locale: string
  systemLocale: string
  libraryPath: string
  ffmpegAvailable: boolean
  ffmpegVersion: string | null
}

export async function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("get_app_info")
}

export async function listRecentRecordings(limit?: number): Promise<RecordingEntry[]> {
  return invoke<RecordingEntry[]>("list_recent_recordings", { limit: limit ?? null })
}

export async function openLibraryFolder(): Promise<void> {
  return invoke("open_library_folder")
}

export async function duplicateRecording(id: string): Promise<RecordingEntry> {
  return invoke<RecordingEntry>("duplicate_recording", { id })
}

export interface PurgeResult {
  removedSidecars: number
  removedEmptyVideos: number
}

export async function purgeLibraryOrphans(): Promise<PurgeResult> {
  return invoke<PurgeResult>("purge_library_orphans")
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
  notes?: string
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

/** Opens platform-specific sharing (macOS sheet, Windows clipboard, Linux mail/URI/FM). */
export async function shareRecording(id: string): Promise<ShareResult> {
  return invoke<ShareResult>("share_recording", { id })
}

/**
 * Checks whether a recording's video file and sidecar actually exist on disk
 * and are non-empty. Useful for health-checks or pre-upload validation.
 */
export async function validateRecording(id: string): Promise<ValidationResult> {
  return invoke<ValidationResult>("validate_recording", { id })
}

/** Copy an external video file into the Bloom library. */
export async function importRecording(sourcePath: string): Promise<RecordingEntry> {
  return invoke<RecordingEntry>("import_recording", { sourcePath })
}

/**
 * Opens the recording's parent folder in Finder / Explorer / file-manager
 * with the file highlighted.
 */
export async function revealInFinder(path: string): Promise<void> {
  return invoke<void>("reveal_in_finder", { path })
}

/** Copy plain text to the system clipboard. */
export async function copyText(text: string): Promise<void> {
  return invoke<void>("copy_text", { text })
}

/** Copy a file reference to the system clipboard. */
export async function copyFile(path: string): Promise<void> {
  return invoke<void>("copy_file", { path })
}

/** Duplicate a file to a new path (Save a copy…). */
export async function copyFileTo(src: string, dest: string): Promise<void> {
  return invoke<void>("copy_file_to", { src, dest })
}

/** Update ⌘⇧ global shortcuts (single letters A–Z). */
export async function setGlobalShortcuts(arm: string, pause: string, stop: string): Promise<void> {
  return invoke<void>("set_global_shortcuts", { arm, pause, stop })
}

/** Current global shortcut letters as stored in Rust (source of truth). */
export async function getGlobalShortcuts(): Promise<{ arm: string; pause: string; stop: string }> {
  const [arm, pause, stop] = await invoke<[string, string, string]>("get_global_shortcuts")
  return { arm, pause, stop }
}

/** Sync recording state into the tray icon / tooltip. */
export async function setRecordingState(
  active: boolean,
  paused: boolean,
  elapsedSecs: number,
): Promise<void> {
  return invoke<void>("set_recording_state", {
    active,
    paused,
    elapsedSecs: Math.max(0, Math.floor(elapsedSecs)),
  })
}

// ── Permissions / capture targets ──────────────────────────────────────────

export async function checkCapturePermissions(): Promise<CapturePermissions> {
  return invoke<CapturePermissions>("check_capture_permissions")
}

/** On-screen application windows (macOS only; empty elsewhere). */
export async function listCaptureWindows(): Promise<CaptureWindow[]> {
  return invoke<CaptureWindow[]>("list_capture_windows")
}

// ── Library maintenance ────────────────────────────────────────────────────

export async function regenerateThumbnails(force = false): Promise<{ updated: number }> {
  return invoke<{ updated: number }>("regenerate_thumbnails", { force })
}

export async function repairSidecars(): Promise<{ repaired: number }> {
  return invoke<{ repaired: number }>("repair_sidecars")
}

export async function listIncompleteSessions(): Promise<IncompleteSession[]> {
  return invoke<IncompleteSession[]>("list_incomplete_sessions")
}

export async function recoverIncompleteSession(filename: string): Promise<RecordingMeta> {
  return invoke<RecordingMeta>("recover_incomplete_session", { filename })
}

export async function discardIncompleteSession(filename: string): Promise<void> {
  return invoke<void>("discard_incomplete_session", { filename })
}

export async function getAutoOptimizeAfterRecord(): Promise<boolean> {
  return invoke<boolean>("get_auto_optimize_after_record")
}

export async function setAutoOptimizeAfterRecord(enabled: boolean): Promise<boolean> {
  return invoke<boolean>("set_auto_optimize_after_record", { enabled })
}

export async function getDiskSpaceMinMb(): Promise<number> {
  return invoke<number>("get_disk_space_min_mb")
}

export async function setDiskSpaceMinMb(mb: number): Promise<number> {
  return invoke<number>("set_disk_space_min_mb", { mb: Math.max(0, Math.floor(mb)) })
}

// ── Concat / click spotlight ───────────────────────────────────────────────

/** Join recordings (in order) into a new library entry. Needs ffmpeg. */
export async function concatRecordings(ids: string[], outputName?: string): Promise<RecordingEntry> {
  return invoke<RecordingEntry>("concat_recordings", { ids, outputName: outputName ?? null })
}

/** Burn a highlight flash at each recorded click into a new recording. */
export async function applyClickSpotlight(
  id: string,
  opts: ClickSpotlightOptions = {},
): Promise<RecordingEntry> {
  return invoke<RecordingEntry>("apply_click_spotlight", {
    id,
    clicksPath: opts.clicksPath ?? null,
    outputName: opts.outputName ?? null,
    captureBounds: opts.captureBounds ?? null,
  })
}

/** Start logging mouse clicks next to the video at `sessionPath`. Returns clicks file path. */
export async function startClickTracker(sessionPath: string): Promise<string> {
  return invoke<string>("start_click_tracker", { sessionPath })
}

export async function stopClickTracker(): Promise<ClickTrackSummary | null> {
  return invoke<ClickTrackSummary | null>("stop_click_tracker")
}

/** Load the recorded click track for a recording (null when none). */
export async function getClickTrack(id: string): Promise<ClickTrackInfo | null> {
  return invoke<ClickTrackInfo | null>("get_click_track", { id })
}

export async function hasClickTrack(id: string): Promise<boolean> {
  return invoke<boolean>("has_click_track", { id })
}

/** Relative library folder paths (filesystem + sidecar `folder`). */
export async function listLibraryFolders(): Promise<string[]> {
  return invoke<string[]>("list_library_folders")
}

// ── Backend events ─────────────────────────────────────────────────────────

/** Library contents changed on disk (watcher / migrate / etc). */
export async function onLibraryChanged(cb: () => void): Promise<UnlistenFn> {
  return listen("library-changed", () => cb())
}

export async function onAutoOptimizeDone(cb: (d: AutoOptimizeDone) => void): Promise<UnlistenFn> {
  return listen<AutoOptimizeDone>("auto-optimize-done", (e) => cb(e.payload))
}

/** Otvorí súbor v predvolenej systémovej aplikácii (QuickTime, VLC…). */
export async function openWithSystemApp(path: string): Promise<void> {
  const { openPath } = await import("@tauri-apps/plugin-opener")
  await openPath(path)
}

// ── Video optimisation (ffmpeg) ─────────────────────────────────────────────

/** Detect a system ffmpeg/ffprobe install. */
export async function checkFfmpeg(): Promise<FfmpegStatus> {
  return invoke<FfmpegStatus>("check_ffmpeg")
}

/** Install ffmpeg via Homebrew / winget / pkexec (platform-dependent). */
export async function installFfmpeg(): Promise<FfmpegInstallResult> {
  return invoke<FfmpegInstallResult>("install_ffmpeg")
}

/** Probe a video file for resolution, fps, codec, bitrate and duration. */
export async function getVideoInfo(path: string): Promise<VideoInfo> {
  return invoke<VideoInfo>("get_video_info", { path })
}

/** Generate or return cached filmstrip thumbnail paths for a video file. */
export async function getFilmstrip(
  path: string,
  frameCount?: number,
  durationHint?: number,
): Promise<string[]> {
  return invoke<string[]>("get_filmstrip", { path, frameCount, durationHint })
}

/** Estimate output size and duration before export. */
export async function estimateExport(options: OptimizeOptions): Promise<ExportEstimate> {
  return invoke<ExportEstimate>("estimate_export", { options })
}

/** Analyze a recording and suggest preset/resolution for optimization. */
export async function analyzeVideo(path: string): Promise<VideoAnalyze> {
  return invoke<VideoAnalyze>("analyze_video", { path })
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
