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
    /// Whether Bloom can install ffmpeg automatically on this machine.
    pub can_auto_install: bool,
}

#[derive(Debug, Serialize)]
pub struct FfmpegInstallResult {
    pub success: bool,
    pub message: String,
    pub status: FfmpegStatus,
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
    /// Playback speed multiplier (1.0 = normal, 2.0 = 2× faster).
    #[serde(default = "default_speed")]
    pub speed: f64,
    /// Optional custom output file name (without directory).
    pub output_name: Option<String>,
    /// Add the result to the Bloom library (write a .bloom.json sidecar).
    #[serde(default = "default_true")]
    pub add_to_library: bool,
}

fn default_true() -> bool {
    true
}

fn default_speed() -> f64 {
    1.0
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
    let speed = effective_speed(opts.speed);

    // Video filters
    let mut vf: Vec<String> = Vec::new();
    if format == "gif" {
        vf.push("fps=12".into());
        vf.push(format!("scale=-2:{}:flags=lanczos", height.unwrap_or(480)));
    } else if let Some(h) = height {
        vf.push(format!("scale=-2:{h}"));
    }
    if speed != 1.0 {
        vf.push(format!("setpts=PTS/{speed}"));
    }
    if !vf.is_empty() {
        a.push("-vf".into());
        a.push(vf.join(","));
    }

    // Audio tempo (skip for GIF).
    if has_audio && speed != 1.0 && format != "gif" {
        let af = build_atempo_chain(speed);
        if !af.is_empty() {
            a.push("-af".into());
            a.push(af);
        }
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
    let has_audio = info.has_audio;
    let total_secs = trim_duration(&options).unwrap_or(info.duration_secs)
        / effective_speed(options.speed);

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
// Tests — see src/__tests__/video_tests.rs
// ────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
#[path = "__tests__/video_tests.rs"]
mod tests;
