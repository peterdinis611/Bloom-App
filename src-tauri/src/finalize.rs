//! Post-recording finalisation: accurate duration, MP4 faststart remux, thumbnail.

use std::path::Path;
use std::sync::OnceLock;

use crate::video::{find_ffprobe, find_ffmpeg_path, make_thumbnail, probe, remux_mp4_faststart};

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
    if let Ok(probed) = probe(&ffprobe, &path_str) {
        if probed.duration_secs > 0.05 {
            info.duration_secs = probed.duration_secs;
        }
    }

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

#[cfg(test)]
#[path = "__tests__/finalize_tests.rs"]
mod tests;
