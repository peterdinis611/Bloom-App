/*!
 * Bloom – video optimisation backend (ffmpeg wrapper)
 *
 * Modular layout:
 *   types, ffmpeg, probe, filters, encode, remux, thumbs,
 *   analyze, progress, commands, audio_tools, batch
 */

use std::{
    collections::HashMap,
    sync::{
        atomic::AtomicBool,
        Arc, Mutex,
    },
};

mod types;
mod ffmpeg;
mod probe;
mod filters;
mod encode;
mod remux;
mod thumbs;
mod analyze;
mod progress;
mod commands;
mod audio_tools;
mod batch;

pub use types::*;
pub(crate) use ffmpeg::*;
pub(crate) use probe::*;
pub(crate) use filters::*;
pub(crate) use encode::*;
pub(crate) use remux::*;
pub(crate) use thumbs::*;
pub(crate) use analyze::*;
pub(crate) use progress::*;
pub use commands::*;
pub use audio_tools::*;
pub use batch::*;

// ────────────────────────────────────────────────────────────────────────────
// Managed state – cancellation flags keyed by job id
// ────────────────────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct VideoJobs(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

#[cfg(test)]
use std::path::{Path, PathBuf};
#[cfg(test)]
use uuid::Uuid;

#[cfg(test)]
#[path = "../__tests__/video_tests.rs"]
mod tests;
