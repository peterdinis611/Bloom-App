//! System tray menu and global keyboard shortcuts.

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub fn register_shortcuts(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcuts = [
        Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyS),
        Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyP),
        Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyR),
    ];

    app.global_shortcut().on_shortcuts(shortcuts, |app, shortcut, event| {
        if event.state != ShortcutState::Pressed {
            return;
        }
        let id = if shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::KeyS) {
            "rec-stop"
        } else if shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::KeyP) {
            "rec-toggle-pause"
        } else if shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::KeyR) {
            "rec-arm"
        } else {
            return;
        };
        let _ = app.emit(id, ());
        if id == "rec-arm" {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }
    })?;

    Ok(())
}

pub fn build_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show_i = MenuItem::with_id(app, "show", "Show Bloom", true, None::<&str>)?;
    let start_i = MenuItem::with_id(app, "start", "Start Recording…", true, None::<&str>)?;
    let pause_i = MenuItem::with_id(app, "pause", "Pause / Resume", true, None::<&str>)?;
    let stop_i = MenuItem::with_id(app, "stop", "Stop & Save", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit Bloom", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_i, &start_i, &pause_i, &stop_i, &sep, &quit_i])?;

    let icon = app.default_window_icon().cloned();

    TrayIconBuilder::new()
        .icon(icon.unwrap())
        .menu(&menu)
        .tooltip("Bloom")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.unminimize();
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "start" => {
                let _ = app.emit("rec-arm", ());
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.unminimize();
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "pause" => {
                let _ = app.emit("rec-toggle-pause", ());
            }
            "stop" => {
                let _ = app.emit("rec-stop", ());
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.unminimize();
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
