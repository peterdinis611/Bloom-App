use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::OnceLock,
};

use super::types::*;
use super::filters::*;
use super::ffmpeg::apply_path_env;

// ────────────────────────────────────────────────────────────────────────────
// Argument building
// ────────────────────────────────────────────────────────────────────────────

pub(crate) struct PresetValues {
    pub(crate) x264_preset: &'static str,
    pub(crate) x264_crf: &'static str,
    pub(crate) vp9_crf: &'static str,
    pub(crate) audio_bitrate: &'static str,
    /// h264_videotoolbox -q:v (lower = better quality).
    pub(crate) vt_quality: &'static str,
}

pub(crate) fn preset_values(preset: &str) -> PresetValues {
    match preset {
        "small" => PresetValues {
            // Prioritise throughput on long / large captures.
            x264_preset: "ultrafast",
            x264_crf: "30",
            vp9_crf: "37",
            audio_bitrate: "96k",
            vt_quality: "72",
        },
        "high" => PresetValues {
            x264_preset: "faster",
            x264_crf: "20",
            vp9_crf: "27",
            audio_bitrate: "192k",
            vt_quality: "45",
        },
        // "medium" and any unknown value
        _ => PresetValues {
            x264_preset: "veryfast",
            x264_crf: "25",
            vp9_crf: "32",
            audio_bitrate: "128k",
            vt_quality: "58",
        },
    }
}

/// Target height for a resolution label, or None for "original".
pub(crate) fn resolution_height(resolution: &str) -> Option<u32> {
    match resolution {
        "480p" => Some(480),
        "720p" => Some(720),
        "1080p" => Some(1080),
        _ => None,
    }
}

pub(crate) fn ext_for_format(format: &str) -> &'static str {
    match format {
        "webm" => "webm",
        "gif" => "gif",
        "mov" => "mov",
        "mkv" => "mkv",
        "avi" => "avi",
        "m4v" => "m4v",
        "mpeg" | "mpg" => "mpg",
        "ts" => "ts",
        "flv" => "flv",
        "3gp" => "3gp",
        "ogv" => "ogv",
        _ => "mp4",
    }
}

/// MP4 / MOV / M4V share H.264+AAC and can use +faststart / stream-copy.
pub(crate) fn is_mp4_family(format: &str) -> bool {
    matches!(format, "mp4" | "mov" | "m4v")
}

/// Containers that use the shared H.264/HEVC + AAC encode path.
pub(crate) fn uses_h264_aac_path(format: &str) -> bool {
    matches!(format, "mp4" | "mov" | "m4v" | "mkv" | "ts" | "flv")
}

static VT_ENCODER: OnceLock<bool> = OnceLock::new();
static VT_HEVC: OnceLock<bool> = OnceLock::new();
static NVENC_ENCODER: OnceLock<bool> = OnceLock::new();

/// Whether ffmpeg exposes Apple VideoToolbox H.264 encoder.
pub(crate) fn videotoolbox_available(ffmpeg: &Path) -> bool {
    *VT_ENCODER.get_or_init(|| encoder_available(ffmpeg, "h264_videotoolbox"))
}

pub(crate) fn hevc_videotoolbox_available(ffmpeg: &Path) -> bool {
    *VT_HEVC.get_or_init(|| encoder_available(ffmpeg, "hevc_videotoolbox"))
}

pub(crate) fn nvenc_available(ffmpeg: &Path) -> bool {
    *NVENC_ENCODER.get_or_init(|| encoder_available(ffmpeg, "h264_nvenc"))
}

