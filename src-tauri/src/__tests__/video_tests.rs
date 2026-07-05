use super::*;
use std::fs;

fn opts(preset: &str, resolution: &str, format: &str) -> OptimizeOptions {
    OptimizeOptions {
        input_path: "/tmp/in.mp4".to_string(),
        preset: preset.to_string(),
        resolution: resolution.to_string(),
        format: format.to_string(),
        trim_start: None,
        trim_end: None,
        output_name: None,
        add_to_library: true,
    }
}

#[test]
fn frame_rate_parsing() {
    assert!((parse_frame_rate("30000/1001") - 29.97).abs() < 0.01);
    assert_eq!(parse_frame_rate("25"), 25.0);
    assert_eq!(parse_frame_rate("0/0"), 0.0);
    assert_eq!(parse_frame_rate("garbage"), 0.0);
}

#[test]
fn preset_values_map_correctly() {
    assert_eq!(preset_values("small").x264_crf, "30");
    assert_eq!(preset_values("high").x264_crf, "20");
    assert_eq!(preset_values("medium").x264_crf, "25");
    assert_eq!(preset_values("bogus").x264_crf, "25");
}

#[test]
fn resolution_and_format_helpers() {
    assert_eq!(resolution_height("480p"), Some(480));
    assert_eq!(resolution_height("720p"), Some(720));
    assert_eq!(resolution_height("1080p"), Some(1080));
    assert_eq!(resolution_height("original"), None);

    assert_eq!(ext_for_format("mp4"), "mp4");
    assert_eq!(ext_for_format("webm"), "webm");
    assert_eq!(ext_for_format("gif"), "gif");
    assert_eq!(ext_for_format("whatever"), "mp4");
}

#[test]
fn trim_duration_logic() {
    let mut o = opts("medium", "720p", "mp4");
    assert_eq!(trim_duration(&o), None);
    o.trim_start = Some(2.0);
    o.trim_end = Some(5.0);
    assert_eq!(trim_duration(&o), Some(3.0));
    o.trim_start = None;
    o.trim_end = Some(4.0);
    assert_eq!(trim_duration(&o), Some(4.0));
    o.trim_start = Some(5.0);
    o.trim_end = Some(1.0);
    assert_eq!(trim_duration(&o), None);
}

#[test]
fn progress_seconds_parsing() {
    assert_eq!(parse_progress_seconds("out_time_us=1500000"), Some(1.5));
    assert_eq!(parse_progress_seconds("out_time_ms=2000000"), Some(2.0));
    assert_eq!(parse_progress_seconds("out_time=00:00:02.500000"), Some(2.5));
    assert_eq!(parse_progress_seconds("out_time=01:02:03.000000"), Some(3723.0));
    assert_eq!(parse_progress_seconds("progress=continue"), None);
    assert_eq!(parse_progress_seconds("frame=42"), None);
}

#[test]
fn build_args_mp4_with_scale_and_progress() {
    let o = opts("medium", "720p", "mp4");
    let args = build_args(&o, "/tmp/in.mp4", "/tmp/out.mp4", true);

    assert!(args.windows(2).any(|w| w == ["-c:v", "libx264"]));
    assert!(args.windows(2).any(|w| w == ["-c:a", "aac"]));
    assert!(args.iter().any(|a| a == "scale=-2:720"));
    assert!(args.windows(2).any(|w| w == ["-progress", "pipe:1"]));
    assert_eq!(args.last().unwrap(), "/tmp/out.mp4");
}

#[test]
fn build_args_no_audio_uses_an() {
    let o = opts("small", "original", "mp4");
    let args = build_args(&o, "/tmp/in.mp4", "/tmp/out.mp4", false);
    assert!(args.iter().any(|a| a == "-an"));
    assert!(!args.iter().any(|a| a.starts_with("scale=")));
}

#[test]
fn build_args_gif_has_fps_and_no_audio() {
    let o = opts("medium", "480p", "gif");
    let args = build_args(&o, "/tmp/in.mp4", "/tmp/out.gif", true);
    assert!(args.iter().any(|a| a.contains("fps=12")));
    assert!(args.iter().any(|a| a == "-an"));
}

#[test]
fn build_output_path_avoids_clobbering() {
    let dir = std::env::temp_dir().join(format!("bloom-vid-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    let input = dir.join("clip.mp4");
    fs::write(&input, b"x").unwrap();

    let o = opts("medium", "720p", "mp4");
    let first = build_output_path(&o, &input);
    assert_eq!(first.file_name().unwrap().to_str().unwrap(), "clip-720p-medium.mp4");

    fs::write(&first, b"x").unwrap();
    let second = build_output_path(&o, &input);
    assert_eq!(second.file_name().unwrap().to_str().unwrap(), "clip-720p-medium-2.mp4");

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn tail_lines_keeps_last_non_empty_lines() {
    let text = "line1\n\nline2\nline3\nline4";
    assert_eq!(tail_lines(text, 2), "line3\nline4");
}

#[test]
fn shell_path_prefix_includes_homebrew_on_macos() {
    let prefix = shell_path_prefix();
    #[cfg(target_os = "macos")]
    {
        assert!(prefix.contains("/opt/homebrew/bin"));
        assert!(prefix.contains("/usr/local/bin"));
    }
}

#[test]
fn ffprobe_prefers_sibling_next_to_ffmpeg() {
    use std::os::unix::fs::PermissionsExt;

    let dir = std::env::temp_dir().join(format!("bloom-ffprobe-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();

    let ffmpeg = dir.join("ffmpeg");
    let ffprobe = dir.join("ffprobe");
    fs::write(&ffmpeg, b"#!/bin/sh\necho ffmpeg\n").unwrap();
    fs::write(&ffprobe, b"#!/bin/sh\necho ffprobe\n").unwrap();
    for path in [&ffmpeg, &ffprobe] {
        let mut perms = fs::metadata(path).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(path, perms).unwrap();
    }

    let found = find_ffprobe(Some(&ffmpeg));
    assert_eq!(found.as_deref(), Some(ffprobe.as_path()));

    fs::remove_dir_all(&dir).ok();
}
