# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Brazilian Portuguese UI. The app follows the phone's or computer's language (any Portuguese
  gets pt-BR, everything else English); the globe button on Home picks a language manually.

### Fixed

- Android: connecting to a strip no longer fails when it refuses or ignores the MTU exchange; the
  link falls back to the default MTU.
- Android: connections use `TRANSPORT_LE`, wait 500 ms after a scan, and get 12 s instead of 8 s.
- Android: a timed-out connect is now really cancelled instead of blocking the strip's command
  queue until the system gives up (~30 s), which made every retry fail too.
- Signal bars in the setup scan were calibrated so a strip next to the phone showed one bar; they
  now light from -90/-80/-70/-60 dBm.

### Changed

- The setup wizard's "Connection lost" screen shows the backend's reason (for example the GATT
  status), so it can be reported without a debugger.

## [0.1.1] - 2026-10-16

### Added

- Tag-driven GitHub release pipeline: tagging `vX.Y.Z` builds the macOS (Apple Silicon `.dmg`),
  Windows (x64 NSIS installer) and Android (arm64 `.apk`) artifacts and publishes the release.
- Issue templates for bug reports and new strip profiles.
- "Tested hardware" table in the README.

### Changed

- Node.js 24 LTS is now the supported and CI-tested version.
- Removed internal design documents from `docs/`.
- All crates and app manifests now share a single version number, checked against the tag on release.

## [0.1.0] - 2026-10-14

### Added

- Initial public pre-release.
- `lumen-core`: protocol families for generic BLE LED strips (MR Star `FFF0`/`FFF3` and ELK-BLEDOM
  style families), connection pool with up to 6 simultaneous connections, device registry and
  setup wizard logic.
- `probe` CLI for hardware experiments (`scan`, `dump`, `write`, `measure`, `send`, `profiles`, `demo`).
- Tauri 2 + React 19 app for macOS, Windows and Android: power, color, white, brightness, effects,
  speed and direction, single strips or groups, and a 9-step setup wizard.
- Manually built Windows (portable zip) and Android (arm64 APK) binaries.

### Known issues

- Only the HX7118 strip is hardware-verified, and only for power, color and brightness.
  Effect, speed and direction frames, and the other protocol families, are not verified on real hardware.

[Unreleased]: https://github.com/jeanpfs/lumen/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/jeanpfs/lumen/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jeanpfs/lumen/releases/tag/v0.1.0
