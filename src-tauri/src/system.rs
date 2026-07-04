//! Directory / setup, disk-space and display enumeration commands.

use std::path::Path;

use tauri::Manager;

use crate::types::{DiskInfo, MonitorInfo};
use crate::util::{bloom_dir, dir_size};

// ── Disk space (cross-platform) ─────────────────────────────────────────────

#[cfg(unix)]
fn available_space_bytes(path: &Path) -> Option<(u64, u64)> {
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
fn available_space_bytes(path: &Path) -> Option<(u64, u64)> {
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
fn available_space_bytes(_path: &Path) -> Option<(u64, u64)> {
    None
}

// ── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub(crate) fn get_bloom_dir(app: tauri::AppHandle) -> Result<String, String> {
    bloom_dir(&app).map(|p| p.to_string_lossy().into_owned())
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
