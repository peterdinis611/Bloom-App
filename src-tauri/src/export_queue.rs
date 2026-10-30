//! Export queue worker — runs in Rust so exports continue without the FE pump.

use std::{
    collections::{HashMap, VecDeque},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use uuid::Uuid;

use crate::error::{coded, codes};
use crate::export_plan::{plan_export_inner, PlanExportRequest};
use crate::video::{
    build_args, build_output_path, effective_speed, find_ffmpeg, find_ffprobe,
    hevc_videotoolbox_available, nvenc_available, probe_cached, run_optimize, trim_duration,
    videotoolbox_available, OptimizeOptions, TimeRange, VideoJobs,
};

const QUEUE_MAX: usize = 50;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueExportJob {
    pub label: String,
    pub options: OptimizeOptions,
    #[serde(default)]
    pub speech_ranges: Vec<TimeRange>,
    #[serde(default)]
    pub preferred_stem: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportQueueItemDto {
    pub id: String,
    pub label: String,
    pub status: String,
    pub percent: f64,
    pub job_id: Option<String>,
    pub error: Option<String>,
    pub output_path: Option<String>,
}

struct QueuedJob {
    id: String,
    label: String,
    options: OptimizeOptions,
    status: String,
    percent: f64,
    job_id: Option<String>,
    error: Option<String>,
    output_path: Option<String>,
    cancel: Arc<AtomicBool>,
}

pub(crate) struct QueueInner {
    items: VecDeque<QueuedJob>,
    history: Vec<QueuedJob>,
    pumping: bool,
}

impl Default for QueueInner {
    fn default() -> Self {
        Self {
            items: VecDeque::new(),
            history: Vec::new(),
            pumping: false,
        }
    }
}

#[derive(Default)]
pub struct ExportQueue(pub(crate) Mutex<QueueInner>);

/// Last output path / error from `run_optimize`, keyed by job id.
#[derive(Default)]
pub struct JobOutputs(pub Mutex<HashMap<String, JobResult>>);

#[derive(Clone)]
pub struct JobResult {
    pub output_path: Option<String>,
    pub error: Option<String>,
    pub cancelled: bool,
}

pub(crate) fn remember_job_result(app: &tauri::AppHandle, job_id: &str, result: JobResult) {
    if let Some(outs) = app.try_state::<JobOutputs>() {
        outs.0.lock().unwrap().insert(job_id.to_string(), result);
    }
}

fn snapshot(inner: &QueueInner) -> Vec<ExportQueueItemDto> {
    inner
        .items
        .iter()
        .chain(inner.history.iter())
        .map(|j| ExportQueueItemDto {
            id: j.id.clone(),
            label: j.label.clone(),
            status: j.status.clone(),
            percent: j.percent,
            job_id: j.job_id.clone(),
            error: j.error.clone(),
            output_path: j.output_path.clone(),
        })
        .collect()
}

fn emit_queue(app: &tauri::AppHandle, inner: &QueueInner) {
    let _ = app.emit("export-queue-changed", snapshot(inner));
}

#[tauri::command]
pub fn enqueue_exports(
    app: tauri::AppHandle,
    state: tauri::State<ExportQueue>,
    jobs: Vec<EnqueueExportJob>,
) -> Result<Vec<ExportQueueItemDto>, String> {
    if jobs.is_empty() {
        return Err(coded(codes::INVALID_OPTIONS, "Žiadne položky na export"));
    }
    if jobs.len() > QUEUE_MAX {
        return Err(coded(
            codes::INVALID_OPTIONS,
            format!("Fronta podporuje max. {QUEUE_MAX} položiek"),
        ));
    }

    let mut prepared = Vec::with_capacity(jobs.len());
    for job in jobs {
        let preferred = job.preferred_stem.or(Some(job.label.clone()));
        let planned = plan_export_inner(PlanExportRequest {
            options: job.options,
            speech_ranges: job.speech_ranges,
            preferred_stem: preferred,
        })?;
        prepared.push((job.label, planned.options));
    }

    let mut added = Vec::new();
    let should_spawn;
    {
        let mut inner = state.0.lock().unwrap();
        if inner.items.len() + prepared.len() > QUEUE_MAX {
            return Err(coded(
                codes::INVALID_OPTIONS,
                format!("Fronta podporuje max. {QUEUE_MAX} položiek"),
            ));
        }
        for (label, options) in prepared {
            let id = Uuid::new_v4().to_string();
            let item = QueuedJob {
                id: id.clone(),
                label: label.clone(),
                options,
                status: "pending".into(),
                percent: 0.0,
                job_id: None,
                error: None,
                output_path: None,
                cancel: Arc::new(AtomicBool::new(false)),
            };
            added.push(ExportQueueItemDto {
                id,
                label,
                status: "pending".into(),
                percent: 0.0,
                job_id: None,
                error: None,
                output_path: None,
            });
            inner.items.push_back(item);
        }
        should_spawn = !inner.pumping;
        if should_spawn {
            inner.pumping = true;
        }
        emit_queue(&app, &inner);
    }

    if should_spawn {
        spawn_pump(app);
    }

    Ok(added)
}

fn spawn_pump(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        let next = {
            let queue = app.state::<ExportQueue>();
            let mut inner = queue.0.lock().unwrap();
            let idx = inner.items.iter().position(|j| j.status == "pending");
            match idx {
                Some(i) => {
                    inner.items[i].status = "running".into();
                    let job_id = Uuid::new_v4().to_string();
                    inner.items[i].job_id = Some(job_id.clone());
                    let cancel = inner.items[i].cancel.clone();
                    let options = inner.items[i].options.clone();
                    let queue_id = inner.items[i].id.clone();
                    emit_queue(&app, &inner);
                    Some((queue_id, options, job_id, cancel))
                }
                None => {
                    inner.pumping = false;
                    emit_queue(&app, &inner);
                    None
                }
            }
        };

        let Some((queue_id, options, job_id, cancel)) = next else {
            break;
        };

        if cancel.load(Ordering::Relaxed) {
            finish_item(&app, &queue_id, "cancelled", Some(job_id), None, None);
            continue;
        }

        match run_queued_job(&app, &job_id, options, cancel.clone()) {
            Ok(()) => {
                let result = app
                    .state::<JobOutputs>()
                    .0
                    .lock()
                    .unwrap()
                    .remove(&job_id);
                if cancel.load(Ordering::Relaxed) || result.as_ref().is_some_and(|r| r.cancelled) {
                    finish_item(&app, &queue_id, "cancelled", Some(job_id), None, None);
                } else if let Some(r) = result {
                    if let Some(err) = r.error {
                        finish_item(&app, &queue_id, "error", Some(job_id), None, Some(err));
                    } else {
                        finish_item(
                            &app,
                            &queue_id,
                            "done",
                            Some(job_id),
                            r.output_path,
                            None,
                        );
                    }
                } else {
                    finish_item(
                        &app,
                        &queue_id,
                        "error",
                        Some(job_id),
                        None,
                        Some("Export skončil bez výsledku".into()),
                    );
                }
            }
            Err(e) => finish_item(&app, &queue_id, "error", Some(job_id), None, Some(e)),
        }
    });
}

