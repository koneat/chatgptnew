#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:-$ROOT/dist}"
NAME="prompt-professionalizer-v1.3.0"
mkdir -p "$OUT"
rm -f "$OUT/$NAME-extension.zip" "$OUT/$NAME-source.zip"
RUNTIME_FILES=(manifest.json service-worker-v4.js service-worker.js response-compat.js action-icon.js content-script.js options.html options.js README.md PRIVACY.md)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/$NAME"
for file in "${RUNTIME_FILES[@]}"; do cp "$ROOT/$file" "$TMP/$NAME/$file"; done
(cd "$TMP" && zip -qr "$OUT/$NAME-extension.zip" "$NAME")
(cd "$(dirname "$ROOT")" && zip -qr "$OUT/$NAME-source.zip" "$(basename "$ROOT")")
sha256sum "$OUT/$NAME-extension.zip" "$OUT/$NAME-source.zip"
