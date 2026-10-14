# MR Star clone — design

Date: 2026-10-06.

## 1. Goal
Clone of the MR Star app (BLE control of LED strips) with a better interface and **strip grouping with no limit on the number of strips**. The original app controls strips together, without individual control, and it used to support grouping. The first test hardware is the **HXT HX7118** strip, which ships with MR Star (the box points to `qrtransfer.com/MiraclesStar.html`, a page that only redirects to the App Store and Google Play).

Targets: **desktop (laptop) and Android**, with a shared core. iOS is out of scope.

## 2. Decisions
| Decision | Choice | Reason |
|---|---|---|
| Architecture | Rust core + Tauri 2 (desktop first, Android later) | One protocol and one BLE pool; one web UI from Open Design |
| BLE | `blec` / `btleplug` | Covers macOS, Windows, Linux; Android through the plugin's Kotlin backend |
| UI | TypeScript + React + Tailwind | Reuses the HTML generated in Open Design |
| iOS | Out | No system audio capture, and background BLE is limited |
| Mobile fallback | Capacitor on Android | Only if the background-service spike in Tauri mobile fails; the `core` does not change |

## 3. Structure
```
mr-star-clone/
├─ core/     # crate `lumen-core`: protocol, transport, pool, registry, engine
├─ probe/    # Rust CLI: scan, GATT dump, raw hex sending
├─ app/
│  ├─ src-tauri/   # thin commands and events over the core
│  └─ ui/          # React + Tailwind
└─ docs/
```

### Contracts
- **protocol**: pure functions, no I/O. One profile per model. `mrstar` (hypothesis below) and `hx7118` (filled in after M0).
- **transport**: trait `Link` (connect, write, notify, disconnect). A real implementation and a fake one.
- **pool**: at most K live connections, LRU policy. A command for N strips becomes batches of up to K: connect, write, release, next batch. A per-strip queue keeps only the last command of each type (coalescing). A connection attempt is retried once; a failure marks the strip "unreachable" without blocking the batch.
- **registry**: strips, groups (N:N), scenes. Persistent, with no item limit.
- **engine**: optimistic state (the strip is stateless), effects.
- **UI** talks to the core only through Tauri commands (`set_color(target, hsv)`, where target = strip or group) and events (`strip_status`). No BLE in the frontend.

## 4. Flow of a command
UI → registry (target → unique set of strips) → engine (optimistic state) → pool (coalesce, batches of K) → protocol (encode per profile) → Link.write. Status comes back as an event.

## 5. Effect synchronization (limits)
| Case | More than K strips | Up to K strips |
|---|---|---|
| Static color and brightness | Works; the difference is only visible when switching | Works |
| Effect built into the strip (mode + speed) | Works if the profile has the command; strips drift out of phase between batches | Almost in phase |
| Animated effect computed by the app | Not supported | ~20 Hz (estimate) |
| Mic and music | A "live" set of up to K strips in real time; the rest receive the average color in rotation (~2 Hz) | ~20 Hz (estimate) |

The UI marks groups above K as "approximate effect" and uncertain states as "presumed state". K and the rates are estimates: **measure on the HX7118 in M0/M1 before fixing them**. The ~7-connection limit on Android (`BTA_GATTC_CONN_MAX`) comes from secondary sources; laptops vary by chip and driver, with no reliable number.

## 6. Protocol — `mrstar` hypothesis (from the Homey driver, not verified on the HX7118)
- Advertised name `GATT--DEMO`. Service `FFF0`, write `FFF3`, notify `FFF4`.
- Frame: `0xBC` + `[cmd, len, ...params]` + `0x55`.
- `01` power `[01,01,00|01]`; `04` color `[04,06,hueHi,hueLo(0–360),satHi,satLo(0–1000),00,00]`; `05` brightness `[05,06,valHi,valLo(3–1000),00,00,00,00]`.
- Mode, speed, and mic: unknown; they require a capture.
- The strip seems to accept one BLE connection at a time (the Homey driver connects on demand and disconnects after 3 s idle).

