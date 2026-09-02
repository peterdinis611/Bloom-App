# Bloom

Desktopová aplikácia na nahrávanie a ľahkú postprodukciu obrazovky pre **macOS**. Postavená na **Tauri 2**, **React 19** a **Rust** — natívna appka s vlastným UI (slovenské rozhranie, téma *Darkroom Bay*).

Nahrávky sa ukladajú do `~/Movies/Bloom` (na iných platformách `~/Videos/Bloom`).

## Dokumentácia

| Súbor | Pre koho |
|-------|----------|
| [docs/index.md](docs/index.md) | Index dokumentácie + odkaz na sekciu v appke |
| [docs/pouzivanie.md](docs/pouzivanie.md) | Používateľ — nahrávanie, knižnica, editor, export |
| [docs/vyvoj.md](docs/vyvoj.md) | Vývojár — architektúra, príkazy, testy |
| [docs/backend.md](docs/backend.md) | Backend — session, ffmpeg pipeline, dátový model |

## Čo Bloom robí

### Nahrávanie
- Obrazovka, kamera alebo oboje · kvalita 480p / 720p / 1080p
- Živý náhľad s diagnostikou (nahrávanie môže pokračovať aj bez náhľadu)
- Kreslenie a zvýrazňovanie počas nahrávania · spotlight kurzora
- PiP kamera s rozmazaním pozadia · predvoľby a odpočítavanie

### Knižnica
- Prehrávanie, premenovanie, štítky, priečinky, obľúbené
- Vyhľadávanie a filtre · dávkové mazanie / optimalizácia
- **Zdieľať** — natívny macOS share panel (AirDrop, Mail, …)
- Overenie integrity súboru · otvorenie vo Finderi

### Editor videa (jednotný modal **Upraviť**)
- Kroky: Náhľad → Orez → Export
- Filmstrip s miniatúrami · presný trim (`mm:ss.ms`)
- Rozdelenie na 2–3 klipy · titulky (.srt + textové karty)
- A/B porovnanie pred/po · odhad veľkosti exportu
- Fronta exportov v sidebar-e (beží na pozadí)

### Export (ffmpeg)
- Presety small / medium / high · rozlíšenie · MP4 / WebM / GIF
- Rýchlosť 1×–3× · HEVC · redukcia šumu · normalizácia zvuku
- **Stream copy** pri orezaní H.264 MP4 (veľmi rýchly export)
- VideoToolbox (macOS) · NVENC fallback · faststart remux po exporte
- Automatická finalizácia po nahrávaní (ffprobe, miniatúra)

## Požiadavky

- **macOS 12+** (primárna platforma)
- [Bun](https://bun.sh) alebo Node.js
- [Rust](https://rustup.rs) (stable)
- **ffmpeg** — voliteľné, ale potrebné na miniatúry, editor a export; appka ponúka inštaláciu cez Homebrew

## Spustenie

```bash
bun install
bun run tauri dev      # vývoj
bun run tauri build    # produkčný .app
```

## Testy

```bash
bun run test           # frontend (Vitest)
cd src-tauri && cargo test   # backend (Rust)
```

## Štruktúra projektu (skrátene)

| Cesta | Úloha |
|-------|--------|
| `src/pages/` | Nahrávanie, Knižnica, Nastavenia |
| `src/components/editor/` | Editor videa, filmstrip, A/B slider |
| `src/hooks/useExportQueue.tsx` | Fronta exportov |
| `src/hooks/useBloomBackend.ts` | Typované Tauri invoke wrappery |
| `src/lib/i18n/sk.ts` | Všetky slovenské texty |
| `src-tauri/src/session.rs` | Streamovanie chunkov z MediaRecorder |
| `src-tauri/src/finalize.rs` | Post-process po nahrávaní |
| `src-tauri/src/video.rs` | ffmpeg — export, miniatúry, analýza |
| `src-tauri/src/share.rs` | macOS share panel |
| `src-tauri/src/library.rs` | Knižnica a metadata |

## Odporúčané IDE

VS Code + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Licencia

Súkromný projekt (`private` v `package.json`).
