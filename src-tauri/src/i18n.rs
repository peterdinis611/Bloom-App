//! Backend locale — tray labels, user-facing errors, sync with the UI.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{
    menu::MenuBuilder,
    AppHandle, Emitter, Manager, State,
};

use crate::config::{load_config, save_config};
use crate::util::{bloom_dir, load_all_recordings};

pub const TRAY_ID: &str = "main";
const DEFAULT_TRAY_RECENT: u32 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Locale {
    Sk,
    En,
    Cs,
    De,
    Pl,
    Hu,
}

impl Locale {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Sk => "sk",
            Self::En => "en",
            Self::Cs => "cs",
            Self::De => "de",
            Self::Pl => "pl",
            Self::Hu => "hu",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        let lower = raw.trim().to_ascii_lowercase();
        if let Some(loc) = Self::parse_tag(&lower) {
            return Some(loc);
        }
        let primary = lower
            .split(['.', '_', '-'])
            .next()
            .unwrap_or("");
        Self::parse_tag(primary)
    }

    fn parse_tag(tag: &str) -> Option<Self> {
        match tag {
            "sk" | "slovak" => Some(Self::Sk),
            "en" | "english" => Some(Self::En),
            "cs" | "czech" => Some(Self::Cs),
            "de" | "german" => Some(Self::De),
            "pl" | "polish" => Some(Self::Pl),
            "hu" | "hungarian" => Some(Self::Hu),
            _ => None,
        }
    }

    pub fn from_system() -> Self {
        let candidates = [
            std::env::var("LC_ALL").ok(),
            std::env::var("LC_MESSAGES").ok(),
            std::env::var("LANG").ok(),
        ];
        for raw in candidates.into_iter().flatten() {
            let primary = raw.split(['.', '_', '-']).next().unwrap_or("");
            if let Some(loc) = Self::parse(primary) {
                return loc;
            }
            if let Some(loc) = Self::parse(&raw) {
                return loc;
            }
        }
        Self::Sk
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocaleInfo {
    pub id: String,
    pub native_label: String,
    pub english_label: String,
}

/// User-facing backend strings for one locale.
#[derive(Debug, Clone, Copy)]
pub struct Strings {
    pub tray_show: &'static str,
    pub tray_start: &'static str,
    pub tray_last: &'static str,
    pub tray_pause: &'static str,
    pub tray_stop: &'static str,
    pub tray_library: &'static str,
    pub tray_recent: &'static str,
    pub tray_quit: &'static str,
    pub tray_tooltip: &'static str,

    pub err_invalid_key: &'static str,
    pub err_duplicate_shortcut: &'static str,
    pub err_path_absolute: &'static str,
    pub err_file_missing: &'static str,
    pub err_not_a_file: &'static str,
    pub err_unsupported_format: &'static str,
    pub err_copy_failed: &'static str,
    pub err_recording_not_found: &'static str,
    pub err_video_missing: &'static str,
    pub err_video_empty: &'static str,
    pub err_sidecar_missing: &'static str,
    pub err_invalid_template: &'static str,
}

pub fn strings(locale: Locale) -> Strings {
    match locale {
        Locale::Sk => Strings {
            tray_show: "Zobraziť Bloom",
            tray_start: "Spustiť nahrávanie…",
            tray_last: "Posledná nahrávka",
            tray_pause: "Pauza / pokračovať",
            tray_stop: "Ukončiť a uložiť",
            tray_library: "Otvoriť knižnicu",
            tray_recent: "Nedávne",
            tray_quit: "Ukončiť Bloom",
            tray_tooltip: "Bloom",
            err_invalid_key: "Neplatný kláves",
            err_duplicate_shortcut: "Každá skratka musí mať iný kláves.",
            err_path_absolute: "Cesta musí byť absolútna",
            err_file_missing: "Súbor neexistuje",
            err_not_a_file: "Vybraná položka nie je súbor",
            err_unsupported_format: "Nepodporovaný formát. Podporované: MP4, MOV, MKV, AVI, WebM a ďalšie.",
            err_copy_failed: "Kopírovanie zlyhalo",
            err_recording_not_found: "Nahrávka sa nenašla",
            err_video_missing: "Video súbor chýba na disku",
            err_video_empty: "Video súbor je prázdny (0 bajtov)",
            err_sidecar_missing: "Metadata (.bloom.json) chýbajú",
            err_invalid_template: "Neplatná šablóna názvu súboru",
        },
        Locale::En => Strings {
            tray_show: "Show Bloom",
            tray_start: "Start recording…",
            tray_last: "Last recording",
            tray_pause: "Pause / resume",
            tray_stop: "Stop and save",
            tray_library: "Open library",
            tray_recent: "Recent",
            tray_quit: "Quit Bloom",
            tray_tooltip: "Bloom",
            err_invalid_key: "Invalid key",
            err_duplicate_shortcut: "Each shortcut must use a different key.",
            err_path_absolute: "Path must be absolute",
            err_file_missing: "File does not exist",
            err_not_a_file: "Selected item is not a file",
            err_unsupported_format: "Unsupported format. Supported: MP4, MOV, MKV, AVI, WebM, and more.",
            err_copy_failed: "Copy failed",
            err_recording_not_found: "Recording not found",
            err_video_missing: "Video file is missing from disk",
            err_video_empty: "Video file is empty (0 bytes)",
            err_sidecar_missing: "Metadata sidecar (.bloom.json) is missing",
            err_invalid_template: "Invalid filename template",
        },
        Locale::Cs => Strings {
            tray_show: "Zobrazit Bloom",
            tray_start: "Spustit nahrávání…",
            tray_last: "Poslední nahrávka",
            tray_pause: "Pauza / pokračovat",
            tray_stop: "Ukončit a uložit",
            tray_library: "Otevřít knihovnu",
            tray_recent: "Nedávné",
            tray_quit: "Ukončit Bloom",
            tray_tooltip: "Bloom",
            err_invalid_key: "Neplatná klávesa",
            err_duplicate_shortcut: "Každá zkratka musí mít jinou klávesu.",
            err_path_absolute: "Cesta musí být absolutní",
            err_file_missing: "Soubor neexistuje",
            err_not_a_file: "Vybraná položka není soubor",
            err_unsupported_format: "Nepodporovaný formát. Podporované: MP4, MOV, MKV, AVI, WebM a další.",
            err_copy_failed: "Kopírování selhalo",
            err_recording_not_found: "Nahrávka nebyla nalezena",
            err_video_missing: "Video soubor na disku chybí",
            err_video_empty: "Video soubor je prázdný (0 bajtů)",
            err_sidecar_missing: "Metadata (.bloom.json) chybí",
            err_invalid_template: "Neplatná šablona názvu souboru",
        },
        Locale::De => Strings {
            tray_show: "Bloom anzeigen",
            tray_start: "Aufnahme starten…",
            tray_last: "Letzte Aufnahme",
            tray_pause: "Pause / fortsetzen",
            tray_stop: "Beenden und speichern",
            tray_library: "Bibliothek öffnen",
            tray_recent: "Zuletzt",
            tray_quit: "Bloom beenden",
            tray_tooltip: "Bloom",
            err_invalid_key: "Ungültige Taste",
            err_duplicate_shortcut: "Jeder Shortcut braucht eine andere Taste.",
            err_path_absolute: "Pfad muss absolut sein",
            err_file_missing: "Datei existiert nicht",
            err_not_a_file: "Auswahl ist keine Datei",
            err_unsupported_format: "Nicht unterstütztes Format. Unterstützt: MP4, MOV, MKV, AVI, WebM u. a.",
            err_copy_failed: "Kopieren fehlgeschlagen",
            err_recording_not_found: "Aufnahme nicht gefunden",
            err_video_missing: "Videodatei fehlt auf dem Datenträger",
            err_video_empty: "Videodatei ist leer (0 Bytes)",
            err_sidecar_missing: "Metadaten (.bloom.json) fehlen",
            err_invalid_template: "Ungültige Dateinamensvorlage",
        },
        Locale::Pl => Strings {
            tray_show: "Pokaż Bloom",
            tray_start: "Rozpocznij nagrywanie…",
            tray_last: "Ostatnie nagranie",
            tray_pause: "Pauza / wznów",
            tray_stop: "Zakończ i zapisz",
            tray_library: "Otwórz bibliotekę",
            tray_recent: "Ostatnie",
            tray_quit: "Zakończ Bloom",
            tray_tooltip: "Bloom",
            err_invalid_key: "Nieprawidłowy klawisz",
            err_duplicate_shortcut: "Każdy skrót musi mieć inny klawisz.",
            err_path_absolute: "Ścieżka musi być bezwzględna",
            err_file_missing: "Plik nie istnieje",
            err_not_a_file: "Wybrany element nie jest plikiem",
            err_unsupported_format: "Nieobsługiwany format. Obsługiwane: MP4, MOV, MKV, AVI, WebM i inne.",
            err_copy_failed: "Kopiowanie nie powiodło się",
            err_recording_not_found: "Nie znaleziono nagrania",
            err_video_missing: "Brak pliku wideo na dysku",
            err_video_empty: "Plik wideo jest pusty (0 bajtów)",
            err_sidecar_missing: "Brak metadanych (.bloom.json)",
            err_invalid_template: "Nieprawidłowy szablon nazwy pliku",
        },
        Locale::Hu => Strings {
            tray_show: "Bloom megjelenítése",
            tray_start: "Felvétel indítása…",
            tray_last: "Utolsó felvétel",
            tray_pause: "Szünet / folytatás",
            tray_stop: "Leállítás és mentés",
            tray_library: "Könyvtár megnyitása",
            tray_recent: "Legutóbbi",
            tray_quit: "Bloom bezárása",
            tray_tooltip: "Bloom",
            err_invalid_key: "Érvénytelen billentyű",
            err_duplicate_shortcut: "Minden gyorsbillentyűnek más billentyűt kell használnia.",
            err_path_absolute: "Az útvonalnak abszolútnak kell lennie",
            err_file_missing: "A fájl nem létezik",
            err_not_a_file: "A kiválasztott elem nem fájl",
            err_unsupported_format: "Nem támogatott formátum. Támogatott: MP4, MOV, MKV, AVI, WebM stb.",
            err_copy_failed: "A másolás sikertelen",
            err_recording_not_found: "A felvétel nem található",
            err_video_missing: "A videófájl hiányzik a lemezről",
            err_video_empty: "A videófájl üres (0 bájt)",
            err_sidecar_missing: "Hiányoznak a metaadatok (.bloom.json)",
            err_invalid_template: "Érvénytelen fájlnévsablon",
        },
    }
}

pub struct LocaleState(pub Mutex<Locale>);

impl LocaleState {
    pub fn new(locale: Locale) -> Self {
        Self(Mutex::new(locale))
    }
}

pub fn current_locale(state: &LocaleState) -> Locale {
    state.0.lock().map(|g| *g).unwrap_or(Locale::Sk)
}

pub fn current_strings(state: &LocaleState) -> Strings {
    strings(current_locale(state))
}

/// Resolve locale from config, or fall back to system language.
pub fn resolve_startup_locale(app: &AppHandle) -> Locale {
    if let Ok(cfg) = load_config(app) {
        if let Some(raw) = cfg.locale.as_deref() {
            if let Some(loc) = Locale::parse(raw) {
                return loc;
            }
        }
    }
    Locale::from_system()
}

fn tray_recent_limit(app: &AppHandle) -> usize {
    load_config(app)
        .ok()
        .and_then(|c| c.tray_recent_count)
        .unwrap_or(DEFAULT_TRAY_RECENT)
        .clamp(0, 8) as usize
}

fn truncate_label(title: &str, max: usize) -> String {
    let t = title.trim();
    if t.chars().count() <= max {
        return t.to_string();
    }
    let cut: String = t.chars().take(max.saturating_sub(1)).collect();
    format!("{cut}…")
}

pub fn build_tray_menu(app: &AppHandle, s: &Strings) -> Result<tauri::menu::Menu<tauri::Wry>, String> {
    let mut builder = MenuBuilder::new(app)
        .text("show", s.tray_show)
        .text("start", s.tray_start)
        .text("last", s.tray_last)
        .text("pause", s.tray_pause)
        .text("stop", s.tray_stop)
        .separator()
        .text("library", s.tray_library);

    let limit = tray_recent_limit(app);
    if limit > 0 {
        if let Ok(dir) = bloom_dir(app) {
            let recent = load_all_recordings(&dir);
            if !recent.is_empty() {
                builder = builder.separator().text("recent-header", s.tray_recent);
                // Disabled-looking header: still clickable no-op via empty handler
                for entry in recent.into_iter().take(limit) {
                    let id = format!("recent:{}", entry.meta.id);
                    let label = truncate_label(&entry.meta.title, 36);
                    builder = builder.text(id, label);
                }
            }
        }
    }

    builder
        .separator()
        .text("quit", s.tray_quit)
        .build()
        .map_err(|e| e.to_string())
}

pub fn refresh_tray_menu(app: &AppHandle, locale: Locale) -> Result<(), String> {
    let s = strings(locale);
    let menu = build_tray_menu(app, &s)?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
        let _ = tray.set_tooltip(Some(s.tray_tooltip));
    }
    Ok(())
}

