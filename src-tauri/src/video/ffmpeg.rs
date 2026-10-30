use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex, OnceLock,
    },
    time::Instant,
};

use super::types::{FfmpegInstallResult, FfmpegStatus};

pub(crate) type ToolCache = Mutex<Option<Option<PathBuf>>>;

pub(crate) fn ffmpeg_tool_cache() -> &'static ToolCache {
    static C: OnceLock<ToolCache> = OnceLock::new();
    C.get_or_init(|| Mutex::new(None))
}

pub(crate) fn ffprobe_tool_cache() -> &'static ToolCache {
    static C: OnceLock<ToolCache> = OnceLock::new();
    C.get_or_init(|| Mutex::new(None))
}

// ────────────────────────────────────────────────────────────────────────────
// Binary discovery
// ────────────────────────────────────────────────────────────────────────────

pub(crate) fn push_dir(dirs: &mut Vec<PathBuf>, path: impl AsRef<Path>) {
    let path = path.as_ref().to_path_buf();
    if !dirs.iter().any(|d| d == &path) {
        dirs.push(path);
    }
}

pub(crate) fn candidate_dirs() -> Vec<PathBuf> {
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

pub(crate) fn is_executable(path: &Path) -> bool {
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
pub(crate) fn find_via_shell(stem: &str) -> Option<PathBuf> {
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

pub(crate) fn find_binary(stem: &str) -> Option<PathBuf> {
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

pub(crate) fn find_ffmpeg() -> Option<PathBuf> {
    let mut slot = ffmpeg_tool_cache().lock().unwrap();
    if let Some(cached) = slot.as_ref() {
        return cached.clone();
    }
    let found = find_binary("ffmpeg").or_else(find_ffmpeg_via_package_manager);
    *slot = Some(found.clone());
    found
}

pub(crate) fn find_ffmpeg_path() -> Option<PathBuf> {
    find_ffmpeg()
}

/// After a fresh Homebrew install, binaries may only be discoverable via `brew --prefix`.
#[cfg(target_os = "macos")]
pub(crate) fn find_ffmpeg_via_package_manager() -> Option<PathBuf> {
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
pub(crate) fn find_ffmpeg_via_package_manager() -> Option<PathBuf> {
    None
}

/// Prefer ffprobe next to the resolved ffmpeg binary (same Cellar / install prefix).
pub(crate) fn find_ffprobe(ffmpeg: Option<&Path>) -> Option<PathBuf> {
    // When caller already resolved ffmpeg, prefer sibling without poisoning the cache
    // with a wrong absolute lookup on first call.
    if let Some(ffmpeg_path) = ffmpeg {
        if let Some(parent) = ffmpeg_path.parent() {
            for name in ["ffprobe", "ffprobe.exe"] {
                let cand = parent.join(name);
                if is_executable(&cand) {
                    let mut slot = ffprobe_tool_cache().lock().unwrap();
                    *slot = Some(Some(cand.clone()));
                    return Some(cand);
                }
            }
        }
    }

    let mut slot = ffprobe_tool_cache().lock().unwrap();
    if let Some(cached) = slot.as_ref() {
        return cached.clone();
    }
    let found = find_binary("ffprobe");
    *slot = Some(found.clone());
    found
}

pub(crate) fn read_version_with_timeout(ffmpeg: &Path, timeout_ms: u64) -> Option<String> {
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

pub(crate) fn install_hint() -> String {
    #[cfg(target_os = "macos")]
    return "Nainštaluj ffmpeg: brew install ffmpeg".to_string();
    #[cfg(target_os = "windows")]
    return "Nainštaluj ffmpeg: winget install Gyan.FFmpeg".to_string();
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    return "Nainštaluj ffmpeg cez správcu balíkov, napr. sudo apt install ffmpeg".to_string();
}

pub(crate) fn apply_path_env(cmd: &mut Command) {
    let prefix = shell_path_prefix();
    if !prefix.is_empty() {
        let path = std::env::var("PATH").unwrap_or_default();
        cmd.env("PATH", format!("{prefix}:{path}"));
    }
}

pub(crate) fn find_brew() -> Option<PathBuf> {
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
pub(crate) fn find_winget() -> Option<PathBuf> {
    find_binary("winget")
}

/// argv for an automatic ffmpeg install on this OS (program path + args).
pub(crate) fn install_ffmpeg_argv() -> Result<(PathBuf, Vec<String>), String> {
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
            "winget nie je dostupný. Nainštaluj ffmpeg ručne alebo aktualizuj Windows App Installer.".to_string()
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
        return Err("Nainštaluj ffmpeg ručne, napr. sudo apt install ffmpeg".into());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err("Automatická inštalácia ffmpeg nie je na tejto platforme podporovaná.".into())
    }
}

pub(crate) fn can_auto_install() -> bool {
    install_ffmpeg_argv().is_ok()
}

pub(crate) fn build_ffmpeg_status() -> FfmpegStatus {
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

pub(crate) fn run_shell_command(script: &str) -> Result<(), String> {
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
pub(crate) fn run_ffmpeg_install() -> Result<(), String> {
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
pub(crate) fn run_ffmpeg_install() -> Result<(), String> {
    let winget = find_winget().ok_or_else(|| {
        "winget nie je dostupný. Nainštaluj ffmpeg ručne alebo aktualizuj Windows App Installer.".to_string()
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
pub(crate) fn run_ffmpeg_install() -> Result<(), String> {
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
pub(crate) fn run_ffmpeg_install() -> Result<(), String> {
    Err("Automatická inštalácia ffmpeg nie je na tejto platforme podporovaná.".into())
}

pub(crate) fn install_ffmpeg_blocking() -> FfmpegInstallResult {
    let before = build_ffmpeg_status();
    if before.available {
        return FfmpegInstallResult {
            success: true,
            message: "ffmpeg je už nainštalovaný.".into(),
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
            message: "Inštalácia prebehla, ale ffmpeg sa nenašiel. Skús Skontrolovať alebo reštartuj Bloom.".into(),
            status,
        }
    }
}

