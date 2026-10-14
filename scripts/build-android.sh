#!/usr/bin/env bash
# Builds Lumen for Android (arm64) and copies the APK to dist-android/.
# A release build (optimized, ~7 MB) signed with the debug key unless KEYSTORE is set: installable with
# `adb install` or by opening the file on the phone, not publishable. Needs the Android SDK + NDK and a JDK 17-22.
# Signing with your own key: KEYSTORE=path KEY_ALIAS=alias KEYSTORE_PASS=pass ./scripts/build-android.sh
# Output: dist-android/Lumen-android-arm64.apk
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist-android"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [[ -z "${NDK_HOME:-}" ]]; then
  NDK_HOME="$(ls -d "$ANDROID_HOME"/ndk/* 2>/dev/null | sort -V | tail -1 || true)"
  export NDK_HOME
fi
[[ -d "$ANDROID_HOME" ]] || { echo "Android SDK not found (set ANDROID_HOME)." >&2; exit 1; }
[[ -d "${NDK_HOME:-}" ]] || { echo "Android NDK not found (install one with sdkmanager, or set NDK_HOME)." >&2; exit 1; }
command -v npm >/dev/null || { echo "npm not found; install Node.js." >&2; exit 1; }
if [[ "$(uname)" == "Darwin" && -z "${JAVA_HOME:-}" ]]; then
  JAVA_HOME="$(/usr/libexec/java_home 2>/dev/null || true)"
  export JAVA_HOME
fi

rustup target list --installed | grep -qx aarch64-linux-android || rustup target add aarch64-linux-android

cd "$ROOT/app"
[[ -d node_modules ]] || npm ci
npx tauri android build --target aarch64 --apk

BT="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
UNSIGNED=src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
KEYSTORE="${KEYSTORE:-$HOME/.android/debug.keystore}"
KEY_ALIAS="${KEY_ALIAS:-androiddebugkey}"
KEYSTORE_PASS="${KEYSTORE_PASS:-android}"
[[ -f "$KEYSTORE" ]] || { echo "Keystore $KEYSTORE not found (create the debug one by building any Android Studio project, or set KEYSTORE)." >&2; exit 1; }

mkdir -p "$OUT"
"$BT/zipalign" -f -P 16 4 "$UNSIGNED" "$OUT/aligned.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" --ks-pass "pass:$KEYSTORE_PASS" \
  --out "$OUT/Lumen-android-arm64.apk" "$OUT/aligned.apk"
rm -f "$OUT/aligned.apk" "$OUT/Lumen-android-arm64.apk.idsig" "$OUT/Lumen-android-arm64-debug.apk"
echo "Wrote $OUT/Lumen-android-arm64.apk"
