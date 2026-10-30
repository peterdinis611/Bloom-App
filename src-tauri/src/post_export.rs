//! Post-export side effects (open / copy path / webhooks) driven from Rust config.

use std::process::Command;

use serde::Serialize;
use tauri::Emitter;

use crate::clipboard;
use crate::config::{self, AppConfig, ExportDefaultsConfig, IntegrationConfig, RecordingLimitsConfig};

#[derive(Debug, Clone, Serialize)]
pub struct ExportFinishedEvent {
    pub path: String,
    pub title: String,
    pub job_id: Option<String>,
    pub auto_share: bool,
}

/// Run configured post-export hooks. Emits `export-finished` for FE share sheet.
pub(crate) fn run_post_export(app: &tauri::AppHandle, path: &str, title: &str, job_id: Option<String>) {
    let cfg = config::load_config(app).unwrap_or_default();
    let integ = cfg.integrations.unwrap_or_default();

    if integ.open_after_export {
        let _ = open_path(path);
    }
    if integ.copy_path_after_export {
        let _ = clipboard::copy_text(path.to_string());
    }
    if integ.notify_on_export {
        notify_webhooks(&integ, title, path);
    }

    let _ = app.emit(
        "export-finished",
        ExportFinishedEvent {
            path: path.to_string(),
            title: title.to_string(),
            job_id,
            auto_share: integ.auto_share_after_export,
        },
    );
}

fn open_path(path: &str) -> Result<(), String> {
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(|e| e.to_string())
}

fn notify_webhooks(integ: &IntegrationConfig, title: &str, path: &str) {
    let text = format!("Bloom export hotový: {title}\n{path}");
    if integ.slack_webhook_url.starts_with("https://") {
        let _ = post_json(&integ.slack_webhook_url, &serde_json::json!({ "text": text }));
    }
    if integ.discord_webhook_url.starts_with("https://") {
        let _ = post_json(
            &integ.discord_webhook_url,
            &serde_json::json!({ "content": text }),
        );
    }
}

fn post_json(url: &str, body: &serde_json::Value) -> Result<(), String> {
    let payload = serde_json::to_string(body).map_err(|e| e.to_string())?;
    let status = Command::new("curl")
        .args([
            "-sS",
            "-X",
            "POST",
            "-H",
            "Content-Type: application/json",
            "-d",
            &payload,
            url,
        ])
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("webhook failed".into())
    }
}

#[tauri::command]
pub fn get_integrations_config(app: tauri::AppHandle) -> IntegrationConfig {
    config::load_config(&app)
        .ok()
        .and_then(|c| c.integrations)
        .unwrap_or_default()
}

#[tauri::command]
pub fn set_integrations_config(
    app: tauri::AppHandle,
    integrations: IntegrationConfig,
) -> Result<(), String> {
    let mut cfg = config::load_config(&app).unwrap_or_default();
    cfg.integrations = Some(integrations);
    config::save_config(&app, &cfg)
}

#[tauri::command]
pub fn get_export_defaults_config(app: tauri::AppHandle) -> ExportDefaultsConfig {
    config::load_config(&app)
        .ok()
        .and_then(|c| c.export_defaults)
        .unwrap_or_default()
}

#[tauri::command]
pub fn set_export_defaults_config(
    app: tauri::AppHandle,
    defaults: ExportDefaultsConfig,
) -> Result<(), String> {
    let mut cfg = config::load_config(&app).unwrap_or_default();
    cfg.export_defaults = Some(defaults);
    config::save_config(&app, &cfg)
}

#[tauri::command]
pub fn get_recording_limits_config(app: tauri::AppHandle) -> RecordingLimitsConfig {
    config::load_config(&app)
        .ok()
        .and_then(|c| c.recording_limits)
        .unwrap_or_default()
}

#[tauri::command]
pub fn set_recording_limits_config(
    app: tauri::AppHandle,
    limits: RecordingLimitsConfig,
) -> Result<(), String> {
    let mut cfg = config::load_config(&app).unwrap_or_default();
    cfg.recording_limits = Some(limits);
    config::save_config(&app, &cfg)
}

#[tauri::command]
pub fn get_full_app_config(app: tauri::AppHandle) -> AppConfig {
    config::load_config(&app).unwrap_or_default()
}
