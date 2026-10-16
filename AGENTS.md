# Repository Guidelines

## Project Overview
**Lumen** is a cross-platform (macOS, Windows, Android) controller for Bluetooth LE LED strips, an independent open-source alternative to the "MR Star" app. It is generic: strips are described by *profiles* (protocol families) and onboarded through a 9-step setup wizard. Targets are single strips or groups. The UI and all docs are in English.

Stack: Rust workspace (`core`, `probe`, `app/src-tauri`) + Tauri 2 shell + React 19 / TypeScript / Vite / Tailwind 4 frontend in `app/`.

## Architecture & Data Flow
```
React UI (app/src) → state/store.tsx (useReducer) → state/sender.ts (coalesce, ~150ms)
   → api.ts (typed invoke) → Tauri commands (app/src-tauri/src/lib.rs, one-line wrappers)
   → lumen-core Service<L> (core/src/service.rs) → Pool<L> (core/src/pool.rs)
   → Link/Scanner traits (core/src/transport) → BleLink (btleplug) | FakeLink (tests)
```
- **All device/business logic lives in `core`**. Tauri commands only delegate to `Service`; do not put logic in `lib.rs`.
- `Service<L: Link + Scanner>` owns the `Pool<L>`, `Mutex<Registry>` (persisted as `registry.json` in the app data dir), and the wizard `Session`. Registry mutations go through `mutate()` (clone → save → swap under one lock).
- `Pool<L>`: max 6 live BLE connections (`DEFAULT_MAX_LIVE`), LRU eviction, same-kind commands coalesced per strip per dispatch (`plan()`), one retry per strip, dispatches serialized. Returns `Report {ok, unreachable, unsupported}`.
- **Protocol** (`core/src/protocol.rs`, `families.rs`): `Command` enum (serde `tag="type", content="value"`, snake_case) is encoded by a `Profile` trait impl. `MrStar` profile: service `FFF0`, write `FFF3`, notify `FFF4`, frames `BC … 55`. Other families are table-driven `TemplateProfile` entries in `VARIANTS`. Add a new family by adding a `VARIANTS` row, not a new type, unless framing differs.
- `calibration.rs`: per-strip `ChannelOrder` (6 permutations), min brightness, `hsv_to_rgb`. `setup.rs`: wizard `Recognizer`/`Step`/channel-order deduction.
- **Frontend contracts**: `app/src/api.ts` TS interfaces mirror Rust serde output; keep both in sync when changing a Snapshot/Command/WizardState shape. Tauri args are camelCase.
- UI-only prefs persist to `localStorage` key `lumen.state.v2` (`state/persist.ts`, validates field-by-field, never throws). Routing is a custom hash router (`router.ts`): `#group/<id>`, `#strip/<id>`, add-wizard outside the Shell.
- A Bluetooth gate (`ui/BluetoothGate`) and startup `warm_up` precede normal use.

