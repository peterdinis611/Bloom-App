# Backend Bloom (Rust)

Referencia pre Tauri backend. Všetky príkazy sú registrované v `src-tauri/src/lib.rs`.

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
4. **Filtre** — `hqdn3d` (šum), `dynaudnorm` (zvuk), `drawtext` (titulky / SRT)
5. **Remux** — MP4 faststart po encode
6. **Progress** — event `video-progress` s `job_id`, percent, `done`

Fronta na frontende (`useExportQueue`) spúšťa exporty **sekvenčne** — jeden aktívny job naraz.

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
| `denoise`, `normalize_audio`, `remove_audio`, `use_hevc` | Bool prepínače |

## Tauri príkazy

### Systém (`system.rs`)

| Príkaz | Návrat | Popis |
|--------|--------|--------|
| `get_bloom_dir` | `string` | Cesta + vytvorenie priečinka |
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

### Video (`video.rs`)

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

### Kurzor (`cursor.rs`)

| Príkaz | Popis |
|--------|--------|
| `start_cursor_tracker` | Polling pozície kurzora |
| `stop_cursor_tracker` | Stop |

## Zdieľanie (`share.rs`)

Na macOS:

- Nájde hlavné okno `main`
- Vytvorí `NSSharingServicePicker` s `NSURL` súboru
- Zobrazí systémový panel zdieľania

Na ostatných platformách fallback: `reveal_in_finder`.

Závislosti (len macOS): `objc2`, `objc2-app-kit`, `objc2-foundation`, `objc2-core-foundation`.

## Bezpečnosť

- Asset protocol scope: len `~/Movies/Bloom/**` a `~/Videos/Bloom/**`
- Invoke príkazy neprijímajú ľubovoľné cesty mimo bloom_dir pri operáciách s knižnicou (ID → lookup)
- `optimize_video` pracuje s explicitnou `input_path` — frontend posiela cesty z knižnice

## Testy

```bash
cd src-tauri && cargo test
```

Hlavné oblasti pokrytia:

- `video_tests.rs` — ffmpeg args, stream copy, shell PATH, odhad exportu
- `finalize_tests.rs` — post-process logika
- `util_tests.rs` — cesty a discovery