## 7. HX7118 discovery (M0)
1. nRF Connect on an Android phone: name, services, characteristics; write hex by hand.
2. Test the frames from section 6 on `FFF0/FFF3`.
3. Capture from the MR Star app: Android "HCI snoop log", analyzed in Wireshark, for mode, speed, and mic.
4. `probe` on the Mac: the scan via Python/bleak aborted (exit 134) because the process had no Bluetooth permission. Grant the Terminal permission in Settings › Privacy › Bluetooth, or run from inside an app that has `NSBluetoothAlwaysUsageDescription`.

## 8. Tests
- protocol: expected bytes per command and profile.
- pool with a fake `Link`: K ceiling, LRU order, batches, coalescing, an unreachable strip does not block the batch.
- Hardware (HX7118): on/off, color, brightness, reconnection. Measure connection time, write latency, and simultaneous connections accepted by the Mac.

## 9. Screens (Open Design)
1. Onboarding and permissions; 2. Home (groups and strips); 3. Scan and add; 4. Group detail; 5. Color; 6. Modes; 7. Music; 8. Mic; 9. Scenes; 10. Settings (language, theme, RGB/GRB color order, pixels, BLE diagnostics); 11. Connection manager. (No schedules: see section 13.)
Problems in the original to fix: connection and scan give no feedback, the brightness slider does not respond, colors are swapped, music is limited to 3 tracks and has no color, no individual control, no grouping.
The Open Design daemon did not respond within 60 s through the CLI; retest in M2, or create the project through the app's interface.

## 10. Milestones
| # | Deliverable | Depends on |
|---|---|---|
| M0 | HX7118 probe: GATT and basic commands confirmed | The strip and the phone |
| M1 | `core`: protocol, transport, pool, registry, with tests | M0 |
| M2 | Tauri desktop: home, scan, color, groups | M1 and the Open Design screens |
| M3 | Modes, mic, and scenes | M2 |
| M4 | Android service spike and mobile shell | M3 |

## 11. Out of scope
iOS, cloud accounts, Wi-Fi strips, firmware updates.

## 12. Amendment (2026-10-06): generic app and strip-adding wizard

Decision by the user: the app is not a clone locked to MR Star. It must support strips of several types and have a **fixed add-strip wizard**, visual and step by step, that tests colors and intensities on the strip itself (like the script run on the HX7118 in M0). This changes sections 3, 6, 7, and 10.

### 12.1 Protocol families (profiles)

| Family | Service / write | Frame | Source | Status |
|---|---|---|---|---|
| `mrstar` | `FFF0` / `FFF3` | `BC … 55` (color as hue/saturation) | Homey driver + test on the HX7118 | **confirmed on hardware** |
| `elk-bledom` | `FFF0` / `FFF3` | 9 bytes `7E … EF` | open-source projects (lotus-lantern, elkbledom) | not verified; `ELK-*` models are encrypted with XOR |
| `triones` (HappyLighting) | `FFD5` / `FFD9` | `7E … EF` with `RR GG BB` | pytrionesmqtt | not verified |
| `magic-lantern` | `FFF0` / `FFF3` | `7E … EF` | Home Assistant issue | not verified |
| `zengge-lednetwf` | to be determined | to be determined | zengge_lednetwf repository | not verified |

The "not verified" rows come from search summaries and third-party repositories; each family only becomes "verified" once a real strip has been tested. Only the HX7118 is available today.

### 12.2 Consequence: recognizing by UUID is not enough
`mrstar`, `elk-bledom`, and `magic-lantern` share `FFF0` / `FFF3`. Recognition (step 3 of the wizard) orders the candidate families by GATT service and advertised name, sends each family's on/off frame, and **asks the user** whether the strip reacted. The human answer is the tiebreaker.
The candidate order uses the advertised name and the GATT services **discovered after connecting** (never the advertised ones: the HX7118 advertises `0x2022` and exposes `FFF0`); within the same rank, candidates with color come before those without. No candidate is discarded. The color phase of recognition asks "what solid color do you see?" and accepts any primary, because the channel order is only measured in step 5.

