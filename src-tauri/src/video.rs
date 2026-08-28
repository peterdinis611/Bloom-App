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
        Arc, Mutex, OnceLock,
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
    /// Normalize audio loudness before export.
    #[serde(default)]
    pub normalize_audio: bool,
    /// Drop the audio track entirely.
    #[serde(default)]
    pub remove_audio: bool,
    /// H.265 / HEVC encode for smaller MP4 (when supported).
    #[serde(default)]
    pub use_hevc: bool,
}

fn default_true() -> bool {
    true
}

fn default_speed() -> f64 {
    1.0
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

// ────────────────────────────────────────────────────────────────────────────
// Binary discovery
// ────────────────────────────────────────────────────────────────────────────

fn push_dir(dirs: &mut Vec<PathBuf>, path: impl AsRef<Path>) {
    let path = path.as_ref().to_path_buf();
    if !dirs.iter().any(|d| d == &path) {
        dirs.push(path);
    }
}

fn candidate_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            push_dir(&mut dirs, dir);
        }
    }
    if let Ok(prefix) = std::env::var("HOMEBREW_PREFIX") {
        push_dir(&mut dirs, PathBuf::from(&prefix).join("bin"));
        push_dir(&mut dirs, PathBuf::from(&prefix).join("opt/ffmpeg/bin"));
    }
    #[cfg(target_os = "macos")]
    for extra in [
        "/opt/homebrew/bin",
        "/opt/homebrew/opt/ffmpeg/bin",
        "/usr/local/bin",
        "/usr/local/opt/ffmpeg/bin",
        "/usr/bin",
        "/opt/local/bin",
    ] {
        push_dir(&mut dirs, extra);
    }
    #[cfg(target_os = "linux")]
    for extra in ["/usr/bin", "/usr/local/bin", "/snap/bin", "/var/lib/flatpak/exports/bin"] {
        push_dir(&mut dirs, extra);
    }
    #[cfg(target_os = "windows")]
    for extra in ["C:\\ffmpeg\\bin", "C:\\Program Files\\ffmpeg\\bin"] {
        push_dir(&mut dirs, extra);
    }
    if let Ok(home) = std::env::var("HOME") {
        for sub in ["bin", ".local/bin"] {
            push_dir(&mut dirs, PathBuf::from(&home).join(sub));
        }
    }
    dirs
}

fn is_executable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        path.metadata()
            .map(|m| m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        true
    }
}

/// Extra PATH prefixes for GUI apps (Finder/Dock) that inherit a minimal PATH.
pub(crate) fn shell_path_prefix() -> String {
    let mut parts: Vec<String> = Vec::new();
    #[cfg(target_os = "macos")]
    {
        parts.push("/opt/homebrew/bin".into());
        parts.push("/usr/local/bin".into());
    }
    #[cfg(target_os = "linux")]
    {
        parts.push("/usr/local/bin".into());
    }
    if let Ok(prefix) = std::env::var("HOMEBREW_PREFIX") {
        parts.push(format!("{prefix}/bin"));
    }
    if let Ok(home) = std::env::var("HOME") {
        parts.push(format!("{home}/bin"));
        parts.push(format!("{home}/.local/bin"));
    }
    parts.join(":")
}

/// Resolve a binary via a non-interactive shell with common prefixes prepended.
/// Avoids `sh -l` (login shell) which can hang or skip zsh-only Homebrew PATH setup.
fn find_via_shell(stem: &str) -> Option<PathBuf> {
    let prefix = shell_path_prefix();
    let script = if prefix.is_empty() {
        format!("command -v {stem} 2>/dev/null")
    } else {
        format!("PATH=\"{prefix}:$PATH\" command -v {stem} 2>/dev/null")
    };
    let out = Command::new("/bin/sh")
        .args(["-c", &script])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if path.is_empty() {
        return None;
    }
    let p = PathBuf::from(&path);
    if is_executable(&p) { Some(p) } else { None }
}

fn find_binary(stem: &str) -> Option<PathBuf> {
    let names: &[String] = &[stem.to_string(), format!("{stem}.exe")];
    // Shell lookup first – GUI apps often miss PATH entries that a login terminal has.
    if let Some(path) = find_via_shell(stem) {
        return Some(path);
    }
    for dir in candidate_dirs() {
        for name in names {
            let cand = dir.join(name);
            if is_executable(&cand) {
                return Some(cand);
            }
        }
    }
    None
}

fn find_ffmpeg() -> Option<PathBuf> {
    find_binary("ffmpeg").or_else(find_ffmpeg_via_package_manager)
}

