use super::*;
use std::fs;

fn sample_info() -> VideoInfo {
    VideoInfo {
        width: 1920,
        height: 1080,
        fps: 30.0,
        codec: "h264".into(),
        duration_secs: 60.0,
        bitrate_bps: 8_000_000,
        size_bytes: 60_000_000,
        has_audio: true,
    }
}

fn opts(preset: &str, resolution: &str, format: &str) -> OptimizeOptions {
    OptimizeOptions {
        input_path: "/tmp/in.mp4".to_string(),
        preset: preset.to_string(),
        resolution: resolution.to_string(),
        format: format.to_string(),
        trim_start: None,
        trim_end: None,
        speed: 1.0,
        output_name: None,
        add_to_library: true,
        replace_original: false,
        srt_path: None,
        subtitle_cards: vec![],
        denoise: false,
        normalize_audio: false,
        remove_audio: false,
        use_hevc: false,
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
fn can_stream_copy_when_trim_only_h264() {
    let info = sample_info();
    let mut o = opts("medium", "original", "mp4");
    o.trim_start = Some(1.0);
    o.trim_end = Some(10.0);
    assert!(can_stream_copy(&o, &info));
    o.resolution = "720p".into();
    assert!(!can_stream_copy(&o, &info));
}

#[test]
fn stream_copy_args_use_codec_copy() {
    let info = sample_info();
    let o = opts("medium", "original", "mp4");
    let args = build_args(&o, "/tmp/in.mp4", "/tmp/out.mp4", &info, false, false, false);
    assert!(args.windows(2).any(|w| w == ["-c", "copy"]));
    assert!(args.windows(2).any(|w| w == ["-movflags", "+faststart"]));
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
    let info = sample_info();
    let args = build_args(&o, "/tmp/in.mp4", "/tmp/out.mp4", &info, false, false, false);

    assert!(args.windows(2).any(|w| w == ["-c:v", "libx264"]));
    assert!(args.iter().any(|a| a.contains("scale=-2:720")));
    assert!(args.iter().any(|a| a.contains("fast_bilinear")));
    assert!(args.windows(2).any(|w| w == ["-progress", "pipe:1"]));
    assert_eq!(args.last().unwrap(), "/tmp/out.mp4");
}

#[test]
fn build_args_videotoolbox_when_hw_enabled() {
    let o = opts("medium", "720p", "mp4");
    let info = sample_info();
    let args = build_args(&o, "/tmp/in.mp4", "/tmp/out.mp4", &info, true, false, false);
    assert!(args.windows(2).any(|w| w == ["-c:v", "h264_videotoolbox"]));
    assert!(args.windows(2).any(|w| w == ["-q:v", "58"]));
}

#[test]
fn build_args_hevc_uses_videotoolbox_when_available() {
    let mut o = opts("medium", "720p", "mp4");
    o.use_hevc = true;
    let info = sample_info();
    let args = build_args(&o, "/tmp/in.mp4", "/tmp/out.mp4", &info, true, true, false);
    assert!(args.windows(2).any(|w| w == ["-c:v", "hevc_videotoolbox"]));
}

#[test]
fn build_args_denoise_and_normalize() {
    let mut o = opts("medium", "720p", "mp4");
    o.denoise = true;
    o.normalize_audio = true;
    let info = sample_info();
    let args = build_args(&o, "/tmp/in.mp4", "/tmp/out.mp4", &info, false, false, false);
    assert!(args.iter().any(|a| a.contains("hqdn3d")));
    assert!(args.iter().any(|a| a.contains("dynaudnorm")));
}

#[test]
fn build_args_no_audio_uses_an() {
    let mut o = opts("small", "original", "mp4");
    o.remove_audio = true;
    let mut info = sample_info();
    info.has_audio = true;
    let args = build_args(&o, "/tmp/in.mp4", "/tmp/out.mp4", &info, false, false, false);
    assert!(args.iter().any(|a| a == "-an"));
}

#[test]
fn build_args_speed_applies_setpts_and_atempo() {
    let mut o = opts("medium", "720p", "mp4");
    o.speed = 2.0;
    let info = sample_info();
    let args = build_args(&o, "/tmp/in.mp4", "/tmp/out.mp4", &info, false, false, false);
    assert!(args.iter().any(|a| a.contains("setpts=PTS/2")));
    assert!(args.iter().any(|a| a.contains("atempo=2.0000")));
}

#[test]
fn build_args_gif_has_fps_and_no_audio() {
    let o = opts("medium", "480p", "gif");
    let info = sample_info();
    let args = build_args(&o, "/tmp/in.mp4", "/tmp/out.gif", &info, false, false, false);
    assert!(args.iter().any(|a| a.contains("fps=12")));
    assert!(args.iter().any(|a| a == "-an"));
}

#[test]
fn analyze_video_suggests_compression_for_heavy_clips() {
    let info = sample_info();
    let analysis = analyze_video_info(&info);
    assert!(analysis.has_room_to_compress);
    assert_eq!(analysis.suggested_preset, "medium");
}

#[test]
fn export_estimate_marks_stream_copy() {
    let info = sample_info();
    let o = opts("medium", "original", "mp4");
    let est = compute_export_estimate(&info, &o);
    assert!(est.stream_copy);
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

#[test]
fn parse_srt_reads_basic_file() {
    let dir = std::env::temp_dir().join(format!("bloom-srt-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("test.srt");
    fs::write(
        &path,
        "1\n00:00:01,000 --> 00:00:03,000\nAhoj svet\n\n",
    )
    .unwrap();
    let cards = parse_srt(path.to_str().unwrap()).unwrap();
    assert_eq!(cards.len(), 1);
    assert_eq!(cards[0].text, "Ahoj svet");
    fs::remove_dir_all(&dir).ok();
}
