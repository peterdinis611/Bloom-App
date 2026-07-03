/*!
 * Bloom – video optimisation backend (ffmpeg wrapper)
 *
 * Commands
 *   check_ffmpeg()                       -> FfmpegStatus
 *   get_video_info(path)                 -> VideoInfo
 *   get_thumbnail(id, at_secs?)          -> String (jpg path)
 *   optimize_video(options)              -> String (job_id)   [async, emits "video-progress"]
 *   cancel_optimize(job_id)              -> ()
 *
 * ffmpeg is *not* bundled – we detect a system install (PATH + common
 * Homebrew / Linux locations). If it's missing the frontend shows an install
 * hint. Transcode progress is streamed to the frontend via the "video-progress"
 * event, and jobs can be cancelled mid-flight.
 */

use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Instant,
};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use uuid::Uuid;

use crate::{meta_path_for, now_iso, RecordingMeta};

// ────────────────────────────────────────────────────────────────────────────
// Managed state – cancellation flags keyed by job id
// ────────────────────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct VideoJobs(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

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
}

#[derive(Debug, Serialize)]
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

#[derive(Debug, Deserialize)]
pub struct OptimizeOptions {
    pub input_path: String,
    /// "small" | "medium" | "high"
    pub preset: String,
    /// "480p" | "720p" | "1080p" | "original"
    pub resolution: String,
    /// "mp4" | "webm" | "gif"
    pub format: String,
    pub trim_start: Option<f64>,
    pub trim_end: Option<f64>,
    /// Optional custom output file name (without directory).
    pub output_name: Option<String>,
    /// Add the result to the Bloom library (write a .bloom.json sidecar).
    #[serde(default = "default_true")]
    pub add_to_library: bool,
}

fn default_true() -> bool {
    true
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

// ────────────────────────────────────────────────────────────────────────────
// Binary discovery
// ────────────────────────────────────────────────────────────────────────────

fn candidate_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Ok(path) = std::env::var("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }
    #[cfg(target_os = "macos")]
    for extra in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/opt/local/bin"] {
        dirs.push(PathBuf::from(extra));
    }
    #[cfg(target_os = "linux")]
    for extra in ["/usr/bin", "/usr/local/bin", "/snap/bin", "/var/lib/flatpak/exports/bin"] {
        dirs.push(PathBuf::from(extra));
    }
    dirs
}

fn find_binary(stem: &str) -> Option<PathBuf> {
    let names: &[String] = &[stem.to_string(), format!("{stem}.exe")];
    for dir in candidate_dirs() {
        for name in names {
            let cand = dir.join(name);
            if cand.is_file() {
                return Some(cand);
            }
        }
    }
    None
}

fn find_ffmpeg() -> Option<PathBuf> {
    find_binary("ffmpeg")
}

fn find_ffprobe() -> Option<PathBuf> {
    find_binary("ffprobe")
}

fn install_hint() -> String {
    #[cfg(target_os = "macos")]
    return "Install ffmpeg with Homebrew:  brew install ffmpeg".to_string();
    #[cfg(target_os = "windows")]
    return "Install ffmpeg with winget:  winget install Gyan.FFmpeg".to_string();
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    return "Install ffmpeg with your package manager, e.g.  sudo apt install ffmpeg".to_string();
}

// ────────────────────────────────────────────────────────────────────────────
// ffprobe helpers
// ────────────────────────────────────────────────────────────────────────────

fn parse_frame_rate(s: &str) -> f64 {
    if let Some((n, d)) = s.split_once('/') {
        let n: f64 = n.parse().unwrap_or(0.0);
        let d: f64 = d.parse().unwrap_or(1.0);
        if d != 0.0 {
            return n / d;
        }
    }
    s.parse().unwrap_or(0.0)
}

fn probe(ffprobe: &Path, path: &str) -> Result<VideoInfo, String> {
    let output = Command::new(ffprobe)
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            path,
        ])
        .output()
        .map_err(|e| format!("ffprobe failed: {e}"))?;

    if !output.status.success() {
        return Err("ffprobe could not read the file".into());
    }

    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("ffprobe parse error: {e}"))?;

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

