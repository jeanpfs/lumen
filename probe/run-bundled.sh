#!/bin/bash
# Runs the probe inside a minimal .app bundle so macOS treats it as its own
# Bluetooth client. A bare binary started from a terminal that lacks
# NSBluetoothAlwaysUsageDescription (e.g. Warp) is killed with SIGABRT.
#
# Usage: probe/run-bundled.sh scan --secs 8 --name GATT
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/target/probe.app"
OUT="$(mktemp -t probe-out)"

cargo build -q -p probe --manifest-path "$ROOT/Cargo.toml"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$ROOT/target/debug/probe" "$APP/Contents/MacOS/probe"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>dev.mrstar.probe</string>
  <key>CFBundleName</key><string>probe</string>
  <key>CFBundleExecutable</key><string>probe</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
  <key>NSBluetoothAlwaysUsageDescription</key>
  <string>Diagnostics for BLE LED strips.</string>
</dict>
</plist>
PLIST
codesign --force --sign - "$APP" >/dev/null 2>&1

# `open` detaches the app, so capture its output through files.
open -W -n --stdout "$OUT" --stderr "$OUT" "$APP" --args "$@"
cat "$OUT"
rm -f "$OUT"
