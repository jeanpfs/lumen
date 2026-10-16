# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
