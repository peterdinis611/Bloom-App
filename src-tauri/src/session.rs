//! Streaming recording session: one open file per active recording, fed by
//! binary chunks from the frontend's MediaRecorder.

use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{BufWriter, Write},
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex},
    time::Instant,
};

use serde::Serialize;
use uuid::Uuid;

use crate::config::load_config;
use crate::system::{available_space_bytes, DEFAULT_DISK_MIN_MB};
use crate::types::{RecordingMeta, SessionMeta};
use crate::util::{bloom_dir, meta_path_for, now_iso, relative_filename, walk_files};

/// Re-check free disk space after this many written bytes.
const DISK_CHECK_INTERVAL: u64 = 8 * 1024 * 1024;
const MIB: u64 = 1024 * 1024;
const PARTIAL_SUFFIX: &str = ".bloom.partial";

/// Writer state held behind its own mutex so chunk I/O does not block the
/// session map (open/close/cancel of other sessions).
struct SessionWriter {
    writer: BufWriter<File>,
    bytes_written: u64,
    /// Directory the video lives in (for free-space checks).
    dir: PathBuf,
    /// Bytes written since the last free-space check; `None` = never checked.
    since_check: Option<u64>,
}

/// `{video}.bloom.partial` marker next to an in-progress recording.
pub(crate) fn partial_marker_for(video: &Path) -> PathBuf {
    let mut os = video.as_os_str().to_owned();
    os.push(PARTIAL_SUFFIX);
    PathBuf::from(os)
}

/// Free space is OK when unknown, or when `available - incoming >= min_mb`.
pub(crate) fn has_enough_space(available: Option<u64>, min_mb: u64, incoming: u64) -> bool {
    match available {
        None => true,
        Some(avail) => avail.saturating_sub(incoming) >= min_mb.saturating_mul(MIB),
    }
}

/// Join a library-relative `filename` onto `root`, rejecting absolute / `..` paths.
pub(crate) fn safe_join(root: &Path, filename: &str) -> Result<PathBuf, String> {
    let rel = Path::new(filename);
    if filename.trim().is_empty()
        || rel.is_absolute()
        || rel
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(format!("Invalid filename: {filename}"));
    }
    Ok(root.join(rel))
}

struct Session {
    write: Arc<Mutex<SessionWriter>>,
    path: PathBuf,
    marker: PathBuf,
    started_at: Instant,
    meta_template: RecordingMeta, // finalised at close_session
}

#[derive(Default)]
pub(crate) struct SessionMap {
    map: HashMap<u32, Session>,
    next_id: u32,
}

pub(crate) type Sessions = Arc<Mutex<SessionMap>>;

#[tauri::command]
pub(crate) fn open_session(
    state: tauri::State<Sessions>,
    app: tauri::AppHandle,
    filename: String,
    meta: SessionMeta,
) -> Result<u32, String> {
    let dir = bloom_dir(&app)?;
    let path = safe_join(&dir, &filename)?;
    let path_str = path.to_string_lossy().into_owned();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create {}: {e}", parent.display()))?;
    }

    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&path)
        .map_err(|e| format!("Cannot create {path_str}: {e}"))?;

    // 1 MiB buffer – fewer syscalls for MediaRecorder chunk writes
    let writer = BufWriter::with_capacity(1024 * 1024, file);

    let meta_template = RecordingMeta {
        id: Uuid::new_v4().to_string(),
        title: filename
            .trim_end_matches(".mp4")
            .trim_end_matches(".m4v")
            .trim_end_matches(".webm")
            .trim_end_matches(".mov")
            .trim_end_matches(".mkv")
            .trim_end_matches(".avi")
            .trim_end_matches(".mpeg")
            .trim_end_matches(".mpg")
            .trim_end_matches(".ts")
            .trim_end_matches(".flv")
            .trim_end_matches(".3gp")
            .trim_end_matches(".ogv")
            .trim_end_matches(".gif")
            .to_owned(),
        filename: filename.clone(),
        created_at: now_iso(),
        duration_secs: 0.0,
        file_size_bytes: 0,
        source: meta.source,
        quality: meta.quality,
        has_microphone: meta.has_microphone,
        has_system_audio: meta.has_system_audio,
        target_label: meta.target_label,
        starred: false,
        tags: vec![],
        folder: String::new(),
        notes: String::new(),
    };

    // Marker lets us offer recovery if the app dies mid-recording.
    let marker = partial_marker_for(&path);
    if let Ok(json) = serde_json::to_string_pretty(&meta_template) {
        let _ = fs::write(&marker, json);
    }
    let write_dir = path.parent().map(Path::to_path_buf).unwrap_or(dir);

    let mut sm = state.lock().unwrap();
    let id = sm.next_id;
    sm.next_id += 1;
    sm.map.insert(
        id,
        Session {
            write: Arc::new(Mutex::new(SessionWriter {
                writer,
                bytes_written: 0,
                dir: write_dir,
                since_check: None,
            })),
            path,
            marker,
            started_at: Instant::now(),
            meta_template,
        },
    );
    Ok(id)
}

