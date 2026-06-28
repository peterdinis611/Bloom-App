use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{BufWriter, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::Manager;

// ── Bloom directory helper ────────────────────────────────────────────────────

fn bloom_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    let dir = home.join("Movies").join("Bloom");

    #[cfg(not(target_os = "macos"))]
    let dir = home.join("Videos").join("Bloom");

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

// ── Recording session ─────────────────────────────────────────────────────────

struct Session {
    writer: BufWriter<File>,
    path: String,
    bytes_written: u64,
}

#[derive(Default)]
struct SessionMap {
    map: HashMap<u32, Session>,
    next_id: u32,
}

type Sessions = Arc<Mutex<SessionMap>>;

// ── Commands ──────────────────────────────────────────────────────────────────

/// Returns (and creates if needed) the ~/Movies/Bloom path.
#[tauri::command]
fn get_bloom_dir(app: tauri::AppHandle) -> Result<String, String> {
    bloom_dir(&app).map(|p| p.to_string_lossy().into_owned())
}

/// Opens a new recording file and returns a session ID.
/// Subsequent chunks should be sent with `write_chunk(session_id, data)`.
#[tauri::command]
fn open_session(
    state: tauri::State<Sessions>,
    app: tauri::AppHandle,
    filename: String,
) -> Result<u32, String> {
    let dir = bloom_dir(&app)?;
    let path = dir.join(&filename);
    let path_str = path.to_string_lossy().into_owned();

    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&path)
        .map_err(|e| format!("Cannot create file {path_str}: {e}"))?;

    // BufWriter with 256 KB buffer – amortises syscalls for small chunks
    let writer = BufWriter::with_capacity(256 * 1024, file);

    let mut sm = state.lock().unwrap();
    let id = sm.next_id;
    sm.next_id += 1;
    sm.map.insert(id, Session { writer, path: path_str, bytes_written: 0 });

    Ok(id)
}

/// Appends a raw binary chunk to an open recording session.
/// `data` is a `number[]` / `Uint8Array` in JS → `Vec<u8>` in Rust.
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
        .ok_or_else(|| format!("No active session {session_id}"))?;

    session
        .writer
        .write_all(&data)
        .map_err(|e| format!("Write error: {e}"))?;

    session.bytes_written += data.len() as u64;
    Ok(session.bytes_written)
}

/// Flushes and closes the session.
/// Returns the absolute path to the saved file.
#[tauri::command]
fn close_session(
    state: tauri::State<Sessions>,
    session_id: u32,
) -> Result<String, String> {
    let mut sm = state.lock().unwrap();
    let mut session = sm
        .map
        .remove(&session_id)
        .ok_or_else(|| format!("No session {session_id}"))?;

    session
        .writer
        .flush()
        .map_err(|e| format!("Flush error: {e}"))?;

    Ok(session.path)
}

/// Cancels and deletes an in-progress session file.
#[tauri::command]
fn cancel_session(
    state: tauri::State<Sessions>,
    session_id: u32,
) -> Result<(), String> {
    let mut sm = state.lock().unwrap();
    if let Some(session) = sm.map.remove(&session_id) {
        drop(session.writer); // close file handle first
        let _ = fs::remove_file(&session.path);
    }
    Ok(())
}

// ── App entry ────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Sessions::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_bloom_dir,
            open_session,
            write_chunk,
            close_session,
            cancel_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Bloom");
}
