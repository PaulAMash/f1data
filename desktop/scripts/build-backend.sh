#!/usr/bin/env bash
# Package the FastAPI backend into a Tauri sidecar binary.
#
#   ./desktop/scripts/build-backend.sh
#
# Produces:  frontend/src-tauri/binaries/pitwall-iq-backend-<target-triple>
# Tauri requires the <target-triple> suffix so it can pick the right binary
# per platform when bundling.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# Resolve the Rust host target triple (e.g. aarch64-apple-darwin, x86_64-apple-darwin).
if command -v rustc >/dev/null 2>&1; then
  TRIPLE="$(rustc -Vv | awk '/host:/ {print $2}')"
else
  echo "rustc not found — install Rust (https://rustup.rs) so we can detect the target triple." >&2
  exit 1
fi

if ! command -v pyinstaller >/dev/null 2>&1; then
  echo "pyinstaller not found. Install it:  pip install pyinstaller" >&2
  exit 1
fi

echo "▶ Building backend sidecar for $TRIPLE"
pyinstaller --clean --noconfirm \
  --distpath desktop/build/dist \
  --workpath desktop/build/work \
  desktop/pitwall-iq-backend.spec

BIN_DIR="frontend/src-tauri/binaries"
mkdir -p "$BIN_DIR"
OUT="$BIN_DIR/pitwall-iq-backend-$TRIPLE"

SRC="desktop/build/dist/pitwall-iq-backend"
[ "${OS:-}" = "Windows_NT" ] && SRC="$SRC.exe" && OUT="$OUT.exe"

cp "$SRC" "$OUT"
chmod +x "$OUT" || true
echo "✔ Sidecar ready: $OUT"
