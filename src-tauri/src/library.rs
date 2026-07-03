//! Library listing, per-recording management and snapshot saving.

use std::fs;
use std::path::Path;

use crate::types::{LibraryStats, RecordingEntry, RecordingMeta, ValidationResult};
use crate::util::{bloom_dir, find_recording, load_all_recordings};

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
