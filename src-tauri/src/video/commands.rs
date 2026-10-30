use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
};

use serde::Deserialize;
use tauri::{Emitter, Manager};
use uuid::Uuid;

use crate::types::RecordingEntry;
use crate::{meta_path_for, now_iso, RecordingMeta};

use super::*;
// ────────────────────────────────────────────────────────────────────────────
// Commands
// ────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn check_ffmpeg() -> FfmpegStatus {
    build_ffmpeg_status()
}

#[tauri::command]
pub async fn install_ffmpeg() -> Result<FfmpegInstallResult, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let result = install_ffmpeg_blocking();
        clear_media_tool_cache();
        result
    })
    .await
    .map_err(|e| format!("Install task failed: {e}"))
}

#[tauri::command]
pub async fn get_video_info(path: String) -> Result<VideoInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ffmpeg = find_ffmpeg();
        let ffprobe = find_ffprobe(ffmpeg.as_deref()).ok_or_else(|| "ffprobe not found".to_string())?;
        probe_cached(&ffprobe, &path)
    })
    .await
    .map_err(|e| format!("Probe task failed: {e}"))?
}

#[tauri::command]
pub async fn get_thumbnail(
    app: tauri::AppHandle,
    id: String,
    at_secs: Option<f64>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = crate::bloom_dir(&app)?;
        let entry = crate::find_recording(&dir, &id).ok_or_else(|| format!("Recording {id} not found"))?;
        let video = PathBuf::from(&entry.path);

        let thumb = thumbnail_path_for(&video);
        if thumb.exists() {
            return Ok(thumb.to_string_lossy().into_owned());
        }

        let ffmpeg = find_ffmpeg().ok_or_else(|| "ffmpeg nie je nainštalovaný".to_string())?;
        let at = at_secs.unwrap_or_else(|| (entry.meta.duration_secs * 0.1).max(0.0));
        let path = make_thumbnail(&ffmpeg, &video, at)?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| format!("Thumbnail task failed: {e}"))?
}

#[tauri::command]
pub fn optimize_video(
    app: tauri::AppHandle,
    state: tauri::State<VideoJobs>,
    options: OptimizeOptions,
) -> Result<String, String> {
    use crate::error::{coded, codes};
    use crate::export_plan::{plan_export_inner, PlanExportRequest};

    let options = plan_export_inner(PlanExportRequest {
        options,
        speech_ranges: vec![],
        preferred_stem: None,
    })?
    .options;

    let ffmpeg = find_ffmpeg().ok_or_else(|| {
        coded(
            codes::FFMPEG_MISSING,
            "ffmpeg nie je nainštalovaný. Nainštaluj ho a skús znova.",
        )
    })?;
    let ffprobe = find_ffprobe(Some(&ffmpeg)).ok_or_else(|| {
        coded(
            codes::FFMPEG_MISSING,
            "ffprobe nie je nainštalovaný. Nainštaluj ffmpeg a skús znova.",
        )
    })?;

    let input = PathBuf::from(&options.input_path);
    if !input.exists() {
        return Err(coded(codes::VIDEO_MISSING, "Vstupné video neexistuje"));
    }

    // Determine total duration for progress (trimmed window or full clip).
    let info = probe_cached(&ffprobe, &options.input_path)?;
    let total_secs = trim_duration(&options).unwrap_or(info.duration_secs)
        / effective_speed(options.speed);

    let output = if options.replace_original {
        input.with_extension("bloom-replace.tmp.mp4")
    } else {
        build_output_path(&options, &input)
    };
    let hw_h264 = videotoolbox_available(&ffmpeg);
    let hw_hevc = hevc_videotoolbox_available(&ffmpeg);
    let nvenc = nvenc_available(&ffmpeg) && !hw_h264;
    let args = build_args(
        &options,
        &options.input_path,
        &output.to_string_lossy(),
        &info,
        hw_h264,
        hw_hevc,
        nvenc,
    );

    let job_id = Uuid::new_v4().to_string();
    let cancel = Arc::new(AtomicBool::new(false));
    state.0.lock().unwrap().insert(job_id.clone(), cancel.clone());

    let app_clone = app.clone();
    let add_to_library = options.add_to_library && !options.replace_original;
    let ffmpeg_thumb = ffmpeg.clone();
    let worker_job_id = job_id.clone();

    std::thread::spawn(move || {
        run_optimize(
            app_clone,
            worker_job_id,
            ffmpeg,
            ffmpeg_thumb,
            args,
            input,
            output,
            total_secs,
            add_to_library,
            options,
            cancel,
        );
    });

    Ok(job_id)
}

