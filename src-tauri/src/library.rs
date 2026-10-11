//! Library listing, per-recording management and snapshot saving.

use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

use tauri::Manager;

use crate::share;
use crate::types::{LibraryStats, RecordingEntry, RecordingMeta, ShareResult, ValidationResult};
use crate::util::{
    bloom_dir, find_recording, iso_from_system_time, load_all_recordings, meta_path_for, move_file, now_iso,
    relative_filename, sanitize_folder_name, unique_path, walk_files,
};
use crate::video::{
    companion_paths, find_ffmpeg_path, find_ffprobe, make_thumbnail, probe_cached, thumbnail_path_for,
};

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

/// Best-effort removal of thumbnail / filmstrip / click-track files.
fn remove_companions(video: &Path) {
    for p in companion_paths(video) {
        let _ = fs::remove_file(p);
    }
}

/// Move video + thumbs/click track into `target_dir`; updates `meta.filename`.
/// Returns the new video path. The sidecar is *not* moved here (caller rewrites it).
fn move_recording_files(
    root: &Path,
    video: &Path,
    target_dir: &Path,
    meta: &mut RecordingMeta,
) -> Result<PathBuf, String> {
    fs::create_dir_all(target_dir).map_err(|e| format!("Cannot create folder: {e}"))?;
    let file_name = video
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid video path".to_string())?;
    let new_video = unique_path(target_dir, file_name);

    move_file(video, &new_video)?;
    for (old, new) in companion_paths(video).into_iter().zip(companion_paths(&new_video)) {
        if old.exists() {
            let _ = move_file(&old, &new);
        }
    }
    meta.filename = relative_filename(root, &new_video);
    Ok(new_video)
}

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
    remove_companions(Path::new(&entry.path));
    let locale = app.state::<crate::i18n::LocaleState>();
    let _ = crate::i18n::refresh_tray_menu(&app, crate::i18n::current_locale(&locale));
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
    pub notes: Option<String>,
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
    let mut meta_path = PathBuf::from(&entry.meta_path);
    let mut old_meta_path: Option<PathBuf> = None;
    if let Some(starred) = patch.starred {
        meta.starred = starred;
    }
    if let Some(tags) = patch.tags {
        meta.tags = tags;
    }
    if let Some(notes) = patch.notes {
        meta.notes = notes;
    }
    if let Some(folder) = patch.folder {
        let new_folder = sanitize_folder_name(&folder);
        let video = PathBuf::from(&entry.path);
        let target_dir = if new_folder.is_empty() {
            dir.clone()
        } else {
            dir.join(&new_folder)
        };
        if video.exists() && video.parent() != Some(target_dir.as_path()) {
            let new_video = move_recording_files(&dir, &video, &target_dir, &mut meta)?;
            old_meta_path = Some(meta_path.clone());
            meta_path = meta_path_for(&new_video);
        }
        meta.folder = new_folder;
    }

    let json = serde_json::to_string_pretty(&meta).map_err(|e| format!("Serialise error: {e}"))?;
    fs::write(&meta_path, json).map_err(|e| format!("Cannot update sidecar: {e}"))?;
    if let Some(old) = old_meta_path {
        if old != meta_path {
            let _ = fs::remove_file(old);
        }
    }

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
                remove_companions(Path::new(&entry.path));
                deleted += 1;
            }
        }
    }
    let locale = app.state::<crate::i18n::LocaleState>();
    let _ = crate::i18n::refresh_tray_menu(&app, crate::i18n::current_locale(&locale));
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
            remove_companions(Path::new(&entry.path));
            deleted += 1;
        }
    }
    let locale = app.state::<crate::i18n::LocaleState>();
    let _ = crate::i18n::refresh_tray_menu(&app, crate::i18n::current_locale(&locale));
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
    let locale = app.state::<crate::i18n::LocaleState>();
    let s = crate::i18n::current_strings(&*locale);
    let Some(entry) = find_recording(&dir, &id) else {
        return Ok(ValidationResult {
            id,
            exists: false,
            size_bytes: 0,
            meta_exists: false,
            is_valid: false,
            error: Some(s.err_recording_not_found.into()),
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
        (false, Some(s.err_video_missing.into()))
    } else if size_bytes == 0 {
        (false, Some(s.err_video_empty.into()))
    } else if !meta_exists {
        (false, Some(s.err_sidecar_missing.into()))
    } else if let Some(ffprobe) = find_ffmpeg_path().and_then(|f| find_ffprobe(Some(&f))) {
        // Deep check when ffprobe is available: must be readable with a real duration.
        match probe_cached(&ffprobe, &entry.path) {
            Ok(info) if info.duration_secs > 0.0 => (true, None),
            _ => (false, Some(s.err_video_corrupt.into())),
        }
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

pub(crate) const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "m4v", "mov", "qt",
    "webm", "mkv", "avi",
    "mpeg", "mpg", "mpe", "m2v",
    "ts", "mts", "m2ts", "m2t",
    "flv", "f4v",
    "wmv", "asf",
    "3gp", "3g2",
    "ogv", "ogg",
    "vob", "mxf", "divx", "xvid",
];

pub(crate) fn is_video_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| VIDEO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

pub(crate) fn sanitize_stem(name: &str) -> String {
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
    let locale = app.state::<crate::i18n::LocaleState>();
    let s = crate::i18n::current_strings(&*locale);
    if !source.is_absolute() {
        return Err(s.err_path_absolute.to_string());
    }
    if !source.exists() {
        return Err(s.err_file_missing.to_string());
    }
    if !source.is_file() {
        return Err(s.err_not_a_file.to_string());
    }
    if !is_video_file(&source) {
        return Err(s.err_unsupported_format.to_string());
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

    fs::copy(&source, &dest).map_err(|e| format!("{}: {e}", s.err_copy_failed))?;

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
        notes: String::new(),
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

/// Newest N recordings (for tray / quick open).
#[tauri::command]
pub(crate) fn list_recent_recordings(
    app: tauri::AppHandle,
    limit: Option<u32>,
) -> Result<Vec<RecordingEntry>, String> {
    let dir = bloom_dir(&app)?;
    let n = limit.unwrap_or(5).clamp(1, 20) as usize;
    let mut all = load_all_recordings(&dir);
    all.truncate(n);
    Ok(all)
}

/// Open the Bloom library folder in the system file manager.
#[tauri::command]
pub(crate) fn open_library_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = bloom_dir(&app)?;
    let path = dir.to_string_lossy().into_owned();

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Duplicate a recording (video + sidecar) with a new id.
#[tauri::command]
pub(crate) fn duplicate_recording(
    app: tauri::AppHandle,
    id: String,
) -> Result<RecordingEntry, String> {
    let dir = bloom_dir(&app)?;
    let locale = app.state::<crate::i18n::LocaleState>();
    let s = crate::i18n::current_strings(&*locale);
    let entry = find_recording(&dir, &id).ok_or_else(|| s.err_recording_not_found.to_string())?;

    let src = PathBuf::from(&entry.path);
    if !src.exists() {
        return Err(s.err_video_missing.to_string());
    }

    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4")
        .to_ascii_lowercase();
    let new_id = uuid::Uuid::new_v4().to_string();
    let stem = sanitize_stem(&format!("{}-copy", entry.meta.title));
    let short_name = format!("{}-{}.{}", stem.replace(' ', "-"), &new_id[..8], ext);
    // Keep the copy next to the original (same sub-folder).
    let dest_dir = src.parent().unwrap_or(&dir).to_path_buf();
    let dest = dest_dir.join(&short_name);
    let filename = relative_filename(&dir, &dest);

    fs::copy(&src, &dest).map_err(|e| format!("{}: {e}", s.err_copy_failed))?;

    let mut meta = entry.meta.clone();
    meta.id = new_id;
    meta.title = format!("{} (copy)", entry.meta.title);
    meta.filename = filename;
    meta.created_at = now_iso();
    meta.file_size_bytes = fs::metadata(&dest).map(|m| m.len()).unwrap_or(meta.file_size_bytes);
    meta.starred = false;

    let meta_path = meta_path_for(&dest);
    let json = serde_json::to_string_pretty(&meta).map_err(|e| format!("Serialise error: {e}"))?;
    fs::write(&meta_path, json).map_err(|e| format!("Cannot write sidecar: {e}"))?;

    let _ = crate::i18n::refresh_tray_menu(&app, crate::i18n::current_locale(&locale));

    Ok(RecordingEntry {
        meta,
        path: dest.to_string_lossy().into_owned(),
        meta_path: meta_path.to_string_lossy().into_owned(),
    })
}

/// Remove orphaned sidecars (no video) and empty video files. Returns counts.
#[tauri::command]
pub(crate) fn purge_library_orphans(app: tauri::AppHandle) -> Result<PurgeResult, String> {
    let dir = bloom_dir(&app)?;
    let mut removed_sidecars = 0u32;
    let mut removed_empty = 0u32;

    for entry in load_all_recordings(&dir) {
        let video = Path::new(&entry.path);
        let meta_path = Path::new(&entry.meta_path);
        if !video.exists() {
            if fs::remove_file(meta_path).is_ok() {
                removed_sidecars += 1;
            }
            continue;
        }
        let size = fs::metadata(video).map(|m| m.len()).unwrap_or(0);
        if size == 0 {
            let _ = fs::remove_file(video);
            let _ = fs::remove_file(meta_path);
            removed_empty += 1;
        }
    }

    let locale = app.state::<crate::i18n::LocaleState>();
    let _ = crate::i18n::refresh_tray_menu(&app, crate::i18n::current_locale(&locale));

    Ok(PurgeResult {
        removed_sidecars,
        removed_empty_videos: removed_empty,
    })
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurgeResult {
    pub removed_sidecars: u32,
    pub removed_empty_videos: u32,
}

// ── Maintenance: thumbnails + sidecar repair ────────────────────────────────

#[derive(Debug, serde::Serialize)]
pub struct RegenerateThumbnailsResult {
    pub updated: u32,
}

#[derive(Debug, serde::Serialize)]
pub struct RepairSidecarsResult {
    pub repaired: u32,
}

fn is_stale_thumb(video: &Path, thumb: &Path) -> bool {
    let (Ok(v), Ok(t)) = (fs::metadata(video), fs::metadata(thumb)) else {
        return true;
    };
    match (v.modified(), t.modified()) {
        (Ok(vm), Ok(tm)) => tm < vm,
        _ => false,
    }
}

fn regenerate_thumbnails_blocking(app: tauri::AppHandle, force: bool) -> Result<RegenerateThumbnailsResult, String> {
    let ffmpeg = find_ffmpeg_path().ok_or_else(|| "ffmpeg nie je nainštalovaný".to_string())?;
    let dir = bloom_dir(&app)?;
    let mut updated = 0u32;
    for entry in load_all_recordings(&dir) {
        let video = PathBuf::from(&entry.path);
        if !video.is_file() {
            continue;
        }
        let thumb = thumbnail_path_for(&video);
        if thumb.exists() && !force && !is_stale_thumb(&video, &thumb) {
            continue;
        }
        let _ = fs::remove_file(&thumb);
        let at = (entry.meta.duration_secs * 0.1).max(0.0);
        if make_thumbnail(&ffmpeg, &video, at).is_ok() {
            updated += 1;
        }
    }
    Ok(RegenerateThumbnailsResult { updated })
}

/// Rebuild missing (or, with `force`, all) thumbnails for the whole library.
#[tauri::command]
pub(crate) async fn regenerate_thumbnails(
    app: tauri::AppHandle,
    force: Option<bool>,
) -> Result<RegenerateThumbnailsResult, String> {
    let force = force.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || regenerate_thumbnails_blocking(app, force))
        .await
        .map_err(|e| format!("Thumbnail task failed: {e}"))?
}

fn is_temp_video(path: &Path) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    name.contains("bloom-faststart") || name.contains("bloom-replace.tmp")
}

fn repair_sidecars_blocking(app: tauri::AppHandle) -> Result<RepairSidecarsResult, String> {
    let root = bloom_dir(&app)?;
    let ffmpeg = find_ffmpeg_path();
    let ffprobe = ffmpeg.as_deref().and_then(|f| find_ffprobe(Some(f)));
    let mut repaired = 0u32;

    for video in walk_files(&root) {
        if !is_video_file(&video) || is_temp_video(&video) {
            continue;
        }
        if meta_path_for(&video).exists() {
            continue;
        }
        // Still being recorded — leave it alone.
        if crate::session::partial_marker_for(&video).exists() {
            continue;
        }
        let md = fs::metadata(&video).map_err(|e| e.to_string())?;
        if md.len() == 0 {
            continue;
        }

        let info = ffprobe
            .as_deref()
            .and_then(|p| probe_cached(p, &video.to_string_lossy()).ok());
        let stem = video.file_stem().and_then(|s| s.to_str()).unwrap_or("recording");
        let rel = relative_filename(&root, &video);
        let folder = Path::new(&rel)
            .parent()
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();

        let meta = RecordingMeta {
            id: uuid::Uuid::new_v4().to_string(),
            title: stem.to_string(),
            filename: rel,
            created_at: md.modified().map(iso_from_system_time).unwrap_or_else(|_| now_iso()),
            duration_secs: info.as_ref().map(|i| i.duration_secs).unwrap_or(0.0),
            file_size_bytes: md.len(),
            source: "import".to_string(),
            quality: info
                .as_ref()
                .filter(|i| i.height > 0)
                .map(|i| format!("{}p", i.height))
                .unwrap_or_else(|| "—".to_string()),
            has_microphone: false,
            has_system_audio: info.as_ref().map(|i| i.has_audio).unwrap_or(false),
            target_label: "Recovered".to_string(),
            starred: false,
            tags: Vec::new(),
            folder,
            notes: String::new(),
        };
        let json = serde_json::to_string_pretty(&meta).map_err(|e| format!("Serialise error: {e}"))?;
        if fs::write(meta_path_for(&video), json).is_ok() {
            repaired += 1;
            if let Some(f) = ffmpeg.as_deref() {
                if !thumbnail_path_for(&video).exists() {
                    let _ = make_thumbnail(f, &video, (meta.duration_secs * 0.1).max(0.0));
                }
            }
        }
    }

    let locale = app.state::<crate::i18n::LocaleState>();
    let _ = crate::i18n::refresh_tray_menu(&app, crate::i18n::current_locale(&locale));
    Ok(RepairSidecarsResult { repaired })
}

/// Create `.bloom.json` sidecars for video files that have none.
#[tauri::command]
pub(crate) async fn repair_sidecars(app: tauri::AppHandle) -> Result<RepairSidecarsResult, String> {
    tauri::async_runtime::spawn_blocking(move || repair_sidecars_blocking(app))
        .await
        .map_err(|e| format!("Repair task failed: {e}"))?
}