pub(crate) fn find_ffmpeg_path() -> Option<PathBuf> {
    find_ffmpeg()
}

/// After a fresh Homebrew install, binaries may only be discoverable via `brew --prefix`.
#[cfg(target_os = "macos")]
fn find_ffmpeg_via_package_manager() -> Option<PathBuf> {
    let brew = find_brew()?;
    let path_prefix = shell_path_prefix();
    let script = format!(
        r#"export PATH="{path_prefix}:$PATH"; "{}" --prefix ffmpeg 2>/dev/null"#,
        brew.display()
    );
    let out = Command::new("/bin/bash")
        .args(["-c", &script])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let prefix = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if prefix.is_empty() {
        return None;
    }
    let ffmpeg = PathBuf::from(prefix).join("bin/ffmpeg");
    if is_executable(&ffmpeg) { Some(ffmpeg) } else { None }
}

#[cfg(not(target_os = "macos"))]
fn find_ffmpeg_via_package_manager() -> Option<PathBuf> {
    None
}

/// Prefer ffprobe next to the resolved ffmpeg binary (same Cellar / install prefix).
pub(crate) fn find_ffprobe(ffmpeg: Option<&Path>) -> Option<PathBuf> {
    if let Some(ffmpeg_path) = ffmpeg {
        if let Some(parent) = ffmpeg_path.parent() {
            for name in ["ffprobe", "ffprobe.exe"] {
                let cand = parent.join(name);
                if is_executable(&cand) {
                    return Some(cand);
                }
            }
        }
    }
    find_binary("ffprobe")
}