/// Rebuild tray after library changes (new recording, delete, …).
#[tauri::command]
pub fn refresh_tray(app: AppHandle, state: State<'_, LocaleState>) -> Result<(), String> {
    refresh_tray_menu(&app, current_locale(&state))
}

#[tauri::command]
pub fn list_locales() -> Vec<LocaleInfo> {
    [
        (Locale::Sk, "Slovenčina", "Slovak"),
        (Locale::En, "English", "English"),
        (Locale::Cs, "Čeština", "Czech"),
        (Locale::De, "Deutsch", "German"),
        (Locale::Pl, "Polski", "Polish"),
        (Locale::Hu, "Magyar", "Hungarian"),
    ]
    .into_iter()
    .map(|(loc, native, english)| LocaleInfo {
        id: loc.as_str().to_string(),
        native_label: native.to_string(),
        english_label: english.to_string(),
    })
    .collect()
}

#[tauri::command]
pub fn get_locale(state: State<'_, LocaleState>) -> String {
    current_locale(&state).as_str().to_string()
}

#[tauri::command]
pub fn get_system_locale() -> String {
    Locale::from_system().as_str().to_string()
}

#[tauri::command]
pub fn set_locale(
    app: AppHandle,
    state: State<'_, LocaleState>,
    locale: String,
) -> Result<String, String> {
    let loc = Locale::parse(&locale).ok_or_else(|| format!("Unknown locale: {locale}"))?;

    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        *guard = loc;
    }

    let mut cfg = load_config(&app).unwrap_or_default();
    cfg.locale = Some(loc.as_str().to_string());
    save_config(&app, &cfg)?;

    refresh_tray_menu(&app, loc)?;
    let _ = app.emit("locale-changed", loc.as_str());
    Ok(loc.as_str().to_string())
}

