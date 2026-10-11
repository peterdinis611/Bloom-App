//! Post-recording finalisation: accurate duration, MP4 faststart remux, thumbnail.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::Serialize;
use tauri::Emitter;

use crate::config::{load_config, save_config};
use crate::types::RecordingMeta;
use crate::util::meta_path_for;
use crate::video::{find_ffprobe, find_ffmpeg_path, make_thumbnail, probe_cached, remux_mp4_faststart};

static FFMPEG_OK: OnceLock<bool> = OnceLock::new();

fn ffmpeg_tools_ready() -> bool {
    *FFMPEG_OK.get_or_init(|| {
        find_ffmpeg_path().is_some() && find_ffprobe(find_ffmpeg_path().as_deref()).is_some()
    })
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct FinalizeInfo {
    pub duration_secs: f64,
    pub file_size_bytes: u64,
}

/// Best-effort optimise after capture — never fails the caller.
pub(crate) fn finalize_recording(path: &Path, wall_duration_secs: f64) -> FinalizeInfo {
    let mut info = FinalizeInfo {
        duration_secs: wall_duration_secs,
        file_size_bytes: std::fs::metadata(path).map(|m| m.len()).unwrap_or(0),
    };

    if !ffmpeg_tools_ready() {
        return info;
    }

    let ffmpeg = match find_ffmpeg_path() {
        Some(f) => f,
        None => return info,
    };
    let ffprobe = match find_ffprobe(Some(&ffmpeg)) {
        Some(p) => p,
        None => return info,
    };

    let path_str = path.to_string_lossy();
    if let Ok(probed) = probe_cached(&ffprobe, &path_str) {
        if probed.duration_secs > 0.05 {
            info.duration_secs = probed.duration_secs;
        }
    }

    // Remux only when moov is not already at the front (skips multi-GB rewrites).
    if remux_mp4_faststart(&ffmpeg, path).is_ok() {
        info.file_size_bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(info.file_size_bytes);
    }

    let thumb_path = path.to_path_buf();
    let ffmpeg_bg = ffmpeg.clone();
    let at = (info.duration_secs * 0.08).max(0.0);
    std::thread::spawn(move || {
        let _ = make_thumbnail(&ffmpeg_bg, &thumb_path, at);
    });

    info
}

// ── Auto-optimize after record ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct AutoOptimizeDone {
    pub id: String,
    pub path: String,
    pub size_bytes: u64,
    pub duration_secs: f64,
}

/// Light, lossless post-pass run in the background: ensure MP4 faststart,
/// refresh thumbnail, and sync duration/size in the sidecar. No re-encode.
/// Emits `auto-optimize-done` when finished; silently skipped without ffmpeg.
pub(crate) fn spawn_auto_optimize(app: tauri::AppHandle, video: PathBuf, id: String) {
    std::thread::spawn(move || {
        let Some(done) = run_auto_optimize(&video, &id) else { return };
        let _ = app.emit("auto-optimize-done", done);
    });
}

fn run_auto_optimize(video: &Path, id: &str) -> Option<AutoOptimizeDone> {
    if !ffmpeg_tools_ready() || !video.is_file() {
        return None;
    }
    let ffmpeg = find_ffmpeg_path()?;
    let ffprobe = find_ffprobe(Some(&ffmpeg))?;

    remux_mp4_faststart(&ffmpeg, video).ok();
    let size = std::fs::metadata(video).map(|m| m.len()).unwrap_or(0);
    let duration = probe_cached(&ffprobe, &video.to_string_lossy())
        .map(|i| i.duration_secs)
        .unwrap_or(0.0);

    // Re-grab the thumbnail from the final file.
    let _ = std::fs::remove_file(crate::video::thumbnail_path_for(video));
    let _ = make_thumbnail(&ffmpeg, video, (duration * 0.08).max(0.0));

    let meta_path = meta_path_for(video);
    if let Ok(raw) = std::fs::read_to_string(&meta_path) {
        if let Ok(mut meta) = serde_json::from_str::<RecordingMeta>(&raw) {
            if duration > 0.05 {
                meta.duration_secs = duration;
            }
            meta.file_size_bytes = size;
            if let Ok(json) = serde_json::to_string_pretty(&meta) {
                let _ = std::fs::write(&meta_path, json);
            }
        }
    }

    Some(AutoOptimizeDone {
        id: id.to_string(),
        path: video.to_string_lossy().into_owned(),
        size_bytes: size,
        duration_secs: duration,
    })
}

#[tauri::command]
pub(crate) fn get_auto_optimize_after_record(app: tauri::AppHandle) -> bool {
    load_config(&app)
        .ok()
        .and_then(|c| c.auto_optimize_after_record)
        .unwrap_or(false)
}

#[tauri::command]
pub(crate) fn set_auto_optimize_after_record(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
    let mut cfg = load_config(&app).unwrap_or_default();
    cfg.auto_optimize_after_record = Some(enabled);
    save_config(&app, &cfg)?;
    Ok(enabled)
}

#[cfg(test)]
#[path = "__tests__/finalize_tests.rs"]
mod tests;
