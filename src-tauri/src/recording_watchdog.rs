//! Enforce max-duration / idle-stop even when the main window is minimized
//! and recording is driven from the tray / HUD.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use device_query::{DeviceQuery, DeviceState};
use tauri::{AppHandle, Emitter, Manager};

use crate::config::{self, RecordingLimitsConfig};
use crate::tray::RecordingTrayState;

/// Shared flag so only one watchdog thread runs.
#[derive(Default)]
pub struct WatchdogControl {
    pub running: AtomicBool,
    /// Wall-clock start of the active recording (ms since epoch-ish via Instant in thread).
    pub generation: AtomicU64,
}

#[derive(Clone, serde::Serialize)]
pub struct RecordingAutoStopEvent {
    pub reason: String, // "max_duration" | "idle"
}

fn limits(app: &AppHandle) -> RecordingLimitsConfig {
    config::load_config(app)
        .ok()
        .and_then(|c| c.recording_limits)
        .unwrap_or_default()
}

/// Call whenever tray recording state flips to active — starts a watchdog if needed.
pub(crate) fn ensure_watchdog(app: &AppHandle) {
    let ctrl = match app.try_state::<WatchdogControl>() {
        Some(c) => c,
        None => return,
    };
    let gen = ctrl.generation.fetch_add(1, Ordering::Relaxed) + 1;
    if ctrl.running.swap(true, Ordering::SeqCst) {
        // Already running — generation bump is enough for the loop to reset.
        return;
    }

    let app = app.clone();
    let ctrl_flag = Arc::new(AtomicBool::new(true));
    // Keep local flag in sync with managed state.
    let _ = ctrl_flag;

    std::thread::spawn(move || {
        let device = DeviceState::new();
        let mut last_activity = Instant::now();
        let mut last_mouse = device.get_mouse().coords;
        let mut last_keys = device.get_keys();
        let mut started_at = Instant::now();
        let mut seen_gen = gen;

        loop {
            let ctrl = match app.try_state::<WatchdogControl>() {
                Some(c) => c,
                None => break,
            };
            let cur_gen = ctrl.generation.load(Ordering::Relaxed);
            if cur_gen != seen_gen {
                seen_gen = cur_gen;
                started_at = Instant::now();
                last_activity = Instant::now();
            }

            let tray = app
                .try_state::<RecordingTrayState>()
                .and_then(|st| st.0.lock().ok().map(|g| *g))
                .unwrap_or_default();

            if !tray.active || tray.paused {
                // Sleep while inactive; exit if still idle for a while with no re-arm.
                std::thread::sleep(Duration::from_millis(400));
                let still = app
                    .try_state::<RecordingTrayState>()
                    .and_then(|st| st.0.lock().ok().map(|g| g.active))
                    .unwrap_or(false);
                if !still {
                    // Wait a bit more in case of brief gaps, then stop thread.
                    std::thread::sleep(Duration::from_secs(2));
                    let again = app
                        .try_state::<RecordingTrayState>()
                        .and_then(|st| st.0.lock().ok().map(|g| g.active))
                        .unwrap_or(false);
                    if !again {
                        ctrl.running.store(false, Ordering::SeqCst);
                        break;
                    }
                }
                continue;
            }

            let lim = limits(&app);
            let mouse = device.get_mouse().coords;
            let keys = device.get_keys();
            if mouse != last_mouse || keys != last_keys {
                last_activity = Instant::now();
                last_mouse = mouse;
                last_keys = keys;
            }

            let elapsed = started_at.elapsed().as_secs();
            if lim.max_duration_secs > 0 && elapsed >= lim.max_duration_secs {
                let _ = app.emit(
                    "recording-auto-stop",
                    RecordingAutoStopEvent {
                        reason: "max_duration".into(),
                    },
                );
                // Soft reset start so we don't spam; FE should stop recording.
                started_at = Instant::now();
            } else if lim.idle_stop_secs > 0
                && last_activity.elapsed().as_secs() >= lim.idle_stop_secs
            {
                let _ = app.emit(
                    "recording-auto-stop",
                    RecordingAutoStopEvent {
                        reason: "idle".into(),
                    },
                );
                last_activity = Instant::now();
            }

            std::thread::sleep(Duration::from_millis(500));
        }
    });
}