#[tauri::command]
pub async fn analyze_video(path: String) -> Result<VideoAnalyze, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ffprobe = find_ffprobe(find_ffmpeg().as_deref())
            .ok_or_else(|| "ffprobe not found".to_string())?;
        let info = probe_cached(&ffprobe, &path)?;
        Ok(analyze_video_info(&info))
    })
    .await
    .map_err(|e| format!("Analyze task failed: {e}"))?
}

#[tauri::command]
pub async fn get_filmstrip(
    path: String,
    frame_count: Option<u32>,
    duration_hint: Option<f64>,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || build_filmstrip(&path, frame_count, duration_hint))
        .await
        .map_err(|e| format!("Filmstrip task failed: {e}"))?
}

pub(crate) fn build_filmstrip(
    path: &str,
    frame_count: Option<u32>,
    duration_hint: Option<f64>,
) -> Result<Vec<String>, String> {
    let video = PathBuf::from(path);
    if !video.exists() {
        return Err("Video súbor neexistuje".into());
    }

    let count = frame_count.unwrap_or(12).clamp(6, 20);

    // Fast path: all strip frames already on disk — no probe, no ffmpeg.
    let mut cached = Vec::with_capacity(count as usize);
    let mut all_cached = true;
    for i in 0..count {
        let thumb = filmstrip_path_for(&video, i);
        if thumb.exists() {
            cached.push(thumb.to_string_lossy().into_owned());
        } else {
            all_cached = false;
            break;
        }
    }
    if all_cached {
        return Ok(cached);
    }

    let duration = if let Some(d) = duration_hint.filter(|d| *d > 0.05) {
        d
    } else {
        let ffmpeg = find_ffmpeg().ok_or_else(|| "ffmpeg nie je nainštalovaný".to_string())?;
        let ffprobe = find_ffprobe(Some(&ffmpeg)).ok_or_else(|| "ffprobe not found".to_string())?;
        probe_cached(&ffprobe, path)?.duration_secs.max(0.1)
    };

    let ffmpeg = find_ffmpeg().ok_or_else(|| "ffmpeg nie je nainštalovaný".to_string())?;

    // Parallel keyframe seeks (bounded) — big win on multi-GB sources.
    let jobs: Vec<(u32, f64, PathBuf)> = (0..count)
        .map(|i| {
            let t = if count <= 1 {
                0.0
            } else {
                duration * i as f64 / (count - 1) as f64
            };
            (i, t, filmstrip_path_for(&video, i))
        })
        .collect();

    let errors = Mutex::new(Vec::<String>::new());
    let next = AtomicUsize::new(0);
    let parallelism = 4usize.min(count as usize).max(1);

    std::thread::scope(|scope| {
        for _ in 0..parallelism {
            let ffmpeg = &ffmpeg;
            let video = &video;
            let jobs = &jobs;
            let errors = &errors;
            let next = &next;
            scope.spawn(move || {
                loop {
                    let idx = next.fetch_add(1, Ordering::Relaxed);
                    if idx >= jobs.len() {
                        break;
                    }
                    let (_i, t, thumb) = &jobs[idx];
                    if thumb.exists() {
                        continue;
                    }
                    if let Err(e) = make_thumbnail_scaled(ffmpeg, video, *t, thumb, 72) {
                        errors.lock().unwrap().push(e);
                    }
                }
            });
        }
    });

    let errs = errors.into_inner().unwrap();
    if !errs.is_empty() && jobs.iter().any(|(_, _, p)| !p.exists()) {
        return Err(errs.into_iter().next().unwrap_or_else(|| "Filmstrip zlyhal".into()));
    }

    Ok(jobs
        .into_iter()
        .map(|(_, _, p)| p.to_string_lossy().into_owned())
        .collect())
}

