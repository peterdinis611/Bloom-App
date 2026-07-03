/*!
 * Bloom – Rust backend
 *
 * Commands exposed to the frontend:
 *
 *  Directory / setup
 *    get_bloom_dir()          -> String (path)
 *    get_disk_space()         -> DiskInfo
 *
 *  Streaming session (one per active recording)
 *    open_session(filename, meta)    -> u32 (session_id)
 *    write_chunk(session_id, data)   -> u64 (total bytes written so far)
 *    close_session(session_id)       -> RecordingMeta (finalised)
 *    cancel_session(session_id)      -> ()
 *
 *  Library
 *    list_recordings()               -> Vec<RecordingEntry>
 *    get_library_stats()             -> LibraryStats
 *
 *  Recording management
 *    delete_recording(id)            -> ()
 *    rename_recording(id, new_title) -> ()
 *    get_recording(id)               -> RecordingEntry
 *    validate_recording(id)          -> ValidationResult
 *    reveal_in_finder(path)          -> ()
 */

use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Instant,
};

use serde::{Deserialize, Serialize};
use tauri::Manager;
use uuid::Uuid;

mod video;

// ────────────────────────────────────────────────────────────────────────────
// Bloom directory helpers
// ────────────────────────────────────────────────────────────────────────────

pub(crate) fn bloom_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    let dir = home.join("Movies").join("Bloom");

    #[cfg(not(target_os = "macos"))]
    let dir = home.join("Videos").join("Bloom");

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub(crate) fn meta_path_for(video_path: &Path) -> PathBuf {
    video_path.with_extension("bloom.json")
}

// ────────────────────────────────────────────────────────────────────────────
// Data types  (all Serialize so Tauri can return them to JS)
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingMeta {
    pub id: String,
    pub title: String,
    pub filename: String,
    pub created_at: String,      // ISO-8601
    pub duration_secs: f64,
    pub file_size_bytes: u64,
    pub source: String,          // "screen" | "camera" | "both"
    pub quality: String,         // "720p" | "1080p"
    pub has_microphone: bool,
    pub has_system_audio: bool,
    pub target_label: String,    // "Built-in Retina Display", "Google Chrome", …
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

// ────────────────────────────────────────────────────────────────────────────
// Streaming session
// ────────────────────────────────────────────────────────────────────────────

struct Session {
    writer: BufWriter<File>,
    path: PathBuf,
    started_at: Instant,
    bytes_written: u64,
    meta_template: RecordingMeta, // filled in at close_session
}

#[derive(Default)]
struct SessionMap {
    map: HashMap<u32, Session>,
    next_id: u32,
}

type Sessions = Arc<Mutex<SessionMap>>;

// ────────────────────────────────────────────────────────────────────────────
// Disk space (cross-platform)
// ────────────────────────────────────────────────────────────────────────────

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
    use std::os::windows::ffi::OsStrExt;
    use std::ffi::OsStr;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let wide: Vec<u16> = OsStr::new(path).encode_wide().chain(Some(0)).collect();
    let mut avail: u64 = 0;
    let mut total: u64 = 0;
    let mut free:  u64 = 0;
    let ok = unsafe {
        GetDiskFreeSpaceExW(wide.as_ptr(), &mut avail, &mut total, &mut free)
    };
    if ok == 0 { None } else { Some((avail, total)) }
}

#[cfg(not(any(unix, windows)))]
fn available_space_bytes(_path: &Path) -> Option<(u64, u64)> {
    None
}

/// Recursively sum file sizes inside `dir`.
fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(dir) else { return 0 };
    entries
        .filter_map(|e| e.ok())
        .map(|e| {
            let p = e.path();
            if p.is_dir() {
                dir_size(&p)
            } else {
                fs::metadata(&p).map(|m| m.len()).unwrap_or(0)
            }
        })
        .sum()
}

// ────────────────────────────────────────────────────────────────────────────
// Library helpers
// ────────────────────────────────────────────────────────────────────────────

