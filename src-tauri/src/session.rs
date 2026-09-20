//! Streaming recording session: one open file per active recording, fed by
//! binary chunks from the frontend's MediaRecorder.

use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{BufWriter, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Instant,
};

use uuid::Uuid;

use crate::types::{RecordingMeta, SessionMeta};
use crate::util::{bloom_dir, meta_path_for, now_iso};

/// Writer state held behind its own mutex so chunk I/O does not block the
/// session map (open/close/cancel of other sessions).
struct SessionWriter {
    writer: BufWriter<File>,
    bytes_written: u64,
}

struct Session {
    write: Arc<Mutex<SessionWriter>>,
    path: PathBuf,
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
    let path = dir.join(&filename);
    let path_str = path.to_string_lossy().into_owned();

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
        starred: false,
        tags: vec![],
        folder: String::new(),
        notes: String::new(),
    };

    let mut sm = state.lock().unwrap();
    let id = sm.next_id;
    sm.next_id += 1;
    sm.map.insert(
        id,
        Session {
            write: Arc::new(Mutex::new(SessionWriter {
                writer,
                bytes_written: 0,
            })),
            path,
            started_at: Instant::now(),
            meta_template,
        },
    );
    Ok(id)
}

#[tauri::command]
pub(crate) fn write_chunk(
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
    w.writer
        .write_all(&data)
        .map_err(|e| format!("Write error: {e}"))?;
    w.bytes_written += data.len() as u64;
    Ok(w.bytes_written)
}

#[tauri::command]
pub(crate) fn close_session(
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
    }
    Ok(())
}
