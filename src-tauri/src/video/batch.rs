//! Batch optimize — thin wrapper over the unified Rust export queue.

use super::types::OptimizeOptions;
use crate::export_queue::{enqueue_exports, EnqueueExportJob, ExportQueue};

/// Queue jobs through `enqueue_exports` (single worker + plan_export + post-export).
#[tauri::command]
pub fn batch_optimize(
    app: tauri::AppHandle,
    state: tauri::State<ExportQueue>,
    options: Vec<OptimizeOptions>,
) -> Result<Vec<String>, String> {
    let jobs: Vec<EnqueueExportJob> = options
        .into_iter()
        .enumerate()
        .map(|(i, options)| EnqueueExportJob {
            label: format!("Batch {}", i + 1),
            options,
            speech_ranges: vec![],
            preferred_stem: None,
        })
        .collect();
    let items = enqueue_exports(app, state, jobs)?;
    Ok(items
        .into_iter()
        .filter_map(|i| i.job_id)
        .collect())
}
