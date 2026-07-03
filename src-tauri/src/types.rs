//! Serializable data types shared across the backend and returned to the
//! frontend via Tauri commands.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingMeta {
    pub id: String,
    pub title: String,
    pub filename: String,
    pub created_at: String, // ISO-8601
    pub duration_secs: f64,
    pub file_size_bytes: u64,
    pub source: String,  // "screen" | "camera" | "both"
    pub quality: String, // "720p" | "1080p"
    pub has_microphone: bool,
    pub has_system_audio: bool,
    pub target_label: String, // "Built-in Retina Display", "Google Chrome", …
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingEntry {
    pub meta: RecordingMeta,
    pub path: String,
    pub meta_path: String,
}

#[derive(Debug, Serialize)]
pub struct LibraryStats {
    pub total_recordings: usize,
    pub total_size_bytes: u64,
    pub total_duration_secs: f64,
    pub oldest_created_at: Option<String>,
    pub newest_created_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DiskInfo {
    pub available_bytes: u64,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub bloom_dir_size_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct MonitorInfo {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

#[derive(Debug, Serialize)]
pub struct ValidationResult {
    pub id: String,
    pub exists: bool,
    pub size_bytes: u64,
    pub meta_exists: bool,
    pub is_valid: bool,
    pub error: Option<String>,
}

/// Payload JS sends when opening a recording session.
#[derive(Debug, Deserialize)]
pub struct SessionMeta {
    pub source: String,
    pub quality: String,
    pub has_microphone: bool,
    pub has_system_audio: bool,
    pub target_label: String,
}
