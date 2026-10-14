# Lumen

A cross-platform (macOS, Windows, Android) controller for Bluetooth LE LED strips.
Lumen is an independent, open-source alternative to the "MR Star" app and works with
many generic BLE LED controllers (ELK-BLEDOM family and similar).

- Control a single strip or a group: power, color, white, brightness, effects, speed, direction.
- 9-step setup wizard that recognizes the strip's protocol family and calibrates its channel order.
- Up to 6 simultaneous BLE connections with automatic eviction and retry.
- Built with Rust (BLE + protocol core), Tauri 2, React 19 and TypeScript.

> **Status:** early. The HX7118 strip is confirmed working with the MR Star protocol family.
> Effect/speed/direction frames are not hardware-verified on every device. See [`docs/hx7118-findings.md`](docs/hx7118-findings.md).

## Tested hardware

| Strip / controller | Advertised name | Protocol family | Status |
|---|---|---|---|
| HX7118 | `GATT--…` | `mrstar` (`FFF0` / `FFF3`, frames `BC … 55`) | Power, color, brightness verified. Effects, speed and direction not verified. |

Other `ELK-*` families in `core/src/families.rs` are implemented from public protocol
descriptions and are **not hardware-verified**. If you test one, please
[open an issue](https://github.com/jeanpfs/lumen/issues/new/choose) so it can be listed here.

## Repository layout

| Path | Purpose |
|---|---|
| `core/` | `lumen-core`: protocol families, connection pool, registry, service, setup wizard logic, BLE transport |
| `probe/` | CLI for hardware experiments (`scan`, `dump`, `write`, `measure`, `send`, `profiles`, `demo`) |
| `app/` | Tauri 2 shell (`app/src-tauri`) and the React frontend (`app/src`) |
| `docs/` | Research notes, hardware findings and design specs |
| `scripts/` | Cross-platform release build scripts |

## Getting started

Prerequisites: [Rust](https://rustup.rs) (stable), Node.js 20+, and the
[Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
# Rust tests (no Bluetooth hardware needed)
cargo test --workspace

# Desktop app in dev mode
cd app
npm install
npm run tauri dev

# Frontend checks
npx tsc --noEmit && npx vitest run
```

### Probing real hardware

```bash
cargo run -p probe -- scan --secs 8 --name GATT
# macOS: Bluetooth permission needs an app bundle; this wraps the probe in a signed .app
probe/run-bundled.sh scan --secs 8
```

### Release builds

```bash
npm --prefix app run tauri build   # native bundle for the current OS
scripts/build-windows.sh           # cross-compile Windows x64 (needs cargo-xwin + llvm)
scripts/build-android.sh           # Android arm64 APK (needs ANDROID_HOME, NDK_HOME, JDK 17-22)
```

## Adding support for a new strip

Most strips are table-driven: add a row to `VARIANTS` in `core/src/families.rs` with the
advertised name, GATT service/characteristic and the on/off/color/brightness frames, plus a test
asserting the exact bytes. Use `probe` to capture and verify frames against real hardware.
See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Disclaimer

Lumen is not affiliated with, endorsed by, or sponsored by the makers of MR Star or any LED
controller vendor. All product names are trademarks of their respective owners and are used only
to describe compatibility. Protocol information was gathered from open-source projects and by observing
devices owned by the author.

## License

[MIT](LICENSE). The vendored Android btleplug glue in `app/src-tauri/android-ble` is under its
own license; see `app/src-tauri/android-ble/LICENSE-btleplug.md`.
