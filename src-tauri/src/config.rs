//! Persisted app config (custom library directory, locale, shortcuts, etc.).

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(crate) struct ShortcutConfig {
    pub arm: String,
    pub pause: String,
    pub stop: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(crate) struct AppConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub library_dir: Option<String>,
    /// UI + tray locale: sk | en | cs | de | pl | hu
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
    /// Filename template, e.g. `recording-{date}-{time}`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename_template: Option<String>,
    /// How many recent recordings to show in the tray (0–8).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tray_recent_count: Option<u32>,
    /// Global ⌘⇧ shortcuts (single letters).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shortcuts: Option<ShortcutConfig>,
    /// After save, run a light optimize pass when ffmpeg is available.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_optimize_after_record: Option<bool>,
    /// Abort write_chunk when free disk space falls below this many MiB.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disk_space_min_mb: Option<u64>,
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

pub(crate) fn load_config(app: &tauri::AppHandle) -> Result<AppConfig, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| format!("Invalid config: {e}"))
}

pub(crate) fn save_config(app: &tauri::AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let raw = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| e.to_string())
}

/// Platform default: `~/Movies/Bloom` (macOS) or `~/Videos/Bloom`.
pub(crate) fn default_bloom_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    let dir = home.join("Movies").join("Bloom");

    #[cfg(not(target_os = "macos"))]
    let dir = home.join("Videos").join("Bloom");

    Ok(dir)
}
