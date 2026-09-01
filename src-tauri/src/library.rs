//! Library listing, per-recording management and snapshot saving.

use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

use crate::share;
use crate::types::{LibraryStats, RecordingEntry, RecordingMeta, ShareResult, ValidationResult};
use crate::util::{bloom_dir, find_recording, load_all_recordings, meta_path_for, now_iso};

// ── Snapshot ────────────────────────────────────────────────────────────────

/// Save a still-frame snapshot (PNG bytes from the frontend) into the Bloom
/// directory. Used by the "pause → annotate → save" flow.
#[tauri::command]
pub(crate) fn save_snapshot(
    app: tauri::AppHandle,
    filename: String,
    data: Vec<u8>,
) -> Result<String, String> {
    let dir = bloom_dir(&app)?;
    // Guard against path traversal – keep only the file name.
    let name = Path::new(&filename)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid filename".to_string())?;
    let path = dir.join(name);
    fs::write(&path, &data).map_err(|e| format!("Cannot write snapshot: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

// ── Library ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub(crate) fn list_recordings(app: tauri::AppHandle) -> Result<Vec<RecordingEntry>, String> {
    let dir = bloom_dir(&app)?;
    Ok(load_all_recordings(&dir))
}

#[tauri::command]
pub(crate) fn get_library_stats(app: tauri::AppHandle) -> Result<LibraryStats, String> {
    let dir = bloom_dir(&app)?;
    let recordings = load_all_recordings(&dir);

    let total_size_bytes: u64 = recordings.iter().map(|r| r.meta.file_size_bytes).sum();
    let total_duration_secs: f64 = recordings.iter().map(|r| r.meta.duration_secs).sum();
    let oldest = recordings.last().map(|r| r.meta.created_at.clone());
    let newest = recordings.first().map(|r| r.meta.created_at.clone());

    Ok(LibraryStats {
        total_recordings: recordings.len(),
        total_size_bytes,
        total_duration_secs,
        oldest_created_at: oldest,
        newest_created_at: newest,
    })
}

// ── Recording management ─────────────────────────────────────────────────────

#[tauri::command]
pub(crate) fn get_recording(app: tauri::AppHandle, id: String) -> Result<RecordingEntry, String> {
    let dir = bloom_dir(&app)?;
    find_recording(&dir, &id).ok_or_else(|| format!("Recording {id} not found"))
}

#[tauri::command]
pub(crate) fn delete_recording(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = bloom_dir(&app)?;
    let entry = find_recording(&dir, &id).ok_or_else(|| format!("Recording {id} not found"))?;

    fs::remove_file(&entry.path).map_err(|e| format!("Cannot delete video: {e}"))?;
    let _ = fs::remove_file(&entry.meta_path); // best-effort
    Ok(())
}

#[tauri::command]
pub(crate) fn rename_recording(
    app: tauri::AppHandle,
    id: String,
    new_title: String,
) -> Result<RecordingMeta, String> {
    let dir = bloom_dir(&app)?;
    let entry = find_recording(&dir, &id).ok_or_else(|| format!("Recording {id} not found"))?;

    let mut meta = entry.meta;
    meta.title = new_title.trim().to_owned();

    let json = serde_json::to_string_pretty(&meta).map_err(|e| format!("Serialise error: {e}"))?;
    fs::write(&entry.meta_path, json).map_err(|e| format!("Cannot update sidecar: {e}"))?;

    Ok(meta)
}

#[derive(Debug, Deserialize)]
pub struct RecordingMetaPatch {
    pub starred: Option<bool>,
    pub tags: Option<Vec<String>>,
    pub folder: Option<String>,
}

#[tauri::command]
pub(crate) fn update_recording_meta(
    app: tauri::AppHandle,
    id: String,
    patch: RecordingMetaPatch,
) -> Result<RecordingMeta, String> {
    let dir = bloom_dir(&app)?;
    let entry = find_recording(&dir, &id).ok_or_else(|| format!("Recording {id} not found"))?;

    let mut meta = entry.meta;
    if let Some(starred) = patch.starred {
        meta.starred = starred;
    }
    if let Some(tags) = patch.tags {
        meta.tags = tags;
    }
    if let Some(folder) = patch.folder {
        meta.folder = folder;
    }

    let json = serde_json::to_string_pretty(&meta).map_err(|e| format!("Serialise error: {e}"))?;
    fs::write(&entry.meta_path, json).map_err(|e| format!("Cannot update sidecar: {e}"))?;

    Ok(meta)
}

#[tauri::command]
pub(crate) fn batch_delete_recordings(app: tauri::AppHandle, ids: Vec<String>) -> Result<u32, String> {
    let dir = bloom_dir(&app)?;
    let mut deleted = 0u32;
    for id in ids {
        if let Some(entry) = find_recording(&dir, &id) {
            if fs::remove_file(&entry.path).is_ok() {
                let _ = fs::remove_file(&entry.meta_path);
                deleted += 1;
            }
        }
    }
    Ok(deleted)
}

/// Permanently delete every recording in the Bloom library directory.
#[tauri::command]
pub(crate) fn delete_all_recordings(app: tauri::AppHandle) -> Result<u32, String> {
    let dir = bloom_dir(&app)?;
    let recordings = load_all_recordings(&dir);
    let mut deleted = 0u32;
    for entry in recordings {
        if fs::remove_file(&entry.path).is_ok() {
            let _ = fs::remove_file(&entry.meta_path);
            deleted += 1;
        }
    }
    Ok(deleted)
}

#[tauri::command]
pub(crate) fn share_recording(app: tauri::AppHandle, id: String) -> Result<ShareResult, String> {
    let dir = bloom_dir(&app)?;
    let entry = find_recording(&dir, &id).ok_or_else(|| format!("Recording {id} not found"))?;
    share::share_file(&app, &entry.path)
}

#[tauri::command]
pub(crate) fn validate_recording(
    app: tauri::AppHandle,
    id: String,
) -> Result<ValidationResult, String> {
    let dir = bloom_dir(&app)?;
    let Some(entry) = find_recording(&dir, &id) else {
        return Ok(ValidationResult {
            id,
            exists: false,
            size_bytes: 0,
            meta_exists: false,
            is_valid: false,
            error: Some("Recording not found in library".into()),
        });
    };

    let video_path = Path::new(&entry.path);
    let meta_path = Path::new(&entry.meta_path);

    let exists = video_path.exists();
    let size_bytes = if exists {
        fs::metadata(video_path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };
    let meta_exists = meta_path.exists();

    let (is_valid, error) = if !exists {
        (false, Some("Video file is missing from disk".into()))
    } else if size_bytes == 0 {
        (false, Some("Video file is empty (0 bytes)".into()))
    } else if !meta_exists {
        (false, Some("Metadata sidecar (.bloom.json) is missing".into()))
    } else {
        (true, None)
    };

    Ok(ValidationResult { id, exists, size_bytes, meta_exists, is_valid, error })
}

/// Open the file's parent folder in Finder (macOS) / Explorer (Windows) /
/// file-manager (Linux).
#[tauri::command]
pub(crate) fn reveal_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .args(["/select,", &path])
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let parent = Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or(path);
        std::process::Command::new("xdg-open")
            .arg(&parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "mov", "mkv", "m4v"];

fn is_video_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| VIDEO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn sanitize_stem(name: &str) -> String {
    let trimmed: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let collapsed = trimmed
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if collapsed.is_empty() {
        "import".to_string()
    } else {
        collapsed
    }
}

/// Copy an external video into the Bloom library and create metadata.
#[tauri::command]
pub(crate) fn import_recording(
    app: tauri::AppHandle,
    source_path: String,
) -> Result<RecordingEntry, String> {
    let source = PathBuf::from(&source_path);
    if !source.is_absolute() {
        return Err("Cesta musí byť absolútna".to_string());
    }
    if !source.exists() {
        return Err("Súbor neexistuje".to_string());
    }
    if !source.is_file() {
        return Err("Vybraná položka nie je súbor".to_string());
    }
    if !is_video_file(&source) {
        return Err("Nepodporovaný formát. Podporované: MP4, WebM, MOV, MKV".to_string());
    }

    let dir = bloom_dir(&app)?;
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4")
        .to_ascii_lowercase();
    let id = uuid::Uuid::new_v4().to_string();
    let stem = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("import");
    let title = sanitize_stem(stem);
    let filename = format!(
        "{}-{}.{}",
        title.replace(' ', "-"),
        &id[..8],
        ext
    );
    let dest = dir.join(&filename);

    fs::copy(&source, &dest).map_err(|e| format!("Kopírovanie zlyhalo: {e}"))?;

    let finalized = crate::finalize::finalize_recording(&dest, 0.0);
    let file_size_bytes = fs::metadata(&dest)
        .map(|m| m.len())
        .unwrap_or(finalized.file_size_bytes)
        .max(finalized.file_size_bytes);

    let meta = RecordingMeta {
        id: id.clone(),
        title: title.clone(),
        filename,
        created_at: now_iso(),
        duration_secs: finalized.duration_secs,
        file_size_bytes,
        source: "import".to_string(),
        quality: "—".to_string(),
        has_microphone: false,
        has_system_audio: false,
        target_label: "Import".to_string(),
        starred: false,
        tags: Vec::new(),
        folder: String::new(),
    };

    let meta_path = meta_path_for(&dest);
    let json = serde_json::to_string_pretty(&meta).map_err(|e| format!("Serialise error: {e}"))?;
    fs::write(&meta_path, json).map_err(|e| format!("Cannot write sidecar: {e}"))?;

    Ok(RecordingEntry {
        meta,
        path: dest.to_string_lossy().into_owned(),
        meta_path: meta_path.to_string_lossy().into_owned(),
    })
}
