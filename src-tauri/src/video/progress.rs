use std::{
    io::{BufRead, BufReader, Read},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Instant,
};

use tauri::{Emitter, Manager};

use super::VideoJobs;
use super::analyze::{replace_original_file, write_output_sidecar};
use super::thumbs::make_thumbnail;
use super::types::{OptimizeOptions, OptimizeProgress};

// ────────────────────────────────────────────────────────────────────────────
// Transcode worker
// ────────────────────────────────────────────────────────────────────────────

pub(crate) fn parse_progress_seconds(line: &str) -> Option<f64> {
    if let Some(v) = line.strip_prefix("out_time_us=") {
        return v.trim().parse::<f64>().ok().map(|us| us / 1_000_000.0);
    }
    if let Some(v) = line.strip_prefix("out_time_ms=") {
        // ffmpeg reports out_time_ms in microseconds despite the name.
        return v.trim().parse::<f64>().ok().map(|us| us / 1_000_000.0);
    }
    if let Some(v) = line.strip_prefix("out_time=") {
        // HH:MM:SS.microseconds
        let v = v.trim();
        let parts: Vec<&str> = v.split(':').collect();
        if parts.len() == 3 {
            let h: f64 = parts[0].parse().ok()?;
            let m: f64 = parts[1].parse().ok()?;
            let s: f64 = parts[2].parse().ok()?;
            return Some(h * 3600.0 + m * 60.0 + s);
        }
    }
    None
}

pub(crate) fn remove_job(app: &tauri::AppHandle, job_id: &str) {
    app.state::<VideoJobs>().0.lock().unwrap().remove(job_id);
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn run_optimize(
    app: tauri::AppHandle,
    job_id: String,
    ffmpeg: PathBuf,
    ffmpeg_thumb: PathBuf,
    args: Vec<String>,
    input: PathBuf,
    output: PathBuf,
    total_secs: f64,
    add_to_library: bool,
    opts: OptimizeOptions,
    cancel: Arc<AtomicBool>,
) {
    let emit = |p: OptimizeProgress| {
        let _ = app.emit("video-progress", p);
    };

    let mut child = match Command::new(&ffmpeg)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            remove_job(&app, &job_id);
            let err = format!("Could not start ffmpeg: {e}");
            crate::export_queue::remember_job_result(
                &app,
                &job_id,
                crate::export_queue::JobResult {
                    output_path: None,
                    error: Some(err.clone()),
                    cancelled: false,
                },
            );
            emit(OptimizeProgress {
                job_id: job_id.clone(),
                percent: 0.0,
                done: true,
                cancelled: false,
                output_path: None,
                output_size_bytes: None,
                error: Some(err),
            });
            return;
        }
    };

    // Drain stderr on a thread so the pipe never blocks; keep it for errors.
    let stderr = child.stderr.take();
    let err_handle = std::thread::spawn(move || {
        let mut buf = String::new();
        if let Some(mut s) = stderr {
            let _ = s.read_to_string(&mut buf);
        }
        buf
    });

    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        let mut last_emit = Instant::now();
        for line in reader.lines().map_while(Result::ok) {
            if cancel.load(Ordering::Relaxed) {
                let _ = child.kill();
                break;
            }
            if let Some(secs) = parse_progress_seconds(&line) {
                let percent = if total_secs > 0.0 {
                    ((secs / total_secs) * 100.0).clamp(0.0, 99.5)
                } else {
                    -1.0
                };
                if last_emit.elapsed().as_millis() >= 120 {
                    last_emit = Instant::now();
                    emit(OptimizeProgress {
                        job_id: job_id.clone(),
                        percent,
                        done: false,
                        cancelled: false,
                        output_path: None,
                        output_size_bytes: None,
                        error: None,
                    });
                }
            }
        }
    }

    let status = child.wait();
    let stderr_text = err_handle.join().unwrap_or_default();
    remove_job(&app, &job_id);

    // Cancelled?
    if cancel.load(Ordering::Relaxed) {
        let _ = std::fs::remove_file(&output);
        crate::export_queue::remember_job_result(
            &app,
            &job_id,
            crate::export_queue::JobResult {
                output_path: None,
                error: None,
                cancelled: true,
            },
        );
        emit(OptimizeProgress {
            job_id: job_id.clone(),
            percent: 0.0,
            done: true,
            cancelled: true,
            output_path: None,
            output_size_bytes: None,
            error: None,
        });
        return;
    }

    let ok = matches!(status, Ok(s) if s.success()) && output.exists();
    if !ok {
        let _ = std::fs::remove_file(&output);
        let tail: String = stderr_text.lines().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join(" ");
        let err = if tail.is_empty() {
            "ffmpeg failed".into()
        } else {
            tail
        };
        crate::export_queue::remember_job_result(
            &app,
            &job_id,
            crate::export_queue::JobResult {
                output_path: None,
                error: Some(err.clone()),
                cancelled: false,
            },
        );
        emit(OptimizeProgress {
            job_id: job_id.clone(),
            percent: 0.0,
            done: true,
            cancelled: false,
            output_path: None,
            output_size_bytes: None,
            error: Some(err),
        });
        return;
    }

    let size = std::fs::metadata(&output).map(|m| m.len()).unwrap_or(0);
    let out_duration = if total_secs > 0.0 { total_secs } else { 0.0 };

    let final_path = if opts.replace_original {
        match replace_original_file(&input, &output, &opts, out_duration, size) {
            Ok(p) => {
                let _ = make_thumbnail(&ffmpeg_thumb, &p, (out_duration * 0.1).max(0.0));
                p
            }
            Err(e) => {
                let _ = std::fs::remove_file(&output);
                crate::export_queue::remember_job_result(
                    &app,
                    &job_id,
                    crate::export_queue::JobResult {
                        output_path: None,
                        error: Some(e.clone()),
                        cancelled: false,
                    },
                );
                emit(OptimizeProgress {
                    job_id: job_id.clone(),
                    percent: 0.0,
                    done: true,
                    cancelled: false,
                    output_path: None,
                    output_size_bytes: None,
                    error: Some(e),
                });
                return;
            }
        }
    } else {
        if add_to_library && opts.format != "gif" {
            let root = crate::bloom_dir(&app).ok();
            write_output_sidecar(root.as_deref(), &input, &output, &opts, out_duration, size);
            let _ = make_thumbnail(&ffmpeg_thumb, &output, (out_duration * 0.1).max(0.0));
        }
        output
    };

    let final_size = std::fs::metadata(&final_path).map(|m| m.len()).unwrap_or(size);
    let out_str = final_path.to_string_lossy().into_owned();
    let title = opts
        .output_name
        .clone()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            final_path
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "export".into());

    crate::export_queue::remember_job_result(
        &app,
        &job_id,
        crate::export_queue::JobResult {
            output_path: Some(out_str.clone()),
            error: None,
            cancelled: false,
        },
    );
    crate::post_export::run_post_export(&app, &out_str, &title, Some(job_id.clone()));

    emit(OptimizeProgress {
        job_id: job_id.clone(),
        percent: 100.0,
        done: true,
        cancelled: false,
        output_path: Some(out_str),
        output_size_bytes: Some(final_size),
        error: None,
    });
}