#[tauri::command]
pub(crate) fn write_chunk(
    app: tauri::AppHandle,
    state: tauri::State<Sessions>,
    session_id: u32,
    data: Vec<u8>,
) -> Result<u64, String> {
    // Take Arc under a short map lock, then write without holding the map.
    let write = {
        let sm = state.lock().unwrap();
        sm.map
            .get(&session_id)
            .map(|s| Arc::clone(&s.write))
            .ok_or_else(|| format!("No session {session_id}"))?
    };

    let mut w = write.lock().unwrap();

    // Free-space guard: first chunk, then every ~8 MiB.
    let due = match w.since_check {
        None => true,
        Some(n) => n >= DISK_CHECK_INTERVAL,
    };
    if due {
        let min_mb = load_config(&app)
            .ok()
            .and_then(|c| c.disk_space_min_mb)
            .unwrap_or(DEFAULT_DISK_MIN_MB);
        let available = available_space_bytes(&w.dir).map(|(avail, _)| avail);
        if !has_enough_space(available, min_mb, data.len() as u64) {
            let _ = w.writer.flush();
            let locale = tauri::Manager::state::<crate::i18n::LocaleState>(&app);
            let msg = crate::i18n::current_strings(&*locale).err_disk_low;
            return Err(format!("{msg} (<{min_mb} MB)"));
        }
        w.since_check = Some(0);
    }

    w.writer
        .write_all(&data)
        .map_err(|e| format!("Write error: {e}"))?;
    w.bytes_written += data.len() as u64;
    if let Some(n) = w.since_check.as_mut() {
        *n += data.len() as u64;
    }
    Ok(w.bytes_written)
}

#[tauri::command]
pub(crate) fn close_session(
    app: tauri::AppHandle,
    state: tauri::State<Sessions>,
    session_id: u32,
) -> Result<RecordingMeta, String> {
    let session = {
        let mut sm = state.lock().unwrap();
        sm.map
            .remove(&session_id)
            .ok_or_else(|| format!("No session {session_id}"))?
    };

    {
        let mut w = session.write.lock().unwrap();
        w.writer.flush().map_err(|e| format!("Flush error: {e}"))?;
    }
    // Drop Arc so the file handle closes before finalize.
    drop(session.write);

    let wall_duration_secs = session.started_at.elapsed().as_secs_f64();
    let finalized = crate::finalize::finalize_recording(&session.path, wall_duration_secs);

    let mut meta = session.meta_template;
    meta.duration_secs = finalized.duration_secs;
    meta.file_size_bytes = finalized.file_size_bytes;

    // Write sidecar JSON
    let meta_path = meta_path_for(&session.path);
    let json = serde_json::to_string_pretty(&meta).map_err(|e| format!("Serialise error: {e}"))?;
    fs::write(&meta_path, json).map_err(|e| format!("Cannot write sidecar: {e}"))?;
    let _ = fs::remove_file(&session.marker);

    if load_config(&app)
        .ok()
        .and_then(|c| c.auto_optimize_after_record)
        .unwrap_or(false)
    {
        crate::finalize::spawn_auto_optimize(app, session.path.clone(), meta.id.clone());
    }

    Ok(meta)
}

#[tauri::command]
pub(crate) fn cancel_session(state: tauri::State<Sessions>, session_id: u32) -> Result<(), String> {
    let session = {
        let mut sm = state.lock().unwrap();
        sm.map.remove(&session_id)
    };
    if let Some(session) = session {
        drop(session.write);
        let _ = fs::remove_file(&session.path);
        let _ = fs::remove_file(&session.marker);
    }
    Ok(())
}

// ── Incomplete (crashed / force-quit) sessions ──────────────────────────────

#[derive(Debug, Serialize)]
pub struct IncompleteSession {
    /// Absolute path of the partial video.
    pub path: String,
    /// Library-relative filename (pass this to recover / discard).
    pub filename: String,
    pub size_bytes: u64,
}

fn active_paths(state: &Sessions) -> Vec<PathBuf> {
    state
        .lock()
        .map(|sm| sm.map.values().map(|s| s.path.clone()).collect())
        .unwrap_or_default()
}

