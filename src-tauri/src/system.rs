//! Directory / setup, disk-space and display enumeration commands.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{Emitter, Manager};

use crate::config;
use crate::types::{DiskInfo, MonitorInfo};
use crate::util::{bloom_dir, dir_size, is_hidden};

#[derive(Debug, Serialize)]
pub struct LibraryDirectoryInfo {
    pub path: String,
    pub is_custom: bool,
    pub default_path: String,
    /// Files moved by the last `set_library_directory(.., migrate = true)` call.
    pub migrated_files: u32,
}

pub(crate) const DEFAULT_DISK_MIN_MB: u64 = 200;

// ── Disk space (cross-platform) ─────────────────────────────────────────────

#[cfg(unix)]
pub(crate) fn available_space_bytes(path: &Path) -> Option<(u64, u64)> {
    use std::ffi::CString;
    use std::mem::MaybeUninit;

    let c_path = CString::new(path.to_str()?).ok()?;
    let mut stat: libc::statvfs = unsafe { MaybeUninit::zeroed().assume_init() };
    let ret = unsafe { libc::statvfs(c_path.as_ptr(), &mut stat) };
    if ret != 0 {
        return None;
    }
    let block = stat.f_frsize as u64;
    Some((stat.f_bavail as u64 * block, stat.f_blocks as u64 * block))
}

#[cfg(windows)]
pub(crate) fn available_space_bytes(path: &Path) -> Option<(u64, u64)> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let wide: Vec<u16> = OsStr::new(path).encode_wide().chain(Some(0)).collect();
    let mut avail: u64 = 0;
    let mut total: u64 = 0;
    let mut free: u64 = 0;
    let ok = unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &mut avail, &mut total, &mut free) };
    if ok == 0 {
        None
    } else {
        Some((avail, total))
    }
}

#[cfg(not(any(unix, windows)))]
pub(crate) fn available_space_bytes(_path: &Path) -> Option<(u64, u64)> {
    None
}

// ── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub(crate) fn get_bloom_dir(app: tauri::AppHandle) -> Result<String, String> {
    bloom_dir(&app).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub(crate) fn get_library_directory(app: tauri::AppHandle) -> Result<LibraryDirectoryInfo, String> {
    let default = config::default_bloom_dir(&app)?;
    let current = bloom_dir(&app)?;
    Ok(LibraryDirectoryInfo {
        path: current.to_string_lossy().into_owned(),
        is_custom: current != default,
        default_path: default.to_string_lossy().into_owned(),
        migrated_files: 0,
    })
}

/// Move every non-hidden file (videos, sidecars, thumbnails, click tracks) from
/// `old` into `new`, preserving sub-folders. Existing destination files are never
/// overwritten. Returns the number of files moved.
pub(crate) fn migrate_library(old: &Path, new: &Path) -> Result<u32, String> {
    if old == new {
        return Ok(0);
    }
    if new.starts_with(old) {
        return Err("The new library folder cannot be inside the current one".into());
    }
    fs::create_dir_all(new).map_err(|e| e.to_string())?;

    let mut moved = 0u32;
    for src in crate::util::walk_files(old) {
        let Ok(rel) = src.strip_prefix(old) else { continue };
        let dst = new.join(rel);
        if dst.exists() {
            continue;
        }
        crate::util::move_file(&src, &dst)?;
        moved += 1;
    }
    remove_empty_dirs(old, false);
    Ok(moved)
}

/// Remove empty sub-directories (never the root itself unless `remove_self`).
fn remove_empty_dirs(dir: &Path, remove_self: bool) {
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.filter_map(|e| e.ok()) {
            let p = e.path();
            if p.is_dir() && !is_hidden(&p) {
                remove_empty_dirs(&p, true);
            }
        }
    }
    if remove_self {
        let _ = fs::remove_dir(dir); // only succeeds when empty
    }
}

