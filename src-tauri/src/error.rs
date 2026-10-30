//! Structured Bloom error codes for FE localization.

use serde::Serialize;

/// Stable machine codes — FE maps these in `localizeError.ts`.
pub mod codes {
    pub const FFMPEG_MISSING: &str = "ffmpeg_missing";
    pub const SESSION_MISSING: &str = "session_missing";
    pub const WRITE_FAILED: &str = "write_failed";
    pub const DELETE_FAILED: &str = "delete_failed";
    pub const CREATE_FAILED: &str = "create_failed";
    pub const VIDEO_MISSING: &str = "video_missing";
    pub const EXPORT_TEMP_MISSING: &str = "export_temp_missing";
    pub const THUMBNAIL_FAILED: &str = "thumbnail_failed";
    pub const PROBE_FAILED: &str = "probe_failed";
    pub const REMUX_FAILED: &str = "remux_failed";
    pub const WINDOW_MISSING: &str = "window_missing";
    pub const SERIALIZE_FAILED: &str = "serialize_failed";
    pub const PERMISSION_DENIED: &str = "permission_denied";
    pub const RECORDING_NOT_FOUND: &str = "recording_not_found";
    pub const DISK_LOW: &str = "disk_low";
    pub const INVALID_OPTIONS: &str = "invalid_options";
    pub const CANCELLED: &str = "cancelled";
    pub const UNKNOWN: &str = "unknown";
}

#[derive(Debug, Clone, Serialize)]
pub struct BloomError {
    pub code: String,
    pub message: String,
}

impl BloomError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }

    pub fn to_invoke_string(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| self.message.clone())
    }
}

impl From<BloomError> for String {
    fn from(value: BloomError) -> Self {
        value.to_invoke_string()
    }
}

/// Wrap a plain message with a code for IPC `Err(...)`.
pub fn coded(code: &str, message: impl Into<String>) -> String {
    BloomError::new(code, message).to_invoke_string()
}
