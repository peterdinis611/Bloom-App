//! Recording filename templates stored in AppConfig.

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::config::{load_config, save_config};
use crate::i18n::{current_strings, LocaleState};
use crate::util::bloom_dir;

pub const DEFAULT_TEMPLATE: &str = "recording-{date}-{time}";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilenamePreview {
    pub template: String,
    pub example: String,
    pub tokens: Vec<&'static str>,
}

pub fn available_tokens() -> Vec<&'static str> {
    vec![
        "{date}",
        "{time}",
        "{datetime}",
        "{source}",
        "{quality}",
        "{uuid}",
        "{n}",
    ]
}

/// Sanitize a single path segment (no slashes, control chars).
fn sanitize_segment(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect();
    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        "recording".into()
    } else {
        collapsed
    }
}

/// Expand template placeholders. `{n}` is filled by the caller (or 1).
pub fn expand_template(
    template: &str,
    source: &str,
    quality: &str,
    n: u32,
) -> String {
    let now = chrono_lite_now();
    let date = format!("{:04}-{:02}-{:02}", now.0, now.1, now.2);
    let time = format!("{:02}-{:02}-{:02}", now.3, now.4, now.5);
    let datetime = format!("{date}_{time}");
    let uuid_short = &uuid::Uuid::new_v4().to_string()[..8];

    let mut out = template.to_string();
    for (key, val) in [
        ("{date}", date.as_str()),
        ("{time}", time.as_str()),
        ("{datetime}", datetime.as_str()),
        ("{source}", source),
        ("{quality}", quality),
        ("{uuid}", uuid_short),
        ("{n}", &n.to_string()),
    ] {
        out = out.replace(key, val);
    }
    sanitize_segment(&out)
}

/// Local wall-clock without pulling chrono crate — (y, mo, d, h, mi, s).
fn chrono_lite_now() -> (i32, u32, u32, u32, u32, u32) {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Approximate UTC breakdown is fine for filenames.
    let days = secs / 86400;
    let day_secs = secs % 86400;
    let h = (day_secs / 3600) as u32;
    let mi = ((day_secs % 3600) / 60) as u32;
    let s = (day_secs % 60) as u32;
    // Civil date from Unix day (Howard Hinnant algorithm).
    let z = days as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m, d, h, mi, s)
}

pub fn resolve_unique_filename(dir: &std::path::Path, stem: &str, ext: &str) -> String {
    let mut candidate = format!("{stem}.{ext}");
    let mut n = 2u32;
    while dir.join(&candidate).exists() {
        candidate = format!("{stem}-{n}.{ext}");
        n += 1;
        if n > 9999 {
            break;
        }
    }
    candidate
}

pub fn template_from_config(app: &AppHandle) -> String {
    load_config(app)
        .ok()
        .and_then(|c| c.filename_template)
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_TEMPLATE.to_string())
}

#[tauri::command]
pub fn get_filename_template(app: AppHandle) -> FilenamePreview {
    let template = template_from_config(&app);
    let example_stem = expand_template(&template, "screen", "1080p", 1);
    FilenamePreview {
        example: format!("{example_stem}.mp4"),
        template,
        tokens: available_tokens(),
    }
}

#[tauri::command]
pub fn set_filename_template(
    app: AppHandle,
    locale: State<'_, LocaleState>,
    template: String,
) -> Result<FilenamePreview, String> {
    let s = current_strings(&*locale);
    let trimmed = template.trim();
    if trimmed.is_empty() {
        return Err(s.err_invalid_template.to_string());
    }
    if trimmed.contains("..") || trimmed.contains('/') || trimmed.contains('\\') {
        return Err(s.err_invalid_template.to_string());
    }
    let mut cfg = load_config(&app).unwrap_or_default();
    cfg.filename_template = Some(trimmed.to_string());
    save_config(&app, &cfg)?;
    Ok(get_filename_template(app))
}

#[tauri::command]
pub fn suggest_recording_filename(
    app: AppHandle,
    source: String,
    quality: String,
    extension: String,
) -> Result<String, String> {
    let dir = bloom_dir(&app)?;
    let template = template_from_config(&app);
    let ext = extension.trim().trim_start_matches('.').to_ascii_lowercase();
    let ext = if ext.is_empty() { "mp4".into() } else { ext };
    let stem = expand_template(&template, &source, &quality, 1);
    Ok(resolve_unique_filename(&dir, &stem, &ext))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn expand_replaces_tokens() {
        let name = expand_template("clip-{source}-{quality}-{uuid}", "camera", "720p", 3);
        assert!(name.contains("camera"));
        assert!(name.contains("720p"));
        assert!(!name.contains('{'));
    }

    #[test]
    fn sanitize_strips_path_chars() {
        let name = expand_template("a/b\\c:{source}", "screen", "1080p", 1);
        assert!(!name.contains('/'));
        assert!(!name.contains('\\'));
        assert!(!name.contains(':'));
    }

    #[test]
    fn unique_filename_avoids_clobber() {
        let dir = std::env::temp_dir().join(format!("bloom-name-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("clip.mp4"), b"x").unwrap();
        let next = resolve_unique_filename(&dir, "clip", "mp4");
        assert_eq!(next, "clip-2.mp4");
        fs::remove_dir_all(&dir).ok();
    }
}
