# Bloom

Desktopová aplikácia na nahrávanie obrazovky pre macOS. Postavená na **Tauri 2**, **React 19** a **Rust** — ľahká natívna appka s webovým UI v štýle systémových nastavení macOS.

Nahrávky sa ukladajú do `~/Movies/Bloom`.

## Čo Bloom robí

- **Nahrávanie** obrazovky, kamery alebo oboch zdrojov naraz
- **Kvalita videa:** 480p, 720p, 1080p
- **Živý náhľad** s diagnostikou, ak WebKit nezobrazí stream (nahrávanie môže aj tak pokračovať)
- **Kreslenie** a zvýrazňovanie počas nahrávania
- **Spotlight kurzora** a kliknutia pre tutoriály
- **PiP kamera** s rozmazaním pozadia
- **Knižnica** nahrávok — prehrávanie, premenovanie, štítky, priečinky, obľúbené
- **Optimalizácia a orezanie** cez ffmpeg (kompresia, rozlíšenie, rýchlosť 1×–3×)
- **Automatická finalizácia** po nahrávaní — `faststart` remux (MP4), presná dĺžka cez ffprobe, miniatúra na pozadí
- **Hardvérové kódovanie** na macOS (VideoToolbox) pri optimalizácii
- **Predvoľby** a témy vzhľadu
- **Slovenské UI** v celej aplikácii

## Požiadavky

- **macOS** (primárna cieľová platforma)
- [Bun](https://bun.sh) alebo Node.js na frontend
- [Rust](https://rustup.rs) na Tauri backend
- **ffmpeg** (voliteľné) — miniatúry, optimalizácia a orezanie videa; appka ponúka inštaláciu cez Homebrew

## Spustenie

```bash
# závislosti
bun install

# vývoj (frontend + Tauri)
bun run tauri dev

# produkčný build
bun run tauri build
```

## Testy

```bash
bun run test
```

## Štruktúra projektu

| Časť | Popis |
|------|--------|
| `src/` | React UI — Nahrávanie, Knižnica, Nastavenia |
| `src/components/video/BloomVideoPlayer.tsx` | Vlastný prehrávač súborov (Tauri asset protocol) |
| `src/lib/i18n/sk.ts` | Slovenské texty |
| `src-tauri/src/session.rs` | Streamovanie chunkov z MediaRecorder (1 MiB buffer) |
| `src-tauri/src/finalize.rs` | Post-process: faststart, ffprobe dĺžka, miniatúra |
| `src-tauri/src/video.rs` | ffmpeg — optimalizácia, VideoToolbox, miniatúry |

## Odporúčané IDE

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Licencia

Súkromný projekt (`private` v `package.json`).
