# Backend Bloom (Rust)

Referencia pre Tauri backend (Bloom **2.0.0**). Všetky príkazy sú registrované v `src-tauri/src/lib.rs`.

## Modul `video/`

Export a ffmpeg logika žije v `src-tauri/src/video/`:

| Súbor | Úloha |
|-------|--------|
| `mod.rs` | `VideoJobs`, re-exporty |
| `types.rs` | `OptimizeOptions`, `VideoInfo`, … |
| `ffmpeg.rs` | Detekcia / inštalácia ffmpeg |
| `probe.rs` | ffprobe + cache |
| `filters.rs` | vf/af (vrátane `denoise_audio`) |
| `encode.rs` | `build_args`, codecs, stream-copy |
| `remux.rs` | MP4 faststart |
| `thumbs.rs` | miniatúra + filmstrip |
| `analyze.rs` | odhad exportu, sidecar |
| `progress.rs` | worker + `video-progress` |
| `commands.rs` | Tauri príkazy + spotlight/concat |
| `audio_tools.rs` | extract / peaks / silence |
| `batch.rs` | `batch_optimize` |

## Dátový model

### Súbory na disku

```
~/Movies/Bloom/
  2026-08-28_14-30-00_bloom.mp4      # video
  2026-08-28_14-30-00_bloom.bloom.json   # metadata sidecar
  .thumb_abc123.jpg                  # cache miniatúr (generované)
```

### `RecordingMeta` (sidecar JSON)

| Pole | Typ | Popis |
|------|-----|--------|
| `id` | UUID | Stabilný identifikátor |
| `title` | string | Zobrazovaný názov |
| `filename` | string | Názov video súboru |
| `created_at` | ISO-8601 | Čas vytvorenia |
| `duration_secs` | f64 | Dĺžka (ffprobe po finalize) |
| `file_size_bytes` | u64 | Veľkosť súboru |
| `source` | string | `screen` \| `camera` \| `both` |
| `quality` | string | `480p` \| `720p` \| `1080p` |
| `has_microphone` | bool | |
| `has_system_audio` | bool | |
| `target_label` | string | Názov displeja / okna |
| `starred` | bool | Obľúbené |
| `tags` | string[] | Štítky |
| `folder` | string | Priečinok (prázdne = inbox) |

Typy v Rust: `src-tauri/src/types.rs`. Zrkadlo vo frontende: `src/types/index.ts`.

## Pipeline nahrávania

```
Frontend MediaRecorder
    → write_chunk (1 MiB buffer)
        → session.rs (append to temp file)
    → close_session
        → finalize.rs
            → ffprobe (duration)
            → ffmpeg faststart remux (MP4)
            → thumbnail JPEG
        → write .bloom.json
```

`cancel_session` zmaže čiastočný súbor.

## Pipeline exportu

Vstup: `OptimizeOptions` (cesta, preset, trim, titulky, …)

1. **Analýza** — `analyze_video`, `estimate_export`
2. **Rozhodnutie** — `can_stream_copy` pre trim-only H.264 MP4 (bez prekódovania)
3. **Kódovanie** — priorita: VideoToolbox (macOS) → NVENC → libx264/libx265
4. **Filtre** — `hqdn3d` (video), `afftdn` + highpass (`denoise_audio`), `dynaudnorm`, `drawtext`
5. **Remux** — MP4 faststart po encode
6. **Progress** — event `video-progress` s `job_id`, percent, `done`

Fronta na frontende (`useExportQueue`) spúšťa exporty **sekvenčne**. Dávková optimalizácia knižnice volá `batch_optimize` (jeden Rust worker).

### `OptimizeOptions` (výber polí)

| Pole | Popis |
|------|--------|
| `input_path` | Absolútna cesta k zdroju |
| `preset` | `small` \| `medium` \| `high` |
| `resolution` | `480p` … `original` |
| `format` | `mp4` \| `webm` \| `gif` |
| `trim_start`, `trim_end` | Sekundy (voliteľné) |
| `speed` | 1.0–3.0 |
| `replace_original` | Prepísať zdroj (len MP4) |
| `srt_path` | Cesta k `.srt` |
| `subtitle_cards` | `{ text, start_secs, end_secs }[]` |
| `denoise`, `denoise_audio`, `normalize_audio`, `remove_audio`, `use_hevc` | Bool prepínače |
| `flip_h`, `flip_v`, `rotate`, `fade_*`, `volume` | Transformácie / zvuk |

