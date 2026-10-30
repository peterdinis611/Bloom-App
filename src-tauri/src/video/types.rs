use serde::{Deserialize, Serialize};

// ────────────────────────────────────────────────────────────────────────────
// Data types
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct FfmpegStatus {
    pub available: bool,
    pub ffmpeg_path: Option<String>,
    pub ffprobe_path: Option<String>,
    pub version: Option<String>,
    pub install_hint: String,
    /// Whether Bloom can install ffmpeg automatically on this machine.
    pub can_auto_install: bool,
}

#[derive(Debug, Serialize)]
pub struct FfmpegInstallResult {
    pub success: bool,
    pub message: String,
    pub status: FfmpegStatus,
}

#[derive(Debug, Clone, Serialize)]
pub struct VideoInfo {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub codec: String,
    pub duration_secs: f64,
    pub bitrate_bps: u64,
    pub size_bytes: u64,
    pub has_audio: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SubtitleCard {
    pub text: String,
    pub start_secs: f64,
    pub end_secs: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TimeRange {
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Deserialize)]
pub struct OptimizeOptions {
    pub input_path: String,
    /// "small" | "medium" | "high"
    pub preset: String,
    /// "480p" | "720p" | "1080p" | "original"
    pub resolution: String,
    /// "mp4" | "mov" | "m4v" | "mkv" | "avi" | "mpeg" | "ts" | "flv" | "3gp" | "ogv" | "webm" | "gif"
    pub format: String,
    pub trim_start: Option<f64>,
    pub trim_end: Option<f64>,
    /// Multiple keep-ranges joined into one output (order preserved).
    /// When non-empty, overrides trim_start/trim_end.
    #[serde(default)]
    pub keep_ranges: Vec<TimeRange>,
    /// Normalized spatial crop (0–1). All four must be set to apply.
    pub crop_x: Option<f64>,
    pub crop_y: Option<f64>,
    pub crop_w: Option<f64>,
    pub crop_h: Option<f64>,
    /// Playback speed multiplier (1.0 = normal, 2.0 = 2× faster).
    #[serde(default = "default_speed")]
    pub speed: f64,
    /// Optional custom output file name (without directory).
    pub output_name: Option<String>,
    /// Add the result to the Bloom library (write a .bloom.json sidecar).
    #[serde(default = "default_true")]
    pub add_to_library: bool,
    /// Overwrite the source file instead of creating a new library entry.
    #[serde(default)]
    pub replace_original: bool,
    /// Optional .srt file with timed captions (merged with subtitle_cards).
    pub srt_path: Option<String>,
    /// Manual text overlays burned in via ffmpeg drawtext.
    #[serde(default)]
    pub subtitle_cards: Vec<SubtitleCard>,
    /// Light temporal denoise (good for screen recordings).
    #[serde(default)]
    pub denoise: bool,
    /// Remove background hiss / fan noise so speech is clearer.
    #[serde(default)]
    pub denoise_audio: bool,
    /// Normalize audio loudness before export.
    #[serde(default)]
    pub normalize_audio: bool,
    /// Drop the audio track entirely.
    #[serde(default)]
    pub remove_audio: bool,
    /// H.265 / HEVC encode for smaller MP4 (when supported).
    #[serde(default)]
    pub use_hevc: bool,
    /// Mirror horizontally.
    #[serde(default)]
    pub flip_h: bool,
    /// Mirror vertically.
    #[serde(default)]
    pub flip_v: bool,
    /// Clockwise rotation in degrees: 0 | 90 | 180 | 270.
    #[serde(default)]
    pub rotate: u16,
    /// Fade-in duration in seconds (0 = off).
    #[serde(default)]
    pub fade_in_secs: f64,
    /// Fade-out duration in seconds (0 = off).
    #[serde(default)]
    pub fade_out_secs: f64,
    /// Linear volume gain (1.0 = unchanged). Clamped ~0.05–4.0 at encode time.
    #[serde(default = "default_volume")]
    pub volume: f64,
}

pub(crate) fn default_true() -> bool {
    true
}

pub(crate) fn default_speed() -> f64 {
    1.0
}

pub(crate) fn default_volume() -> f64 {
    1.0
}

pub(crate) fn effective_volume(v: f64) -> f64 {
    if !v.is_finite() {
        return 1.0;
    }
    v.clamp(0.05, 4.0)
}

pub(crate) fn effective_fade(secs: f64) -> f64 {
    if secs.is_finite() && secs > 0.02 {
        secs.min(8.0)
    } else {
        0.0
    }
}

pub(crate) fn has_geometry_transform(opts: &OptimizeOptions) -> bool {
    opts.flip_h || opts.flip_v || matches!(opts.rotate, 90 | 180 | 270)
}

pub(crate) fn has_fades(opts: &OptimizeOptions) -> bool {
    effective_fade(opts.fade_in_secs) > 0.0 || effective_fade(opts.fade_out_secs) > 0.0
}

pub(crate) fn volume_changed(opts: &OptimizeOptions) -> bool {
    (effective_volume(opts.volume) - 1.0).abs() > 0.01
}

pub(crate) fn effective_speed(speed: f64) -> f64 {
    if speed.is_finite() && speed > 0.05 && (speed - 1.0).abs() > 0.001 {
        speed
    } else {
        1.0
    }
}

/// Build an atempo chain for ffmpeg (each filter accepts 0.5–2.0).
pub(crate) fn build_atempo_chain(speed: f64) -> String {
    let mut filters: Vec<String> = Vec::new();
    let mut remaining = speed;
    while remaining > 2.001 {
        filters.push("atempo=2.0".into());
        remaining /= 2.0;
    }
    if remaining > 1.001 {
        filters.push(format!("atempo={remaining:.4}"));
    }
    filters.join(",")
}

#[derive(Debug, Clone, Serialize)]
pub struct ExportEstimate {
    pub duration_secs: f64,
    pub size_bytes: u64,
    pub resolution_label: String,
    pub format_label: String,
    /// When true, export will remux without re-encoding (very fast).
    pub stream_copy: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct VideoAnalyze {
    pub info: VideoInfo,
    pub suggested_preset: String,
    pub suggested_resolution: String,
    pub can_stream_copy_trim: bool,
    pub bitrate_mbps: f64,
    pub bytes_per_sec: f64,
    pub has_room_to_compress: bool,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OptimizeProgress {
    pub job_id: String,
    /// 0–100, or -1 when the total duration is unknown (indeterminate).
    pub percent: f64,
    pub done: bool,
    pub cancelled: bool,
    pub output_path: Option<String>,
    pub output_size_bytes: Option<u64>,
    pub error: Option<String>,
}

