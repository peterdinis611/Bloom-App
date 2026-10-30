//! TypeScript mirrors for core Rust IPC types (OptimizeOptions).
//! Prefer regenerating via `get_optimize_options_ts` / `cargo test export_optimize_options_ts`.

/// Hand-maintained TS contract kept in sync with `video::types::OptimizeOptions`.
pub const OPTIMIZE_OPTIONS_TS: &str = r#"/** Generated from Rust OptimizeOptions — do not hand-edit field names. */
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
"#;

#[tauri::command]
pub fn get_optimize_options_ts() -> String {
    OPTIMIZE_OPTIONS_TS.to_string()
}

/// Serde field names that the FE contract must include.
pub fn optimize_options_field_names() -> Vec<&'static str> {
    vec![
        "input_path",
        "preset",
        "resolution",
        "format",
        "trim_start",
        "trim_end",
        "keep_ranges",
        "crop_x",
        "crop_y",
        "crop_w",
        "crop_h",
        "speed",
        "output_name",
        "add_to_library",
        "replace_original",
        "srt_path",
        "subtitle_cards",
        "denoise",
        "denoise_audio",
        "normalize_audio",
        "remove_audio",
        "use_hevc",
        "flip_h",
        "flip_v",
        "rotate",
        "fade_in_secs",
        "fade_out_secs",
        "volume",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::video::{OptimizeOptions, SubtitleCard, TimeRange};

    fn sample() -> OptimizeOptions {
        OptimizeOptions {
            input_path: "/tmp/in.mp4".into(),
            preset: "medium".into(),
            resolution: "original".into(),
            format: "mp4".into(),
            trim_start: None,
            trim_end: None,
            keep_ranges: vec![TimeRange { start: 0.0, end: 1.0 }],
            crop_x: None,
            crop_y: None,
            crop_w: None,
            crop_h: None,
            speed: 1.0,
            output_name: Some("clip".into()),
            add_to_library: true,
            replace_original: false,
            srt_path: None,
            subtitle_cards: vec![SubtitleCard {
                text: "hi".into(),
                start_secs: 0.0,
                end_secs: 1.0,
            }],
            denoise: false,
            denoise_audio: false,
            normalize_audio: false,
            remove_audio: false,
            use_hevc: false,
            flip_h: false,
            flip_v: false,
            rotate: 0,
            fade_in_secs: 0.0,
            fade_out_secs: 0.0,
            volume: 1.0,
        }
    }

    #[test]
    fn export_optimize_options_ts_contains_all_fields() {
        let v = serde_json::to_value(sample()).unwrap();
        let obj = v.as_object().unwrap();
        for name in optimize_options_field_names() {
            assert!(obj.contains_key(name), "missing serde field {name}");
            assert!(
                OPTIMIZE_OPTIONS_TS.contains(name),
                "TS export missing field {name}"
            );
        }
    }
}