fn load_all_recordings(dir: &Path) -> Vec<RecordingEntry> {
    let Ok(entries) = fs::read_dir(dir) else { return vec![] };

    let mut recordings: Vec<RecordingEntry> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| x == "json")
                .unwrap_or(false)
                && e.path()
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .map(|s| s.ends_with(".bloom"))
                    .unwrap_or(false)
        })
        .filter_map(|e| {
            let meta_path = e.path();
            let raw = fs::read_to_string(&meta_path).ok()?;
            let meta: RecordingMeta = serde_json::from_str(&raw).ok()?;
            let video_path = dir.join(&meta.filename);
            Some(RecordingEntry {
                meta,
                path: video_path.to_string_lossy().into_owned(),
                meta_path: meta_path.to_string_lossy().into_owned(),
            })
        })
        .collect();

    // Newest first
    recordings.sort_by(|a, b| b.meta.created_at.cmp(&a.meta.created_at));
    recordings
}

pub(crate) fn find_recording(dir: &Path, id: &str) -> Option<RecordingEntry> {
    load_all_recordings(dir)
        .into_iter()
        .find(|r| r.meta.id == id)
}

pub(crate) fn now_iso() -> String {
    // Use chrono if available; otherwise fall back to SystemTime
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Minimal ISO-8601 UTC (no chrono dep)
    let (y, mo, d, h, mi, s) = epoch_to_utc(secs);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
}

