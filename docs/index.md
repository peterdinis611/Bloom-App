# Dokumentácia Bloom

Slovenská dokumentácia k desktopovej aplikácii Bloom.

## V aplikácii

V sidebar-e otvor **Dokumentácia** — návod, skratky, **praktické príklady** (tutoriál, Slack, orez, nastavenia) a riešenie problémov.

## Súbory v tomto priečinku

| Súbor | Obsah |
|-------|--------|
| [pouzivanie.md](pouzivanie.md) | Príručka pre koncového používateľa + príklady |
| [vyvoj.md](vyvoj.md) | Architektúra, príkazy, testy |
| [backend.md](backend.md) | Rust backend, session, ffmpeg |
| [release.md](release.md) | 1.0 release: signing, updater, CI |

## Témy

Bloom má **30 vizuálnych tém** (Darkroom, Svetlý, Kino, Lagúna, Med, …). Výber je v **Nastavenia → Vzhľad**.

## Rýchly štart

```bash
bun install
bun run tauri dev
```

Nahrávky sa ukladajú do `~/Movies/Bloom` (macOS). Okno zväčšíš zeleným tlačidlom v titlebare alebo dvojklikom na lištu.