fn set_library_directory_blocking(
    app: tauri::AppHandle,
    path: Option<String>,
    migrate: bool,
) -> Result<LibraryDirectoryInfo, String> {
    let old = bloom_dir(&app)?;
    let new_custom = path
        .map(|p| p.trim().to_owned())
        .filter(|p| !p.is_empty());

    let new_dir: PathBuf = match &new_custom {
        Some(p) => {
            let pb = PathBuf::from(p);
            if !pb.is_absolute() {
                return Err("Path must be absolute".into());
            }
            pb
        }
        None => config::default_bloom_dir(&app)?,
    };

    let migrated = if migrate && old != new_dir {
        migrate_library(&old, &new_dir)?
    } else {
        0
    };

    let mut cfg = config::load_config(&app).unwrap_or_default();
    cfg.library_dir = new_custom;
    config::save_config(&app, &cfg)?;

    let _ = crate::watcher::restart_library_watcher(&app);
    let locale = app.state::<crate::i18n::LocaleState>();
    let _ = crate::i18n::refresh_tray_menu(&app, crate::i18n::current_locale(&locale));
    let _ = app.emit("library-changed", ());

    let mut info = get_library_directory(app)?;
    info.migrated_files = migrated;
    Ok(info)
}

/// Change the library folder. With `migrate` (default false) existing recordings
/// are moved into the new folder first.
#[tauri::command]
pub(crate) async fn set_library_directory(
    app: tauri::AppHandle,
    path: Option<String>,
    migrate: Option<bool>,
) -> Result<LibraryDirectoryInfo, String> {
    let migrate = migrate.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || set_library_directory_blocking(app, path, migrate))
        .await
        .map_err(|e| format!("Migration task failed: {e}"))?
}

#[tauri::command]
pub(crate) fn get_disk_space_min_mb(app: tauri::AppHandle) -> u64 {
    config::load_config(&app)
        .ok()
        .and_then(|c| c.disk_space_min_mb)
        .unwrap_or(DEFAULT_DISK_MIN_MB)
}

#[tauri::command]
pub(crate) fn set_disk_space_min_mb(app: tauri::AppHandle, mb: u64) -> Result<u64, String> {
    let mut cfg = config::load_config(&app).unwrap_or_default();
    cfg.disk_space_min_mb = Some(mb);
    config::save_config(&app, &cfg)?;
    Ok(mb)
}

// ── Capture permissions ─────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct CapturePermissions {
    pub screen: bool,
    pub microphone: bool,
    pub camera: bool,
}

#[cfg(target_os = "macos")]
mod mac {
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2_foundation::NSString;
    use std::ffi::{c_char, c_void, CStr};

