//! Audio utilities: extract track, waveform peaks, silence detection.

use std::{
    collections::HashMap,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, OnceLock},
    time::SystemTime,
};

use serde::{Deserialize, Serialize};

use super::ffmpeg::{apply_path_env, find_ffmpeg, find_ffprobe};
use super::filters::append_audio_filters;
use super::probe::probe_cached;
use super::types::OptimizeOptions;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioPeaks {
    pub duration_secs: f64,
    pub peaks: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeSpan {
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SilenceReport {
    pub silences: Vec<TimeSpan>,
    pub speech_ranges: Vec<TimeSpan>,
}

#[derive(Debug, Deserialize)]
pub struct ExtractAudioOptions {
    pub path: String,
    /// `wav` | `mp3`
    #[serde(default = "default_wav")]
    pub format: String,
    #[serde(default)]
    pub denoise_audio: bool,
    #[serde(default)]
    pub normalize_audio: bool,
}

fn default_wav() -> String {
    "wav".into()
}

struct PeaksCacheEntry {
    size: u64,
    modified: SystemTime,
    buckets: u32,
    peaks: AudioPeaks,
}

fn peaks_cache() -> &'static Mutex<HashMap<String, PeaksCacheEntry>> {
    static C: OnceLock<Mutex<HashMap<String, PeaksCacheEntry>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

fn file_stamp(path: &Path) -> Option<(u64, SystemTime)> {
    let meta = std::fs::metadata(path).ok()?;
    Some((meta.len(), meta.modified().ok()?))
}

/// Extract audio next to the source as `*_audio.wav` / `*_audio.mp3`.
#[tauri::command]
pub async fn extract_audio(options: ExtractAudioOptions) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || extract_audio_blocking(options))
        .await
        .map_err(|e| format!("Extract audio task failed: {e}"))?
}

pub(crate) fn extract_audio_blocking(options: ExtractAudioOptions) -> Result<String, String> {
    let input = PathBuf::from(&options.path);
    if !input.exists() {
        return Err("Vstupné video neexistuje".into());
    }
    let ffmpeg = find_ffmpeg().ok_or_else(|| "ffmpeg nie je nainštalovaný".to_string())?;
    let fmt = if options.format.eq_ignore_ascii_case("mp3") {
        "mp3"
    } else {
        "wav"
    };
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio");
    let out = input.with_file_name(format!("{stem}_audio.{fmt}"));

    let mut af: Vec<String> = Vec::new();
    let opts = OptimizeOptions {
        input_path: options.path.clone(),
        preset: "medium".into(),
        resolution: "original".into(),
        format: "mp4".into(),
        trim_start: None,
        trim_end: None,
        keep_ranges: vec![],
        crop_x: None,
        crop_y: None,
        crop_w: None,
        crop_h: None,
        speed: 1.0,
        output_name: None,
        add_to_library: false,
        replace_original: false,
        srt_path: None,
        subtitle_cards: vec![],
        denoise: false,
        denoise_audio: options.denoise_audio,
        normalize_audio: options.normalize_audio,
        remove_audio: false,
        use_hevc: false,
        flip_h: false,
        flip_v: false,
        rotate: 0,
        fade_in_secs: 0.0,
        fade_out_secs: 0.0,
        volume: 1.0,
    };
    append_audio_filters(&mut af, &opts, 1.0);

    let mut cmd = Command::new(&ffmpeg);
    apply_path_env(&mut cmd);
    cmd.args(["-y", "-i"]).arg(&input).args(["-vn"]);
    if !af.is_empty() {
        cmd.args(["-af", &af.join(",")]);
    }
    if fmt == "mp3" {
        cmd.args(["-c:a", "libmp3lame", "-b:a", "192k"]);
    } else {
        cmd.args(["-c:a", "pcm_s16le"]);
    }
    cmd.arg(&out);
    let output = cmd
        .output()
        .map_err(|e| format!("ffmpeg extract failed: {e}"))?;
    if !output.status.success() || !out.exists() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Extrakcia zvuku zlyhala: {}",
            err.lines().rev().take(3).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join(" ")
        ));
    }
    Ok(out.to_string_lossy().into_owned())
}

/// Downmix to mono PCM and return normalized peak buckets (0–1).
#[tauri::command]
pub async fn get_audio_peaks(path: String, buckets: Option<u32>) -> Result<AudioPeaks, String> {
    tauri::async_runtime::spawn_blocking(move || {
        get_audio_peaks_blocking(&path, buckets.unwrap_or(200).clamp(32, 2000))
    })
    .await
    .map_err(|e| format!("Peaks task failed: {e}"))?
}