// ────────────────────────────────────────────────────────────────────────────
// Argument building
// ────────────────────────────────────────────────────────────────────────────

struct PresetValues {
    x264_preset: &'static str,
    x264_crf: &'static str,
    vp9_crf: &'static str,
    audio_bitrate: &'static str,
}

fn preset_values(preset: &str) -> PresetValues {
    match preset {
        "small" => PresetValues { x264_preset: "veryfast", x264_crf: "30", vp9_crf: "37", audio_bitrate: "96k" },
        "high" => PresetValues { x264_preset: "slow", x264_crf: "20", vp9_crf: "27", audio_bitrate: "192k" },
        // "medium" and any unknown value
        _ => PresetValues { x264_preset: "medium", x264_crf: "25", vp9_crf: "32", audio_bitrate: "128k" },
    }
}

/// Target height for a resolution label, or None for "original".
fn resolution_height(resolution: &str) -> Option<u32> {
    match resolution {
        "480p" => Some(480),
        "720p" => Some(720),
        "1080p" => Some(1080),
        _ => None,
    }
}

fn ext_for_format(format: &str) -> &'static str {
    match format {
        "webm" => "webm",
        "gif" => "gif",
        _ => "mp4",
    }
}

fn build_args(
    opts: &OptimizeOptions,
    input: &str,
    output: &str,
    has_audio: bool,
) -> Vec<String> {
    let mut a: Vec<String> = vec!["-y".into(), "-hide_banner".into()];

    // Fast input-side seek for trimming.
    if let Some(start) = opts.trim_start {
        if start > 0.0 {
            a.push("-ss".into());
            a.push(format!("{start:.3}"));
        }
    }
    a.push("-i".into());
    a.push(input.to_string());

    // Duration (from trim window).
    if let Some(dur) = trim_duration(opts) {
        a.push("-t".into());
        a.push(format!("{dur:.3}"));
    }

    let height = resolution_height(&opts.resolution);
    let pv = preset_values(&opts.preset);
    let format = opts.format.as_str();

    // Video filters
    let mut vf: Vec<String> = Vec::new();
    if format == "gif" {
        vf.push("fps=12".into());
        vf.push(format!("scale=-2:{}:flags=lanczos", height.unwrap_or(480)));
    } else if let Some(h) = height {
        vf.push(format!("scale=-2:{h}"));
    }
    if !vf.is_empty() {
        a.push("-vf".into());
        a.push(vf.join(","));
    }

    // Codecs per container
    match format {
        "webm" => {
            a.extend(["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", pv.vp9_crf, "-row-mt", "1"].map(String::from));
            if has_audio {
                a.extend(["-c:a", "libopus", "-b:a", pv.audio_bitrate].map(String::from));
            } else {
                a.push("-an".into());
            }
        }
        "gif" => {
            a.extend(["-loop", "0", "-an"].map(String::from));
        }
        _ => {
            a.extend([
                "-c:v", "libx264",
                "-preset", pv.x264_preset,
                "-crf", pv.x264_crf,
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
            ]
            .map(String::from));
            if has_audio {
                a.extend(["-c:a", "aac", "-b:a", pv.audio_bitrate].map(String::from));
            } else {
                a.push("-an".into());
            }
        }
    }

    // Machine-readable progress on stdout.
    a.extend(["-progress", "pipe:1", "-nostats"].map(String::from));
    a.push(output.to_string());
    a
}

fn trim_duration(opts: &OptimizeOptions) -> Option<f64> {
    match (opts.trim_start, opts.trim_end) {
        (Some(s), Some(e)) if e > s => Some(e - s),
        (None, Some(e)) if e > 0.0 => Some(e),
        _ => None,
    }
}