### 12.3 Data model
- `Capabilities` per profile: color, brightness range, white, effects, microphone.
- `Calibration` per strip, produced by the wizard: channel order (relevant only for families whose frame carries RGB bytes; `mrstar` sends hue/saturation and the controller resolves the order, which the test confirmed), minimum useful brightness, noticeable steps, presence of white.
- `Strip` gains `calibration` and detected `capabilities`. `Command` and `encode` start receiving the calibration.

### 12.4 Wizard (9 steps, one per screen)
1 Search · 2 Identify (blink) · 3 Recognize the type · 4 On/off test · 5 Color test (red, green, blue; the user says what they see; the channel order is deduced) · 6 White and extra channels · 7 Intensity test (100, 70, 40, 20, 10, 3 percent) · 8 Effects (optional) · 9 Name and summary of the detected profile.
The logic is a pure state machine in `core/src/setup.rs` (tests run without Bluetooth, with `FakeLink`): it produces the next test and consumes the answer. The UI only renders it.
Failures at any step: retry, skip, or go back. Unrecognized type: capture guidance (HCI snoop) and a report; does not block the wizard. It can be recalibrated later.

### 12.5 Revised milestones
| # | Deliverable |
|---|---|
| M1.5 | `core`: `Capabilities`, `Calibration`, `7E … EF` variants marked "not verified" (`triones` postponed: it has no native brightness command and requires a design decision), `setup` state machine |
| M2 | Tauri desktop: full wizard, home, color, groups (Open Design screens) |

## 13. Amendment (2026-10-07): no schedules

Decision by the user: **the app will have no schedules** (turning on/off at set times, timers, sunrise/sunset). The original MR Star had a Schedule tab; we do not clone it.
- Removed from scope: the tab and the Schedule screen, time triggers in the `engine`, the desktop tray as a requirement for scheduling, the exact alarms and the Android `foreground service` that existed because of scheduling.
- Prototype navigation: the tabs go from five to four (**Home · Color · Modes · Sound**); the "Schedule" item is removed from the Open Design prototype when porting in M2b.
- M3 becomes: modes, mic, and scenes. M4 (Android) no longer needs a background service for scheduling; it will only need one if audio capture or the mic requires it.

## 14. M2b status (UI port + local storage)

Done without hardware (strip unplugged): all screens of the Open Design prototype ported to React/TS except Schedule (§13): Home, Group, Color, Modes, Sound, Scenes, Connections, Settings, Strip types, Welcome, and the 9-step wizard wired to the real `wizard_*` commands. Backend added: group edit commands (remove member, reorder, rename, delete), strip rename, channel-order edit, `wizard_power_test`, `wizard_recalibrate`, `connections`, `profiles` (all with core tests).

Local storage (`localStorage`, key `lumen.state.v2`, field-validated on load): presumed state per target, selected target, favourite colors, scenes, per-strip color overrides, icons, theme, onboarding flag. Modes/Sound keep their selections under `lumen.local.*`.

Known limits: Modes/Sound are interface-only (no effects or mic in the backend, M3); wizard step 6 (white) is a plain question and step 8 (effects) is skipped because there is no backend test for either; scenes and overrides live only on this device. **Not yet verified on the real strip**: the new UI against hardware (pending).

## 15. No sound feature (user decision, 2026-10-07)

The Sound tab, screen, and microphone permission are removed; there will be no music or microphone mode. Tabs are three: Home · Color · Modes. M3 is effects (Modes) and scenes only. `Capabilities.microphone` stays in core as profile data only. This supersedes the Sound mentions in §13 and §14.

## 16. No per-strip icon (user decision, 2026-10-07)

Strips have no icon setting: removed from the wizard summary, Settings, the store, and localStorage (old icon data is ignored on load). Strips show the generic strip glyph; groups show the scenes glyph.