/// Recordings that have a `.bloom.partial` marker but no live session.
#[tauri::command]
pub(crate) fn list_incomplete_sessions(
    app: tauri::AppHandle,
    state: tauri::State<Sessions>,
) -> Result<Vec<IncompleteSession>, String> {
    let root = bloom_dir(&app)?;
    let active = active_paths(&state);
    let mut out = Vec::new();

    for marker in walk_files(&root) {
        let Some(name) = marker.to_str() else { continue };
        let Some(video_str) = name.strip_suffix(PARTIAL_SUFFIX) else { continue };
        let video = PathBuf::from(video_str);
        if active.contains(&video) {
            continue;
        }
        if !video.is_file() {
            let _ = fs::remove_file(&marker); // stale marker
            continue;
        }
        out.push(IncompleteSession {
            path: video.to_string_lossy().into_owned(),
            filename: relative_filename(&root, &video),
            size_bytes: fs::metadata(&video).map(|m| m.len()).unwrap_or(0),
        });
    }
    out.sort_by(|a, b| a.filename.cmp(&b.filename));
    Ok(out)
}

fn incomplete_target(
    app: &tauri::AppHandle,
    state: &Sessions,
    filename: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let root = bloom_dir(app)?;
    let video = safe_join(&root, filename)?;
    if active_paths(state).contains(&video) {
        return Err("Recording is still in progress".into());
    }
    let marker = partial_marker_for(&video);
    Ok((video, marker))
}

/// Finalise a partial recording: probe/faststart/thumbnail, write the sidecar,
/// clear the marker and return the new metadata.
#[tauri::command]
pub(crate) fn recover_incomplete_session(
    app: tauri::AppHandle,
    state: tauri::State<Sessions>,
    filename: String,
) -> Result<RecordingMeta, String> {
    let (video, marker) = incomplete_target(&app, &state, &filename)?;
    let size = fs::metadata(&video).map(|m| m.len()).unwrap_or(0);
    if size == 0 {
        let _ = fs::remove_file(&video);
        let _ = fs::remove_file(&marker);
        return Err("Partial recording is empty".into());
    }

    let mut meta: RecordingMeta = fs::read_to_string(&marker)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_else(|| RecordingMeta {
            id: Uuid::new_v4().to_string(),
            title: video
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("recovered")
                .to_owned(),
            filename: filename.clone(),
            created_at: now_iso(),
            duration_secs: 0.0,
            file_size_bytes: 0,
            source: "screen".into(),
            quality: "—".into(),
            has_microphone: false,
            has_system_audio: false,
            target_label: "Recovered".into(),
            starred: false,
            tags: vec![],
            folder: String::new(),
            notes: String::new(),
        });
    meta.filename = filename;

    let finalized = crate::finalize::finalize_recording(&video, meta.duration_secs);
    meta.duration_secs = finalized.duration_secs;
    meta.file_size_bytes = finalized.file_size_bytes;

    let json = serde_json::to_string_pretty(&meta).map_err(|e| format!("Serialise error: {e}"))?;
    fs::write(meta_path_for(&video), json).map_err(|e| format!("Cannot write sidecar: {e}"))?;
    let _ = fs::remove_file(&marker);
    Ok(meta)
}

/// Delete a partial recording and its marker.
#[tauri::command]
pub(crate) fn discard_incomplete_session(
    app: tauri::AppHandle,
    state: tauri::State<Sessions>,
    filename: String,
) -> Result<(), String> {
    let (video, marker) = incomplete_target(&app, &state, &filename)?;
    let _ = fs::remove_file(&video);
    let _ = fs::remove_file(&marker);
    let _ = fs::remove_file(meta_path_for(&video));
    for extra in crate::video::companion_paths(&video) {
        let _ = fs::remove_file(extra);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marker_is_sibling_with_suffix() {
        assert_eq!(
            partial_marker_for(Path::new("/lib/a/clip.mp4")),
            PathBuf::from("/lib/a/clip.mp4.bloom.partial")
        );
    }

    #[test]
    fn space_check_respects_minimum() {
        assert!(has_enough_space(None, 200, 1024));
        assert!(has_enough_space(Some(500 * MIB), 200, MIB));
        assert!(!has_enough_space(Some(150 * MIB), 200, MIB));
        assert!(!has_enough_space(Some(200 * MIB), 200, MIB));
    }

    #[test]
    fn safe_join_rejects_traversal() {
        let root = Path::new("/lib");
        assert_eq!(safe_join(root, "a/b.mp4").unwrap(), PathBuf::from("/lib/a/b.mp4"));
        assert!(safe_join(root, "../x.mp4").is_err());
        assert!(safe_join(root, "/etc/passwd").is_err());
        assert!(safe_join(root, "").is_err());
    }
}