/// Unique, non-clobbering output path in the same directory as the input.
fn build_output_path(opts: &OptimizeOptions, input: &Path) -> PathBuf {
    let dir = input.parent().unwrap_or_else(|| Path::new("."));
    let ext = ext_for_format(&opts.format);

    let base = if let Some(name) = opts.output_name.as_ref().filter(|n| !n.trim().is_empty()) {
        // Strip any extension the user typed; we control it from the format.
        Path::new(name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(name)
            .to_string()
    } else {
        let stem = input.file_stem().and_then(|s| s.to_str()).unwrap_or("video");
        format!("{stem}-{}-{}", opts.resolution, opts.preset)
    };

    let mut candidate = dir.join(format!("{base}.{ext}"));
    let mut n = 2;
    while candidate.exists() {
        candidate = dir.join(format!("{base}-{n}.{ext}"));
        n += 1;
    }
    candidate
}

// ────────────────────────────────────────────────────────────────────────────
// Thumbnail
// ────────────────────────────────────────────────────────────────────────────

fn thumbnail_path_for(video: &Path) -> PathBuf {
    video.with_extension("thumb.jpg")
}

fn make_thumbnail(ffmpeg: &Path, video: &Path, at_secs: f64) -> Result<PathBuf, String> {
    let out = thumbnail_path_for(video);
    let status = Command::new(ffmpeg)
        .args([
            "-y", "-hide_banner",
            "-ss", &format!("{at_secs:.3}"),
            "-i", &video.to_string_lossy(),
            "-frames:v", "1",
            "-vf", "scale=-2:360",
            "-q:v", "4",
            &out.to_string_lossy(),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("ffmpeg failed: {e}"))?;

    if !status.success() || !out.exists() {
        return Err("Could not generate thumbnail".into());
    }
    Ok(out)
}

// ────────────────────────────────────────────────────────────────────────────
// Sidecar for optimised output (so it shows up in the library)
// ────────────────────────────────────────────────────────────────────────────

fn write_output_sidecar(input: &Path, output: &Path, opts: &OptimizeOptions, duration_secs: f64, size_bytes: u64) {
    // Inherit from the original recording's sidecar when available.
    let base: Option<RecordingMeta> = std::fs::read_to_string(meta_path_for(input))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok());

    let filename = output
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("optimized")
        .to_string();
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
    };

    if let Ok(json) = serde_json::to_string_pretty(&meta) {
        let _ = std::fs::write(meta_path_for(output), json);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Transcode worker
// ────────────────────────────────────────────────────────────────────────────

fn parse_progress_seconds(line: &str) -> Option<f64> {
    if let Some(v) = line.strip_prefix("out_time_us=") {
        return v.trim().parse::<f64>().ok().map(|us| us / 1_000_000.0);
    }
    if let Some(v) = line.strip_prefix("out_time_ms=") {
        // ffmpeg reports out_time_ms in microseconds despite the name.
        return v.trim().parse::<f64>().ok().map(|us| us / 1_000_000.0);
    }
    if let Some(v) = line.strip_prefix("out_time=") {
        // HH:MM:SS.microseconds
        let v = v.trim();
        let parts: Vec<&str> = v.split(':').collect();
        if parts.len() == 3 {
            let h: f64 = parts[0].parse().ok()?;
            let m: f64 = parts[1].parse().ok()?;
            let s: f64 = parts[2].parse().ok()?;
            return Some(h * 3600.0 + m * 60.0 + s);
        }
    }
    None
}

fn remove_job(app: &tauri::AppHandle, job_id: &str) {
    app.state::<VideoJobs>().0.lock().unwrap().remove(job_id);
}

#[allow(clippy::too_many_arguments)]
fn run_optimize(
    app: tauri::AppHandle,
    job_id: String,
    ffmpeg: PathBuf,
    ffmpeg_thumb: PathBuf,
    args: Vec<String>,
    input: PathBuf,
    output: PathBuf,
    total_secs: f64,
    add_to_library: bool,
    opts: OptimizeOptions,
    cancel: Arc<AtomicBool>,
) {
    let emit = |p: OptimizeProgress| {
        let _ = app.emit("video-progress", p);
    };

    let mut child = match Command::new(&ffmpeg)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            remove_job(&app, &job_id);
            emit(OptimizeProgress {
                job_id: job_id.clone(),
                percent: 0.0,
                done: true,
                cancelled: false,
                output_path: None,
                output_size_bytes: None,
                error: Some(format!("Could not start ffmpeg: {e}")),
            });
            return;
        }
    };

    // Drain stderr on a thread so the pipe never blocks; keep it for errors.
    let stderr = child.stderr.take();
    let err_handle = std::thread::spawn(move || {
        let mut buf = String::new();
        if let Some(mut s) = stderr {
            let _ = s.read_to_string(&mut buf);
        }
        buf
    });

    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        let mut last_emit = Instant::now();
        for line in reader.lines().map_while(Result::ok) {
            if cancel.load(Ordering::Relaxed) {
                let _ = child.kill();
                break;
            }
            if let Some(secs) = parse_progress_seconds(&line) {
                let percent = if total_secs > 0.0 {
                    ((secs / total_secs) * 100.0).clamp(0.0, 99.5)
                } else {
                    -1.0
                };
                if last_emit.elapsed().as_millis() >= 120 {
                    last_emit = Instant::now();
                    emit(OptimizeProgress {
                        job_id: job_id.clone(),
                        percent,
                        done: false,
                        cancelled: false,
                        output_path: None,
                        output_size_bytes: None,
                        error: None,
                    });
                }
            }
        }
    }

    let status = child.wait();
    let stderr_text = err_handle.join().unwrap_or_default();
    remove_job(&app, &job_id);

    // Cancelled?
    if cancel.load(Ordering::Relaxed) {
        let _ = std::fs::remove_file(&output);
        emit(OptimizeProgress {
            job_id: job_id.clone(),
            percent: 0.0,
            done: true,
            cancelled: true,
            output_path: None,
            output_size_bytes: None,
            error: None,
        });
        return;
    }

    let ok = matches!(status, Ok(s) if s.success()) && output.exists();
    if !ok {
        let _ = std::fs::remove_file(&output);
        let tail: String = stderr_text.lines().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join(" ");
        emit(OptimizeProgress {
            job_id: job_id.clone(),
            percent: 0.0,
            done: true,
            cancelled: false,
            output_path: None,
            output_size_bytes: None,
            error: Some(if tail.is_empty() { "ffmpeg failed".into() } else { tail }),
        });
        return;
    }

    let size = std::fs::metadata(&output).map(|m| m.len()).unwrap_or(0);
    let out_duration = if total_secs > 0.0 { total_secs } else { 0.0 };

    // GIFs aren't real "recordings"; only MP4/WebM get a library sidecar.
    if add_to_library && opts.format != "gif" {
        write_output_sidecar(&input, &output, &opts, out_duration, size);
        let _ = make_thumbnail(&ffmpeg_thumb, &output, (out_duration * 0.1).max(0.0));
    }

    emit(OptimizeProgress {
        job_id: job_id.clone(),
        percent: 100.0,
        done: true,
        cancelled: false,
        output_path: Some(output.to_string_lossy().into_owned()),
        output_size_bytes: Some(size),
        error: None,
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Commands
// ────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn check_ffmpeg() -> FfmpegStatus {
    let ffmpeg = find_ffmpeg();
    let ffprobe = find_ffprobe();

    let version = ffmpeg.as_ref().and_then(|p| {
        Command::new(p)
            .arg("-version")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.lines().next().map(|l| l.to_string()))
    });

    FfmpegStatus {
        available: ffmpeg.is_some() && ffprobe.is_some(),
        ffmpeg_path: ffmpeg.map(|p| p.to_string_lossy().into_owned()),
        ffprobe_path: ffprobe.map(|p| p.to_string_lossy().into_owned()),
        version,
        install_hint: install_hint(),
    }
}

