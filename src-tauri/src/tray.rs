//! System tray menu and global keyboard shortcuts.

use std::sync::Mutex;

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::config::{load_config, save_config, ShortcutConfig};
use crate::i18n::{self, current_locale, current_strings, strings, LocaleState, Strings, TRAY_ID};

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

/// Live recording status mirrored from the UI (drives tray menu + tooltip).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RecordingTray {
    pub active: bool,
    pub paused: bool,
    pub elapsed_secs: u32,
}

pub struct RecordingTrayState(pub Mutex<RecordingTray>);

impl Default for RecordingTrayState {
    fn default() -> Self {
        Self(Mutex::new(RecordingTray::default()))
    }
}

/// `MM:SS` (or `H:MM:SS` past an hour).
pub(crate) fn format_elapsed(secs: u32) -> String {
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m:02}:{s:02}")
    }
}

/// Tooltip text, e.g. `Bloom · REC 03:42` or `Bloom · paused`.
pub(crate) fn tooltip_text(rec: RecordingTray, s: &Strings) -> String {
    if !rec.active {
        s.tray_tooltip.to_string()
    } else if rec.paused {
        format!("{} · {}", s.tray_tooltip, s.tray_paused)
    } else {
        format!("{} · REC {}", s.tray_tooltip, format_elapsed(rec.elapsed_secs))
    }
}

/// Current recording state (inactive when the state is not managed yet).
pub(crate) fn recording_tray(app: &AppHandle) -> RecordingTray {
    app.try_state::<RecordingTrayState>()
        .and_then(|st| st.0.lock().ok().map(|g| *g))
        .unwrap_or_default()
}

/// Update recording status. Rebuilds the menu only when active/paused flips;
/// the per-second elapsed tick just refreshes the tooltip.
#[tauri::command]
pub fn set_recording_state(
    app: AppHandle,
    state: State<'_, RecordingTrayState>,
    locale: State<'_, LocaleState>,
    active: bool,
    paused: bool,
    elapsed_secs: u32,
) -> Result<(), String> {
    let next = RecordingTray {
        active,
        paused: active && paused,
        elapsed_secs: if active { elapsed_secs } else { 0 },
    };
    let prev = {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        let prev = *guard;
        *guard = next;
        prev
    };

    let loc = current_locale(&locale);
    if prev.active != next.active || prev.paused != next.paused {
        i18n::refresh_tray_menu(&app, loc)?;
    } else if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let s = strings(loc);
        let _ = tray.set_tooltip(Some(tooltip_text(next, &s)));
    }
    Ok(())
}

fn bindings_from_config(cfg: &ShortcutConfig) -> Option<ShortcutBindings> {
    let arm = code_from_key(&cfg.arm)?;
    let pause = code_from_key(&cfg.pause)?;
    let stop = code_from_key(&cfg.stop)?;
    if arm == pause || arm == stop || pause == stop {
        return None;
    }
    Some(ShortcutBindings { arm, pause, stop })
}

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

/// Load persisted shortcuts (falling back to defaults), store them and register.
/// A registration failure (e.g. key taken by another app) is logged, not fatal.
pub fn register_shortcuts(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let bindings = load_config(app)
        .ok()
        .and_then(|c| c.shortcuts)
        .and_then(|sc| bindings_from_config(&sc))
        .unwrap_or_default();

    if let Some(store) = app.try_state::<ShortcutStateStore>() {
        if let Ok(mut guard) = store.0.lock() {
            *guard = bindings.clone();
        }
    }
    if let Err(e) = apply_shortcuts(app, &bindings) {
        eprintln!("Bloom: could not register global shortcuts: {e}");
    }
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

    let mut cfg = load_config(&app).unwrap_or_default();
    cfg.shortcuts = Some(ShortcutConfig {
        arm: key_from_code(bindings.arm).to_string(),
        pause: key_from_code(bindings.pause).to_string(),
        stop: key_from_code(bindings.stop).to_string(),
    });
    save_config(&app, &cfg)?;

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
        .tooltip(tooltip_text(recording_tray(app), &s))
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
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
                "library" => {
                    let _ = app.emit("open-library", ());
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
                "recent-header" => {}
                id if id.starts_with("recent:") => {
                    let rec_id = &id["recent:".len()..];
                    if !rec_id.is_empty() {
                        let _ = app.emit("open-recording", rec_id);
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.unminimize();
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                }
                _ => {}
            }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n::{strings, Locale};

    #[test]
    fn elapsed_formats() {
        assert_eq!(format_elapsed(0), "00:00");
        assert_eq!(format_elapsed(222), "03:42");
        assert_eq!(format_elapsed(3723), "1:02:03");
    }

    #[test]
    fn tooltip_reflects_state() {
        let s = strings(Locale::En);
        let idle = RecordingTray::default();
        assert_eq!(tooltip_text(idle, &s), "Bloom");
        let rec = RecordingTray { active: true, paused: false, elapsed_secs: 222 };
        assert_eq!(tooltip_text(rec, &s), "Bloom · REC 03:42");
        let paused = RecordingTray { active: true, paused: true, elapsed_secs: 222 };
        assert_eq!(tooltip_text(paused, &s), "Bloom · paused");
    }

    #[test]
    fn config_shortcuts_validate() {
        let ok = ShortcutConfig { arm: "a".into(), pause: "B".into(), stop: "c".into() };
        assert!(bindings_from_config(&ok).is_some());
        let dup = ShortcutConfig { arm: "a".into(), pause: "a".into(), stop: "c".into() };
        assert!(bindings_from_config(&dup).is_none());
        let bad = ShortcutConfig { arm: "1".into(), pause: "b".into(), stop: "c".into() };
        assert!(bindings_from_config(&bad).is_none());
    }
}
