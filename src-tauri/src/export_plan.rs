//! Single source of truth for export limits + OptimizeOptions normalization.

use serde::{Deserialize, Serialize};

use crate::error::{coded, codes};
use crate::util::sanitize_folder_name;
use crate::video::{OptimizeOptions, TimeRange};

pub const MAX_SEGMENTS: usize = 8;
pub const MIN_SEGMENT_SECS: f64 = 0.5;
pub const MIN_CROP: f64 = 0.05;
pub const MIN_SPEECH_SECS: f64 = 0.25;

#[derive(Debug, Clone, Serialize)]
pub struct ExportLimits {
    pub max_segments: usize,
    pub min_segment_secs: f64,
    pub min_crop: f64,
    pub min_speech_secs: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlanExportRequest {
    pub options: OptimizeOptions,
    /// Optional speech ranges from detect_silence — applied as keep_ranges when set.
    #[serde(default)]
    pub speech_ranges: Vec<TimeRange>,
    /// Preferred output stem for GIF / named exports (sanitized in Rust).
    #[serde(default)]
    pub preferred_stem: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlanExportResult {
    pub options: OptimizeOptions,
    pub warnings: Vec<String>,
}

#[tauri::command]
pub fn get_export_limits() -> ExportLimits {
    ExportLimits {
        max_segments: MAX_SEGMENTS,
        min_segment_secs: MIN_SEGMENT_SECS,
        min_crop: MIN_CROP,
        min_speech_secs: MIN_SPEECH_SECS,
    }
}

/// Normalize and validate options before optimize / batch.
#[tauri::command]
pub fn plan_export(request: PlanExportRequest) -> Result<PlanExportResult, String> {
    plan_export_inner(request)
}

pub(crate) fn plan_export_inner(request: PlanExportRequest) -> Result<PlanExportResult, String> {
    let mut opts = request.options;
    let mut warnings = Vec::new();

    // GIF cannot be HEVC / replace.
    if opts.format == "gif" {
        if opts.use_hevc {
            opts.use_hevc = false;
            warnings.push("gif_disables_hevc".into());
        }
        if opts.replace_original {
            opts.replace_original = false;
            warnings.push("gif_disables_replace".into());
        }
        opts.remove_audio = true;
    }

    // Replace original only for MP4 (non-HEVC).
    if opts.replace_original {
        if opts.format != "mp4" {
            return Err(coded(
                codes::INVALID_OPTIONS,
                "Nahradenie originálu je podporované len pre MP4.",
            ));
        }
        if opts.use_hevc {
            return Err(coded(
                codes::INVALID_OPTIONS,
                "Nahradenie originálu nepodporuje HEVC.",
            ));
        }
    }

    // Apply speech ranges as keep_ranges when provided.
    if !request.speech_ranges.is_empty() {
        let mut ranges: Vec<TimeRange> = request
            .speech_ranges
            .into_iter()
            .filter(|r| (r.end - r.start) >= MIN_SPEECH_SECS)
            .take(MAX_SEGMENTS)
            .collect();
        if ranges.is_empty() {
            return Err(coded(
                codes::INVALID_OPTIONS,
                "Žiadne použiteľné rečové úseky.",
            ));
        }
        // Clamp tiny gaps.
        for r in &mut ranges {
            if r.end < r.start + MIN_SEGMENT_SECS {
                r.end = r.start + MIN_SEGMENT_SECS;
            }
        }
        opts.keep_ranges = ranges;
        opts.trim_start = None;
        opts.trim_end = None;
    }

    if opts.keep_ranges.len() > MAX_SEGMENTS {
        opts.keep_ranges.truncate(MAX_SEGMENTS);
        warnings.push("segments_truncated".into());
    }

    for r in &opts.keep_ranges {
        if r.end <= r.start {
            return Err(coded(codes::INVALID_OPTIONS, "Neplatný časový úsek."));
        }
    }

    // Spatial crop floors.
    if let (Some(w), Some(h)) = (opts.crop_w, opts.crop_h) {
        if w < MIN_CROP || h < MIN_CROP {
            return Err(coded(codes::INVALID_OPTIONS, "Crop je príliš malý."));
        }
    }

    // Preferred stem → sanitized output_name when missing.
    if opts.output_name.as_ref().map(|s| s.trim().is_empty()).unwrap_or(true) {
        if let Some(stem) = request.preferred_stem {
            let clean = sanitize_stem(&stem);
            if !clean.is_empty() {
                opts.output_name = Some(clean);
            }
        }
    } else if let Some(name) = opts.output_name.take() {
        opts.output_name = Some(sanitize_stem(&name));
    }

    if opts.input_path.trim().is_empty() {
        return Err(coded(codes::VIDEO_MISSING, "Vstupné video neexistuje"));
    }

    Ok(PlanExportResult { options: opts, warnings })
}

/// Sanitize a file stem for export names (GIF / titled outputs).
pub(crate) fn sanitize_stem(raw: &str) -> String {
    let base = raw.trim();
    let no_ext = base
        .trim_end_matches(".gif")
        .trim_end_matches(".mp4")
        .trim_end_matches(".mov")
        .trim_end_matches(".webm");
    let collapsed: String = no_ext
        .chars()
        .map(|c| if c.is_whitespace() { '-' } else { c })
        .collect();
    let folderish = sanitize_folder_name(&collapsed.replace('/', "-"));
    let mut out: String = folderish
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .collect();
    if out.len() > 40 {
        out.truncate(40);
    }
    out.trim_matches('-').trim_matches('.').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::video::OptimizeOptions;

    fn base_opts() -> OptimizeOptions {
        OptimizeOptions {
            input_path: "/tmp/in.mp4".into(),
            preset: "medium".into(),
            resolution: "original".into(),
            format: "mp4".into(),
            trim_start: None,
            trim_end: None,
            keep_ranges: vec![],
            crop_x: None,
            crop_y: None,
            crop_w: None,
            crop_h: None,
            speed: 1.0,
            output_name: None,
            add_to_library: true,
            replace_original: false,
            srt_path: None,
            subtitle_cards: vec![],
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
    fn sanitize_stem_collapses_spaces() {
        assert_eq!(sanitize_stem("My Cool Clip!!.mp4"), "My-Cool-Clip");
    }

    #[test]
    fn gif_forces_no_hevc_replace() {
        let mut o = base_opts();
        o.format = "gif".into();
        o.use_hevc = true;
        o.replace_original = true;
        let r = plan_export_inner(PlanExportRequest {
            options: o,
            speech_ranges: vec![],
            preferred_stem: Some("Demo Clip".into()),
        })
        .unwrap();
        assert!(!r.options.use_hevc);
        assert!(!r.options.replace_original);
        assert!(r.options.remove_audio);
        assert_eq!(r.options.output_name.as_deref(), Some("Demo-Clip"));
    }

    #[test]
    fn replace_rejects_non_mp4() {
        let mut o = base_opts();
        o.format = "mov".into();
        o.replace_original = true;
        assert!(plan_export_inner(PlanExportRequest {
            options: o,
            speech_ranges: vec![],
            preferred_stem: None,
        })
        .is_err());
    }
}
