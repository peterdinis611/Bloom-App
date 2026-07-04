//! Global cursor position polling for the spotlight overlay.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

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
