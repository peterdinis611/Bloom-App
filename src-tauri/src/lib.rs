/*!
 * Bloom – Rust backend
 */

mod cursor;
mod library;
mod session;
mod system;
mod tray;
mod types;
mod util;
mod video;

pub(crate) use types::RecordingMeta;
pub(crate) use util::{bloom_dir, find_recording, meta_path_for, now_iso};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(session::Sessions::default())
        .manage(video::VideoJobs::default())
        .manage(cursor::CursorTracker::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            tray::build_tray(app.handle())?;
            tray::register_shortcuts(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            system::get_bloom_dir,
            system::get_disk_space,
            system::list_monitors,
            session::open_session,
            session::write_chunk,
            session::close_session,
            session::cancel_session,
            library::list_recordings,
            library::get_library_stats,
            library::save_snapshot,
            library::get_recording,
            library::delete_recording,
            library::rename_recording,
            library::update_recording_meta,
            library::batch_delete_recordings,
            library::share_recording,
            library::validate_recording,
            library::reveal_in_finder,
            video::check_ffmpeg,
            video::get_video_info,
            video::get_thumbnail,
            video::optimize_video,
            video::cancel_optimize,
            cursor::start_cursor_tracker,
            cursor::stop_cursor_tracker,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Bloom");
}
