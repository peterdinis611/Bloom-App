#!/usr/bin/env bash
# Generate Tauri updater (minisign) keypair for Bloom.
# Public key → src-tauri/tauri.conf.json plugins.updater.pubkey
# Private key → GitHub secret TAURI_SIGNING_PRIVATE_KEY (never commit)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$HOME/.tauri/bloom.key}"

mkdir -p "$(dirname "$OUT")"
echo "Generating keypair → $OUT"
npx tauri signer generate -w "$OUT"

echo ""
echo "Next steps:"
echo "  1. Copy the printed public key into src-tauri/tauri.conf.json → plugins.updater.pubkey"
echo "  2. Store the private key file contents as GitHub secret TAURI_SIGNING_PRIVATE_KEY"
echo "  3. Store the password as TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
echo "  4. Set bundle.macOS.signingIdentity for notarized macOS builds"
echo ""
echo "Do NOT commit $OUT"
