//! Shared filesystem paths, recording discovery and time helpers.

use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::config;
use crate::types::{RecordingEntry, RecordingMeta};

// ── Bloom directory ─────────────────────────────────────────────────────────

/// Returns (creating if needed) the Bloom library directory.
/// Uses a custom path from config when set, otherwise the platform default.
pub(crate) fn bloom_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(cfg) = config::load_config(app) {
        if let Some(custom) = cfg.library_dir {
            let path = PathBuf::from(&custom);
            if path.is_absolute() {
                fs::create_dir_all(&path).map_err(|e| e.to_string())?;
                return Ok(path);
            }
        }
    }

    let dir = config::default_bloom_dir(app)?;
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

/// True for dot-files / dot-directories (skipped by every library walk).
pub(crate) fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.'))
        .unwrap_or(false)
}

/// True when `path` looks like a `*.bloom.json` sidecar.
pub(crate) fn is_sidecar_path(path: &Path) -> bool {
    path.extension()
        .and_then(|x| x.to_str())
        .map(|x| x == "json")
        .unwrap_or(false)
        && path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.ends_with(".bloom"))
            .unwrap_or(false)
}

/// Recursively collect every file under `dir` (skipping hidden entries).
pub(crate) fn walk_files(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    walk_files_into(dir, &mut out);
    out
}

fn walk_files_into(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for e in entries.filter_map(|e| e.ok()) {
        let p = e.path();
        if is_hidden(&p) {
            continue;
        }
        if p.is_dir() {
            walk_files_into(&p, out);
        } else {
            out.push(p);
        }
    }
}

/// Resolve the video file for a sidecar. `meta.filename` is relative to the
/// library root (e.g. `folder/file.mp4`); falls back to the sidecar's own
/// directory when the file was moved by hand.
pub(crate) fn resolve_video_path(root: &Path, sidecar: &Path, filename: &str) -> PathBuf {
    let primary = root.join(filename);
    if primary.exists() {
        return primary;
    }
    if let (Some(parent), Some(name)) = (sidecar.parent(), Path::new(filename).file_name()) {
        let sibling = parent.join(name);
        if sibling.exists() {
            return sibling;
        }
    }
    primary
}

fn read_entry(root: &Path, meta_path: &Path) -> Option<RecordingEntry> {
    let raw = fs::read_to_string(meta_path).ok()?;
    let meta: RecordingMeta = serde_json::from_str(&raw).ok()?;
    let video_path = resolve_video_path(root, meta_path, &meta.filename);
    Some(RecordingEntry {
        meta,
        path: video_path.to_string_lossy().into_owned(),
        meta_path: meta_path.to_string_lossy().into_owned(),
    })
}

/// Load every recording (sidecar + video) under `dir` (recursive), newest first.
pub(crate) fn load_all_recordings(dir: &Path) -> Vec<RecordingEntry> {
    let mut recordings: Vec<RecordingEntry> = walk_files(dir)
        .into_iter()
        .filter(|p| is_sidecar_path(p))
        .filter_map(|p| read_entry(dir, &p))
        .collect();

    // Newest first
    recordings.sort_by(|a, b| b.meta.created_at.cmp(&a.meta.created_at));
    recordings
}

/// Find a single recording by its UUID without loading/sorting the full library.
pub(crate) fn find_recording(dir: &Path, id: &str) -> Option<RecordingEntry> {
    for meta_path in walk_files(dir).into_iter().filter(|p| is_sidecar_path(p)) {
        let Ok(raw) = fs::read_to_string(&meta_path) else {
            continue;
        };
        // Cheap reject before JSON parse — id is a UUID in the sidecar.
        if !raw.contains(id) {
            continue;
        }
        let Ok(meta) = serde_json::from_str::<RecordingMeta>(&raw) else {
            continue;
        };
        if meta.id != id {
            continue;
        }
        let video_path = resolve_video_path(dir, &meta_path, &meta.filename);
        return Some(RecordingEntry {
            meta,
            path: video_path.to_string_lossy().into_owned(),
            meta_path: meta_path.to_string_lossy().into_owned(),
        });
    }
    None
}

// ── Folder / relative path helpers ──────────────────────────────────────────

/// Make a user-supplied folder name safe: each `/`-separated segment keeps
/// alphanumerics (unicode ok), space, `-`, `_`, `.`; hidden / `..` segments are dropped.
/// Empty result means "library root".
pub(crate) fn sanitize_folder_name(name: &str) -> String {
    name.split(['/', '\\'])
        .filter_map(|seg| {
            let cleaned: String = seg
                .chars()
                .map(|c| {
                    if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' || c == '.' {
                        c
                    } else {
                        '-'
                    }
                })
                .collect();
            let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
            let cleaned = cleaned.trim_matches('.').trim().to_string();
            if cleaned.is_empty() {
                None
            } else {
                Some(cleaned)
            }
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// `path` relative to `root`, using `/` separators (what `meta.filename` stores).
pub(crate) fn relative_filename(root: &Path, path: &Path) -> String {
    let rel = path.strip_prefix(root).unwrap_or(path);
    rel.components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

/// Rename, falling back to copy + delete (cross-device moves).
pub(crate) fn move_file(src: &Path, dst: &Path) -> Result<(), String> {
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if fs::rename(src, dst).is_ok() {
        return Ok(());
    }
    fs::copy(src, dst).map_err(|e| format!("Cannot copy {}: {e}", src.display()))?;
    fs::remove_file(src).map_err(|e| format!("Cannot remove {}: {e}", src.display()))
}

/// First non-existing `dir/stem.ext`, `dir/stem-2.ext`, …
pub(crate) fn unique_path(dir: &Path, file_name: &str) -> PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let p = Path::new(file_name);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = p.extension().and_then(|s| s.to_str());
    let mut n = 2;
    loop {
        let name = match ext {
            Some(e) => format!("{stem}-{n}.{e}"),
            None => format!("{stem}-{n}"),
        };
        let c = dir.join(name);
        if !c.exists() {
            return c;
        }
        n += 1;
    }
}

// ── Time (minimal ISO-8601 UTC, no chrono dependency) ───────────────────────

pub(crate) fn now_iso() -> String {
    iso_from_system_time(std::time::SystemTime::now())
}

pub(crate) fn iso_from_system_time(t: std::time::SystemTime) -> String {
    use std::time::UNIX_EPOCH;
    let secs = t
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
