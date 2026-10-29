//! Global cursor position polling for the spotlight overlay, plus a click
//! tracker that logs mouse presses to `<video>.clicks.jsonl`.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use device_query::{DeviceQuery, DeviceState};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
pub struct CursorPos {
    pub x: i32,
    pub y: i32,
}

pub struct CursorTracker {
    running: Arc<AtomicBool>,
}

impl Default for CursorTracker {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[tauri::command]
pub fn start_cursor_tracker(state: tauri::State<CursorTracker>, app: AppHandle) -> Result<(), String> {
    if state.running.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    let running = state.running.clone();
    let flag = state.running.clone();
    std::thread::spawn(move || {
        let device_state = DeviceState::new();
        while running.load(Ordering::SeqCst) {
            let (x, y) = device_state.get_mouse().coords;
            let _ = app.emit("cursor-pos", CursorPos { x, y });
            std::thread::sleep(Duration::from_millis(16));
        }
        flag.store(false, Ordering::SeqCst);
    });

    Ok(())
}

#[tauri::command]
pub fn stop_cursor_tracker(state: tauri::State<CursorTracker>) -> Result<(), String> {
    state.running.store(false, Ordering::SeqCst);
    Ok(())
}

// ── Click tracker ───────────────────────────────────────────────────────────

/// Where the click track for `target` lives: `<video>.clicks.jsonl` next to the
/// video. `target` may be absolute or relative to the library, and may already
/// be a `.jsonl` path.
pub(crate) fn clicks_path_for(base: &std::path::Path, target: &str) -> PathBuf {
    let p = PathBuf::from(target);
    let abs = if p.is_absolute() { p } else { base.join(p) };
    if abs
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("jsonl"))
        .unwrap_or(false)
    {
        abs
    } else {
        abs.with_extension("clicks.jsonl")
    }
}

/// One JSONL line for a click.
pub(crate) fn click_line(t: f64, x: i32, y: i32) -> String {
    format!("{{\"t\":{t:.3},\"x\":{x},\"y\":{y}}}\n")
}

#[derive(Default)]
pub struct ClickTracker {
    running: Arc<AtomicBool>,
    generation: Arc<AtomicU64>,
    count: Arc<AtomicU32>,
    path: Mutex<Option<PathBuf>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClickTrackSummary {
    pub path: String,
    pub count: u32,
}

/// Start logging mouse-button presses. `session_path` is the video's path
/// (absolute, or relative to the library folder); the log is written next to it
/// as `<name>.clicks.jsonl`, one `{"t":secs_since_start,"x":..,"y":..}` per click.
#[tauri::command]
pub fn start_click_tracker(
    state: tauri::State<ClickTracker>,
    app: AppHandle,
    session_path: String,
) -> Result<String, String> {
    let base = crate::bloom_dir(&app)?;
    let path = clicks_path_for(&base, &session_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&path)
        .map_err(|e| format!("Cannot create {}: {e}", path.display()))?;

    // Supersede any previous tracker thread.
    let gen = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    state.running.store(true, Ordering::SeqCst);
    state.count.store(0, Ordering::SeqCst);
    if let Ok(mut p) = state.path.lock() {
        *p = Some(path.clone());
    }

    let running = state.running.clone();
    let generation = state.generation.clone();
    let count = state.count.clone();
    std::thread::spawn(move || {
        let device_state = DeviceState::new();
        let started = Instant::now();
        let mut was_down = false;
        while running.load(Ordering::SeqCst) && generation.load(Ordering::SeqCst) == gen {
            let mouse = device_state.get_mouse();
            // Button indices: 1 = left, 2 = right, 3 = middle.
            let down = mouse.button_pressed.iter().skip(1).take(3).any(|b| *b);
            if down && !was_down {
                let (x, y) = mouse.coords;
                let line = click_line(started.elapsed().as_secs_f64(), x, y);
                if file.write_all(line.as_bytes()).is_ok() {
                    let _ = file.flush();
                    count.fetch_add(1, Ordering::SeqCst);
                }
            }
            was_down = down;
            std::thread::sleep(Duration::from_millis(8));
        }
    });

    Ok(path.to_string_lossy().into_owned())
}

/// Stop logging; returns the click-track path + count (None if never started).
#[tauri::command]
pub fn stop_click_tracker(state: tauri::State<ClickTracker>) -> Result<Option<ClickTrackSummary>, String> {
    state.running.store(false, Ordering::SeqCst);
    let path = state.path.lock().map_err(|e| e.to_string())?.take();
    let count = state.count.load(Ordering::SeqCst);
    Ok(path.map(|p| {
        if count == 0 {
            // Nothing recorded — don't leave an empty file next to the video.
            let _ = std::fs::remove_file(&p);
        }
        ClickTrackSummary {
            path: p.to_string_lossy().into_owned(),
            count,
        }
    }))
}

#[derive(Debug, Clone, Serialize)]
pub struct ClickPoint {
    pub t: f64,
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickTrackInfo {
    pub path: String,
    pub count: u32,
    pub clicks: Vec<ClickPoint>,
}

fn parse_clicks_file(path: &std::path::Path) -> Vec<ClickPoint> {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    raw.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let v: serde_json::Value = serde_json::from_str(line).ok()?;
            Some(ClickPoint {
                t: v.get("t")?.as_f64()?,
                x: v.get("x")?.as_i64()? as i32,
                y: v.get("y")?.as_i64()? as i32,
            })
        })
        .collect()
}

/// Load click track for a recording id (None if no `.clicks.jsonl`).
#[tauri::command]
pub fn get_click_track(
    app: AppHandle,
    id: String,
) -> Result<Option<ClickTrackInfo>, String> {
    let dir = crate::bloom_dir(&app)?;
    let entry = crate::find_recording(&dir, &id)
        .ok_or_else(|| format!("Recording {id} not found"))?;
    let path = clicks_path_for(&dir, &entry.path);
    if !path.is_file() {
        return Ok(None);
    }
    let clicks = parse_clicks_file(&path);
    if clicks.is_empty() {
        return Ok(None);
    }
    Ok(Some(ClickTrackInfo {
        path: path.to_string_lossy().into_owned(),
        count: clicks.len() as u32,
        clicks,
    }))
}

/// True when a non-empty click track exists next to the recording.
#[tauri::command]
pub fn has_click_track(app: AppHandle, id: String) -> Result<bool, String> {
    Ok(get_click_track(app, id)?.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn clicks_path_next_to_video() {
        let base = Path::new("/lib");
        assert_eq!(clicks_path_for(base, "rec.mp4"), PathBuf::from("/lib/rec.clicks.jsonl"));
        assert_eq!(clicks_path_for(base, "/x/y/rec.webm"), PathBuf::from("/x/y/rec.clicks.jsonl"));
        assert_eq!(clicks_path_for(base, "/x/rec.clicks.jsonl"), PathBuf::from("/x/rec.clicks.jsonl"));
    }

    #[test]
    fn click_line_is_valid_json() {
        let v: serde_json::Value = serde_json::from_str(click_line(1.23456, 10, -5).trim()).unwrap();
        assert_eq!(v["x"], 10);
        assert_eq!(v["y"], -5);
        assert!((v["t"].as_f64().unwrap() - 1.235).abs() < 1e-9);
    }
}
