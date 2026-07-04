//! Shared filesystem paths, recording discovery and time helpers.

use std::{
    fs,
    path::{Path, PathBuf},
};

use tauri::Manager;

use crate::types::{RecordingEntry, RecordingMeta};

// ── Bloom directory ─────────────────────────────────────────────────────────

/// Returns (creating if needed) the platform Bloom directory:
/// `~/Movies/Bloom` on macOS, `~/Videos/Bloom` elsewhere.
pub(crate) fn bloom_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    let dir = home.join("Movies").join("Bloom");

    #[cfg(not(target_os = "macos"))]
    let dir = home.join("Videos").join("Bloom");

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// The `.bloom.json` sidecar path for a given video file.
pub(crate) fn meta_path_for(video_path: &Path) -> PathBuf {
    video_path.with_extension("bloom.json")
}

/// Recursively sum file sizes inside `dir`.
pub(crate) fn dir_size(dir: &Path) -> u64 {
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

// ── Recording discovery ─────────────────────────────────────────────────────

/// Load every recording (sidecar + video) in `dir`, newest first.
pub(crate) fn load_all_recordings(dir: &Path) -> Vec<RecordingEntry> {
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

/// Find a single recording by its UUID.
pub(crate) fn find_recording(dir: &Path, id: &str) -> Option<RecordingEntry> {
    load_all_recordings(dir).into_iter().find(|r| r.meta.id == id)
}

// ── Time (minimal ISO-8601 UTC, no chrono dependency) ───────────────────────

pub(crate) fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
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
        if rem < dy {
            break;
        }
        rem -= dy;
        year += 1;
    }
    let months = [
        31u64,
        if is_leap(year) { 29 } else { 28 },
        31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ];
    let mut month = 1u64;
    for &dm in &months {
        if rem < dm {
            break;
        }
        rem -= dm;
        month += 1;
    }
    (year, month, rem + 1, h, mi, s)
}

fn is_leap(y: u64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

// ────────────────────────────────────────────────────────────────────────────
// Tests — see src/__tests__/util_tests.rs
// ────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
#[path = "__tests__/util_tests.rs"]
mod tests;