pub(crate) fn encoder_available(ffmpeg: &Path, name: &str) -> bool {
    Command::new(ffmpeg)
        .args(["-hide_banner", "-encoders"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains(name))
        .unwrap_or(false)
}

pub(crate) fn has_subtitles(opts: &OptimizeOptions) -> bool {
    !opts.subtitle_cards.is_empty()
        || opts
            .srt_path
            .as_ref()
            .is_some_and(|p| !p.trim().is_empty())
}

pub(crate) fn is_h264_codec(codec: &str) -> bool {
    matches!(codec, "h264" | "avc1" | "avc" | "h264_videotoolbox")
}

/// Trim-only export without re-encode when filters/codecs unchanged.
pub(crate) fn can_stream_copy(opts: &OptimizeOptions, info: &VideoInfo) -> bool {
    is_mp4_family(&opts.format)
        && opts.resolution == "original"
        && effective_speed(opts.speed) == 1.0
        && !opts.use_hevc
        && !opts.denoise
        && !opts.denoise_audio
        && !opts.normalize_audio
        && !opts.remove_audio
        && !has_subtitles(opts)
        && !has_spatial_crop(opts)
        && !has_geometry_transform(opts)
        && !has_fades(opts)
        && !volume_changed(opts)
        && opts.keep_ranges.len() <= 1
        && is_h264_codec(&info.codec)
}



pub(crate) fn effective_keep_ranges(opts: &OptimizeOptions) -> Vec<(f64, f64)> {
    if !opts.keep_ranges.is_empty() {
        return opts
            .keep_ranges
            .iter()
            .filter(|r| r.end > r.start + 0.05)
            .map(|r| (r.start, r.end))
            .collect();
    }
    match (opts.trim_start, opts.trim_end) {
        (Some(s), Some(e)) if e > s => vec![(s, e)],
        (Some(s), None) => vec![(s, f64::MAX)],
        (None, Some(e)) if e > 0.0 => vec![(0.0, e)],
        _ => vec![],
    }
}

pub(crate) fn build_stream_copy_args(opts: &OptimizeOptions, input: &str, output: &str) -> Vec<String> {
    let mut a: Vec<String> = vec!["-y".into(), "-hide_banner".into(), "-loglevel".into(), "error".into()];
    if let Some(start) = opts.trim_start {
        if start > 0.0 {
            a.push("-ss".into());
            a.push(format!("{start:.3}"));
        }
    }
    a.push("-i".into());
    a.push(input.to_string());
    if let Some(dur) = trim_duration(opts) {
        a.push("-t".into());
        a.push(format!("{dur:.3}"));
    }
    a.extend([
        "-c".into(),
        "copy".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        output.to_string(),
    ]);
    a
}






pub(crate) fn append_mp4_video_codec(
    a: &mut Vec<String>,
    opts: &OptimizeOptions,
    pv: &PresetValues,
    hw_h264: bool,
    hw_hevc: bool,
    nvenc: bool,
    faststart: bool,
    use_hevc: bool,
) {
    let push_faststart = |out: &mut Vec<String>| {
        if faststart {
            out.extend(["-movflags".into(), "+faststart".into()]);
        }
    };

    if use_hevc {
        if hw_hevc {
            a.extend([
                "-c:v", "hevc_videotoolbox",
                "-q:v", pv.vt_quality,
                "-tag:v", "hvc1",
                "-allow_sw", "1",
                "-realtime", "1",
                "-pix_fmt", "yuv420p",
            ]
            .map(String::from));
            push_faststart(a);
            return;
        }
        a.extend([
            "-c:v", "libx265",
            "-preset", pv.x264_preset,
            "-crf", pv.x264_crf,
            "-pix_fmt", "yuv420p",
            "-tag:v", "hvc1",
        ]
        .map(String::from));
        push_faststart(a);
        a.push("-threads".into());
        a.push("0".into());
        return;
    }
    if hw_h264 {
        a.extend([
            "-c:v", "h264_videotoolbox",
            "-q:v", pv.vt_quality,
            "-allow_sw", "1",
            "-realtime", "1",
            "-pix_fmt", "yuv420p",
        ]
        .map(String::from));
        push_faststart(a);
        return;
    }
    if nvenc {
        let nv_preset = match opts.preset.as_str() {
            "small" => "p1",
            "high" => "p5",
            _ => "p4",
        };
        a.extend([
            "-c:v", "h264_nvenc",
            "-preset", nv_preset,
            "-rc", "vbr",
            "-cq", pv.x264_crf,
            "-pix_fmt", "yuv420p",
        ]
        .map(String::from));
        push_faststart(a);
        return;
    }
    a.extend([
        "-c:v", "libx264",
        "-preset", pv.x264_preset,
        "-crf", pv.x264_crf,
        "-pix_fmt", "yuv420p",
        "-tune", "fastdecode",
    ]
    .map(String::from));
    push_faststart(a);
    a.push("-threads".into());
    a.push("0".into());
}

/// Stream-copy audio when we are not changing it (big win on long clips).
pub(crate) fn can_copy_audio(opts: &OptimizeOptions, info: &VideoInfo, speed: f64) -> bool {
    info.has_audio
        && !opts.remove_audio
        && !opts.denoise_audio
        && !opts.normalize_audio
        && !volume_changed(opts)
        && effective_speed(speed) == 1.0
        && is_mp4_family(&opts.format)
        && opts.keep_ranges.len() <= 1
}

pub fn analyze_video_info(info: &VideoInfo) -> VideoAnalyze {
    let duration = info.duration_secs.max(0.01);
    let bitrate_mbps = info.bitrate_bps as f64 / 1_000_000.0;
    let bytes_per_sec = info.size_bytes as f64 / duration;
    let has_room_to_compress = bitrate_mbps > 4.5 || bytes_per_sec > 900_000.0;

    let suggested_preset = if bitrate_mbps > 9.0 || bytes_per_sec > 1_800_000.0 {
        "small"
    } else if bitrate_mbps > 4.5 || bytes_per_sec > 900_000.0 {
        "medium"
    } else {
        "high"
    };

    let suggested_resolution = if info.height > 1440 {
        "1080p"
    } else if info.height > 900 {
        "720p"
    } else {
        "original"
    };

    let mut notes: Vec<String> = Vec::new();
    if has_room_to_compress {
        notes.push("Nahrávka má vysoký bitrate — kompresia výrazne zmenší súbor.".into());
    }
    if info.height > 1080 {
        notes.push("Rozlíšenie nad 1080p — zvážte downscale na 1080p alebo 720p.".into());
    }
    if info.fps > 45.0 {
        notes.push("Vysoká snímková frekvencia — export môže trvať dlhšie.".into());
    }
    if notes.is_empty() {
        notes.push("Súbor je už relatívne kompaktný — preset high alebo original rozlíšenie.".into());
    }

    VideoAnalyze {
        can_stream_copy_trim: true,
        suggested_preset: suggested_preset.into(),
        suggested_resolution: suggested_resolution.into(),
        bitrate_mbps,
        bytes_per_sec,
        has_room_to_compress,
        notes,
        info: info.clone(),
    }
}






pub(crate) fn hwaccel_input_args() -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        vec!["-hwaccel".into(), "videotoolbox".into()]
    }
    #[cfg(not(target_os = "macos"))]
    {
        vec![]
    }
}

