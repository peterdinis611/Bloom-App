//! System tray menu and global keyboard shortcuts.

use std::sync::Mutex;

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::i18n::{self, current_strings, LocaleState, TRAY_ID};

#[derive(Clone)]
pub struct ShortcutBindings {
    pub arm: Code,
    pub pause: Code,
    pub stop: Code,
}

impl Default for ShortcutBindings {
    fn default() -> Self {
        Self {
            arm: Code::KeyR,
            pause: Code::KeyP,
            stop: Code::KeyS,
        }
    }
}

pub struct ShortcutStateStore(pub Mutex<ShortcutBindings>);

fn code_from_key(key: &str) -> Option<Code> {
    match key.to_uppercase().as_str() {
        "A" => Some(Code::KeyA),
        "B" => Some(Code::KeyB),
        "C" => Some(Code::KeyC),
        "D" => Some(Code::KeyD),
        "E" => Some(Code::KeyE),
        "F" => Some(Code::KeyF),
        "G" => Some(Code::KeyG),
        "H" => Some(Code::KeyH),
        "I" => Some(Code::KeyI),
        "J" => Some(Code::KeyJ),
        "K" => Some(Code::KeyK),
        "L" => Some(Code::KeyL),
        "M" => Some(Code::KeyM),
        "N" => Some(Code::KeyN),
        "O" => Some(Code::KeyO),
        "P" => Some(Code::KeyP),
        "Q" => Some(Code::KeyQ),
        "R" => Some(Code::KeyR),
        "S" => Some(Code::KeyS),
        "T" => Some(Code::KeyT),
        "U" => Some(Code::KeyU),
        "V" => Some(Code::KeyV),
        "W" => Some(Code::KeyW),
        "X" => Some(Code::KeyX),
        "Y" => Some(Code::KeyY),
        "Z" => Some(Code::KeyZ),
        _ => None,
    }
}

fn key_from_code(code: Code) -> &'static str {
    match code {
        Code::KeyA => "A",
        Code::KeyB => "B",
        Code::KeyC => "C",
        Code::KeyD => "D",
        Code::KeyE => "E",
        Code::KeyF => "F",
        Code::KeyG => "G",
        Code::KeyH => "H",
        Code::KeyI => "I",
        Code::KeyJ => "J",
        Code::KeyK => "K",
        Code::KeyL => "L",
        Code::KeyM => "M",
        Code::KeyN => "N",
        Code::KeyO => "O",
        Code::KeyP => "P",
        Code::KeyQ => "Q",
        Code::KeyR => "R",
        Code::KeyS => "S",
        Code::KeyT => "T",
        Code::KeyU => "U",
        Code::KeyV => "V",
        Code::KeyW => "W",
        Code::KeyX => "X",
        Code::KeyY => "Y",
        Code::KeyZ => "Z",
        _ => "?",
    }
}

fn emit_shortcut(app: &AppHandle, id: &str) {
    let _ = app.emit(id, ());
    if id == "rec-arm" {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.unminimize();
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

pub fn register_shortcuts(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let bindings = ShortcutBindings::default();
    apply_shortcuts(app, &bindings)?;
    Ok(())
}

fn apply_shortcuts(app: &AppHandle, bindings: &ShortcutBindings) -> Result<(), String> {
    let _ = app.global_shortcut().unregister_all();

    let mods = Modifiers::SUPER | Modifiers::SHIFT;
    let arm = Shortcut::new(Some(mods), bindings.arm);
    let pause = Shortcut::new(Some(mods), bindings.pause);
    let stop = Shortcut::new(Some(mods), bindings.stop);

    app.global_shortcut()
        .on_shortcut(arm, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                emit_shortcut(app, "rec-arm");
            }
        })
        .map_err(|e| e.to_string())?;

    app.global_shortcut()
        .on_shortcut(pause, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                emit_shortcut(app, "rec-toggle-pause");
            }
        })
        .map_err(|e| e.to_string())?;

    app.global_shortcut()
        .on_shortcut(stop, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                emit_shortcut(app, "rec-stop");
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Update ⌘⇧ bindings. Keys are single letters A–Z.
#[tauri::command]
pub fn set_global_shortcuts(
    app: AppHandle,
    state: State<'_, ShortcutStateStore>,
    locale: State<'_, LocaleState>,
    arm: String,
    pause: String,
    stop: String,
) -> Result<(), String> {
    let s = current_strings(&*locale);
    let arm_code = code_from_key(&arm).ok_or_else(|| format!("{}: {arm}", s.err_invalid_key))?;
    let pause_code =
        code_from_key(&pause).ok_or_else(|| format!("{}: {pause}", s.err_invalid_key))?;
    let stop_code = code_from_key(&stop).ok_or_else(|| format!("{}: {stop}", s.err_invalid_key))?;

    if arm_code == pause_code || arm_code == stop_code || pause_code == stop_code {
        return Err(s.err_duplicate_shortcut.into());
    }

    let bindings = ShortcutBindings {
        arm: arm_code,
        pause: pause_code,
        stop: stop_code,
    };
    apply_shortcuts(&app, &bindings)?;
    if let Ok(mut guard) = state.0.lock() {
        *guard = bindings;
    }
    Ok(())
}

#[tauri::command]
pub fn get_global_shortcuts(state: State<'_, ShortcutStateStore>) -> Result<(String, String, String), String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok((
        key_from_code(guard.arm).to_string(),
        key_from_code(guard.pause).to_string(),
        key_from_code(guard.stop).to_string(),
    ))
}

pub fn build_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let locale_state = app.state::<LocaleState>();
    let s = current_strings(&*locale_state);
    let menu = i18n::build_tray_menu(app, &s)?;

    let icon = app.default_window_icon().cloned();

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon.unwrap())
        .menu(&menu)
        .tooltip(s.tray_tooltip)
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
            "last" => {
                let _ = app.emit("open-last-recording", ());
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