fn finish_item(
    app: &tauri::AppHandle,
    queue_id: &str,
    status: &str,
    job_id: Option<String>,
    output_path: Option<String>,
    error: Option<String>,
) {
    let queue = app.state::<ExportQueue>();
    let mut inner = queue.0.lock().unwrap();
    if let Some(pos) = inner.items.iter().position(|j| j.id == queue_id) {
        let mut item = inner.items.remove(pos).unwrap();
        item.status = status.into();
        item.percent = if status == "done" { 100.0 } else { item.percent };
        if let Some(j) = job_id {
            item.job_id = Some(j);
        }
        item.output_path = output_path;
        item.error = error;
        inner.history.push(item);
        while inner.history.len() > 40 {
            inner.history.remove(0);
        }
    }
    emit_queue(app, &inner);
}

fn run_queued_job(
    app: &tauri::AppHandle,
    job_id: &str,
    options: OptimizeOptions,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
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

    let info = probe_cached(&ffprobe, &options.input_path)?;
    let total_secs =
        trim_duration(&options).unwrap_or(info.duration_secs) / effective_speed(options.speed);
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

    let jobs = app.state::<VideoJobs>();
    jobs.0
        .lock()
        .unwrap()
        .insert(job_id.to_string(), cancel.clone());

    let add_to_library = options.add_to_library && !options.replace_original;
    run_optimize(
        app.clone(),
        job_id.to_string(),
        ffmpeg.clone(),
        ffmpeg,
        args,
        input,
        output,
        total_secs,
        add_to_library,
        options,
        cancel,
    );
    Ok(())
}

#[tauri::command]
pub fn cancel_export_queue_item(
    app: tauri::AppHandle,
    state: tauri::State<ExportQueue>,
    jobs_state: tauri::State<VideoJobs>,
    id: String,
) -> Result<(), String> {
    let mut inner = state.0.lock().unwrap();
    if let Some(item) = inner.items.iter_mut().find(|j| j.id == id) {
        item.cancel.store(true, Ordering::Relaxed);
        if let Some(ref job_id) = item.job_id {
            if let Some(flag) = jobs_state.0.lock().unwrap().get(job_id) {
                flag.store(true, Ordering::Relaxed);
            }
        }
        if item.status == "pending" {
            item.status = "cancelled".into();
        }
    }
    emit_queue(&app, &inner);
    Ok(())
}

#[tauri::command]
pub fn list_export_queue(state: tauri::State<ExportQueue>) -> Vec<ExportQueueItemDto> {
    let inner = state.0.lock().unwrap();
    snapshot(&inner)
}

#[tauri::command]
pub fn clear_export_queue_finished(
    app: tauri::AppHandle,
    state: tauri::State<ExportQueue>,
) -> Result<(), String> {
    let mut inner = state.0.lock().unwrap();
    inner.history.clear();
    inner
        .items
        .retain(|j| j.status == "pending" || j.status == "running");
    emit_queue(&app, &inner);
    Ok(())
}