    use super::CaptureWindow;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> *mut AnyObject;
    }

    extern "C" {
        fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
    }

    /// `CGPreflightScreenCaptureAccess` (macOS 10.15+), resolved at runtime.
    pub fn screen_access() -> bool {
        const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;
        unsafe {
            let sym = dlsym(RTLD_DEFAULT, c"CGPreflightScreenCaptureAccess".as_ptr());
            if sym.is_null() {
                return true;
            }
            let f: extern "C" fn() -> bool = std::mem::transmute(sym);
            f()
        }
    }

    /// AVAuthorizationStatus: 0 notDetermined, 1 restricted, 2 denied, 3 authorized.
    /// Not-determined counts as OK — the OS prompts on first use.
    pub fn av_access(media_type: &str) -> bool {
        let Some(cls) = AnyClass::get(c"AVCaptureDevice") else {
            return true; // AVFoundation not loaded: unknown → assume ok
        };
        let ty = NSString::from_str(media_type);
        let status: isize = unsafe { msg_send![cls, authorizationStatusForMediaType: &*ty] };
        !(status == 1 || status == 2)
    }

    unsafe fn dict_get(dict: &AnyObject, key: &str) -> Option<*mut AnyObject> {
        let k = NSString::from_str(key);
        let v: *mut AnyObject = msg_send![dict, objectForKey: &*k];
        if v.is_null() {
            None
        } else {
            Some(v)
        }
    }

    unsafe fn num_f64(dict: &AnyObject, key: &str) -> f64 {
        match dict_get(dict, key) {
            Some(v) => msg_send![&*v, doubleValue],
            None => 0.0,
        }
    }

    unsafe fn string_of(dict: &AnyObject, key: &str) -> String {
        let Some(v) = dict_get(dict, key) else {
            return String::new();
        };
        let c: *const c_char = msg_send![&*v, UTF8String];
        if c.is_null() {
            String::new()
        } else {
            CStr::from_ptr(c).to_string_lossy().into_owned()
        }
    }

    pub fn windows() -> Vec<CaptureWindow> {
        // kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements
        const OPTS: u32 = 1 | 16;
        let mut out = Vec::new();
        unsafe {
            let arr = CGWindowListCopyWindowInfo(OPTS, 0);
            if arr.is_null() {
                return out;
            }
            let count: usize = msg_send![&*arr, count];
            for i in 0..count {
                let dict: *mut AnyObject = msg_send![&*arr, objectAtIndex: i];
                if dict.is_null() {
                    continue;
                }
                let dict = &*dict;
                // Layer 0 = normal app windows (skips menu bar, dock, overlays).
                if num_f64(dict, "kCGWindowLayer") != 0.0 {
                    continue;
                }
                let Some(bounds) = dict_get(dict, "kCGWindowBounds") else {
                    continue;
                };
                let bounds = &*bounds;
                let width = num_f64(bounds, "Width");
                let height = num_f64(bounds, "Height");
                if width < 80.0 || height < 60.0 {
                    continue;
                }
                let app_name = string_of(dict, "kCGWindowOwnerName");
                let title = string_of(dict, "kCGWindowName");
                if app_name.is_empty() {
                    continue;
                }
                let id = num_f64(dict, "kCGWindowNumber") as i64;
                out.push(CaptureWindow {
                    id: format!("window-{id}"),
                    title,
                    app_name,
                    x: num_f64(bounds, "X").round() as i32,
                    y: num_f64(bounds, "Y").round() as i32,
                    width: width.round() as u32,
                    height: height.round() as u32,
                });
            }
            // CGWindowListCopyWindowInfo follows the Create rule.
            let _: () = msg_send![&*arr, release];
        }
        out
    }
}

