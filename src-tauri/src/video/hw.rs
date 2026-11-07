//! Hardware encode preference from Rust config.

use std::path::Path;

use crate::config;

use super::encode::{hevc_videotoolbox_available, nvenc_available, videotoolbox_available};

/// Resolve HW encoder flags honouring `export_defaults.prefer_hardware_encode`.
pub(crate) fn resolve_hw_flags(app: &tauri::AppHandle, ffmpeg: &Path) -> (bool, bool, bool) {
    let prefer = config::load_config(app)
        .ok()
        .and_then(|c| c.export_defaults)
        .map(|d| d.prefer_hardware_encode)
        .unwrap_or(true);

    if !prefer {
        return (false, false, false);
    }

    let hw_h264 = videotoolbox_available(ffmpeg);
    let hw_hevc = hevc_videotoolbox_available(ffmpeg);
    let nvenc = nvenc_available(ffmpeg) && !hw_h264;
    (hw_h264, hw_hevc, nvenc)
}