pub(crate) fn build_args(
    opts: &OptimizeOptions,
    input: &str,
    output: &str,
    info: &VideoInfo,
    hw_h264: bool,
    hw_hevc: bool,
    nvenc: bool,
) -> Vec<String> {
    let ranges = effective_keep_ranges(opts);
    let multi = ranges.len() > 1;

    if !multi && can_stream_copy(opts, info) {
        return build_stream_copy_args(opts, input, output);
    }

    let mut a: Vec<String> = vec!["-y".into(), "-hide_banner".into(), "-loglevel".into(), "error".into()];

    a.extend(hwaccel_input_args());

    if !multi {
        if let Some((start, _)) = ranges.first() {
            if *start > 0.0 && *start < 1.0e9 {
                a.push("-ss".into());
                a.push(format!("{start:.3}"));
            }
        } else if let Some(start) = opts.trim_start {
            if start > 0.0 {
                a.push("-ss".into());
                a.push(format!("{start:.3}"));
            }
        }
    }

    a.push("-i".into());
    a.push(input.to_string());

    if !multi {
        if let Some((start, end)) = ranges.first() {
            if *end < 1.0e9 {
                a.push("-t".into());
                a.push(format!("{:.3}", end - start));
            }
        } else if let Some(dur) = trim_duration(opts) {
            a.push("-t".into());
            a.push(format!("{dur:.3}"));
        }
    }

    let height = resolution_height(&opts.resolution);
    let pv = preset_values(&opts.preset);
    let format = opts.format.as_str();
    let speed = effective_speed(opts.speed);
    let use_audio = info.has_audio && !opts.remove_audio && format != "gif";
    let copy_audio = can_copy_audio(opts, info, opts.speed) && !multi;

    if multi {
        // Join keep-ranges with filter_complex, then apply shared video filters.
        let mut parts: Vec<String> = Vec::new();
        let mut concat_in = String::new();
        for (i, (start, end)) in ranges.iter().enumerate() {
            let end_clamped = if *end >= 1.0e9 { *start + 36000.0 } else { *end };
            parts.push(format!(
                "[0:v]trim=start={start:.3}:end={end_clamped:.3},setpts=PTS-STARTPTS[v{i}]"
            ));
            if use_audio {
                parts.push(format!(
                    "[0:a]atrim=start={start:.3}:end={end_clamped:.3},asetpts=PTS-STARTPTS[a{i}]"
                ));
                concat_in.push_str(&format!("[v{i}][a{i}]"));
            } else {
                concat_in.push_str(&format!("[v{i}]"));
            }
        }
        let n = ranges.len();
        if use_audio {
            parts.push(format!("{concat_in}concat=n={n}:v=1:a=1[vc][ac]"));
        } else {
            parts.push(format!("{concat_in}concat=n={n}:v=1:a=0[vc]"));
        }

        let mut post: Vec<String> = Vec::new();
        append_video_filters(&mut post, opts, height, format, trim_duration(opts));
        if post.is_empty() {
            parts.push("[vc]null[outv]".into());
        } else {
            parts.push(format!("[vc]{}[outv]", post.join(",")));
        }

        a.push("-filter_complex".into());
        a.push(parts.join(";"));
        a.extend(["-map".into(), "[outv]".into()]);
        if use_audio {
            let mut af: Vec<String> = Vec::new();
            append_audio_filters(&mut af, opts, speed);
            if af.is_empty() {
                a.extend(["-map".into(), "[ac]".into()]);
            } else {
                a.extend(["-map".into(), "[ac]".into()]);
                a.push("-af".into());
                a.push(af.join(","));
            }
        }
    } else {
        let mut vf: Vec<String> = Vec::new();
        append_video_filters(&mut vf, opts, height, format, trim_duration(opts));
        if !vf.is_empty() {
            a.push("-vf".into());
            a.push(vf.join(","));
        }

        if use_audio && !copy_audio {
            let mut af: Vec<String> = Vec::new();
            append_audio_filters(&mut af, opts, speed);
            if !af.is_empty() {
                a.push("-af".into());
                a.push(af.join(","));
            }
        }
    }

    match format {
        "webm" => {
            let cpu_used = match opts.preset.as_str() {
                "small" => "8",
                "high" => "2",
                _ => "4",
            };
            a.extend([
                "-c:v", "libvpx-vp9",
                "-b:v", "0",
                "-crf", pv.vp9_crf,
                "-row-mt", "1",
                "-deadline", "realtime",
                "-cpu-used", cpu_used,
            ].map(String::from));
            if use_audio {
                a.extend(["-c:a", "libopus", "-b:a", pv.audio_bitrate].map(String::from));
            } else {
                a.push("-an".into());
            }
        }
        "gif" => {
            a.extend(["-loop", "0", "-an"].map(String::from));
        }
        "avi" => {
            // AVI + H.264; MP3 audio for widest player compatibility.
            a.extend([
                "-c:v", "libx264",
                "-preset", pv.x264_preset,
                "-crf", pv.x264_crf,
                "-pix_fmt", "yuv420p",
            ]
            .map(String::from));
            a.push("-threads".into());
            a.push("0".into());
            if use_audio {
                a.extend(["-c:a", "libmp3lame", "-b:a", pv.audio_bitrate].map(String::from));
            } else {
                a.push("-an".into());
            }
        }
        "mpeg" | "mpg" => {
            let v_bitrate = match opts.preset.as_str() {
                "small" => "2500k",
                "high" => "8000k",
                _ => "5000k",
            };
            a.extend([
                "-c:v", "mpeg2video",
                "-b:v", v_bitrate,
                "-maxrate", v_bitrate,
                "-bufsize", "4M",
                "-pix_fmt", "yuv420p",
            ]
            .map(String::from));
            if use_audio {
                a.extend(["-c:a", "mp2", "-b:a", "192k"].map(String::from));
            } else {
                a.push("-an".into());
            }
        }
        "ogv" => {
            let qv = match opts.preset.as_str() {
                "small" => "5",
                "high" => "8",
                _ => "7",
            };
            a.extend([
                "-c:v", "libtheora",
                "-q:v", qv,
                "-pix_fmt", "yuv420p",
            ]
            .map(String::from));
            if use_audio {
                a.extend(["-c:a", "libvorbis", "-q:a", "5"].map(String::from));
            } else {
                a.push("-an".into());
            }
        }
        "3gp" => {
            a.extend([
                "-c:v", "libx264",
                "-preset", pv.x264_preset,
                "-crf", pv.x264_crf,
                "-profile:v", "baseline",
                "-level", "3.0",
                "-pix_fmt", "yuv420p",
                "-f", "3gp",
            ]
            .map(String::from));
            a.push("-threads".into());
            a.push("0".into());
            if use_audio {
                a.extend(["-c:a", "aac", "-b:a", "96k", "-ac", "1", "-ar", "22050"].map(String::from));
            } else {
                a.push("-an".into());
            }
        }
        _ if uses_h264_aac_path(format) => {
            // mp4 | mov | m4v | mkv | ts | flv
            let faststart = is_mp4_family(format);
            let allow_hevc = matches!(format, "mp4" | "mov" | "m4v" | "mkv") && opts.use_hevc;
            append_mp4_video_codec(&mut a, opts, &pv, hw_h264, hw_hevc, nvenc, faststart, allow_hevc);
            if format == "ts" {
                a.extend(["-f", "mpegts"].map(String::from));
            } else if format == "flv" {
                a.extend(["-f", "flv"].map(String::from));
            }
            if use_audio {
                if copy_audio && is_mp4_family(format) {
                    a.extend(["-c:a", "copy"].map(String::from));
                } else {
                    a.extend(["-c:a", "aac", "-b:a", pv.audio_bitrate].map(String::from));
                }
            } else {
                a.push("-an".into());
            }
        }
        _ => {
            // Unknown → treat as MP4
            append_mp4_video_codec(&mut a, opts, &pv, hw_h264, hw_hevc, nvenc, true, opts.use_hevc);
            if use_audio {
                a.extend(["-c:a", "aac", "-b:a", pv.audio_bitrate].map(String::from));
            } else {
                a.push("-an".into());
            }
        }
    }

    a.extend(["-progress", "pipe:1", "-nostats"].map(String::from));
    a.push(output.to_string());
    a
}