#[tauri::command]
pub fn set_tray_recent_count(app: AppHandle, state: State<'_, LocaleState>, count: u32) -> Result<u32, String> {
    let clamped = count.clamp(0, 8);
    let mut cfg = load_config(&app).unwrap_or_default();
    cfg.tray_recent_count = Some(clamped);
    save_config(&app, &cfg)?;
    refresh_tray_menu(&app, current_locale(&state))?;
    Ok(clamped)
}

#[tauri::command]
pub fn get_tray_recent_count(app: AppHandle) -> u32 {
    tray_recent_limit(&app) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_locale_variants() {
        assert_eq!(Locale::parse("sk"), Some(Locale::Sk));
        assert_eq!(Locale::parse("EN-US"), Some(Locale::En));
        assert_eq!(Locale::parse("cs_CZ.UTF-8"), Some(Locale::Cs));
        assert_eq!(Locale::parse("de"), Some(Locale::De));
        assert_eq!(Locale::parse("pl"), Some(Locale::Pl));
        assert_eq!(Locale::parse("hu"), Some(Locale::Hu));
        assert_eq!(Locale::parse("xx"), None);
    }

    #[test]
    fn strings_exist_for_all_locales() {
        for loc in [Locale::Sk, Locale::En, Locale::Cs, Locale::De, Locale::Pl, Locale::Hu] {
            let s = strings(loc);
            assert!(!s.tray_show.is_empty());
            assert!(!s.tray_library.is_empty());
            assert!(!s.err_invalid_template.is_empty());
        }
    }

    #[test]
    fn list_locales_has_six() {
        assert_eq!(list_locales().len(), 6);
        assert_eq!(list_locales()[0].id, "sk");
    }
}