#[tauri::command]
pub fn get_video_info(path: String) -> Result<VideoInfo, String> {
    let ffprobe = find_ffprobe().ok_or_else(|| "ffprobe not found".to_string())?;
    probe(&ffprobe, &path)
}

#[tauri::command]
pub fn get_thumbnail(app: tauri::AppHandle, id: String, at_secs: Option<f64>) -> Result<String, String> {
    let dir = crate::bloom_dir(&app)?;
    let entry = crate::find_recording(&dir, &id).ok_or_else(|| format!("Recording {id} not found"))?;
    let video = PathBuf::from(&entry.path);

    let thumb = thumbnail_path_for(&video);
    if thumb.exists() {
        return Ok(thumb.to_string_lossy().into_owned());
    }

    let ffmpeg = find_ffmpeg().ok_or_else(|| "ffmpeg not found".to_string())?;
    let at = at_secs.unwrap_or_else(|| (entry.meta.duration_secs * 0.1).max(0.0));
    let path = make_thumbnail(&ffmpeg, &video, at)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn optimize_video(
    app: tauri::AppHandle,
    state: tauri::State<VideoJobs>,
    options: OptimizeOptions,
) -> Result<String, String> {
    let ffmpeg = find_ffmpeg().ok_or_else(|| "ffmpeg not found. Install it and try again.".to_string())?;
    let ffprobe = find_ffprobe().ok_or_else(|| "ffprobe not found. Install ffmpeg and try again.".to_string())?;

    let input = PathBuf::from(&options.input_path);
    if !input.exists() {
        return Err("Input video does not exist".into());
    }

    // Determine total duration for progress (trimmed window or full clip).
    let info = probe(&ffprobe, &options.input_path)?;
    let has_audio = info.has_audio;
    let total_secs = trim_duration(&options).unwrap_or(info.duration_secs);

    let output = build_output_path(&options, &input);
    let args = build_args(&options, &options.input_path, &output.to_string_lossy(), has_audio);

    let job_id = Uuid::new_v4().to_string();
    let cancel = Arc::new(AtomicBool::new(false));
    state.0.lock().unwrap().insert(job_id.clone(), cancel.clone());

    let app_clone = app.clone();
    let add_to_library = options.add_to_library;
    let ffmpeg_thumb = ffmpeg.clone();
    let worker_job_id = job_id.clone();

    std::thread::spawn(move || {
        run_optimize(
            app_clone,
            worker_job_id,
            ffmpeg,
            ffmpeg_thumb,
            args,
            input,
            output,
            total_secs,
            add_to_library,
            options,
            cancel,
        );
    });

    Ok(job_id)
}

#[tauri::command]
pub fn cancel_optimize(state: tauri::State<VideoJobs>, job_id: String) -> Result<(), String> {
    if let Some(flag) = state.0.lock().unwrap().get(&job_id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn opts(preset: &str, resolution: &str, format: &str) -> OptimizeOptions {
        OptimizeOptions {
            input_path: "/tmp/in.mp4".to_string(),
            preset: preset.to_string(),
            resolution: resolution.to_string(),
            format: format.to_string(),
            trim_start: None,
            trim_end: None,
            output_name: None,
            add_to_library: true,
        }
    }

    #[test]
    fn frame_rate_parsing() {
        assert!((parse_frame_rate("30000/1001") - 29.97).abs() < 0.01);
        assert_eq!(parse_frame_rate("25"), 25.0);
        assert_eq!(parse_frame_rate("0/0"), 0.0);
        assert_eq!(parse_frame_rate("garbage"), 0.0);
    }

    #[test]
    fn preset_values_map_correctly() {
        assert_eq!(preset_values("small").x264_crf, "30");
        assert_eq!(preset_values("high").x264_crf, "20");
        // Unknown falls back to medium.
        assert_eq!(preset_values("medium").x264_crf, "25");
        assert_eq!(preset_values("bogus").x264_crf, "25");
    }

    #[test]
    fn resolution_and_format_helpers() {
        assert_eq!(resolution_height("480p"), Some(480));
        assert_eq!(resolution_height("720p"), Some(720));
        assert_eq!(resolution_height("1080p"), Some(1080));
        assert_eq!(resolution_height("original"), None);

        assert_eq!(ext_for_format("mp4"), "mp4");
        assert_eq!(ext_for_format("webm"), "webm");
        assert_eq!(ext_for_format("gif"), "gif");
        assert_eq!(ext_for_format("whatever"), "mp4");
    }

    #[test]
    fn trim_duration_logic() {
        let mut o = opts("medium", "720p", "mp4");
        assert_eq!(trim_duration(&o), None);
        o.trim_start = Some(2.0);
        o.trim_end = Some(5.0);
        assert_eq!(trim_duration(&o), Some(3.0));
        o.trim_start = None;
        o.trim_end = Some(4.0);
        assert_eq!(trim_duration(&o), Some(4.0));
        // Invalid window (end <= start) → None.
        o.trim_start = Some(5.0);
        o.trim_end = Some(1.0);
        assert_eq!(trim_duration(&o), None);
    }

    #[test]
    fn progress_seconds_parsing() {
        assert_eq!(parse_progress_seconds("out_time_us=1500000"), Some(1.5));
        assert_eq!(parse_progress_seconds("out_time_ms=2000000"), Some(2.0));
        assert_eq!(parse_progress_seconds("out_time=00:00:02.500000"), Some(2.5));
        assert_eq!(parse_progress_seconds("out_time=01:02:03.000000"), Some(3723.0));
        assert_eq!(parse_progress_seconds("progress=continue"), None);
        assert_eq!(parse_progress_seconds("frame=42"), None);
    }

    #[test]
    fn build_args_mp4_with_scale_and_progress() {
        let o = opts("medium", "720p", "mp4");
        let args = build_args(&o, "/tmp/in.mp4", "/tmp/out.mp4", true);

        // H.264 video + AAC audio codecs present.
        assert!(args.windows(2).any(|w| w == ["-c:v", "libx264"]));
        assert!(args.windows(2).any(|w| w == ["-c:a", "aac"]));
        // Scale filter for 720p.
        assert!(args.iter().any(|a| a == "scale=-2:720"));
        // Machine-readable progress + output last.
        assert!(args.windows(2).any(|w| w == ["-progress", "pipe:1"]));
        assert_eq!(args.last().unwrap(), "/tmp/out.mp4");
    }

    #[test]
    fn build_args_no_audio_uses_an() {
        let o = opts("small", "original", "mp4");
        let args = build_args(&o, "/tmp/in.mp4", "/tmp/out.mp4", false);
        assert!(args.iter().any(|a| a == "-an"));
        // No scale filter for "original".
        assert!(!args.iter().any(|a| a.starts_with("scale=")));
    }

    #[test]
    fn build_args_gif_has_fps_and_no_audio() {
        let o = opts("medium", "480p", "gif");
        let args = build_args(&o, "/tmp/in.mp4", "/tmp/out.gif", true);
        assert!(args.iter().any(|a| a.contains("fps=12")));
        assert!(args.iter().any(|a| a == "-an"));
    }

    #[test]
    fn build_output_path_avoids_clobbering() {
        let dir = std::env::temp_dir().join(format!("bloom-vid-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("clip.mp4");
        fs::write(&input, b"x").unwrap();

        let o = opts("medium", "720p", "mp4");
        let first = build_output_path(&o, &input);
        assert_eq!(first.file_name().unwrap().to_str().unwrap(), "clip-720p-medium.mp4");

        // If it already exists, a numeric suffix is appended.
        fs::write(&first, b"x").unwrap();
        let second = build_output_path(&o, &input);
        assert_eq!(second.file_name().unwrap().to_str().unwrap(), "clip-720p-medium-2.mp4");

        fs::remove_dir_all(&dir).ok();
    }
}
