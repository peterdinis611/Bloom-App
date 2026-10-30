use std::path::{Path, PathBuf};

use uuid::Uuid;

use super::types::*;
use super::encode::{can_stream_copy, is_mp4_family, resolution_height, trim_duration};
use super::thumbs::{filmstrip_path_for, thumbnail_path_for};
use crate::{meta_path_for, now_iso, RecordingMeta};

pub fn compute_export_estimate(info: &VideoInfo, opts: &OptimizeOptions) -> ExportEstimate {
    let source_duration = trim_duration(opts).unwrap_or(info.duration_secs).max(0.0);
    let speed = effective_speed(opts.speed);
    let out_duration = (source_duration / speed).max(0.0);
    let stream_copy = can_stream_copy(opts, info);

    let mut size = info.size_bytes as f64;
    if info.duration_secs > 0.0 {
        size *= source_duration / info.duration_secs;
    }
    size /= speed;

    if stream_copy {
        ExportEstimate {
            duration_secs: out_duration,
            size_bytes: size.max(1024.0) as u64,
            resolution_label: opts.resolution.clone(),
            format_label: opts.format.to_uppercase(),
            stream_copy: true,
        }
    } else {
        let preset_factor = match opts.preset.as_str() {
            "small" => 0.38,
            "high" => 0.82,
            _ => 0.58,
        };
        size *= preset_factor;

        if let Some(h) = resolution_height(&opts.resolution) {
            if info.height > 0 {
                let scale = (h as f64 / info.height as f64).min(1.0);
                size *= scale * scale;
            }
        }

        if opts.use_hevc {
            size *= 0.62;
        }
        if opts.denoise {
            size *= 0.95;
        }

        size = match opts.format.as_str() {
            "gif" => size * 0.45,
            "webm" => size * 0.92,
            "avi" => size * 1.05,
            "mkv" => size * 0.98,
            "mpeg" | "mpg" => size * 1.35,
            "ogv" => size * 1.15,
            "3gp" => size * 0.55,
            "ts" | "flv" => size * 1.02,
            "m4v" => size,
            _ => size,
        };

        ExportEstimate {
            duration_secs: out_duration,
            size_bytes: size.max(1024.0) as u64,
            resolution_label: opts.resolution.clone(),
            format_label: if opts.use_hevc && is_mp4_family(&opts.format) {
                format!("HEVC {}", opts.format.to_uppercase())
            } else {
                opts.format.to_uppercase()
            },
            stream_copy: false,
        }
    }
}

pub(crate) fn update_sidecar_in_place(
    path: &Path,
    opts: &OptimizeOptions,
    duration_secs: f64,
    size_bytes: u64,
) -> Result<(), String> {
    let meta_path = meta_path_for(path);
    let raw = std::fs::read_to_string(&meta_path)
        .map_err(|e| format!("Cannot read sidecar: {e}"))?;
    let mut meta: RecordingMeta =
        serde_json::from_str(&raw).map_err(|e| format!("Sidecar parse error: {e}"))?;
    meta.duration_secs = duration_secs;
    meta.file_size_bytes = size_bytes;
    meta.quality = opts.resolution.clone();
    let json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    std::fs::write(&meta_path, json).map_err(|e| format!("Cannot update sidecar: {e}"))?;
    Ok(())
}

pub(crate) fn replace_original_file(
    input: &Path,
    temp_output: &Path,
    opts: &OptimizeOptions,
    duration_secs: f64,
    size_bytes: u64,
) -> Result<PathBuf, String> {
    if !temp_output.exists() {
        return Err("Dočasný export súbor chýba".into());
    }
    let _ = std::fs::remove_file(input);
    std::fs::rename(temp_output, input).map_err(|e| format!("Could not replace original: {e}"))?;
    update_sidecar_in_place(input, opts, duration_secs, size_bytes)?;
    let _ = std::fs::remove_file(thumbnail_path_for(input));
    for i in 0..24 {
        let _ = std::fs::remove_file(filmstrip_path_for(input, i));
    }
    Ok(input.to_path_buf())
}

// ────────────────────────────────────────────────────────────────────────────
// Sidecar for optimised output (so it shows up in the library)
// ────────────────────────────────────────────────────────────────────────────

pub(crate) fn write_output_sidecar(
    root: Option<&Path>,
    input: &Path,
    output: &Path,
    opts: &OptimizeOptions,
    duration_secs: f64,
    size_bytes: u64,
) {
    // Inherit from the original recording's sidecar when available.
    let base: Option<RecordingMeta> = std::fs::read_to_string(meta_path_for(input))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok());

    // Relative to the library root so files in sub-folders resolve correctly.
    let filename = match root {
        Some(r) if output.starts_with(r) => crate::util::relative_filename(r, output),
        _ => output
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("optimized")
            .to_string(),
    };
    let title_stem = output.file_stem().and_then(|s| s.to_str()).unwrap_or("optimized").to_string();

    let meta = RecordingMeta {
        id: Uuid::new_v4().to_string(),
        title: title_stem,
        filename,
        created_at: now_iso(),
        duration_secs,
        file_size_bytes: size_bytes,
        source: base.as_ref().map(|m| m.source.clone()).unwrap_or_else(|| "screen".into()),
        quality: opts.resolution.clone(),
        has_microphone: base.as_ref().map(|m| m.has_microphone).unwrap_or(false),
        has_system_audio: base.as_ref().map(|m| m.has_system_audio).unwrap_or(false),
        target_label: format!(
            "Optimised · {} · {}",
            opts.resolution,
            opts.format.to_uppercase()
        ),
        starred: false,
        tags: vec![],
        folder: base.as_ref().map(|m| m.folder.clone()).unwrap_or_default(),
        notes: base.as_ref().map(|m| m.notes.clone()).unwrap_or_default(),
    };

    if let Ok(json) = serde_json::to_string_pretty(&meta) {
        let _ = std::fs::write(meta_path_for(output), json);
    }
}

