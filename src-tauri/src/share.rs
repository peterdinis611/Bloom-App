//! Platform-specific sharing for library recordings.

use std::path::Path;
use std::process::{Command, Stdio};
use std::io::Write;

use tauri::AppHandle;

use crate::types::{ShareMode, ShareResult};

pub fn share_file(app: &AppHandle, path: &str) -> Result<ShareResult, String> {
    let path_obj = Path::new(path);
    if !path_obj.exists() {
        return Err("Súbor neexistuje.".into());
    }

    #[cfg(target_os = "macos")]
    {
        share_macos(app, path)?;
        Ok(ShareResult {
            path: path.to_string(),
            mode: ShareMode::MacosSheet,
        })
    }

    #[cfg(target_os = "windows")]
    {
        share_windows(path)?;
        Ok(ShareResult {
            path: path.to_string(),
            mode: ShareMode::WindowsClipboard,
        })
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let mode = share_linux(path)?;
        Ok(ShareResult {
            path: path.to_string(),
            mode,
        })
    }
}

#[cfg(target_os = "macos")]
fn share_macos(app: &AppHandle, path: &str) -> Result<(), String> {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::AnyThread;
    use objc2_app_kit::{NSSharingServicePicker, NSView};
    use objc2_core_foundation::{CGPoint, CGRect, CGSize};
    use objc2_foundation::{NSArray, NSRectEdge, NSURL, NSString};
    use tauri::Manager;

    let path = path.to_string();
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Hlavné okno sa nenašlo.".to_string())?;

    window
        .with_webview(move |webview| {
            unsafe {
                let ns_view: &NSView = &*(webview.inner() as *const NSView);
                let url = NSURL::fileURLWithPath(&NSString::from_str(&path));
                let items: Vec<Retained<AnyObject>> = vec![Retained::cast_unchecked(url)];
                let items_array = NSArray::from_retained_slice(&items);
                let picker = NSSharingServicePicker::initWithItems(
                    NSSharingServicePicker::alloc(),
                    &items_array,
                );
                let rect = CGRect::new(CGPoint::new(0.0, 0.0), CGSize::new(1.0, 1.0));
                picker.showRelativeToRect_ofView_preferredEdge(rect, ns_view, NSRectEdge::MinY);
            }
        })
        .map_err(|e| format!("Nepodarilo sa otvoriť zdieľanie: {e}"))?;

    Ok(())
}

#[cfg(target_os = "windows")]
fn share_windows(path: &str) -> Result<(), String> {
    // Windows: copy the file itself to the clipboard (CF_HDROP) — paste into Teams, Mail, Explorer…
    let escaped = path.replace('\'', "''");
    let script = format!("Set-Clipboard -Path '{}'", escaped);
    let status = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .status()
        .map_err(|e| format!("PowerShell zlyhal: {e}"))?;

    if status.success() {
        return Ok(());
    }

    // Fallback: copy path text for older setups
    let script = format!("Set-Clipboard -Value '{}'", escaped);
    let status = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .status()
        .map_err(|e| format!("PowerShell zlyhal: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err("Nepodarilo sa skopírovať súbor do schránky.".into())
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn share_linux(path: &str) -> Result<ShareMode, String> {
    // Linux: prefer mail client with attachment, then file URI, then file manager highlight.
    if command_exists("xdg-email") {
        if Command::new("xdg-email")
            .arg("--attach")
            .arg(path)
            .spawn()
            .is_ok()
        {
            return Ok(ShareMode::LinuxEmail);
        }
    }

    if copy_text_to_clipboard(&file_uri(path)) {
        return Ok(ShareMode::LinuxClipboard);
    }

    if reveal_in_file_manager(path) {
        return Ok(ShareMode::LinuxFileManager);
    }

    // Last resort: open containing folder
    if let Some(parent) = Path::new(path).parent() {
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(ShareMode::LinuxFileManager);
    }

    Err("Zdieľanie nie je na tomto systéme dostupné.".into())
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn reveal_in_file_manager(path: &str) -> bool {
    let selectors: &[(&str, &[&str])] = &[
        ("nautilus", &["--select"]),
        ("dolphin", &["--select"]),
        ("nemo", &["--select"]),
        ("caja", &["--select"]),
    ];

    for (bin, prefix) in selectors {
        if !command_exists(bin) {
            continue;
        }
        let mut cmd = Command::new(bin);
        for arg in *prefix {
            cmd.arg(arg);
        }
        cmd.arg(path);
        if cmd.spawn().is_ok() {
            return true;
        }
    }
    false
}

fn command_exists(name: &str) -> bool {
    #[cfg(windows)]
    {
        Command::new("where")
            .arg(name)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        Command::new("which")
            .arg(name)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

fn copy_text_to_clipboard(text: &str) -> bool {
    if command_exists("wl-copy") {
        if let Ok(mut child) = Command::new("wl-copy")
            .stdin(Stdio::piped())
            .spawn()
        {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(text.as_bytes());
            }
            if let Ok(status) = child.wait() {
                return status.success();
            }
        }
    }

    if command_exists("xclip") {
        if let Ok(mut child) = Command::new("xclip")
            .args(["-selection", "clipboard"])
            .stdin(Stdio::piped())
            .spawn()
        {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(text.as_bytes());
            }
            if let Ok(status) = child.wait() {
                return status.success();
            }
        }
    }

    if command_exists("xsel") {
        if let Ok(mut child) = Command::new("xsel")
            .args(["--clipboard", "--input"])
            .stdin(Stdio::piped())
            .spawn()
        {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(text.as_bytes());
            }
            if let Ok(status) = child.wait() {
                return status.success();
            }
        }
    }

    false
}

pub(crate) fn file_uri(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    let encoded = normalized
        .chars()
        .map(|c| match c {
            ' ' => "%20".to_string(),
            '?' | '#' | '%' | '{' | '}' | '|' | '\\' | '^' | '~' | '[' | ']' | '`' => {
                format!("%{:02X}", c as u8)
            }
            _ => c.to_string(),
        })
        .collect::<String>();

    if encoded.starts_with('/') {
        format!("file://{encoded}")
    } else {
        format!("file:///{encoded}")
    }
}

#[cfg(test)]
mod tests {
    use super::file_uri;

    #[test]
    fn file_uri_unix_absolute() {
        assert_eq!(file_uri("/home/user/a b.mp4"), "file:///home/user/a%20b.mp4");
    }

    #[test]
    fn file_uri_windows_path() {
        assert_eq!(
            file_uri(r"C:\Users\me\clip.mp4"),
            "file:///C:/Users/me/clip.mp4"
        );
    }
}
