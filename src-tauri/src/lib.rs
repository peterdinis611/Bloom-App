/*!
 * Bloom – Rust backend
 */

mod backup;
mod config;
mod clipboard;
mod cursor;
mod finalize;
mod i18n;
mod library;
mod naming;
mod session;
mod share;
mod system;
mod tray;
mod types;
mod util;
mod video;
mod watcher;

use tauri::Manager;

pub(crate) use types::RecordingMeta;
pub(crate) use util::{bloom_dir, find_recording, meta_path_for, now_iso};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(session::Sessions::default())
        .manage(video::VideoJobs::default())
        .manage(cursor::CursorTracker::default())
        .manage(cursor::ClickTracker::default())
        .manage(tray::RecordingTrayState::default())
        .manage(watcher::LibraryWatcher::default())
        .manage(tray::ShortcutStateStore(std::sync::Mutex::new(
            tray::ShortcutBindings::default(),
        )))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let locale = i18n::resolve_startup_locale(app.handle());
            app.manage(i18n::LocaleState::new(locale));
            // LocaleState is managed above: tray + shortcuts (from config) depend on it.
            tray::build_tray(app.handle())?;
            tray::register_shortcuts(app.handle())?;
            if let Err(e) = watcher::start_library_watcher(app.handle()) {
                eprintln!("Bloom: library watcher not started: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            system::get_bloom_dir,
            system::get_library_directory,
            system::set_library_directory,
            backup::get_backup_directory,
            backup::set_backup_directory,
            backup::create_library_backup,
            backup::list_backups,
            backup::open_backup_folder,
            backup::open_backup_path,
            backup::get_default_recording_folder,
            backup::set_default_recording_folder,
            system::get_disk_space,
            system::list_monitors,
            system::get_app_info,
            system::check_capture_permissions,
            system::list_capture_windows,
            system::get_disk_space_min_mb,
            system::set_disk_space_min_mb,
            i18n::list_locales,
            i18n::get_locale,
            i18n::get_system_locale,
            i18n::set_locale,
            i18n::refresh_tray,
            i18n::get_tray_recent_count,
            i18n::set_tray_recent_count,
            naming::get_filename_template,
            naming::set_filename_template,
            naming::suggest_recording_filename,
            session::open_session,
            session::write_chunk,
            session::close_session,
            session::cancel_session,
            session::list_incomplete_sessions,
            session::recover_incomplete_session,
            session::discard_incomplete_session,
            finalize::get_auto_optimize_after_record,
            finalize::set_auto_optimize_after_record,
            library::list_recordings,
            library::list_library_folders,
            library::list_recent_recordings,
            library::get_library_stats,
            library::save_snapshot,
            library::get_recording,
            library::delete_recording,
            library::rename_recording,
            library::update_recording_meta,
            library::batch_delete_recordings,
            library::delete_all_recordings,
            library::share_recording,
            library::validate_recording,
            library::import_recording,
            library::ensure_demo_recording,
            library::reveal_in_finder,
            library::open_library_folder,
            library::duplicate_recording,
            library::purge_library_orphans,
            library::regenerate_thumbnails,
            library::repair_sidecars,
            clipboard::copy_text,
            clipboard::copy_file,
            clipboard::copy_file_to,
            tray::set_global_shortcuts,
            tray::get_global_shortcuts,
            tray::set_recording_state,
            video::check_ffmpeg,
            video::install_ffmpeg,
            video::get_video_info,
            video::analyze_video,
            video::get_thumbnail,
            video::get_filmstrip,
            video::estimate_export,
            video::optimize_video,
            video::cancel_optimize,
            video::batch_optimize,
            video::extract_audio,
            video::get_audio_peaks,
            video::detect_silence,
            video::concat_recordings,
            video::apply_click_spotlight,
            cursor::start_cursor_tracker,
            cursor::stop_cursor_tracker,
            cursor::start_click_tracker,
            cursor::stop_click_tracker,
            cursor::get_click_track,
            cursor::has_click_track,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Bloom");
}
