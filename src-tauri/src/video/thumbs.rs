use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use super::ffmpeg::apply_path_env;

// ────────────────────────────────────────────────────────────────────────────
// Thumbnail
// ────────────────────────────────────────────────────────────────────────────

pub(crate) fn thumbnail_path_for(video: &Path) -> PathBuf {
    video.with_extension("thumb.jpg")
}

pub(crate) fn make_thumbnail(ffmpeg: &Path, video: &Path, at_secs: f64) -> Result<PathBuf, String> {
    make_thumbnail_scaled(ffmpeg, video, at_secs, &thumbnail_path_for(video), 360)
}

pub(crate) fn make_thumbnail_scaled(
    ffmpeg: &Path,
    video: &Path,
    at_secs: f64,
    out: &Path,
    height: u32,
) -> Result<PathBuf, String> {
    let vf = format!("scale=-2:{height}:flags=fast_bilinear");
    let status = Command::new(ffmpeg)
        .args([
            "-y",
            "-hide_banner",
            "-loglevel", "error",
            "-ss", &format!("{at_secs:.3}"),
            "-i", &video.to_string_lossy(),
            "-an",
            "-sn",
            "-frames:v", "1",
            "-vf", &vf,
            "-q:v", if height >= 200 { "5" } else { "6" },
            &out.to_string_lossy(),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("ffmpeg failed: {e}"))?;

    if !status.success() || !out.exists() {
        return Err("Nepodarilo sa vytvoriť miniatúru".into());
    }
    Ok(out.to_path_buf())
}

pub(crate) fn filmstrip_path_for(video: &Path, index: u32) -> PathBuf {
    let stem = video
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("video");
    video.with_file_name(format!("{stem}.strip-{index:02}.jpg"))
}