## Tauri príkazy

### Systém (`system.rs`)

| Príkaz | Návrat | Popis |
|--------|--------|--------|
| `get_bloom_dir` | `string` | Cesta + vytvorenie priečinka |
| `get_library_directory` / `set_library_directory` | `LibraryDirectoryInfo` | Vlastný priečinok knižnice |
| `get_backup_directory` / `set_backup_directory` | `BackupDirectoryInfo` | Priečinok záloh |
| `create_library_backup` | `BackupResult` | Kópia knižnice do `Bloom-YYYY-…` |
| `list_backups` | `BackupEntry[]` | Nedávne zálohy |
| `get_default_recording_folder` / `set_…` | `string` | Predvolený podpriečinok nahrávok |
| `get_disk_space` | `DiskInfo` | Voľné miesto + veľkosť Bloom |
| `list_monitors` | `MonitorInfo[]` | Fyzické displeje |

### Session (`session.rs`)

| Príkaz | Popis |
|--------|--------|
| `open_session` | Nový súbor + session ID |
| `write_chunk` | Append binárnych dát |
| `close_session` | Finalize + metadata |
| `cancel_session` | Zrušenie a zmazanie |

### Knižnica (`library.rs`)

| Príkaz | Popis |
|--------|--------|
| `list_recordings` | Všetky záznamy (najnovšie prvé) |
| `get_library_stats` | Súhrn knižnice |
| `get_recording` | Jeden záznam podľa ID |
| `delete_recording` | Zmazanie video + sidecar |
| `rename_recording` | Zmena titulku |
| `update_recording_meta` | starred, tags, folder |
| `batch_delete_recordings` | Dávkové mazanie |
| `delete_all_recordings` | Vymazať celú knižnicu |
| `validate_recording` | Kontrola integrity |
| `reveal_in_finder` | Otvoriť v Finderi |
| `share_recording` | macOS share panel (`share.rs`) |
| `save_snapshot` | PNG snímka z anotácií |

### Video (`video/`)

| Príkaz | Popis |
|--------|--------|
| `check_ffmpeg` | Detekcia ffmpeg/ffprobe |
| `install_ffmpeg` | Homebrew / winget / pkexec |
| `get_video_info` | ffprobe metadata |
| `analyze_video` | Odporúčania preset/rozlíšenie |
| `get_thumbnail` | JPEG miniatúra (cache) |
| `get_filmstrip` | Rada miniatúr pre timeline |
| `estimate_export` | Odhad veľkosti + `stream_copy` flag |
| `optimize_video` | Spustí async job → `job_id` |
| `cancel_optimize` | Zruší bežiaci job |
| `batch_optimize` | Sekvenčne N exportov → `job_id[]` |
| `extract_audio` | WAV/MP3 vedľa zdroja |
| `get_audio_peaks` | Waveform buckets 0–1 |
| `detect_silence` | `silences` + `speech_ranges` |

### Kurzor (`cursor.rs`)

| Príkaz | Popis |
|--------|--------|
| `start_cursor_tracker` | Polling pozície kurzora |
| `stop_cursor_tracker` | Stop |

## Zdieľanie (`share.rs`)

| Platforma | Správanie | `ShareMode` |
|-----------|-----------|-------------|
| **macOS** | `NSSharingServicePicker` — systémový panel | `macos_sheet` |
| **Windows** | PowerShell `Set-Clipboard -Path` — súbor v schránke (Ctrl+V) | `windows_clipboard` |
| **Linux** | 1. `xdg-email --attach` → 2. URI do schránky (`wl-copy` / `xclip`) → 3. Nautilus/Dolphin `--select` | `linux_email` / `linux_clipboard` / `linux_file_manager` |

Príkaz `share_recording` vracia `{ path, mode }` — frontend zobrazí toast podľa `mode`.

## Bezpečnosť

- Asset protocol scope: len `~/Movies/Bloom/**` a `~/Videos/Bloom/**`
- Invoke príkazy neprijímajú ľubovoľné cesty mimo bloom_dir pri operáciách s knižnicou (ID → lookup)
- `optimize_video` pracuje s explicitnou `input_path` — frontend posiela cesty z knižnice

## Testy

```bash
cd src-tauri && cargo test
```

Hlavné oblasti pokrytia:

- `video_tests.rs` — ffmpeg args, stream copy, silence/peaks helpers, odhad exportu
- `finalize_tests.rs` — post-process logika
- `util_tests.rs` — cesty a discovery
