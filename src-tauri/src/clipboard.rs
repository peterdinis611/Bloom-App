//! Clipboard helpers for path / file copy.

use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
use crate::share;

/// Copy plain text to the system clipboard.
#[tauri::command]
pub fn copy_text(text: String) -> Result<(), String> {
    copy_text_impl(&text)
}

/// Copy a file reference to the clipboard (paste into Finder / Mail / Slack…).
#[tauri::command]
pub fn copy_file(path: String) -> Result<(), String> {
    let path_obj = Path::new(&path);
    if !path_obj.exists() {
        return Err("Súbor neexistuje.".into());
    }
    copy_file_impl(&path)
}

#[cfg(target_os = "macos")]
fn copy_text_impl(text: &str) -> Result<(), String> {
    let mut child = Command::new("pbcopy")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|e| format!("pbcopy zlyhal: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(text.as_bytes())
            .map_err(|e| format!("pbcopy zlyhal: {e}"))?;
    }
    let status = child.wait().map_err(|e| format!("pbcopy zlyhal: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("Nepodarilo sa skopírovať text.".into())
    }
}

#[cfg(target_os = "macos")]
fn copy_file_impl(path: &str) -> Result<(), String> {
    // AppleScript: put a file URL on the clipboard so Finder/Mail accept paste.
    let escaped = path.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(
        "set the clipboard to (POSIX file \"{escaped}\")"
    );
    let status = Command::new("osascript")
        .args(["-e", &script])
        .status()
        .map_err(|e| format!("osascript zlyhal: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        // Fallback: copy path as text
        copy_text_impl(path)
    }
}

#[cfg(target_os = "windows")]
fn copy_text_impl(text: &str) -> Result<(), String> {
    let escaped = text.replace('\'', "''");
    let script = format!("Set-Clipboard -Value '{}'", escaped);
    let status = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .status()
        .map_err(|e| format!("PowerShell zlyhal: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("Nepodarilo sa skopírovať text.".into())
    }
}

#[cfg(target_os = "windows")]
fn copy_file_impl(path: &str) -> Result<(), String> {
    let escaped = path.replace('\'', "''");
    let script = format!("Set-Clipboard -Path '{}'", escaped);
    let status = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .status()
        .map_err(|e| format!("PowerShell zlyhal: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("Nepodarilo sa skopírovať súbor.".into())
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn copy_text_impl(text: &str) -> Result<(), String> {
    if pipe_to_clipboard(text) {
        Ok(())
    } else {
        Err("Nepodarilo sa skopírovať text (wl-copy / xclip / xsel).".into())
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn copy_file_impl(path: &str) -> Result<(), String> {
    let uri = share::file_uri(path);
    if pipe_to_clipboard(&uri) {
        Ok(())
    } else {
        Err("Nepodarilo sa skopírovať súbor (wl-copy / xclip / xsel).".into())
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn pipe_to_clipboard(text: &str) -> bool {
    for (bin, args) in [
        ("wl-copy", &[] as &[&str]),
        ("xclip", &["-selection", "clipboard"][..]),
        ("xsel", &["--clipboard", "--input"][..]),
    ] {
        if let Ok(mut child) = Command::new(bin).args(args).stdin(Stdio::piped()).spawn() {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(text.as_bytes());
            }
            if let Ok(status) = child.wait() {
                if status.success() {
                    return true;
                }
            }
        }
    }
    false
}