/// Best-effort capture permission probe. Non-macOS platforms report `true`
/// (no OS-level gate we can query); on macOS microphone/camera "not determined"
/// also reports `true` since the OS prompts on first use.
#[tauri::command]
pub(crate) fn check_capture_permissions() -> CapturePermissions {
    #[cfg(target_os = "macos")]
    {
        CapturePermissions {
            screen: mac::screen_access(),
            microphone: mac::av_access("soun"),
            camera: mac::av_access("vide"),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        CapturePermissions { screen: true, microphone: true, camera: true }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CaptureWindow {
    pub id: String,
    pub title: String,
    pub app_name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// On-screen application windows (macOS only; empty elsewhere).
#[tauri::command]
pub(crate) fn list_capture_windows() -> Vec<CaptureWindow> {
    #[cfg(target_os = "macos")]
    {
        mac::windows()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Vec::new()
    }
}

#[tauri::command]
pub(crate) fn get_disk_space(app: tauri::AppHandle) -> Result<DiskInfo, String> {
    let dir = bloom_dir(&app)?;
    let (available_bytes, total_bytes) = available_space_bytes(&dir).unwrap_or((0, 0));
    let bloom_dir_size_bytes = dir_size(&dir);
    Ok(DiskInfo {
        available_bytes,
        total_bytes,
        used_bytes: total_bytes.saturating_sub(available_bytes),
        bloom_dir_size_bytes,
    })
}

/// Enumerate the physical displays connected to the machine.
///
/// Note: on webview platforms the OS `getDisplayMedia` picker ultimately
/// decides which surface is captured; this list is used to populate a
/// friendly, real display chooser and to store the chosen label in metadata.
#[tauri::command]
pub(crate) fn list_monitors(app: tauri::AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    let monitors = win.available_monitors().map_err(|e| e.to_string())?;
    let primary = win.primary_monitor().ok().flatten();
    let primary_pos = primary.as_ref().map(|m| *m.position());

    let list = monitors
        .into_iter()
        .enumerate()
        .map(|(i, m)| {
            let size = m.size();
            let position = m.position();
            let scale = m.scale_factor();
            let is_primary = primary_pos.map(|p| p == *position).unwrap_or(i == 0);
            MonitorInfo {
                id: format!("monitor-{i}"),
                name: m.name().cloned().unwrap_or_else(|| format!("Display {}", i + 1)),
                width: ((size.width as f64) / scale).round() as u32,
                height: ((size.height as f64) / scale).round() as u32,
                scale_factor: scale,
                is_primary,
                x: position.x,
                y: position.y,
                physical_width: size.width,
                physical_height: size.height,
            }
        })
        .collect();

    Ok(list)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub name: String,
    pub platform: String,
    pub locale: String,
    pub system_locale: String,
    pub library_path: String,
    pub ffmpeg_available: bool,
    pub ffmpeg_version: Option<String>,
}

/// Snapshot of backend state for About / diagnostics.
#[tauri::command]
pub(crate) fn get_app_info(
    app: tauri::AppHandle,
    locale: tauri::State<'_, crate::i18n::LocaleState>,
) -> Result<AppInfo, String> {
    let library_path = bloom_dir(&app)?.to_string_lossy().into_owned();
    let ff = crate::video::check_ffmpeg();
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        name: "Bloom".into(),
        platform: std::env::consts::OS.to_string(),
        locale: crate::i18n::current_locale(&locale).as_str().to_string(),
        system_locale: crate::i18n::Locale::from_system().as_str().to_string(),
        library_path,
        ffmpeg_available: ff.available,
        ffmpeg_version: ff.version,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("bloom-sys-{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn migrate_moves_nested_files_and_keeps_existing() {
        let old = temp_dir("old");
        let new = temp_dir("new");
        fs::create_dir_all(old.join("Work")).unwrap();
        fs::write(old.join("a.mp4"), b"a").unwrap();
        fs::write(old.join("a.bloom.json"), b"{}").unwrap();
        fs::write(old.join("Work/b.mp4"), b"b").unwrap();
        fs::write(old.join(".hidden"), b"h").unwrap();
        fs::write(new.join("a.mp4"), b"existing").unwrap();

        let moved = migrate_library(&old, &new).unwrap();
        assert_eq!(moved, 2);
        assert_eq!(fs::read(new.join("a.mp4")).unwrap(), b"existing");
        assert!(new.join("a.bloom.json").exists());
        assert!(new.join("Work/b.mp4").exists());
        assert!(!old.join("Work").exists());
        assert!(old.join(".hidden").exists());

        fs::remove_dir_all(&old).ok();
        fs::remove_dir_all(&new).ok();
    }

    #[test]
    fn migrate_rejects_nested_destination() {
        let old = temp_dir("nest");
        let inside = old.join("child");
        assert!(migrate_library(&old, &inside).is_err());
        fs::remove_dir_all(&old).ok();
    }

    #[test]
    fn capture_permissions_serialize() {
        let p = check_capture_permissions();
        let v = serde_json::to_value(&p).unwrap();
        assert!(v["screen"].is_boolean() && v["microphone"].is_boolean() && v["camera"].is_boolean());
    }

    #[test]
    fn list_capture_windows_does_not_panic() {
        for w in list_capture_windows() {
            assert!(w.width > 0 && w.height > 0);
        }
    }
}