pub(crate) fn get_audio_peaks_blocking(path: &str, buckets: u32) -> Result<AudioPeaks, String> {
    let input = Path::new(path);
    if !input.exists() {
        return Err("Vstupné video neexistuje".into());
    }
    if let Some((size, modified)) = file_stamp(input) {
        if let Ok(cache) = peaks_cache().lock() {
            if let Some(hit) = cache.get(path) {
                if hit.size == size && hit.modified == modified && hit.buckets == buckets {
                    return Ok(hit.peaks.clone());
                }
            }
        }
    }

    let ffmpeg = find_ffmpeg().ok_or_else(|| "ffmpeg nie je nainštalovaný".to_string())?;
    let ffprobe = find_ffprobe(Some(&ffmpeg)).ok_or_else(|| "ffprobe nie je nainštalovaný".to_string())?;
    let info = probe_cached(&ffprobe, path)?;
    if !info.has_audio {
        return Ok(AudioPeaks {
            duration_secs: info.duration_secs,
            peaks: vec![0.0; buckets as usize],
        });
    }

    let sample_rate: u32 = 8_000;
    let mut cmd = Command::new(&ffmpeg);
    apply_path_env(&mut cmd);
    cmd.args([
        "-v", "error",
        "-i", path,
        "-ac", "1",
        "-ar", &sample_rate.to_string(),
        "-f", "f32le",
        "-acodec", "pcm_f32le",
        "pipe:1",
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::null());

    let mut child = cmd.spawn().map_err(|e| format!("ffmpeg peaks failed: {e}"))?;
    let mut stdout = child.stdout.take().ok_or_else(|| "ffmpeg stdout missing".to_string())?;
    let mut bytes = Vec::new();
    stdout
        .read_to_end(&mut bytes)
        .map_err(|e| format!("read peaks pcm: {e}"))?;
    let _ = child.wait();

    let samples: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();

    let peaks = bucket_peaks(&samples, buckets as usize);
    let result = AudioPeaks {
        duration_secs: info.duration_secs,
        peaks,
    };

    if let Some((size, modified)) = file_stamp(input) {
        if let Ok(mut cache) = peaks_cache().lock() {
            cache.insert(
                path.to_string(),
                PeaksCacheEntry {
                    size,
                    modified,
                    buckets,
                    peaks: result.clone(),
                },
            );
        }
    }
    Ok(result)
}

pub(crate) fn bucket_peaks(samples: &[f32], buckets: usize) -> Vec<f32> {
    if buckets == 0 {
        return Vec::new();
    }
    if samples.is_empty() {
        return vec![0.0; buckets];
    }
    let mut peaks = vec![0.0f32; buckets];
    let n = samples.len();
    for (i, &s) in samples.iter().enumerate() {
        let b = (i * buckets) / n;
        let b = b.min(buckets - 1);
        let a = s.abs();
        if a > peaks[b] {
            peaks[b] = a;
        }
    }
    let max = peaks.iter().cloned().fold(0.0f32, f32::max).max(1e-6);
    for p in &mut peaks {
        *p = (*p / max).clamp(0.0, 1.0);
    }
    peaks
}

/// Detect silence via ffmpeg `silencedetect`; return silence + complementary speech ranges.
#[tauri::command]
pub async fn detect_silence(
    path: String,
    noise_db: Option<f64>,
    min_duration: Option<f64>,
) -> Result<SilenceReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        detect_silence_blocking(
            &path,
            noise_db.unwrap_or(-35.0).clamp(-80.0, -10.0),
            min_duration.unwrap_or(0.4).clamp(0.05, 30.0),
        )
    })
    .await
    .map_err(|e| format!("Silence task failed: {e}"))?
}

pub(crate) fn detect_silence_blocking(
    path: &str,
    noise_db: f64,
    min_duration: f64,
) -> Result<SilenceReport, String> {
    let input = Path::new(path);
    if !input.exists() {
        return Err("Vstupné video neexistuje".into());
    }
    let ffmpeg = find_ffmpeg().ok_or_else(|| "ffmpeg nie je nainštalovaný".to_string())?;
    let ffprobe = find_ffprobe(Some(&ffmpeg)).ok_or_else(|| "ffprobe nie je nainštalovaný".to_string())?;
    let info = probe_cached(&ffprobe, path)?;
    let duration = info.duration_secs.max(0.0);

    if !info.has_audio || duration <= 0.0 {
        return Ok(SilenceReport {
            silences: vec![],
            speech_ranges: if duration > 0.05 {
                vec![TimeSpan {
                    start: 0.0,
                    end: duration,
                }]
            } else {
                vec![]
            },
        });
    }

    let filter = format!("silencedetect=noise={noise_db}dB:d={min_duration:.3}");
    let mut cmd = Command::new(&ffmpeg);
    apply_path_env(&mut cmd);
    cmd.args(["-i", path, "-af", &filter, "-f", "null", "-"])
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let output = cmd
        .output()
        .map_err(|e| format!("ffmpeg silencedetect failed: {e}"))?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    let silences = parse_silencedetect(&stderr);
    let speech_ranges = invert_ranges(&silences, duration);
    Ok(SilenceReport {
        silences,
        speech_ranges,
    })
}

pub(crate) fn parse_silencedetect(stderr: &str) -> Vec<TimeSpan> {
    let mut starts: Vec<f64> = Vec::new();
    let mut spans: Vec<TimeSpan> = Vec::new();
    for line in stderr.lines() {
        if let Some(rest) = line.split("silence_start:").nth(1) {
            if let Ok(t) = rest.trim().split_whitespace().next().unwrap_or("").parse::<f64>() {
                starts.push(t);
            }
        }
        if let Some(rest) = line.split("silence_end:").nth(1) {
            let mut parts = rest.split_whitespace();
            if let Some(end_s) = parts.next() {
                if let Ok(end) = end_s.parse::<f64>() {
                    let start = starts.pop().unwrap_or(0.0);
                    if end > start {
                        spans.push(TimeSpan { start, end });
                    }
                }
            }
        }
    }
    spans
}

pub(crate) fn invert_ranges(silences: &[TimeSpan], duration: f64) -> Vec<TimeSpan> {
    if duration <= 0.05 {
        return Vec::new();
    }
    let mut speech = Vec::new();
    let mut cursor = 0.0;
    for s in silences {
        if s.start > cursor + 0.02 {
            speech.push(TimeSpan {
                start: cursor,
                end: s.start.min(duration),
            });
        }
        cursor = s.end.max(cursor);
    }
    if cursor + 0.02 < duration {
        speech.push(TimeSpan {
            start: cursor,
            end: duration,
        });
    }
    speech
}
