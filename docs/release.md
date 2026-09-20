# Bloom 1.0 — release, signing, updater

## Verzia

Synchronizuj vždy tieto 4 miesta na rovnakú verziu:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src/lib/i18n/sk.ts` → `app.version`

## Bundle ID

`app.bloom.desktop` — po prvom podpísanom release **nemeň**.

## Apple signing + notarization

1. Apple Developer účet + Developer ID Application certifikát
2. Export `.p12` → Base64 do GitHub secret `APPLE_CERTIFICATE`
3. Secrets: `APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific), `APPLE_TEAM_ID`
4. V `tauri.conf.json` nastav `bundle.macOS.signingIdentity` na názov certifikátu (alebo nechaj `null` a nech `tauri-action` použiť env)

## Updater (minisign)

```bash
# vygeneruj kľúče
npm run tauri signer generate -w ~/.tauri/bloom.key

# verejný kľúč → tauri.conf.json → plugins.updater.pubkey
# súkromný kľúč → GitHub secret TAURI_SIGNING_PRIVATE_KEY
# heslo → TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

Endpoint (upravený v `tauri.conf.json`):

```
https://github.com/<ORG>/<REPO>/releases/latest/download/latest.json
```

Po release action vytvorí updater artefakty (`.sig` + `latest.json`).

## ffmpeg (first-run)

Bloom **nebundluje** ffmpeg (veľkosť + notarizácia). Flow 1.0:

1. Onboarding krok „ffmpeg“ — check / `brew install`
2. Knižnica — banner + auto-install ak je Homebrew
3. Lokalizované chybové hlášky cez `localizeError`

Voliteľné neskôr: stiahnuť static ffmpeg do Application Support.

## CI

- `.github/workflows/ci.yml` — `bun build` + vitest + `cargo test`
- `.github/workflows/release.yml` — tag `v*` → draft GitHub Release

## Checklist pred 1.0 tagom

- [ ] Nahradiť `REPLACE_WITH_MINISIGN_PUBLIC_KEY`
- [ ] Upraviť updater endpoint na skutočný repo
- [ ] Nastaviť Apple secrets
- [ ] Overiť notarizovaný DMG na čistom Macu
- [ ] Prvý run: permissions onboarding + ffmpeg
- [ ] Aktualizácia cez Nastavenia → Aktualizácie
