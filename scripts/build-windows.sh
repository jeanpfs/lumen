#!/usr/bin/env bash
# Cross-compiles Lumen for Windows x64 from macOS/Linux and packs a portable zip.
# Output: dist-win/Lumen-windows-x64.zip (contains Lumen.exe, no installer).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET=x86_64-pc-windows-msvc
OUT="$ROOT/dist-win"
ZIP="$OUT/Lumen-windows-x64.zip"

# --- prerequisites (installed only when missing) ---
command -v cargo >/dev/null || { echo "cargo not found; install Rust (rustup)." >&2; exit 1; }
command -v npm >/dev/null || { echo "npm not found; install Node.js." >&2; exit 1; }
command -v zip >/dev/null || { echo "zip not found." >&2; exit 1; }

rustup target list --installed | grep -qx "$TARGET" || rustup target add "$TARGET"
command -v cargo-xwin >/dev/null || cargo install --locked cargo-xwin

if [[ "$(uname)" == "Darwin" ]]; then
  command -v brew >/dev/null || { echo "Homebrew required to install llvm." >&2; exit 1; }
  brew list llvm >/dev/null 2>&1 || brew install llvm
  export PATH="$(brew --prefix llvm)/bin:$PATH"
fi
command -v clang-cl >/dev/null || { echo "clang-cl (llvm) not found in PATH." >&2; exit 1; }

# --- build ---
cd "$ROOT/app"
[[ -d node_modules ]] || npm ci
npx tauri build --runner cargo-xwin --target "$TARGET" --no-bundle

EXE="$ROOT/target/$TARGET/release/lumen.exe"
[[ -f "$EXE" ]] || { echo "build did not produce $EXE" >&2; exit 1; }

# --- package ---
mkdir -p "$OUT"
rm -f "$ZIP" "$OUT/Lumen.exe"
cp "$EXE" "$OUT/Lumen.exe"
zip -j -q "$ZIP" "$OUT/Lumen.exe"
rm "$OUT/Lumen.exe"

echo "OK: $ZIP ($(du -h "$ZIP" | cut -f1))"
