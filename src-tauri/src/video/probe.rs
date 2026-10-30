use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, OnceLock},
    time::SystemTime,
};

use super::types::VideoInfo;
use super::ffmpeg::{
    apply_path_env, ffmpeg_tool_cache, ffprobe_tool_cache, find_binary, find_ffmpeg,
};

pub(crate) struct ProbeCacheEntry {
    size: u64,
    modified: SystemTime,
    info: VideoInfo,
}

pub(crate) fn probe_result_cache() -> &'static Mutex<HashMap<String, ProbeCacheEntry>> {
    static C: OnceLock<Mutex<HashMap<String, ProbeCacheEntry>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Clear resolved binary paths after install / PATH changes.
pub(crate) fn clear_media_tool_cache() {
    *ffmpeg_tool_cache().lock().unwrap() = None;
    *ffprobe_tool_cache().lock().unwrap() = None;
    probe_result_cache().lock().unwrap().clear();
}

// ────────────────────────────────────────────────────────────────────────────
// ffprobe helpers
// ────────────────────────────────────────────────────────────────────────────

pub(crate) fn parse_frame_rate(s: &str) -> f64 {
    if let Some((n, d)) = s.split_once('/') {
        let n: f64 = n.parse().unwrap_or(0.0);
        let d: f64 = d.parse().unwrap_or(1.0);
        if d != 0.0 {
            return n / d;
        }
    }
    s.parse().unwrap_or(0.0)
}

pub(crate) fn probe(ffprobe: &Path, path: &str) -> Result<VideoInfo, String> {
    // Cap how much of a multi-GB file ffprobe reads before giving up on discovery.
    let output = Command::new(ffprobe)
        .args([
            "-v", "error",
            "-probesize", "5M",
            "-analyzeduration", "2M",
            "-print_format", "json",
            "-show_entries",
            "format=duration,bit_rate,size:stream=codec_type,codec_name,width,height,avg_frame_rate",
            path,
        ])
        .output()
        .map_err(|e| format!("ffprobe failed: {e}"))?;

    if !output.status.success() {
        return probe_fallback(ffprobe, path);
    }

    parse_probe_json(&output.stdout, path)
}

pub(crate) fn probe_fallback(ffprobe: &Path, path: &str) -> Result<VideoInfo, String> {
    let output = Command::new(ffprobe)
        .args([
            "-v", "error",
            "-probesize", "32M",
            "-analyzeduration", "5M",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            path,
        ])
        .output()
        .map_err(|e| format!("ffprobe failed: {e}"))?;

    if !output.status.success() {
        return Err("ffprobe nedokázal prečítať súbor".into());
    }
    parse_probe_json(&output.stdout, path)
}

pub(crate) fn parse_probe_json(stdout: &[u8], path: &str) -> Result<VideoInfo, String> {
    let json: serde_json::Value =
        serde_json::from_slice(stdout).map_err(|e| format!("ffprobe parse error: {e}"))?;

    let empty = Vec::new();
    let streams = json.get("streams").and_then(|s| s.as_array()).unwrap_or(&empty);

    let video = streams
        .iter()
        .find(|s| s.get("codec_type").and_then(|t| t.as_str()) == Some("video"));
    let has_audio = streams
        .iter()
        .any(|s| s.get("codec_type").and_then(|t| t.as_str()) == Some("audio"));

    let (width, height, fps, codec) = if let Some(v) = video {
        (
            v.get("width").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
            v.get("height").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
            v.get("avg_frame_rate")
                .and_then(|x| x.as_str())
                .map(parse_frame_rate)
                .unwrap_or(0.0),
            v.get("codec_name")
                .and_then(|x| x.as_str())
                .unwrap_or("unknown")
                .to_string(),
        )
    } else {
        (0, 0, 0.0, "unknown".to_string())
    };

    let format = json.get("format");
    let duration_secs = format
        .and_then(|f| f.get("duration"))
        .and_then(|d| d.as_str())
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0);
    let bitrate_bps = format
        .and_then(|f| f.get("bit_rate"))
        .and_then(|b| b.as_str())
        .and_then(|b| b.parse::<u64>().ok())
        .unwrap_or(0);
    let size_bytes = format
        .and_then(|f| f.get("size"))
        .and_then(|s| s.as_str())
        .and_then(|s| s.parse::<u64>().ok())
        .or_else(|| std::fs::metadata(path).ok().map(|m| m.len()))
        .unwrap_or(0);

    Ok(VideoInfo {
        width,
        height,
        fps,
        codec,
        duration_secs,
        bitrate_bps,
        size_bytes,
        has_audio,
    })
}

/// Probe with mtime/size cache — avoids re-reading multi-GB files in the same session.
pub(crate) fn probe_cached(ffprobe: &Path, path: &str) -> Result<VideoInfo, String> {
    let meta = std::fs::metadata(path).ok();
    let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
    let modified = meta
        .and_then(|m| m.modified().ok())
        .unwrap_or(SystemTime::UNIX_EPOCH);

    {
        let cache = probe_result_cache().lock().unwrap();
        if let Some(entry) = cache.get(path) {
            if entry.size == size && entry.modified == modified {
                return Ok(entry.info.clone());
            }
        }
    }

    let info = probe(ffprobe, path)?;
    let mut cache = probe_result_cache().lock().unwrap();
    if cache.len() > 64 {
        cache.clear();
    }
    cache.insert(
        path.to_string(),
        ProbeCacheEntry {
            size,
            modified,
            info: info.clone(),
        },
    );
    Ok(info)
}