## Key Directories
| Path | Purpose |
|---|---|
| `core/` | crate `lumen-core`: protocol, pool, registry, service, wizard logic, transports |
| `core/src/transport/` | `Link`/`Scanner` traits, `ble.rs` (feature `ble`), `fake.rs` (`#[cfg(test)]`) |
| `probe/` | CLI for hardware experiments (`scan`, `dump`, `write`, `measure`, `send`, `profiles`, `demo`) |
| `app/src-tauri/` | Tauri 2 shell (lib `lumen_lib`), `tauri.conf.json`, `capabilities/`, Android Gradle project in `gen/android` |
| `app/src/screens/` | route screens (Home, Color, Modes, Wizard, Group*/Strip*, TargetPage…) |
| `app/src/state/` | store, sender, persist, types, targets |
| `app/src/lib/` | pure helpers (color, modes, profiles, wizard machine) |
| `app/src/ui/` | shared components |
| `app/src/test/` | vitest setup + `fakeBackend.ts` |
| `docs/` | `hx7118-findings.md` (hardware findings) |
| `scripts/` | cross-platform build scripts |
| `dist-win/`, `dist-android/` | build outputs (artifacts, don't edit) |

## Development Commands
```bash
# Rust (repo root)
cargo test --workspace                 # core + probe tests (no Bluetooth needed)
cargo build -p lumen-core --features ble
cargo run -p probe -- scan --secs 8 --name GATT
probe/run-bundled.sh scan --secs 8     # macOS: wraps probe in ad-hoc-signed .app so TCC grants Bluetooth

# App (cd app)
npm install
npm run tauri dev                      # desktop dev (vite on :1420 strictPort)
npm run build                          # tsc && vite build
npx tsc --noEmit && npx vitest run     # frontend gate (no `test` npm script)
npm run tauri build

# Release builds (repo root)
scripts/build-windows.sh               # cargo-xwin → dist-win/Lumen-windows-x64.zip (Lumen.exe only)
scripts/build-android.sh               # → dist-android/Lumen-android-arm64.apk (needs ANDROID_HOME, NDK_HOME, JDK 17–22)
```
No lint/format tooling is configured (no ESLint/Prettier/rustfmt.toml/clippy.toml/CI). Use `cargo fmt` defaults and match surrounding style.

macOS note: after reinstalling the app, quit it with `pkill -f Lumen.app/Contents/MacOS/lumen` before relaunching.

## Code Conventions & Common Patterns
- **Rust**: edition 2021; `thiserror` error enums (`ServiceError`, `RegistryError`, `LinkError`, `SetupError`); `ServiceError` serializes as a plain string to the frontend. Newtype IDs `StripId`/`GroupId` (`ids.rs`). Async via tokio + `async_trait`; generic over `Link` for DI (production `BleLink`, tests `FakeLink`).
- BLE is feature-gated (`ble`, off by default in `core`); `probe` and `app/src-tauri` enable it. Timeouts in `ble.rs`: connect 8s, discover 8s, write 5s, scan 6s.
- **Tauri**: every `#[tauri::command]` must be registered in `generate_handler!` in `app/src-tauri/src/lib.rs` and gets a matching method in `api.ts`. `logged()` wrapper writes `commands.log`. If service init fails, commands return `ServiceError::Unavailable` ("service unavailable") which the store routes to the `unavailable` state; other errors → toast + event log (max 30). Do not remove `windows_subsystem` in `main.rs`.
- **Frontend**: function components + hooks, `useReducer` store with `Action` union exposed via context (`AppProvider`, injectable `backend`, `sendDelayMs`, `returnRetryMs`, `bluetoothPollMs` for tests). UI changes are sent through `Sender` (latest-value-per-kind, serial flush; order power, colour, effect, speed, direction, brightness). Tailwind 4 via `@tailwindcss/vite`. Tests/files: `Name.tsx` + `Name.test.tsx` colocated.
- Android: 16 KB page alignment flag in `.cargo/config.toml`; `JNI_OnLoad` in `lib.rs` initializes btleplug.
- Scope decisions (see spec): no scheduling, no sound/mic mode, no per-strip icons, no scenes/connections screen.

## Important Files
- `core/src/service.rs` – central API surface (snapshot, apply, wizard_*, group/strip mutators)
- `core/src/pool.rs`, `core/src/protocol.rs`, `core/src/families.rs`, `core/src/registry.rs`, `core/src/setup.rs`
- `app/src-tauri/src/lib.rs` (commands, `run()`), `app/src-tauri/src/main.rs`, `tauri.conf.json`, `capabilities/default.json`
- `app/src/api.ts`, `app/src/state/store.tsx`, `app/src/state/sender.ts`, `app/src/App.tsx`, `app/src/router.ts`
- `Cargo.toml` (workspace; release: lto, codegen-units=1, panic=abort, strip), `app/package.json`, `app/vite.config.ts` (also vitest config)
- `docs/hx7118-findings.md` – hardware findings; read before changing protocol or UX

## Runtime/Tooling Preferences
- Package manager: **npm** (`app/package-lock.json`); no pnpm/yarn/bun. No `engines`/toolchain pin files.
- Rust workspace with a single root `Cargo.lock`; Tauri CLI via `npx tauri` from `app/`.
- Frontend: Vite 8, TypeScript ~6, React 19, Vitest 5 + jsdom.
- Cross-builds need `cargo-xwin` + llvm (Windows) and Android SDK/NDK + `aarch64-linux-android` rustup target (scripts install what they can).
- Hardware notes: HX7118 strip speaks the mrstar protocol (confirmed). Effect/speed/direction frames are **not hardware-verified**. A bare binary started from some terminals is killed by macOS TCC; use `run-bundled.sh`.

## Testing & QA
- Only unit tests, all inline/colocated; no `tests/` integration dirs, no Tauri-side tests, no coverage tooling or thresholds.
- **Rust**: `#[cfg(test)] mod tests` in `core/src/{service,pool,registry,families,protocol,setup,calibration}.rs` and `probe/src/parse.rs`. Async tests use `#[tokio::test]` with `FakeLink` (`core/src/transport/fake.rs`: `fail_connect/fail_write/fail_services`, recorded writes/connects, `set_discovered/set_services/set_powered`) and `tempfile` registries. Byte-level protocol encodings are asserted exactly; add a test for any new frame.
- **Frontend**: Vitest + Testing Library + user-event. Setup `app/src/test/setup.ts` (jest-dom, ResizeObserver/scrollTo polyfills, localStorage cleared per test). Use `fakeBackend()` from `app/src/test/fakeBackend.ts` (vi.fn spies for every api method) with `AppProvider backend={…}`; `App.test.tsx` mocks `@tauri-apps/api/core` `invoke` by command name. UI labels are English; seed `localStorage` key `lumen.state.v2` and use `window.location.hash` for routing.
- Gate before finishing: `cargo test --workspace` and, in `app/`, `npx tsc --noEmit && npx vitest run`. Real-hardware behavior can only be verified via `probe`/the app on a device.