## 17. Strip state hygiene (after the dim-strip incident, 2026-10-07)

The strip keeps its last brightness; at 3% it looks switched off, so a correct command seemed to do nothing. Rules: (1) every wizard test that changes brightness restores full brightness when the wizard ends (finish or cancel) and at the end of the 6-step sequence; (2) turning a target on re-sends the brightness the screen shows; (3) a link the strip dropped is detected before each write and reconnected once; (4) every strip command is logged to `commands.log` in the app data dir; (5) any manual hardware script must end by sending brightness 1000.

## 18. No scenes, no connections screen, no "More" menu (user decision, 2026-10-07)

Removed: the Scenes and Connections screens, scene storage, the pool-occupancy readout (`Service::connections`, `Pool::live_ids`, the `connections` command), and the header menu with the "More" items. Navigation is Home · Color · Modes · Settings; "Strip types" is reached from Settings > About. M3 is effects (Modes) only.

## 19. Pages per target (2026-10-07)

The global "Controlling" target is gone. Each group and strip has its own page (`#group/<id>`, `#strip/<id>`) with tabs General · Color · Modes; the main navigation is Home · Settings. See `2026-10-07-target-pages-ux-design.md`.

## 20. Modes: MR Star's native effects (2026-10-07)

Writes go to `FFF3` as plain frames, with the same `BC … 55` envelope as §6:

| Command | Frame | Notes |
|---|---|---|
| Effect | `BC 06 02 hi lo 55` | `hi = n / 255`, `lo = n % 255`; `n` is the number of the app's `cmodeN` string (all below 255, so `00 n`) |
| Speed | `BC 08 01 s 55` | `s` 1..100 (app SeekBar min 1, max 100) |
| Direction | `BC 07 01 d 55` | the app writes 0 when its direction switch is on, 1 when off; which way each runs is not documented |
| Brightness in Modes | `BC 05 06 …` | same frame as in Color |