pub(crate) fn trim_duration(opts: &OptimizeOptions) -> Option<f64> {
    let ranges = effective_keep_ranges(opts);
    if ranges.is_empty() {
        return None;
    }
    let mut total = 0.0;
    for (s, e) in ranges {
        if e < 1.0e9 {
            total += e - s;
        }
    }
    if total > 0.0 {
        Some(total)
    } else {
        None
    }
}

/// Unique, non-clobbering output path in the same directory as the input.
/// Stems go through `export_plan::sanitize_stem` (GIF / titled exports).
pub(crate) fn build_output_path(opts: &OptimizeOptions, input: &Path) -> PathBuf {
    let dir = input.parent().unwrap_or_else(|| Path::new("."));
    let ext = ext_for_format(&opts.format);

    let raw = if let Some(name) = opts.output_name.as_ref().filter(|n| !n.trim().is_empty()) {
        name.clone()
    } else {
        let stem = input.file_stem().and_then(|s| s.to_str()).unwrap_or("video");
        format!("{stem}-{}-{}", opts.resolution, opts.preset)
    };
    let base = crate::export_plan::sanitize_stem(&raw);
    let base = if base.is_empty() {
        "export".to_string()
    } else {
        base
    };

    crate::util::unique_path(dir, &format!("{base}.{ext}"))
}

