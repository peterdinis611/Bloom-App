# Dokumentácia Bloom

Slovenská dokumentácia k desktopovej aplikácii Bloom.

## V aplikácii

V sidebar-e otvor **Dokumentácia** — stručný návod, skratky a riešenie problémov priamo v UI.

## Súbory v tomto priečinku

| Súbor | Obsah |
|-------|--------|
| [pouzivanie.md](pouzivanie.md) | Príručka pre koncového používateľa |
| [vyvoj.md](vyvoj.md) | Architektúra, príkazy, testy |
| [backend.md](backend.md) | Rust backend, session, ffmpeg |

## Témy

Bloom má **30 vizuálnych tém** (Darkroom, Svetlý, Kino, Lagúna, Med, …). Výber je v **Nastavenia → Vzhľad**.

## Rýchly štart

```bash
bun install
bun run tauri dev
```

Nahrávky sa ukladajú do `~/Movies/Bloom` (macOS).
