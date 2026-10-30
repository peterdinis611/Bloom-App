//! Library backup folder, create/list backups, default recording folder.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::Manager;

use crate::config;
use crate::util::{bloom_dir, dir_size, is_hidden, now_iso, sanitize_folder_name, walk_files};

#[derive(Debug, Serialize)]
pub struct BackupDirectoryInfo {
    pub path: String,
    pub is_custom: bool,
    pub default_path: String,
}

#[derive(Debug, Serialize)]
pub struct BackupResult {
    pub path: String,
    pub files: u32,
    pub bytes: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct BackupEntry {
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub size_bytes: u64,
    pub file_count: u32,
}

fn default_backup_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    let dir = home.join("Movies").join("Bloom Backups");
    #[cfg(not(target_os = "macos"))]
    let dir = home.join("Videos").join("Bloom Backups");
    Ok(dir)
}

pub(crate) fn backup_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(cfg) = config::load_config(app) {
        if let Some(custom) = cfg.backup_dir {
            let path = PathBuf::from(custom.trim());
            if path.is_absolute() {
                fs::create_dir_all(&path).map_err(|e| e.to_string())?;
                return Ok(path);
            }
        }
    }
    let dir = default_backup_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub(crate) fn get_backup_directory(app: tauri::AppHandle) -> Result<BackupDirectoryInfo, String> {
    let default = default_backup_dir(&app)?;
    let current = backup_dir(&app)?;
    Ok(BackupDirectoryInfo {
        path: current.to_string_lossy().into_owned(),
        is_custom: current != default,
        default_path: default.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub(crate) fn set_backup_directory(
    app: tauri::AppHandle,
    path: Option<String>,
) -> Result<BackupDirectoryInfo, String> {
    let new_custom = path
        .map(|p| p.trim().to_owned())
        .filter(|p| !p.is_empty());

    if let Some(ref p) = new_custom {
        let pb = PathBuf::from(p);
        if !pb.is_absolute() {
            return Err("Path must be absolute".into());
        }
        // Refuse putting backups inside the live library.
        let lib = bloom_dir(&app)?;
        if pb.starts_with(&lib) || lib.starts_with(&pb) {
            return Err("Backup folder must be outside the library".into());
        }
        fs::create_dir_all(&pb).map_err(|e| e.to_string())?;
    }

    let mut cfg = config::load_config(&app).unwrap_or_default();
    cfg.backup_dir = new_custom;
    config::save_config(&app, &cfg)?;
    get_backup_directory(app)
}

fn stamp_folder_name() -> String {
    // Bloom-2026-10-30_10-36-00
    let iso = now_iso();
    let cleaned: String = iso
        .chars()
        .map(|c| match c {
            ':' => '-',
            'T' => '_',
            'Z' | '+' => ' ',
            _ => c,
        })
        .collect();
    let cleaned = cleaned.split('.').next().unwrap_or(&cleaned).trim();
    let cleaned = cleaned.split(' ').next().unwrap_or(cleaned);
    format!("Bloom-{cleaned}")
}

fn copy_library_to(src: &Path, dst: &Path) -> Result<(u32, u64), String> {
    if dst.starts_with(src) {
        return Err("Backup destination cannot be inside the library".into());
    }
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    let mut files = 0u32;
    let mut bytes = 0u64;
    for file in walk_files(src) {
        let Ok(rel) = file.strip_prefix(src) else { continue };
        let target = dst.join(rel);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::copy(&file, &target).map_err(|e| format!("Cannot copy {}: {e}", file.display()))?;
        files += 1;
        bytes += fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
    }
    Ok((files, bytes))
}

#[tauri::command]
pub(crate) async fn create_library_backup(app: tauri::AppHandle) -> Result<BackupResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let src = bloom_dir(&app)?;
        let root = backup_dir(&app)?;
        let dest = root.join(stamp_folder_name());
        if dest.exists() {
            return Err("Backup folder already exists — skús znova o sekundu".into());
        }
        let (files, bytes) = copy_library_to(&src, &dest)?;
        Ok(BackupResult {
            path: dest.to_string_lossy().into_owned(),
            files,
            bytes,
        })
    })
    .await
    .map_err(|e| format!("Backup task failed: {e}"))?
}

fn count_files(dir: &Path) -> u32 {
    walk_files(dir).len() as u32
}

#[tauri::command]
pub(crate) fn list_backups(app: tauri::AppHandle) -> Result<Vec<BackupEntry>, String> {
    let root = backup_dir(&app)?;
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(&root) else {
        return Ok(out);
    };
    for e in entries.filter_map(|e| e.ok()) {
        let p = e.path();
        if !p.is_dir() || is_hidden(&p) {
            continue;
        }
        let name = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("backup")
            .to_string();
        if !name.starts_with("Bloom-") {
            continue;
        }
        let created_at = fs::metadata(&p)
            .and_then(|m| m.created().or_else(|_| m.modified()))
            .ok()
            .and_then(|t| {
                t.duration_since(std::time::UNIX_EPOCH)
                    .ok()
                    .map(|d| {
                        let secs = d.as_secs() as i64;
                        // Keep ISO-ish string without chrono dep
                        format!("{secs}")
                    })
            })
            .unwrap_or_else(|| name.clone());
        out.push(BackupEntry {
            name,
            path: p.to_string_lossy().into_owned(),
            created_at,
            size_bytes: dir_size(&p),
            file_count: count_files(&p),
        });
    }
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

#[tauri::command]
pub(crate) fn open_backup_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = backup_dir(&app)?;
    open_path(&dir)
}

#[tauri::command]
pub(crate) fn open_backup_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(path.trim());
    if !p.exists() {
        return Err("Backup path does not exist".into());
    }
    open_path(&p)
}

fn open_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", unix)))]
    {
        let _ = path;
        Err("Opening folders is not supported on this platform".into())
    }
}

#[tauri::command]
pub(crate) fn get_default_recording_folder(app: tauri::AppHandle) -> Result<String, String> {
    let cfg = config::load_config(&app).unwrap_or_default();
    Ok(cfg
        .default_recording_folder
        .unwrap_or_default()
        .trim()
        .to_string())
}

#[tauri::command]
pub(crate) fn set_default_recording_folder(
    app: tauri::AppHandle,
    folder: String,
) -> Result<String, String> {
    let cleaned = sanitize_folder_name(&folder);
    let mut cfg = config::load_config(&app).unwrap_or_default();
    cfg.default_recording_folder = if cleaned.is_empty() {
        None
    } else {
        Some(cleaned.clone())
    };
    config::save_config(&app, &cfg)?;
    Ok(cleaned)
}

/// Resolve configured default folder for new recordings (may be empty).
pub(crate) fn resolved_default_folder(app: &tauri::AppHandle) -> String {
    config::load_config(app)
        .ok()
        .and_then(|c| c.default_recording_folder)
        .map(|f| sanitize_folder_name(&f))
        .filter(|f| !f.is_empty())
        .unwrap_or_default()
}
