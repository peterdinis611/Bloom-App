// ── App state ──────────────────────────────────────────────────────────────
export type RecordingStatus = "idle" | "countdown" | "recording" | "paused" | "processing" | "done"

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
  quality: "720p" | "1080p"
  countdown: 0 | 3 | 5
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

/** Mirrors ValidationResult in Rust */
export interface ValidationResult {
  id: string
  exists: boolean
  size_bytes: number
  meta_exists: boolean
  is_valid: boolean
  error: string | null
}
