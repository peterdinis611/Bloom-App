use std::{
    fs::File,
    io::Read,
    path::Path,
    process::{Command, Stdio},
};

use super::ffmpeg::{apply_path_env, tail_lines};

// ────────────────────────────────────────────────────────────────────────────
// Fast MP4 remux (stream copy + moov at start for instant playback)
// ────────────────────────────────────────────────────────────────────────────

/// Rewrites MP4 in place so the moov atom is at the front — no re-encode.
/// Skips work when moov already precedes mdat in the file header (already faststarted).
pub(crate) fn remux_mp4_faststart(ffmpeg: &Path, path: &Path) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext != "mp4" {
        return Ok(());
    }

    if mp4_moov_is_faststarted(path) {
        return Ok(());
    }

    let tmp = path.with_extension("bloom-faststart.mp4");
    let _ = std::fs::remove_file(&tmp);

    let status = Command::new(ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            &path.to_string_lossy(),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            "-max_muxing_queue_size",
            "9999",
            &tmp.to_string_lossy(),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|e| format!("ffmpeg remux failed: {e}"))?;

    if !status.success() || !tmp.exists() {
        let _ = std::fs::remove_file(&tmp);
        return Err("Remux faststart zlyhal".into());
    }

    std::fs::rename(&tmp, path).map_err(|e| format!("Could not replace recording: {e}"))
}

/// True when `moov` appears before `mdat` in the first ~1 MiB (instant seek / playback).
pub(crate) fn mp4_moov_is_faststarted(path: &Path) -> bool {
    let Ok(mut file) = File::open(path) else {
        return false;
    };
    let mut buf = vec![0u8; 1024 * 1024];
    let Ok(n) = file.read(&mut buf) else {
        return false;
    };
    let hay = &buf[..n];
    let moov = find_fourcc(hay, b"moov");
    let mdat = find_fourcc(hay, b"mdat");
    match (moov, mdat) {
        (Some(mv), Some(md)) => mv < md,
        (Some(_), None) => true,
        _ => false,
    }
}

pub(crate) fn find_fourcc(hay: &[u8], needle: &[u8; 4]) -> Option<usize> {
    hay.windows(4).position(|w| w == needle)
}

