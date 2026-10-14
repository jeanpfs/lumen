# Contributing to Lumen

Thanks for helping! Bug reports, new strip profiles, and pull requests are welcome.

## Development setup

```bash
cargo test --workspace                          # Rust, no Bluetooth required
cd app && npm install
npx tsc --noEmit && npx vitest run              # frontend gate
npm run tauri dev                               # run the desktop app
```

Both gates must pass before you open a pull request. Format Rust with `cargo fmt` (defaults) and
match the surrounding style in TypeScript.

## Architecture rules

- All device and business logic lives in `core`. Tauri commands in `app/src-tauri/src/lib.rs` are
  one-line wrappers around `Service`.
- Every `#[tauri::command]` must be registered in `generate_handler!` and have a matching method in
  `app/src/api.ts`. Keep the TypeScript interfaces in `api.ts` in sync with the Rust serde output.
- UI text is English. Keep tests colocated (`Name.tsx` + `Name.test.tsx`).

## Adding a strip profile

1. Capture the strip's advertised name and GATT layout with `probe scan` / `probe dump`.
2. Find the write frames (other open-source projects, or experimentation with `probe write`).
3. Add a row to `VARIANTS` in `core/src/families.rs`. Only add a new profile type if framing differs.
4. Add a test that asserts the exact encoded bytes for every frame.
5. Note the hardware you verified on in `docs/` (model, advertised name, what works).

Please do not submit frames you have not verified, or mark them clearly as unverified.

## Pull requests

- Keep changes focused; include tests for behavior changes.
- Describe how you verified on real hardware, if applicable.
- Do not commit build artifacts (`dist-win/`, `dist-android/`, `target/`, `node_modules/`).

By contributing you agree that your contributions are licensed under the MIT License.