#[tauri::command]
pub async fn estimate_export(options: OptimizeOptions) -> Result<ExportEstimate, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ffprobe = find_ffprobe(find_ffmpeg().as_deref())
            .ok_or_else(|| "ffprobe not found".to_string())?;
        let info = probe_cached(&ffprobe, &options.input_path)?;
        Ok(compute_export_estimate(&info, &options))
    })
    .await
    .map_err(|e| format!("Estimate task failed: {e}"))?
}

#[tauri::command]
pub fn cancel_optimize(state: tauri::State<VideoJobs>, job_id: String) -> Result<(), String> {
    if let Some(flag) = state.0.lock().unwrap().get(&job_id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

// ────────────────────────────────────────────────────────────────────────────
// Concat + click spotlight
// ────────────────────────────────────────────────────────────────────────────

/// Side files that travel with a video (thumbnail, filmstrip, click track).
pub(crate) fn companion_paths(video: &Path) -> Vec<PathBuf> {
    let mut v = vec![thumbnail_path_for(video), video.with_extension("clicks.jsonl")];
    for i in 0..24 {
        v.push(filmstrip_path_for(video, i));
    }
    v
}

/// Probe `output`, write its sidecar + thumbnail and return a library entry.
pub(crate) fn register_new_output(
    root: &Path,
    ffmpeg: &Path,
    ffprobe: Option<&Path>,
    output: &Path,
    base: &RecordingMeta,
    title: String,
    target_label: String,
) -> Result<RecordingEntry, String> {
    let size = std::fs::metadata(output).map(|m| m.len()).unwrap_or(0);
    if size == 0 {
        return Err("ffmpeg produced an empty file".into());
    }
    let duration = ffprobe
        .and_then(|p| probe(p, &output.to_string_lossy()).ok())
        .map(|i| i.duration_secs)
        .unwrap_or(0.0);

    let meta = RecordingMeta {
        id: Uuid::new_v4().to_string(),
        title,
        filename: crate::util::relative_filename(root, output),
        created_at: now_iso(),
        duration_secs: duration,
        file_size_bytes: size,
        source: base.source.clone(),
        quality: base.quality.clone(),
        has_microphone: base.has_microphone,
        has_system_audio: base.has_system_audio,
        target_label,
        starred: false,
        tags: base.tags.clone(),
        folder: base.folder.clone(),
        notes: String::new(),
    };
    let meta_path = meta_path_for(output);
    let json = serde_json::to_string_pretty(&meta).map_err(|e| format!("Serialise error: {e}"))?;
    std::fs::write(&meta_path, json).map_err(|e| format!("Cannot write sidecar: {e}"))?;
    let _ = make_thumbnail(ffmpeg, output, (duration * 0.1).max(0.0));

    Ok(RecordingEntry {
        meta,
        path: output.to_string_lossy().into_owned(),
        meta_path: meta_path.to_string_lossy().into_owned(),
    })
}

pub(crate) fn run_ffmpeg_blocking(ffmpeg: &Path, args: &[String]) -> Result<(), String> {
    let out = Command::new(ffmpeg)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Could not start ffmpeg: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        let text = String::from_utf8_lossy(&out.stderr);
        Err(tail_lines(&text, 4))
    }
}

/// One `file '…'` line for the concat demuxer list.
pub(crate) fn concat_list_line(path: &str) -> String {
    format!("file '{}'\n", path.replace('\'', "'\\''"))
}

pub(crate) fn concat_blocking(
    app: tauri::AppHandle,
    ids: Vec<String>,
    output_name: Option<String>,
) -> Result<RecordingEntry, String> {
    if ids.len() < 2 {
        return Err("Select at least two recordings to join".into());
    }
    let ffmpeg = find_ffmpeg().ok_or_else(|| "ffmpeg nie je nainštalovaný. Nainštaluj ho a skús znova.".to_string())?;
    let ffprobe = find_ffprobe(Some(&ffmpeg));
    let root = crate::bloom_dir(&app)?;

    let mut entries = Vec::with_capacity(ids.len());
    for id in &ids {
        let e = crate::find_recording(&root, id).ok_or_else(|| format!("Recording {id} not found"))?;
        if !Path::new(&e.path).exists() {
            return Err(format!("Video file missing for {}", e.meta.title));
        }
        entries.push(e);
    }

    let first_path = PathBuf::from(&entries[0].path);
    let out_dir = first_path.parent().unwrap_or(&root).to_path_buf();
    let base_name = match output_name.as_ref().filter(|n| !n.trim().is_empty()) {
        Some(n) => {
            let stem = Path::new(n).file_stem().and_then(|s| s.to_str()).unwrap_or(n);
            crate::library::sanitize_stem(stem).replace(' ', "-")
        }
        None => format!(
            "{}-joined",
            crate::library::sanitize_stem(&entries[0].meta.title).replace(' ', "-")
        ),
    };
    let output = crate::util::unique_path(&out_dir, &format!("{base_name}.mp4"));

    let list_path = out_dir.join(format!(".bloom-concat-{}.txt", Uuid::new_v4()));
    let mut list = String::new();
    for e in &entries {
        list.push_str(&concat_list_line(&e.path));
    }
    std::fs::write(&list_path, list).map_err(|e| format!("Cannot write concat list: {e}"))?;

    let head: Vec<String> = [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "concat", "-safe", "0",
        "-i",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    let out_str = output.to_string_lossy().into_owned();

    let mut copy_args = head.clone();
    copy_args.push(list_path.to_string_lossy().into_owned());
    copy_args.extend(
        ["-c", "copy", "-movflags", "+faststart", &out_str]
            .iter()
            .map(|s| s.to_string()),
    );

    let mut result = run_ffmpeg_blocking(&ffmpeg, &copy_args);
    if result.is_err() {
        // Mixed codecs / containers: fall back to a re-encode.
        let _ = std::fs::remove_file(&output);
        let mut enc_args = head;
        enc_args.push(list_path.to_string_lossy().into_owned());
        enc_args.extend(
            [
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", &out_str,
            ]
            .iter()
            .map(|s| s.to_string()),
        );
        result = run_ffmpeg_blocking(&ffmpeg, &enc_args);
    }
    let _ = std::fs::remove_file(&list_path);
    if let Err(e) = result {
        let _ = std::fs::remove_file(&output);
        return Err(if e.is_empty() { "ffmpeg concat failed".into() } else { e });
    }

    let title = output
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("joined")
        .to_string();
    let entry = register_new_output(
        &root,
        &ffmpeg,
        ffprobe.as_deref(),
        &output,
        &entries[0].meta,
        title,
        format!("Joined · {} clips", entries.len()),
    )?;
    let locale = app.state::<crate::i18n::LocaleState>();
    let _ = crate::i18n::refresh_tray_menu(&app, crate::i18n::current_locale(&locale));
    Ok(entry)
}

/// Join recordings (in the given order) with the ffmpeg concat demuxer.
/// Stream-copies when possible and falls back to a re-encode.
#[tauri::command]
pub async fn concat_recordings(
    app: tauri::AppHandle,
    ids: Vec<String>,
    output_name: Option<String>,
) -> Result<RecordingEntry, String> {
    tauri::async_runtime::spawn_blocking(move || concat_blocking(app, ids, output_name))
        .await
        .map_err(|e| format!("Concat task failed: {e}"))?
}

/// Logical rectangle of the captured display (same coordinate space as the click track).
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct CaptureBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub(crate) struct ClickEvent {
    pub t: f64,
    pub x: f64,
    pub y: f64,
}

/// Parse a `.clicks.jsonl` file (`{"t":secs,"x":..,"y":..}` per line); bad lines are skipped.
pub(crate) fn parse_clicks_jsonl(raw: &str) -> Vec<ClickEvent> {
    raw.lines()
        .filter_map(|l| serde_json::from_str::<ClickEvent>(l.trim()).ok())
        .filter(|c| c.t.is_finite() && c.t >= 0.0 && c.x.is_finite() && c.y.is_finite())
        .collect()
}

pub(crate) const SPOTLIGHT_MAX_CLICKS: usize = 300;
pub(crate) const SPOTLIGHT_FLASH_SECS: f64 = 0.3;

/// Build an ffmpeg `-vf` chain that flashes a highlight ring + dot at every click
/// for 0.3 s. Uses `drawbox` + timeline `enable` (cheap, no per-pixel expressions).
pub(crate) fn build_spotlight_filter(
    clicks: &[ClickEvent],
    video_w: u32,
    video_h: u32,
    bounds: CaptureBounds,
) -> Option<String> {
    if video_w == 0 || video_h == 0 || bounds.width <= 0.0 || bounds.height <= 0.0 {
        return None;
    }
    let scale = (video_h as f64 / 1080.0).max(0.5);
    let ring = (34.0 * scale).round() as i64;
    let dot = (7.0 * scale).round().max(2.0) as i64;
    let thick = (4.0 * scale).round().max(2.0) as i64;

    let mut parts: Vec<String> = Vec::new();
    for c in clicks.iter().take(SPOTLIGHT_MAX_CLICKS) {
        let nx = (c.x - bounds.x) / bounds.width;
        let ny = (c.y - bounds.y) / bounds.height;
        if !(0.0..=1.0).contains(&nx) || !(0.0..=1.0).contains(&ny) {
            continue;
        }
        let cx = (nx * video_w as f64).round() as i64;
        let cy = (ny * video_h as f64).round() as i64;
        let t0 = c.t;
        let t1 = c.t + SPOTLIGHT_FLASH_SECS;
        let enable = format!("enable='between(t,{t0:.3},{t1:.3})'");
        parts.push(format!(
            "drawbox=x={}:y={}:w={}:h={}:color=yellow@0.85:t={thick}:{enable}",
            (cx - ring).max(0),
            (cy - ring).max(0),
            ring * 2,
            ring * 2,
        ));
        parts.push(format!(
            "drawbox=x={}:y={}:w={}:h={}:color=yellow@0.9:t=fill:{enable}",
            (cx - dot).max(0),
            (cy - dot).max(0),
            dot * 2,
            dot * 2,
        ));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(","))
    }
}

pub(crate) fn default_capture_bounds(app: &tauri::AppHandle) -> Option<CaptureBounds> {
    let win = app.get_webview_window("main")?;
    let m = win.primary_monitor().ok().flatten()?;
    let scale = m.scale_factor().max(0.1);
    Some(CaptureBounds {
        x: m.position().x as f64 / scale,
        y: m.position().y as f64 / scale,
        width: m.size().width as f64 / scale,
        height: m.size().height as f64 / scale,
    })
}

pub(crate) fn spotlight_blocking(
    app: tauri::AppHandle,
    id: String,
    clicks_path: Option<String>,
    output_name: Option<String>,
    capture_bounds: Option<CaptureBounds>,
) -> Result<RecordingEntry, String> {
    let ffmpeg = find_ffmpeg().ok_or_else(|| "ffmpeg nie je nainštalovaný. Nainštaluj ho a skús znova.".to_string())?;
    let ffprobe = find_ffprobe(Some(&ffmpeg)).ok_or_else(|| "ffprobe nie je nainštalovaný. Nainštaluj ffmpeg a skús znova.".to_string())?;
    let root = crate::bloom_dir(&app)?;
    let entry = crate::find_recording(&root, &id).ok_or_else(|| format!("Recording {id} not found"))?;
    let input = PathBuf::from(&entry.path);
    if !input.exists() {
        return Err("Vstupné video neexistuje".into());
    }

    let clicks_file = clicks_path
        .filter(|p| !p.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| input.with_extension("clicks.jsonl"));
    let raw = std::fs::read_to_string(&clicks_file)
        .map_err(|e| format!("Cannot read click track {}: {e}", clicks_file.display()))?;
    let clicks = parse_clicks_jsonl(&raw);
    if clicks.is_empty() {
        return Err("Click track is empty".into());
    }

    let info = probe(&ffprobe, &input.to_string_lossy())?;
    let bounds = capture_bounds
        .or_else(|| default_capture_bounds(&app))
        .unwrap_or(CaptureBounds {
            x: 0.0,
            y: 0.0,
            width: info.width as f64,
            height: info.height as f64,
        });
    let vf = build_spotlight_filter(&clicks, info.width, info.height, bounds)
        .ok_or_else(|| "No clicks fall inside the captured area".to_string())?;

    let out_dir = input.parent().unwrap_or(&root).to_path_buf();
    let base_name = match output_name.as_ref().filter(|n| !n.trim().is_empty()) {
        Some(n) => {
            let stem = Path::new(n).file_stem().and_then(|s| s.to_str()).unwrap_or(n);
            crate::library::sanitize_stem(stem).replace(' ', "-")
        }
        None => format!(
            "{}-spotlight",
            input.file_stem().and_then(|s| s.to_str()).unwrap_or("video")
        ),
    };
    let output = crate::util::unique_path(&out_dir, &format!("{base_name}.mp4"));

    let copy_audio = matches!(
        input.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(),
        Some("mp4") | Some("m4v") | Some("mov")
    );
    let mut args: Vec<String> = vec![
        "-hide_banner".into(), "-loglevel".into(), "error".into(), "-y".into(),
        "-i".into(), input.to_string_lossy().into_owned(),
        "-vf".into(), vf,
        "-c:v".into(), "libx264".into(), "-preset".into(), "veryfast".into(),
        "-crf".into(), "20".into(), "-pix_fmt".into(), "yuv420p".into(),
    ];
    if copy_audio {
        args.extend(["-c:a".into(), "copy".into()]);
    } else {
        args.extend(["-c:a".into(), "aac".into(), "-b:a".into(), "160k".into()]);
    }
    args.extend(["-movflags".into(), "+faststart".into(), output.to_string_lossy().into_owned()]);

    if let Err(e) = run_ffmpeg_blocking(&ffmpeg, &args) {
        let _ = std::fs::remove_file(&output);
        return Err(if e.is_empty() { "ffmpeg spotlight failed".into() } else { e });
    }

    let title = output
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("spotlight")
        .to_string();
    let entry = register_new_output(
        &root,
        &ffmpeg,
        Some(&ffprobe),
        &output,
        &entry.meta,
        title,
        "Click spotlight".to_string(),
    )?;
    let locale = app.state::<crate::i18n::LocaleState>();
    let _ = crate::i18n::refresh_tray_menu(&app, crate::i18n::current_locale(&locale));
    Ok(entry)
}

/// Burn a highlight flash at every recorded click (reads `<video>.clicks.jsonl`
/// unless `clicks_path` is given) into a new library recording.
#[tauri::command]
pub async fn apply_click_spotlight(
    app: tauri::AppHandle,
    id: String,
    clicks_path: Option<String>,
    output_name: Option<String>,
    capture_bounds: Option<CaptureBounds>,
) -> Result<RecordingEntry, String> {
    tauri::async_runtime::spawn_blocking(move || {
        spotlight_blocking(app, id, clicks_path, output_name, capture_bounds)
    })
    .await
    .map_err(|e| format!("Spotlight task failed: {e}"))?
}

