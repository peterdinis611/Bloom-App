//! Library directory watcher — emits `library-changed` (debounced) so the UI
//! can refresh when files are added, removed or renamed outside the app.

use std::path::Path;
use std::sync::{mpsc, Mutex};
use std::time::Duration;

use notify::{recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

const DEBOUNCE: Duration = Duration::from_millis(400);

/// Holds the live watcher; dropping it stops watching.
#[derive(Default)]
pub struct LibraryWatcher(pub Mutex<Option<RecommendedWatcher>>);

/// Ignore in-progress / temporary files so a running recording or export does
/// not spam the UI.
fn is_noise(path: &Path) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    name.starts_with('.')
        || name.ends_with(".bloom.partial")
        || name.contains("bloom-faststart")
        || name.contains("bloom-replace.tmp")
        || name.ends_with(".clicks.jsonl")
}

/// Does this filesystem event warrant a refresh?
pub(crate) fn is_relevant(event: &Event) -> bool {
    if event.paths.iter().all(|p| is_noise(p)) {
        return false;
    }
    match event.kind {
        EventKind::Create(_) | EventKind::Remove(_) => true,
        EventKind::Modify(notify::event::ModifyKind::Name(_)) => true,
        // Data writes: only sidecar edits matter (video bytes change constantly while recording).
        EventKind::Modify(_) => event
            .paths
            .iter()
            .any(|p| p.to_string_lossy().ends_with(".bloom.json")),
        _ => false,
    }
}

fn spawn_watcher(app: &AppHandle) -> Result<RecommendedWatcher, String> {
    let dir = crate::bloom_dir(app)?;
    let (tx, rx) = mpsc::channel::<()>();

    let mut watcher = recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            if is_relevant(&event) {
                let _ = tx.send(());
            }
        }
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(&dir, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // Debounce thread: exits once the watcher (and its sender) is dropped.
    let app = app.clone();
    std::thread::spawn(move || {
        while rx.recv().is_ok() {
            while rx.recv_timeout(DEBOUNCE).is_ok() {}
            let _ = app.emit("library-changed", ());
        }
    });

    Ok(watcher)
}

/// Start (or restart, e.g. after the library directory changed) the watcher.
pub(crate) fn restart_library_watcher(app: &AppHandle) -> Result<(), String> {
    let state = app
        .try_state::<LibraryWatcher>()
        .ok_or_else(|| "LibraryWatcher not managed".to_string())?;
    // Drop the old watcher first so its debounce thread ends.
    if let Ok(mut guard) = state.0.lock() {
        *guard = None;
    }
    let watcher = spawn_watcher(app)?;
    if let Ok(mut guard) = state.0.lock() {
        *guard = Some(watcher);
    }
    Ok(())
}

/// Called from `setup`.
pub(crate) fn start_library_watcher(app: &AppHandle) -> Result<(), String> {
    restart_library_watcher(app)
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, DataChange, ModifyKind};
    use std::path::PathBuf;

    fn ev(kind: EventKind, path: &str) -> Event {
        Event::new(kind).add_path(PathBuf::from(path))
    }

    #[test]
    fn create_video_is_relevant() {
        assert!(is_relevant(&ev(EventKind::Create(CreateKind::File), "/lib/a.mp4")));
    }

    #[test]
    fn video_data_writes_are_ignored() {
        let k = EventKind::Modify(ModifyKind::Data(DataChange::Any));
        assert!(!is_relevant(&ev(k, "/lib/a.mp4")));
        assert!(is_relevant(&ev(k, "/lib/a.bloom.json")));
    }

    #[test]
    fn partial_markers_are_noise() {
        assert!(!is_relevant(&ev(EventKind::Create(CreateKind::File), "/lib/a.mp4.bloom.partial")));
        assert!(!is_relevant(&ev(EventKind::Create(CreateKind::File), "/lib/.DS_Store")));
    }
}
