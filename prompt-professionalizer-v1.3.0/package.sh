#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:-$ROOT/dist}"
EXT_NAME="prompt-professionalizer-v1.3.0"
SRC_NAME="prompt-professionalizer-v1.3.0-source"
mkdir -p "$OUT"
rm -f "$OUT/$EXT_NAME-extension.zip" "$OUT/$SRC_NAME.zip"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
RUNTIME_FILES=(manifest.json service-worker-v4.js service-worker.js response-compat.js action-icon.js content-script.js options.html options.js README.md PRIVACY.md)
mkdir -p "$TMP/$EXT_NAME" "$TMP/$SRC_NAME"
for file in "${RUNTIME_FILES[@]}"; do cp "$ROOT/$file" "$TMP/$EXT_NAME/$file"; done
cp -a "$ROOT/." "$TMP/$SRC_NAME/"
rm -rf "$TMP/$SRC_NAME/dist"
(cd "$TMP" && zip -qr "$OUT/$EXT_NAME-extension.zip" "$EXT_NAME")
(cd "$TMP" && zip -qr "$OUT/$SRC_NAME.zip" "$SRC_NAME")
sha256sum "$OUT/$EXT_NAME-extension.zip" "$OUT/$SRC_NAME.zip"
