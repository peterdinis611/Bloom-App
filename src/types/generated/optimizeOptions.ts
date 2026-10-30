/** Generated from Rust OptimizeOptions — do not hand-edit field names. */
export interface TimeRange {
  start: number
  end: number
}

export interface SubtitleCard {
  text: string
  start_secs: number
  end_secs: number
}

export type OptimizePreset = "small" | "medium" | "high"
export type OptimizeResolution = "480p" | "720p" | "1080p" | "original"
export type OptimizeFormat =
  | "mp4" | "mov" | "m4v" | "mkv" | "avi" | "mpeg" | "ts"
  | "flv" | "3gp" | "ogv" | "webm" | "gif"

/** Payload sent to optimize_video / plan_export / enqueue_exports. */
export interface OptimizeOptions {
  input_path: string
  preset: OptimizePreset
  resolution: OptimizeResolution
  format: OptimizeFormat
  trim_start?: number | null
  trim_end?: number | null
  keep_ranges?: TimeRange[]
  crop_x?: number | null
  crop_y?: number | null
  crop_w?: number | null
  crop_h?: number | null
  speed?: number
  output_name?: string | null
  add_to_library?: boolean
  replace_original?: boolean
  srt_path?: string | null
  subtitle_cards?: SubtitleCard[]
  denoise?: boolean
  denoise_audio?: boolean
  normalize_audio?: boolean
  remove_audio?: boolean
  use_hevc?: boolean
  flip_h?: boolean
  flip_v?: boolean
  rotate?: 0 | 90 | 180 | 270
  fade_in_secs?: number
  fade_out_secs?: number
  volume?: number
}
