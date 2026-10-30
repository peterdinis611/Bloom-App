//! Batch optimize — sequential jobs sharing the VideoJobs registry.

use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use uuid::Uuid;

use super::VideoJobs;
use super::encode::{
    build_args, build_output_path, hevc_videotoolbox_available, nvenc_available, trim_duration,
    videotoolbox_available,
};
use super::ffmpeg::{find_ffmpeg, find_ffprobe};
use super::probe::probe_cached;
use super::progress::run_optimize;
use super::types::{effective_speed, OptimizeOptions};

const BATCH_MAX: usize = 50;

/// Queue up to 50 optimize jobs; each runs sequentially and emits `video-progress`.
#[tauri::command]
pub fn batch_optimize(
    app: tauri::AppHandle,
    state: tauri::State<VideoJobs>,
    options: Vec<OptimizeOptions>,
) -> Result<Vec<String>, String> {
    if options.is_empty() {
        return Err("Žiadne položky na optimalizáciu".into());
    }
    if options.len() > BATCH_MAX {
        return Err(format!("Batch podporuje max. {BATCH_MAX} položiek"));
    }

    let ffmpeg = find_ffmpeg()
        .ok_or_else(|| "ffmpeg nie je nainštalovaný. Nainštaluj ho a skús znova.".to_string())?;
    let ffprobe = find_ffprobe(Some(&ffmpeg))
        .ok_or_else(|| "ffprobe nie je nainštalovaný. Nainštaluj ffmpeg a skús znova.".to_string())?;

    let mut prepared = Vec::with_capacity(options.len());
    let mut job_ids = Vec::with_capacity(options.len());

    for opts in options {
        let opts = crate::export_plan::plan_export_inner(crate::export_plan::PlanExportRequest {
            options: opts,
            speech_ranges: vec![],
            preferred_stem: None,
        })?
        .options;

        let input = PathBuf::from(&opts.input_path);
        if !input.exists() {
            return Err(crate::error::coded(
                crate::error::codes::VIDEO_MISSING,
                format!("Vstupné video neexistuje: {}", opts.input_path),
            ));
        }

        let info = probe_cached(&ffprobe, &opts.input_path)?;
        let total_secs =
            trim_duration(&opts).unwrap_or(info.duration_secs) / effective_speed(opts.speed);
        let output = if opts.replace_original {
            input.with_extension("bloom-replace.tmp.mp4")
        } else {
            build_output_path(&opts, &input)
        };
        let hw_h264 = videotoolbox_available(&ffmpeg);
        let hw_hevc = hevc_videotoolbox_available(&ffmpeg);
        let nvenc = nvenc_available(&ffmpeg) && !hw_h264;
        let args = build_args(
            &opts,
            &opts.input_path,
            &output.to_string_lossy(),
            &info,
            hw_h264,
            hw_hevc,
            nvenc,
        );
        let job_id = Uuid::new_v4().to_string();
        let cancel = Arc::new(AtomicBool::new(false));
        state.0.lock().unwrap().insert(job_id.clone(), cancel.clone());
        job_ids.push(job_id.clone());
        prepared.push((
            job_id,
            args,
            input,
            output,
            total_secs,
            opts.add_to_library && !opts.replace_original,
            opts,
            cancel,
        ));
    }

    let app_clone = app.clone();
    let ffmpeg_worker = ffmpeg.clone();
    std::thread::spawn(move || {
        for (job_id, args, input, output, total_secs, add_to_library, opts, cancel) in prepared {
            if cancel.load(Ordering::Relaxed) {
                continue;
            }
            run_optimize(
                app_clone.clone(),
                job_id,
                ffmpeg_worker.clone(),
                ffmpeg_worker.clone(),
                args,
                input,
                output,
                total_secs,
                add_to_library,
                opts,
                cancel,
            );
        }
    });

    Ok(job_ids)
}
