/*!
 * Bloom – Rust backend
 *
 * Module layout:
 *   types    – serializable data structures returned to the frontend
 *   util     – Bloom directory, recording discovery and time helpers
 *   system   – directory / disk-space / display enumeration commands
 *   session  – streaming recording session (open/write/close/cancel)
 *   library  – library listing, recording management, snapshot saving
 *   video    – ffmpeg-based video info / thumbnails / optimisation
 */

mod library;
mod session;
mod system;
mod types;
mod util;
mod video;

// Short `crate::` re-exports used by the video module.
pub(crate) use types::RecordingMeta;
pub(crate) use util::{bloom_dir, find_recording, meta_path_for, now_iso};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(session::Sessions::default())
        .manage(video::VideoJobs::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // directory / setup
            system::get_bloom_dir,
            system::get_disk_space,
            system::list_monitors,
            // streaming session
            session::open_session,
            session::write_chunk,
            session::close_session,
            session::cancel_session,
            // library
            library::list_recordings,
            library::get_library_stats,
            library::save_snapshot,
            // recording management
            library::get_recording,
            library::delete_recording,
            library::rename_recording,
            library::validate_recording,
            library::reveal_in_finder,
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