Mode numbers per tab (the app's own lists; its "Flow" tab, 63-75, exists in the strings but is not in its tab list, so it is omitted here too): Basic 1,2,3,4,7,10,26,27,29,30,31,32 · Open/Close 35-44 · Transition 45-54 · Running water 55-62 · Trail 76-83 · Race 84-93 (`app/src/lib/modes.ts`). Also seen in the app, not used here: `BC 02 01 n` and `BC 03 02 hi lo` (line type and pixel count dialogs), `BC 0B…`/`0D…` (timers), `BC 0F…`/`11…`/`12…` (microphone), `BC 13 02` and `BC 09 06` (music/voice).

Core: `Command::{Effect, Speed, Direction}` encoded by `MrStar` (`Capabilities.effects = true`); the `7E … EF` variants return `None` (reported as `unsupported`). The earlier app-drawn animation (color and brightness frames) was removed: the strip plays its own effects. UI: picking a mode plays it at once (power on if needed, then effect, then speed); speed, brightness, and direction send as they change; a color from Color replaces the effect, and "Stop effect" sends the color the target was showing (the strip has no stop command). Effects cannot be tuned to a color: the color is part of the mode.

Not verified on hardware: that the frames above behave as decoded, what the direction byte means, whether Speed and Brightness persist across mode changes, and out-of-phase behavior over several strips.

## 21. Android (2026-10-08)

The Tauri project has an Android target (`app/src-tauri/gen/android`, committed). BLE is the same `btleplug` core through its Android backend: its Java half is vendored in `app/src-tauri/android-ble/java` (BSD-3, see `LICENSE-btleplug.md`) and added as a Gradle source dir; `JNI_OnLoad` in `src-tauri/src/lib.rs` hands the JVM to `btleplug::platform::init` (without it every Bluetooth call panics). `MainActivity` asks for `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` (Android 12+) or location (older) at start; the manifest declares them (scan with `neverForLocation`). R8 keep rules for the JNI-only classes are in `gen/android/app/proguard-btleplug.pro`. UI: `viewport-fit=cover` plus top safe-area padding on `.app`, `.wz`, and `.welcome`; light system-bar icons; on phones the Modes control panel comes before the mode list.

Build: `scripts/build-android.sh` → `dist-android/Lumen-android-arm64.apk` (release, ~7 MB, signed with the debug key unless `KEYSTORE` is set; installable, not publishable). Needs the Android SDK/NDK and JDK 17-22; run with `ANDROID_HOME`/`NDK_HOME` set or in the default macOS locations.

Verified: the release APK installs and runs on an arm64 emulator (Pixel 9 Pro XL, Android 16); first run, wizard, and the BLE scan complete without errors (0 devices: the emulator has no Bluetooth radio). Found on a real phone (Galaxy Z Fold7, Android 17): with Bluetooth switched off the system refuses a scan and only logs it (`BtScan.ScanBinder: Only privileged app can scan when Bluetooth is not ON`), so the wizard showed an empty list. The vendored `Adapter.java` now throws `BluetoothDisabledException` when the adapter is off (the wizard shows "Bluetooth unavailable") and logs `onScanFailed`; `MainActivity` asks the system to switch Bluetooth on once the permissions are granted. With Bluetooth on, the wizard listed 12 devices including `GATT--DEMO`. Not verified: connecting to and controlling a real strip from the phone (connect, color, effects), the connection limit of the phone's Bluetooth stack, background behavior.

## 22. Startup latency (2026-10-08)

Cause of the wait after opening the app: nothing was connected until the first command, which then paid for a fixed 4 s scan to find the strip plus the connection (4.9 s measured on the phone, `apply … in 4882 ms`). Two changes: (1) `Service::warm_up` runs at app start in the background (`lib.rs` setup): `Link::prepare` scans until all saved strips have been seen, then `Pool::warm` connects up to `max_live` of them one at a time (a real command waits at most for the connection in progress; unreachable strips are skipped and retried by their first command); (2) `BleLink::find` and `prepare` stop scanning as soon as the strip is seen instead of sleeping the full time. Measured on the desktop with the real strip: `warm_up done in 1292 ms`, in the background. A strip that another device (the phone, the other app) is connected to does not advertise, so it is not found: with the phone still connected, the desktop's warm-up took 12 s and found nothing. Not measured: the same on the phone after this change.

## 23. Bluetooth gate (2026-10-08)

Without Bluetooth nothing in Lumen works, so while the radio is off a full-screen, non-dismissable dialog (`BluetoothGate`, a portal over everything with `#root` made `inert`) blocks the app until it is on. State comes from `Link::powered` (btleplug `adapter_state`: macOS CoreBluetooth answers; Android always answers `Unknown`) through the `bluetooth_state` command on the desktop, and on Android from `window.LumenNative.bluetoothEnabled()`, a WebView bridge added in `MainActivity` (`onWebViewCreate`). `unknown` never blocks. The store polls every 2 s and on focus. Android's button calls `LumenNative.enableBluetooth()` (the system "Lumen is asking to turn on Bluetooth" prompt; guarded on `BLUETOOTH_CONNECT`); the desktop's opens the system Bluetooth settings (`open_bluetooth_settings`, macOS and Windows). When the radio comes back: unreachable strips are retried and the saved strips are connected.

The saved strips are now connected by the UI calling `warm_up` (the command returns the connected ids, which the UI marks "Live") at start and each time Bluetooth comes back, instead of from Rust's setup, so the home screen shows the real link state without a command. Verified on the Galaxy Z Fold7: gate shown with Bluetooth off, stays after denying the prompt, the button brings the prompt back, and after allowing it the gate closes and the strip turns "Live" on its own. Desktop: warm-up from the UI measured at 2.7 s (strip free). Not verified: the gate on the Mac with Bluetooth switched off (needs the radio toggled by hand), Windows, and Linux (`adapter_state` support unchecked; they fall back to `unknown`, i.e. no gate).
