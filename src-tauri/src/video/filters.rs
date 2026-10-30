use super::types::{
    build_atempo_chain, effective_fade, effective_speed, effective_volume, has_fades,
    has_geometry_transform, volume_changed, OptimizeOptions, SubtitleCard,
};

pub(crate) fn scale_filter(height: u32, preset: &str) -> String {
    let flags = if preset == "high" {
        "lanczos"
    } else {
        "fast_bilinear"
    };
    format!("scale=-2:{height}:flags={flags}")
}

pub(crate) fn has_spatial_crop(opts: &OptimizeOptions) -> bool {
    matches!(
        (opts.crop_x, opts.crop_y, opts.crop_w, opts.crop_h),
        (Some(x), Some(y), Some(w), Some(h))
            if w > 0.02 && h > 0.02 && (x > 0.001 || y > 0.001 || w < 0.999 || h < 0.999)
    )
}

pub(crate) fn crop_filter(opts: &OptimizeOptions) -> Option<String> {
    let (x, y, w, h) = match (opts.crop_x, opts.crop_y, opts.crop_w, opts.crop_h) {
        (Some(x), Some(y), Some(w), Some(h)) if w > 0.02 && h > 0.02 => (x, y, w, h),
        _ => return None,
    };
    // ffmpeg crop uses pixels; express as fractions of iw/ih.
    Some(format!(
        "crop=iw*{w:.4}:ih*{h:.4}:iw*{x:.4}:ih*{y:.4}"
    ))
}

pub(crate) fn denoise_filter(preset: &str) -> &'static str {
    if preset == "high" {
        "hqdn3d=2:1:3:2"
    } else {
        "hqdn3d=3:2:4:3"
    }
}

pub(crate) fn append_geometry_filters(vf: &mut Vec<String>, opts: &OptimizeOptions) {
    match opts.rotate {
        90 => vf.push("transpose=1".into()),
        180 => {
            vf.push("transpose=1".into());
            vf.push("transpose=1".into());
        }
        270 => vf.push("transpose=2".into()),
        _ => {}
    }
    if opts.flip_h {
        vf.push("hflip".into());
    }
    if opts.flip_v {
        vf.push("vflip".into());
    }
}

pub(crate) fn append_fade_filters(vf: &mut Vec<String>, opts: &OptimizeOptions, out_duration: Option<f64>) {
    let fade_in = effective_fade(opts.fade_in_secs);
    let fade_out = effective_fade(opts.fade_out_secs);
    let speed = effective_speed(opts.speed);
    if fade_in > 0.0 {
        vf.push(format!("fade=t=in:st=0:d={fade_in:.2}"));
    }
    if fade_out > 0.0 {
        if let Some(dur) = out_duration {
            let timeline = (dur / speed).max(0.05);
            let st = (timeline - fade_out).max(0.0);
            vf.push(format!("fade=t=out:st={st:.2}:d={fade_out:.2}"));
        }
    }
}

pub(crate) fn append_video_filters(
    vf: &mut Vec<String>,
    opts: &OptimizeOptions,
    height: Option<u32>,
    format: &str,
    out_duration: Option<f64>,
) {
    if let Some(crop) = crop_filter(opts) {
        vf.push(crop);
    }
    append_geometry_filters(vf, opts);
    if format == "gif" {
        vf.push("fps=12".into());
        vf.push(scale_filter(height.unwrap_or(480), &opts.preset));
    } else if let Some(h) = height {
        vf.push(scale_filter(h, &opts.preset));
    }
    let speed = effective_speed(opts.speed);
    if speed != 1.0 {
        vf.push(format!("setpts=PTS/{speed}"));
    }
    if opts.denoise && format != "gif" {
        vf.push(denoise_filter(&opts.preset).into());
    }
    append_fade_filters(vf, opts, out_duration);
    vf.extend(subtitle_drawtext_filters(opts));
}

pub(crate) fn append_audio_filters(af: &mut Vec<String>, opts: &OptimizeOptions, speed: f64) {
    if opts.denoise_audio {
        // Cut rumble, FFT-denoise stationary hiss/fans, then a soft speech shelf.
        af.push("highpass=f=80".into());
        af.push("afftdn=nr=10:nf=-25:tn=1".into());
        af.push("equalizer=f=2500:t=q:w=1.2:g=2".into());
    }
    if volume_changed(opts) {
        af.push(format!("volume={:.3}", effective_volume(opts.volume)));
    }
    if opts.normalize_audio {
        // Speech-friendly dynamic loudness so quiet voice sits forward.
        af.push("dynaudnorm=f=75:g=15:p=0.95:m=10".into());
    }
    if speed != 1.0 {
        let tempo = build_atempo_chain(speed);
        if !tempo.is_empty() {
            af.push(tempo);
        }
    }
}

pub(crate) fn escape_drawtext(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace(':', "\\:")
        .replace('\'', "\\'")
        .replace('\n', " ")
}

pub(crate) fn parse_srt_timestamp(raw: &str) -> Option<f64> {
    let raw = raw.trim().replace(',', ".");
    let parts: Vec<&str> = raw.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: f64 = parts[0].parse().ok()?;
    let m: f64 = parts[1].parse().ok()?;
    let s: f64 = parts[2].parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
}

pub(crate) fn parse_srt(path: &str) -> Result<Vec<SubtitleCard>, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| format!("Cannot read SRT: {e}"))?;
    let mut cards = Vec::new();
    let mut lines = raw.lines().peekable();
    while lines.peek().is_some() {
        while matches!(lines.peek(), Some(l) if l.trim().is_empty()) {
            lines.next();
        }
        if lines.peek().is_none() {
            break;
        }
        if lines.next().is_none() {
            break;
        }
        let timing = lines.next().ok_or("SRT missing timing line")?;
        let mut parts = timing.split("-->");
        let start = parse_srt_timestamp(parts.next().unwrap_or("")).ok_or("SRT bad start time")?;
        let end = parse_srt_timestamp(parts.next().unwrap_or("")).ok_or("SRT bad end time")?;
        let mut text = String::new();
        while let Some(line) = lines.peek() {
            if line.trim().is_empty() {
                break;
            }
            if !text.is_empty() {
                text.push(' ');
            }
            text.push_str(line.trim());
            lines.next();
        }
        if !text.is_empty() && end > start {
            cards.push(SubtitleCard {
                text,
                start_secs: start,
                end_secs: end,
            });
        }
    }
    Ok(cards)
}

pub(crate) fn collect_subtitle_cards(opts: &OptimizeOptions) -> Vec<SubtitleCard> {
    let mut cards = opts.subtitle_cards.clone();
    if let Some(path) = opts.srt_path.as_ref().filter(|p| !p.trim().is_empty()) {
        if let Ok(mut parsed) = parse_srt(path) {
            cards.append(&mut parsed);
        }
    }
    cards
}

pub(crate) fn subtitle_drawtext_filters(opts: &OptimizeOptions) -> Vec<String> {
    let trim_start = opts.trim_start.unwrap_or(0.0);
    collect_subtitle_cards(opts)
        .into_iter()
        .filter_map(|card| {
            if card.text.trim().is_empty() {
                return None;
            }
            let start = (card.start_secs - trim_start).max(0.0);
            let end = (card.end_secs - trim_start).max(start + 0.05);
            let text = escape_drawtext(card.text.trim());
            Some(format!(
                "drawtext=text='{text}':fontsize=28:fontcolor=white:borderw=2:bordercolor=black@0.55:x=(w-text_w)/2:y=h*0.82:enable='between(t\\,{start:.3}\\,{end:.3})'"
            ))
        })
        .collect()
}