/// Minimal UTC decomposition without external crates.
fn epoch_to_utc(secs: u64) -> (u64, u64, u64, u64, u64, u64) {
    let s = secs % 60;
    let mins = secs / 60;
    let mi = mins % 60;
    let hours = mins / 60;
    let h = hours % 24;
    let days = hours / 24;

    // Days since 1970-01-01
    let mut year = 1970u64;
    let mut rem = days;
    loop {
        let dy = if is_leap(year) { 366 } else { 365 };
        if rem < dy { break; }
        rem -= dy;
        year += 1;
    }
    let months = [31u64, if is_leap(year) { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 1u64;
    for &dm in &months {
        if rem < dm { break; }
        rem -= dm;
        month += 1;
    }
    (year, month, rem + 1, h, mi, s)
}

fn is_leap(y: u64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

// ────────────────────────────────────────────────────────────────────────────
// Tauri commands
// ────────────────────────────────────────────────────────────────────────────

// ── Directory / setup ─────────────────────────────────────────────────────────

#[tauri::command]
fn get_bloom_dir(app: tauri::AppHandle) -> Result<String, String> {
    bloom_dir(&app).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn get_disk_space(app: tauri::AppHandle) -> Result<DiskInfo, String> {
    let dir = bloom_dir(&app)?;
    let (available_bytes, total_bytes) =
        available_space_bytes(&dir).unwrap_or((0, 0));
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
fn list_monitors(app: tauri::AppHandle) -> Result<Vec<MonitorInfo>, String> {
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
            let scale = m.scale_factor();
            let is_primary = primary_pos
                .map(|p| p == *m.position())
                .unwrap_or(i == 0);
            MonitorInfo {
                id: format!("monitor-{i}"),
                name: m.name().cloned().unwrap_or_else(|| format!("Display {}", i + 1)),
                width: ((size.width as f64) / scale).round() as u32,
                height: ((size.height as f64) / scale).round() as u32,
                scale_factor: scale,
                is_primary,
            }
        })
        .collect();

    Ok(list)
}

// ── Streaming session ─────────────────────────────────────────────────────────

#[tauri::command]
fn open_session(
    state: tauri::State<Sessions>,
    app: tauri::AppHandle,
    filename: String,
    meta: SessionMeta,
) -> Result<u32, String> {
    let dir = bloom_dir(&app)?;
    let path = dir.join(&filename);
    let path_str = path.to_string_lossy().into_owned();

    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&path)
        .map_err(|e| format!("Cannot create {path_str}: {e}"))?;

    // 256 KB buffer – amortises many small write() syscalls
    let writer = BufWriter::with_capacity(256 * 1024, file);

    let meta_template = RecordingMeta {
        id: Uuid::new_v4().to_string(),
        title: filename
            .trim_end_matches(".mp4")
            .trim_end_matches(".webm")
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
    };

    let mut sm = state.lock().unwrap();
    let id = sm.next_id;
    sm.next_id += 1;
    sm.map.insert(
        id,
        Session { writer, path, started_at: Instant::now(), bytes_written: 0, meta_template },
    );
    Ok(id)
}

#[tauri::command]
fn write_chunk(
    state: tauri::State<Sessions>,
    session_id: u32,
    data: Vec<u8>,
) -> Result<u64, String> {
    let mut sm = state.lock().unwrap();
    let session = sm
        .map
        .get_mut(&session_id)
        .ok_or_else(|| format!("No session {session_id}"))?;

    session.writer.write_all(&data).map_err(|e| format!("Write error: {e}"))?;
    session.bytes_written += data.len() as u64;
    Ok(session.bytes_written)
}

#[tauri::command]
fn close_session(
    state: tauri::State<Sessions>,
    session_id: u32,
) -> Result<RecordingMeta, String> {
    let mut sm = state.lock().unwrap();
    let mut session = sm
        .map
        .remove(&session_id)
        .ok_or_else(|| format!("No session {session_id}"))?;

    session.writer.flush().map_err(|e| format!("Flush error: {e}"))?;
    drop(session.writer); // close file handle

    let duration_secs = session.started_at.elapsed().as_secs_f64();
    let file_size_bytes = fs::metadata(&session.path)
        .map(|m| m.len())
        .unwrap_or(session.bytes_written);

    let mut meta = session.meta_template;
    meta.duration_secs = duration_secs;
    meta.file_size_bytes = file_size_bytes;

    // Write sidecar JSON
    let meta_path = meta_path_for(&session.path);
    let json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("Serialise error: {e}"))?;
    fs::write(&meta_path, json).map_err(|e| format!("Cannot write sidecar: {e}"))?;

    Ok(meta)
}

#[tauri::command]
fn cancel_session(
    state: tauri::State<Sessions>,
    session_id: u32,
) -> Result<(), String> {
    let mut sm = state.lock().unwrap();
    if let Some(session) = sm.map.remove(&session_id) {
        drop(session.writer);
        let _ = fs::remove_file(&session.path);
    }
    Ok(())
}

// ── Library ───────────────────────────────────────────────────────────────────

#[tauri::command]
fn list_recordings(app: tauri::AppHandle) -> Result<Vec<RecordingEntry>, String> {
    let dir = bloom_dir(&app)?;
    Ok(load_all_recordings(&dir))
}

#[tauri::command]
fn get_library_stats(app: tauri::AppHandle) -> Result<LibraryStats, String> {
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
fn get_recording(app: tauri::AppHandle, id: String) -> Result<RecordingEntry, String> {
    let dir = bloom_dir(&app)?;
    find_recording(&dir, &id).ok_or_else(|| format!("Recording {id} not found"))
}

#[tauri::command]
fn delete_recording(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = bloom_dir(&app)?;
    let entry = find_recording(&dir, &id)
        .ok_or_else(|| format!("Recording {id} not found"))?;

    fs::remove_file(&entry.path).map_err(|e| format!("Cannot delete video: {e}"))?;
    let _ = fs::remove_file(&entry.meta_path); // best-effort
    Ok(())
}

#[tauri::command]
fn rename_recording(app: tauri::AppHandle, id: String, new_title: String) -> Result<RecordingMeta, String> {
    let dir = bloom_dir(&app)?;
    let entry = find_recording(&dir, &id)
        .ok_or_else(|| format!("Recording {id} not found"))?;

    let mut meta = entry.meta;
    meta.title = new_title.trim().to_owned();

    let json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("Serialise error: {e}"))?;
    fs::write(&entry.meta_path, json)
        .map_err(|e| format!("Cannot update sidecar: {e}"))?;

    Ok(meta)
}

#[tauri::command]
fn validate_recording(app: tauri::AppHandle, id: String) -> Result<ValidationResult, String> {
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
    let meta_path  = Path::new(&entry.meta_path);

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

/// Open the file's parent folder in Finder (macOS) / Explorer (Windows) / file-manager (Linux).
#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
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

// ────────────────────────────────────────────────────────────────────────────
// App entry
// ────────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Sessions::default())
        .manage(video::VideoJobs::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // directory
            get_bloom_dir,
            get_disk_space,
            list_monitors,
            // streaming session
            open_session,
            write_chunk,
            close_session,
            cancel_session,
            // library
            list_recordings,
            get_library_stats,
            // management
            get_recording,
            delete_recording,
            rename_recording,
            validate_recording,
            reveal_in_finder,
            // video optimisation
            video::check_ffmpeg,
            video::get_video_info,
            video::get_thumbnail,
            video::optimize_video,
            video::cancel_optimize,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Bloom");
}