fn read_version_with_timeout(ffmpeg: &Path, timeout_ms: u64) -> Option<String> {
    use std::time::Duration;

    let mut child = Command::new(ffmpeg)
        .arg("-version")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let start = Instant::now();
    loop {
        if let Ok(Some(_)) = child.try_wait() {
            let out = child.wait_with_output().ok()?;
            return String::from_utf8(out.stdout)
                .ok()
                .and_then(|s| s.lines().next().map(|l| l.to_string()));
        }
        if start.elapsed() > Duration::from_millis(timeout_ms) {
            let _ = child.kill();
            return None;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

fn install_hint() -> String {
    #[cfg(target_os = "macos")]
    return "Install ffmpeg with Homebrew:  brew install ffmpeg".to_string();
    #[cfg(target_os = "windows")]
    return "Install ffmpeg with winget:  winget install Gyan.FFmpeg".to_string();
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    return "Install ffmpeg with your package manager, e.g.  sudo apt install ffmpeg".to_string();
}

#[cfg(target_os = "linux")]
fn apply_path_env(cmd: &mut Command) {
    let prefix = shell_path_prefix();
    if !prefix.is_empty() {
        let path = std::env::var("PATH").unwrap_or_default();
        cmd.env("PATH", format!("{prefix}:{path}"));
    }
}

fn find_brew() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    for path in ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"] {
        let p = PathBuf::from(path);
        if is_executable(&p) {
            return Some(p);
        }
    }
    find_binary("brew")
}

#[cfg(target_os = "windows")]
fn find_winget() -> Option<PathBuf> {
    find_binary("winget")
}

/// argv for an automatic ffmpeg install on this OS (program path + args).
fn install_ffmpeg_argv() -> Result<(PathBuf, Vec<String>), String> {
    #[cfg(target_os = "macos")]
    {
        let brew = find_brew().ok_or_else(|| {
            "Homebrew is not installed. Install it from https://brew.sh then try again.".to_string()
        })?;
        return Ok((brew, vec!["install".into(), "ffmpeg".into()]));
    }

    #[cfg(target_os = "windows")]
    {
        let winget = find_winget().ok_or_else(|| {
            "winget is not available. Install ffmpeg manually or update Windows App Installer.".to_string()
        })?;
        return Ok((
            winget,
            vec![
                "install".into(),
                "--id".into(),
                "Gyan.FFmpeg".into(),
                "-e".into(),
                "--accept-package-agreements".into(),
                "--accept-source-agreements".into(),
            ],
        ));
    }

    #[cfg(target_os = "linux")]
    {
        if find_binary("pkexec").is_some() {
            if find_binary("apt-get").is_some() {
                let apt = find_binary("apt-get").unwrap();
                return Ok((
                    find_binary("pkexec").unwrap(),
                    vec![
                        apt.to_string_lossy().into_owned(),
                        "install".into(),
                        "-y".into(),
                        "ffmpeg".into(),
                    ],
                ));
            }
            if find_binary("dnf").is_some() {
                let dnf = find_binary("dnf").unwrap();
                return Ok((
                    find_binary("pkexec").unwrap(),
                    vec![dnf.to_string_lossy().into_owned(), "install".into(), "-y".into(), "ffmpeg".into()],
                ));
            }
            if find_binary("pacman").is_some() {
                let pacman = find_binary("pacman").unwrap();
                return Ok((
                    find_binary("pkexec").unwrap(),
                    vec![
                        pacman.to_string_lossy().into_owned(),
                        "-S".into(),
                        "--noconfirm".into(),
                        "ffmpeg".into(),
                    ],
                ));
            }
        }
        return Err("Install ffmpeg manually, e.g.  sudo apt install ffmpeg".into());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err("Automatic ffmpeg install is not supported on this platform.".into())
    }
}

fn can_auto_install() -> bool {
    install_ffmpeg_argv().is_ok()
}

fn build_ffmpeg_status() -> FfmpegStatus {
    let ffmpeg = find_ffmpeg();
    let ffprobe = find_ffprobe(ffmpeg.as_deref());
    let version = ffmpeg
        .as_deref()
        .and_then(|p| read_version_with_timeout(p, 2_000));

    FfmpegStatus {
        available: ffmpeg.is_some() && ffprobe.is_some(),
        ffmpeg_path: ffmpeg.map(|p| p.to_string_lossy().into_owned()),
        ffprobe_path: ffprobe.map(|p| p.to_string_lossy().into_owned()),
        version,
        install_hint: install_hint(),
        can_auto_install: can_auto_install(),
    }
}

pub(crate) fn tail_lines(text: &str, max_lines: usize) -> String {
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    let start = lines.len().saturating_sub(max_lines);
    lines[start..].join("\n")
}

fn run_shell_command(script: &str) -> Result<(), String> {
    let mut cmd = Command::new("/bin/bash");
    cmd.arg("-c")
        .arg(script)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Ok(home) = std::env::var("HOME") {
        cmd.current_dir(home);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run install: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
    );
    let detail = tail_lines(&combined, 14);
    Err(if detail.is_empty() {
        format!("Install failed (exit {:?})", output.status.code())
    } else {
        detail
    })
}

#[cfg(target_os = "macos")]
fn run_ffmpeg_install() -> Result<(), String> {
    let brew = find_brew().ok_or_else(|| {
        "Homebrew is not installed. Install it from https://brew.sh then try again.".to_string()
    })?;
    let brew_path = brew.to_string_lossy();
    let path_prefix = shell_path_prefix();
    let script = format!(
        r#"export PATH="{path_prefix}:$PATH"
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
export CI=1
export NONINTERACTIVE=1
"{brew_path}" install ffmpeg"#
    );
    run_shell_command(&script)
}

#[cfg(target_os = "windows")]
fn run_ffmpeg_install() -> Result<(), String> {
    let winget = find_winget().ok_or_else(|| {
        "winget is not available. Install ffmpeg manually or update Windows App Installer.".to_string()
    })?;
    let mut cmd = Command::new(&winget);
    cmd.args([
        "install",
        "--id",
        "Gyan.FFmpeg",
        "-e",
        "--accept-package-agreements",
        "--accept-source-agreements",
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run winget: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
    );
    let detail = tail_lines(&combined, 14);
    Err(if detail.is_empty() {
        "winget install failed".into()
    } else {
        detail
    })
}

#[cfg(target_os = "linux")]
fn run_ffmpeg_install() -> Result<(), String> {
    let (program, args) = install_ffmpeg_argv()?;
    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_path_env(&mut cmd);
    if let Ok(home) = std::env::var("HOME") {
        cmd.current_dir(home);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run {}: {e}", program.display()))?;

    if output.status.success() {
        return Ok(());
    }

    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
    );
    let detail = tail_lines(&combined, 14);
    Err(if detail.is_empty() {
        format!("{} failed (exit {:?})", program.display(), output.status.code())
    } else {
        detail
    })
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn run_ffmpeg_install() -> Result<(), String> {
    Err("Automatic ffmpeg install is not supported on this platform.".into())
}

fn install_ffmpeg_blocking() -> FfmpegInstallResult {
    let before = build_ffmpeg_status();
    if before.available {
        return FfmpegInstallResult {
            success: true,
            message: "ffmpeg is already installed.".into(),
            status: before,
        };
    }

    if let Err(message) = install_ffmpeg_argv() {
        return FfmpegInstallResult {
            success: false,
            message,
            status: before,
        };
    }

    if let Err(message) = run_ffmpeg_install() {
        return FfmpegInstallResult {
            success: false,
            message,
            status: build_ffmpeg_status(),
        };
    }

    let status = build_ffmpeg_status();
    if status.available {
        FfmpegInstallResult {
            success: true,
            message: status
                .version
                .clone()
                .unwrap_or_else(|| "ffmpeg installed successfully.".into()),
            status,
        }
    } else {
        FfmpegInstallResult {
            success: false,
            message: "Install finished but ffmpeg was not detected. Try Recheck or restart Bloom.".into(),
            status,
        }
    }
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

pub(crate) fn probe(ffprobe: &Path, path: &str) -> Result<VideoInfo, String> {
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
    /// h264_videotoolbox -q:v (lower = better quality).
    vt_quality: &'static str,
}

fn preset_values(preset: &str) -> PresetValues {
    match preset {
        "small" => PresetValues {
            x264_preset: "veryfast",
            x264_crf: "30",
            vp9_crf: "37",
            audio_bitrate: "96k",
            vt_quality: "72",
        },
        "high" => PresetValues {
            x264_preset: "medium",
            x264_crf: "20",
            vp9_crf: "27",
            audio_bitrate: "192k",
            vt_quality: "45",
        },
        // "medium" and any unknown value
        _ => PresetValues {
            x264_preset: "faster",
            x264_crf: "25",
            vp9_crf: "32",
            audio_bitrate: "128k",
            vt_quality: "58",
        },
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

fn effective_speed(speed: f64) -> f64 {
    if speed.is_finite() && speed > 0.05 && (speed - 1.0).abs() > 0.001 {
        speed
    } else {
        1.0
    }
}

/// Build an atempo chain for ffmpeg (each filter accepts 0.5–2.0).
fn build_atempo_chain(speed: f64) -> String {
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

fn scale_filter(height: u32, preset: &str) -> String {
    let flags = if preset == "high" {
        "lanczos"
    } else {
        "fast_bilinear"
    };
    format!("scale=-2:{height}:flags={flags}")
}

static VT_ENCODER: OnceLock<bool> = OnceLock::new();
static VT_HEVC: OnceLock<bool> = OnceLock::new();
static NVENC_ENCODER: OnceLock<bool> = OnceLock::new();

/// Whether ffmpeg exposes Apple VideoToolbox H.264 encoder.
pub(crate) fn videotoolbox_available(ffmpeg: &Path) -> bool {
    *VT_ENCODER.get_or_init(|| encoder_available(ffmpeg, "h264_videotoolbox"))
}

fn hevc_videotoolbox_available(ffmpeg: &Path) -> bool {
    *VT_HEVC.get_or_init(|| encoder_available(ffmpeg, "hevc_videotoolbox"))
}

fn nvenc_available(ffmpeg: &Path) -> bool {
    *NVENC_ENCODER.get_or_init(|| encoder_available(ffmpeg, "h264_nvenc"))
}

fn encoder_available(ffmpeg: &Path, name: &str) -> bool {
    Command::new(ffmpeg)
        .args(["-hide_banner", "-encoders"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains(name))
        .unwrap_or(false)
}

fn has_subtitles(opts: &OptimizeOptions) -> bool {
    !opts.subtitle_cards.is_empty()
        || opts
            .srt_path
            .as_ref()
            .is_some_and(|p| !p.trim().is_empty())
}

fn is_h264_codec(codec: &str) -> bool {
    matches!(codec, "h264" | "avc1" | "avc" | "h264_videotoolbox")
}

/// Trim-only export without re-encode when filters/codecs unchanged.
pub(crate) fn can_stream_copy(opts: &OptimizeOptions, info: &VideoInfo) -> bool {
    opts.format == "mp4"
        && opts.resolution == "original"
        && effective_speed(opts.speed) == 1.0
        && !opts.use_hevc
        && !opts.denoise
        && !opts.normalize_audio
        && !opts.remove_audio
        && !has_subtitles(opts)
        && is_h264_codec(&info.codec)
}

fn build_stream_copy_args(opts: &OptimizeOptions, input: &str, output: &str) -> Vec<String> {
    let mut a: Vec<String> = vec!["-y".into(), "-hide_banner".into(), "-loglevel".into(), "error".into()];
    if let Some(start) = opts.trim_start {
        if start > 0.0 {
            a.push("-ss".into());
            a.push(format!("{start:.3}"));
        }
    }
    a.push("-i".into());
    a.push(input.to_string());
    if let Some(dur) = trim_duration(opts) {
        a.push("-t".into());
        a.push(format!("{dur:.3}"));
    }
    a.extend([
        "-c".into(),
        "copy".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        output.to_string(),
    ]);
    a
}

fn denoise_filter(preset: &str) -> &'static str {
    if preset == "high" {
        "hqdn3d=2:1:3:2"
    } else {
        "hqdn3d=3:2:4:3"
    }
}

fn append_video_filters(vf: &mut Vec<String>, opts: &OptimizeOptions, height: Option<u32>, format: &str) {
    if format == "gif" {
        vf.push("fps=12".into());
        vf.push(scale_filter(height.unwrap_or(480), &opts.preset));
    } else if let Some(h) = height {
        vf.push(scale_filter(h, &opts.preset));
    }
    let speed = effective_speed(opts.speed);
    if speed != 1.0 {
        vf.push(format!("setpts=PTS/{speed}"));
    }
    if opts.denoise && format != "gif" {
        vf.push(denoise_filter(&opts.preset).into());
    }
    vf.extend(subtitle_drawtext_filters(opts));
}

fn append_audio_filters(af: &mut Vec<String>, opts: &OptimizeOptions, speed: f64) {
    if opts.normalize_audio {
        af.push("dynaudnorm=f=150:g=12".into());
    }
    if speed != 1.0 {
        let tempo = build_atempo_chain(speed);
        if !tempo.is_empty() {
            af.push(tempo);
        }
    }
}

fn append_mp4_video_codec(a: &mut Vec<String>, opts: &OptimizeOptions, pv: &PresetValues, hw_h264: bool, hw_hevc: bool, nvenc: bool) {
    if opts.use_hevc {
        if hw_hevc {
            a.extend([
                "-c:v", "hevc_videotoolbox",
                "-q:v", pv.vt_quality,
                "-tag:v", "hvc1",
                "-allow_sw", "1",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
            ]
            .map(String::from));
            return;
        }
        a.extend([
            "-c:v", "libx265",
            "-preset", pv.x264_preset,
            "-crf", pv.x264_crf,
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-tag:v", "hvc1",
        ]
        .map(String::from));
        a.push("-threads".into());
        a.push("0".into());
        return;
    }
    if hw_h264 {
        a.extend([
            "-c:v", "h264_videotoolbox",
            "-q:v", pv.vt_quality,
            "-allow_sw", "1",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
        ]
        .map(String::from));
        return;
    }
    if nvenc {
        a.extend([
            "-c:v", "h264_nvenc",
            "-preset", "p4",
            "-rc", "vbr",
            "-cq", pv.x264_crf,
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
        ]
        .map(String::from));
        return;
    }
    a.extend([
        "-c:v", "libx264",
        "-preset", pv.x264_preset,
        "-crf", pv.x264_crf,
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-tune", "fastdecode",
    ]
    .map(String::from));
    a.push("-threads".into());
    a.push("0".into());
}

pub fn analyze_video_info(info: &VideoInfo) -> VideoAnalyze {
    let duration = info.duration_secs.max(0.01);
    let bitrate_mbps = info.bitrate_bps as f64 / 1_000_000.0;
    let bytes_per_sec = info.size_bytes as f64 / duration;
    let has_room_to_compress = bitrate_mbps > 4.5 || bytes_per_sec > 900_000.0;

    let suggested_preset = if bitrate_mbps > 9.0 || bytes_per_sec > 1_800_000.0 {
        "small"
    } else if bitrate_mbps > 4.5 || bytes_per_sec > 900_000.0 {
        "medium"
    } else {
        "high"
    };

    let suggested_resolution = if info.height > 1440 {
        "1080p"
    } else if info.height > 900 {
        "720p"
    } else {
        "original"
    };

    let mut notes: Vec<String> = Vec::new();
    if has_room_to_compress {
        notes.push("Nahrávka má vysoký bitrate — kompresia výrazne zmenší súbor.".into());
    }
    if info.height > 1080 {
        notes.push("Rozlíšenie nad 1080p — zvážte downscale na 1080p alebo 720p.".into());
    }
    if info.fps > 45.0 {
        notes.push("Vysoká snímková frekvencia — export môže trvať dlhšie.".into());
    }
    if notes.is_empty() {
        notes.push("Súbor je už relatívne kompaktný — preset high alebo original rozlíšenie.".into());
    }

    VideoAnalyze {
        can_stream_copy_trim: true,
        suggested_preset: suggested_preset.into(),
        suggested_resolution: suggested_resolution.into(),
        bitrate_mbps,
        bytes_per_sec,
        has_room_to_compress,
        notes,
        info: info.clone(),
    }
}

fn escape_drawtext(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace(':', "\\:")
        .replace('\'', "\\'")
        .replace('\n', " ")
}

fn parse_srt_timestamp(raw: &str) -> Option<f64> {
    let raw = raw.trim().replace(',', ".");
    let parts: Vec<&str> = raw.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: f64 = parts[0].parse().ok()?;
    let m: f64 = parts[1].parse().ok()?;
    let s: f64 = parts[2].parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
}

fn parse_srt(path: &str) -> Result<Vec<SubtitleCard>, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| format!("Cannot read SRT: {e}"))?;
    let mut cards = Vec::new();
    let mut lines = raw.lines().peekable();
    while lines.peek().is_some() {
        while matches!(lines.peek(), Some(l) if l.trim().is_empty()) {
            lines.next();
        }
        if lines.peek().is_none() {
            break;
        }
        if lines.next().is_none() {
            break;
        }
        let timing = lines.next().ok_or("SRT missing timing line")?;
        let mut parts = timing.split("-->");
        let start = parse_srt_timestamp(parts.next().unwrap_or("")).ok_or("SRT bad start time")?;
        let end = parse_srt_timestamp(parts.next().unwrap_or("")).ok_or("SRT bad end time")?;
        let mut text = String::new();
        while let Some(line) = lines.peek() {
            if line.trim().is_empty() {
                break;
            }
            if !text.is_empty() {
                text.push(' ');
            }
            text.push_str(line.trim());
            lines.next();
        }
        if !text.is_empty() && end > start {
            cards.push(SubtitleCard {
                text,
                start_secs: start,
                end_secs: end,
            });
        }
    }
    Ok(cards)
}

fn collect_subtitle_cards(opts: &OptimizeOptions) -> Vec<SubtitleCard> {
    let mut cards = opts.subtitle_cards.clone();
    if let Some(path) = opts.srt_path.as_ref().filter(|p| !p.trim().is_empty()) {
        if let Ok(mut parsed) = parse_srt(path) {
            cards.append(&mut parsed);
        }
    }
    cards
}

fn subtitle_drawtext_filters(opts: &OptimizeOptions) -> Vec<String> {
    let trim_start = opts.trim_start.unwrap_or(0.0);
    collect_subtitle_cards(opts)
        .into_iter()
        .filter_map(|card| {
            if card.text.trim().is_empty() {
                return None;
            }
            let start = (card.start_secs - trim_start).max(0.0);
            let end = (card.end_secs - trim_start).max(start + 0.05);
            let text = escape_drawtext(card.text.trim());
            Some(format!(
                "drawtext=text='{text}':fontsize=28:fontcolor=white:borderw=2:bordercolor=black@0.55:x=(w-text_w)/2:y=h*0.82:enable='between(t\\,{start:.3}\\,{end:.3})'"
            ))
        })
        .collect()
}

fn hwaccel_input_args() -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        vec!["-hwaccel".into(), "videotoolbox".into()]
    }
    #[cfg(not(target_os = "macos"))]
    {
        vec![]
    }
}

fn build_args(
    opts: &OptimizeOptions,
    input: &str,
    output: &str,
    info: &VideoInfo,
    hw_h264: bool,
    hw_hevc: bool,
    nvenc: bool,
) -> Vec<String> {
    if can_stream_copy(opts, info) {
        return build_stream_copy_args(opts, input, output);
    }

    let mut a: Vec<String> = vec!["-y".into(), "-hide_banner".into(), "-loglevel".into(), "error".into()];

    a.extend(hwaccel_input_args());

    if let Some(start) = opts.trim_start {
        if start > 0.0 {
            a.push("-ss".into());
            a.push(format!("{start:.3}"));
        }
    }
    a.push("-i".into());
    a.push(input.to_string());

    if let Some(dur) = trim_duration(opts) {
        a.push("-t".into());
        a.push(format!("{dur:.3}"));
    }

    let height = resolution_height(&opts.resolution);
    let pv = preset_values(&opts.preset);
    let format = opts.format.as_str();
    let speed = effective_speed(opts.speed);
    let use_audio = info.has_audio && !opts.remove_audio;

    let mut vf: Vec<String> = Vec::new();
    append_video_filters(&mut vf, opts, height, format);
    if !vf.is_empty() {
        a.push("-vf".into());
        a.push(vf.join(","));
    }

    if use_audio && format != "gif" {
        let mut af: Vec<String> = Vec::new();
        append_audio_filters(&mut af, opts, speed);
        if !af.is_empty() {
            a.push("-af".into());
            a.push(af.join(","));
        }
    }

    match format {
        "webm" => {
            a.extend(["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", pv.vp9_crf, "-row-mt", "1"].map(String::from));
            if use_audio {
                a.extend(["-c:a", "libopus", "-b:a", pv.audio_bitrate].map(String::from));
            } else {
                a.push("-an".into());
            }
        }
        "gif" => {
            a.extend(["-loop", "0", "-an"].map(String::from));
        }
        _ => {
            append_mp4_video_codec(&mut a, opts, &pv, hw_h264, hw_hevc, nvenc);
            if use_audio {
                a.extend(["-c:a", "aac", "-b:a", pv.audio_bitrate].map(String::from));
            } else {
                a.push("-an".into());
            }
        }
    }

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
// Fast MP4 remux (stream copy + moov at start for instant playback)
// ────────────────────────────────────────────────────────────────────────────

/// Rewrites MP4 in place so the moov atom is at the front — no re-encode.
pub(crate) fn remux_mp4_faststart(ffmpeg: &Path, path: &Path) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext != "mp4" {
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
        return Err("faststart remux failed".into());
    }

    std::fs::rename(&tmp, path).map_err(|e| format!("Could not replace recording: {e}"))
}

// ────────────────────────────────────────────────────────────────────────────
// Thumbnail
// ────────────────────────────────────────────────────────────────────────────

fn thumbnail_path_for(video: &Path) -> PathBuf {
    video.with_extension("thumb.jpg")
}

pub(crate) fn make_thumbnail(ffmpeg: &Path, video: &Path, at_secs: f64) -> Result<PathBuf, String> {
    make_thumbnail_scaled(ffmpeg, video, at_secs, &thumbnail_path_for(video), 360)
}

fn make_thumbnail_scaled(
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
        return Err("Could not generate thumbnail".into());
    }
    Ok(out.to_path_buf())
}

fn filmstrip_path_for(video: &Path, index: u32) -> PathBuf {
    let stem = video
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("video");
    video.with_file_name(format!("{stem}.strip-{index:02}.jpg"))
}

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
            _ => size,
        };

        ExportEstimate {
            duration_secs: out_duration,
            size_bytes: size.max(1024.0) as u64,
            resolution_label: opts.resolution.clone(),
            format_label: if opts.use_hevc && opts.format == "mp4" {
                "HEVC MP4".into()
            } else {
                opts.format.to_uppercase()
            },
            stream_copy: false,
        }
    }
}

fn update_sidecar_in_place(
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

fn replace_original_file(
    input: &Path,
    temp_output: &Path,
    opts: &OptimizeOptions,
    duration_secs: f64,
    size_bytes: u64,
) -> Result<PathBuf, String> {
    if !temp_output.exists() {
        return Err("Temporary export file missing".into());
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
        starred: false,
        tags: vec![],
        folder: String::new(),
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

    let final_path = if opts.replace_original {
        match replace_original_file(&input, &output, &opts, out_duration, size) {
            Ok(p) => {
                let _ = make_thumbnail(&ffmpeg_thumb, &p, (out_duration * 0.1).max(0.0));
                p
            }
            Err(e) => {
                let _ = std::fs::remove_file(&output);
                emit(OptimizeProgress {
                    job_id: job_id.clone(),
                    percent: 0.0,
                    done: true,
                    cancelled: false,
                    output_path: None,
                    output_size_bytes: None,
                    error: Some(e),
                });
                return;
            }
        }
    } else {
        if add_to_library && opts.format != "gif" {
            write_output_sidecar(&input, &output, &opts, out_duration, size);
            let _ = make_thumbnail(&ffmpeg_thumb, &output, (out_duration * 0.1).max(0.0));
        }
        output
    };

    let final_size = std::fs::metadata(&final_path).map(|m| m.len()).unwrap_or(size);

    if opts.format == "mp4" {
        let _ = remux_mp4_faststart(&ffmpeg_thumb, &final_path);
    }

    emit(OptimizeProgress {
        job_id: job_id.clone(),
        percent: 100.0,
        done: true,
        cancelled: false,
        output_path: Some(final_path.to_string_lossy().into_owned()),
        output_size_bytes: Some(final_size),
        error: None,
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Commands
// ────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn check_ffmpeg() -> FfmpegStatus {
    build_ffmpeg_status()
}

#[tauri::command]
pub async fn install_ffmpeg() -> Result<FfmpegInstallResult, String> {
    tauri::async_runtime::spawn_blocking(install_ffmpeg_blocking)
        .await
        .map_err(|e| format!("Install task failed: {e}"))
}

#[tauri::command]
pub fn get_video_info(path: String) -> Result<VideoInfo, String> {
    let ffmpeg = find_ffmpeg();
    let ffprobe = find_ffprobe(ffmpeg.as_deref()).ok_or_else(|| "ffprobe not found".to_string())?;
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
    let ffprobe = find_ffprobe(Some(&ffmpeg)).ok_or_else(|| "ffprobe not found. Install ffmpeg and try again.".to_string())?;

    let input = PathBuf::from(&options.input_path);
    if !input.exists() {
        return Err("Input video does not exist".into());
    }

    // Determine total duration for progress (trimmed window or full clip).
    let info = probe(&ffprobe, &options.input_path)?;
    let total_secs = trim_duration(&options).unwrap_or(info.duration_secs)
        / effective_speed(options.speed);

    if options.replace_original && options.format != "mp4" {
        return Err("Nahradenie originálu je podporované len pre MP4.".into());
    }
    if options.replace_original && options.use_hevc {
        return Err("Nahradenie originálu nepodporuje HEVC.".into());
    }

    let output = if options.replace_original {
        input.with_extension("bloom-replace.tmp.mp4")
    } else {
        build_output_path(&options, &input)
    };
    let hw_h264 = videotoolbox_available(&ffmpeg);
    let hw_hevc = hevc_videotoolbox_available(&ffmpeg);
    let nvenc = nvenc_available(&ffmpeg) && !hw_h264;
    let args = build_args(
        &options,
        &options.input_path,
        &output.to_string_lossy(),
        &info,
        hw_h264,
        hw_hevc,
        nvenc,
    );

    let job_id = Uuid::new_v4().to_string();
    let cancel = Arc::new(AtomicBool::new(false));
    state.0.lock().unwrap().insert(job_id.clone(), cancel.clone());

    let app_clone = app.clone();
    let add_to_library = options.add_to_library && !options.replace_original;
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
pub fn analyze_video(path: String) -> Result<VideoAnalyze, String> {
    let ffprobe = find_ffprobe(find_ffmpeg().as_deref())
        .ok_or_else(|| "ffprobe not found".to_string())?;
    let info = probe(&ffprobe, &path)?;
    Ok(analyze_video_info(&info))
}

#[tauri::command]
pub fn get_filmstrip(path: String, frame_count: Option<u32>) -> Result<Vec<String>, String> {
    let ffmpeg = find_ffmpeg().ok_or_else(|| "ffmpeg not found".to_string())?;
    let ffprobe = find_ffprobe(Some(&ffmpeg)).ok_or_else(|| "ffprobe not found".to_string())?;
    let info = probe(&ffprobe, &path)?;
    let video = PathBuf::from(&path);
    if !video.exists() {
        return Err("Video file does not exist".into());
    }

    let count = frame_count.unwrap_or(12).clamp(6, 20);
    let duration = info.duration_secs.max(0.1);
    let mut paths = Vec::with_capacity(count as usize);

    for i in 0..count {
        let t = if count <= 1 {
            0.0
        } else {
            duration * i as f64 / (count - 1) as f64
        };
        let thumb = filmstrip_path_for(&video, i);
        if !thumb.exists() {
            make_thumbnail_scaled(&ffmpeg, &video, t, &thumb, 72)?;
        }
        paths.push(thumb.to_string_lossy().into_owned());
    }

    Ok(paths)
}

#[tauri::command]
pub fn estimate_export(options: OptimizeOptions) -> Result<ExportEstimate, String> {
    let ffprobe = find_ffprobe(find_ffmpeg().as_deref())
        .ok_or_else(|| "ffprobe not found".to_string())?;
    let info = probe(&ffprobe, &options.input_path)?;
    Ok(compute_export_estimate(&info, &options))
}

#[tauri::command]
pub fn cancel_optimize(state: tauri::State<VideoJobs>, job_id: String) -> Result<(), String> {
    if let Some(flag) = state.0.lock().unwrap().get(&job_id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

// ────────────────────────────────────────────────────────────────────────────
// Tests — see src/__tests__/video_tests.rs
// ────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
#[path = "__tests__/video_tests.rs"]
mod tests;
