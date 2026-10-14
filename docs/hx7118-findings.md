# HXT HX7118 — findings

## Environment
- Mac: arm64, Bluetooth chipset BCM_4388 (Apple), macOS 27.0.0, 2026-10-06.
- Strip powered over USB. MR Star app closed on phones.
- Terminal: Warp. A bare `probe` binary started from Warp is killed with SIGABRT: Warp's Info.plist has no `NSBluetoothAlwaysUsageDescription` (crash report: `termination.namespace = TCC`, `responsibleProc = stable`). `probe/run-bundled.sh` wraps the binary in an ad-hoc-signed `.app` that carries the key; every hardware command below ran through it.

## Scan
Command: `probe/run-bundled.sh scan --secs 8 --name GATT`

```
 -77  GATT--DEMO               8149bccd-74b8-c848-3f5d-b88ecb66605d  services=[00002022-0000-1000-8000-00805f9b34fb]  mfr=["FFFF:FF FF 11 77 27 B3 36 00 DA 01 01 05 08 01 00"]
1 device(s)
```
- Strip id (CoreBluetooth UUID): `8149bccd-74b8-c848-3f5d-b88ecb66605d`
- Advertised name `GATT--DEMO`, as the Homey driver expects. RSSI -77 dBm (weak).
- The advertisement carries service `0x2022`, not `FFF0`; `FFF0` appears only after connecting.

## GATT dump
Command: `probe/run-bundled.sh dump 8149bccd-74b8-c848-3f5d-b88ecb66605d`

```
service 0000fff0-0000-1000-8000-00805f9b34fb
  char 0000fff3-0000-1000-8000-00805f9b34fb  CharPropFlags(WRITE_WITHOUT_RESPONSE | WRITE)
  char 0000fff4-0000-1000-8000-00805f9b34fb  CharPropFlags(READ | NOTIFY)
```
- Service `FFF0`, write characteristic `FFF3` (accepts both write types), notify characteristic `FFF4` (read + notify): matches the `mrstar` profile hypothesis exactly.
- `BleLink` and `probe write` choose write-without-response because `FFF3` advertises it.

## Frame tests (Task 4)
Run through `probe/run-bundled.sh write <id> fff3 "<hex>" --listen fff4` and through `probe demo` (core pool + `BleLink`), with the user watching the strip.

| Frame | Meaning | Observed |
|---|---|---|
| `BC 01 01 00 55` / `BC 01 01 01 55` | power off / on | on and off work (demo steps `power on`, `power off`) |
| `BC 04 06 00 00 03 E8 00 00 55` | hue 0 | red |
| `BC 04 06 00 78 03 E8 00 00 55` | hue 120 | green |
| `BC 04 06 00 F0 03 E8 00 00 55` | hue 240 | blue |
| `BC 05 06 03 E8 00 00 00 00 55` | brightness 1000 | full brightness |
| `BC 05 06 00 1E 00 00 00 00 55` | brightness 30 | clearly dimmer; the next brightness-1000 frame restored it |
| `BC 05 06 01 F4 00 00 00 00 55` | brightness 500 (demo step) | not noticed by the user at the end of the demo; the 1000→30→1000 test shows the brightness frame works, so 500 is simply a subtle step |

- Color order is correct: hue 0/120/240 = red/green/blue. The R↔G↔B swap some Play Store reviewers report does not occur on this strip.
- On `power on` the strip comes back showing its last color (the user saw it already blue), i.e. the controller keeps its own color; `power on` does not reset it.
- No notification was received on `FFF4` after any write (`--listen fff4`, 2 s window), so the controller does not acknowledge commands: success can only be inferred from the write completing. `probe write` prints no `notify` line.

## Measurements
Command: `probe/run-bundled.sh measure 8149bccd-74b8-c848-3f5d-b88ecb66605d fff3 "BC 01 01 01 55" --n 20`

```
connect + discover: 458 ms
20 writes (WithoutResponse): min 0.1 ms  avg 0.2 ms  max 1.0 ms
```
- Connect + service discovery: ~0.46 s (strip at -77 dBm, one strip, Mac BCM4388).
- A write-without-response returns when CoreBluetooth has queued it, so 0.2 ms is *not* radio delivery latency. Treat it as "enqueue time" only.
- A cold `probe` command takes ~5-6 s because `find` scans 5 s before connecting; `BleLink::find` scans 4 s when the peripheral was not seen yet, and (per the final review) again after an LRU eviction, because btleplug drops disconnected peripherals from the adapter list. A cold per-strip dispatch therefore costs roughly connect (~0.5 s) plus up to one find-scan (4 s).

## Decision
**protocol mrstar confirmed** on the HX7118: service `FFF0`, write `FFF3`, frame `BC … 55`, commands `01` power, `04` color, `05` brightness. The strip is registered with profile `mrstar` (no separate `hx7118` profile is needed).
## Demo run and K (Task 9, steps 5-6)
- `probe demo 8149bccd-74b8-c848-3f5d-b88ecb66605d` (power on, red, green, blue, half brightness, power off, 2 s apart) exited 0 and the strip followed it (power, colors in order; the 500 brightness step was too subtle to see, see above). This exercised `Pool` + `BleLink` end to end.
- **K proposal:** keep `DEFAULT_MAX_LIVE = 6`. With one strip the real concurrent-connection cap of this Mac cannot be measured; the 6 stays an estimate until two or more strips are available.
- Open issue the measurements expose: the ~4 s find-scan on a cold or evicted strip dominates the cost of a large group dispatch (12 strips with 6 slots would pay it on every evicted strip). Fixing it (keep the scan running in the background, or cache the peripheral handle across disconnects) belongs to M2, before the group UI.

## Delivery of write-without-response
A write that returns is only queued; a short-lived process must keep running for ~1.5 s afterwards; the 0.2 ms latency in the Measurements section is enqueue time, not delivery.

## M1.5 regression (through `Profile` v2, `probe send`)
Run on 2026-10-06 with the user watching the strip, after the `probe send` delivery fix.

| Command | Bytes printed | Observed |
|---|---|---|
| `send … --profile mrstar on` | `BC 01 01 01 55` | on |
| `send … --profile mrstar color 240 1000` | `BC 04 06 00 F0 03 E8 00 00 55` | blue |
| `send … --profile mrstar color 120 1000` | `BC 04 06 00 78 03 E8 00 00 55` | green |
| `send … --profile mrstar brightness 30` | `BC 05 06 00 1E 00 00 00 00 55` | clearly dimmer |
| `send … --profile mrstar brightness 1000` | `BC 05 06 03 E8 00 00 00 00 55` | bright again |
| `send … --profile elk-bledom-a off` | `7E 04 04 00 00 00 FF 00 EF` | **the strip did not turn off** |
| `send … --profile mrstar color 0 1000` | `BC 04 06 00 00 03 E8 00 00 55` | red |

- The first attempt, before the fix, printed the same bytes and exited 0 but the strip did nothing: the process exited before the queued write-without-response was sent (see *Delivery of write-without-response*).
- Negative check: a power-off frame from another family (`elk-bledom-a`, service `FFF0`, write `FFF3`, the same characteristic MR Star uses) is written successfully and silently ignored by the HX7118. A successful write therefore says nothing about whether a profile is right; the wizard has to ask the user what the strip did.
- Not verified: any `elk-*` profile on a strip that actually speaks it (no such strip available).

## M2a: Lumen app on the HX7118
Run on 2026-10-07 with the user watching the strip, using the debug bundle built from the committed code (`target/debug/bundle/macos/Lumen.app`, commit `0d4fe32` plus docs).

- Launch: the bundle opened with no new Bluetooth prompt (the permission granted to `Lumen.app` earlier persisted for the rebuilt bundle). The window rendered with the final CSP (`default-src 'self'; connect-src ipc: http://ipc.localhost; style-src 'self' 'unsafe-inline'`) and the first command logged "load strips: ok", so the IPC works under it.
- Flow: **Scan** listed `GATT--DEMO`; **Add** + **Send test** made the strip go off and back on; the user answered **Yes**; the color probe showed red; the user answered **Red**; **Save** listed the strip as `mrstar`; **Turn on**, **Turn off**, **Red**, **Green** and **Blue** each changed the strip. Everything worked. (The UI was Portuguese at the time; labels are given here in their English equivalents.)
- First-ever launch of the scratch bundle (before the fixes): macOS showed "Allow “Lumen.app” to use Bluetooth?" with the text from `Info.plist`, and the window appeared only after Allow.
- An earlier scratch run in which no wizard candidate seemed to blink (answers "No" through all 16 candidates) was **not explained**. Hypothesis, unverified: an earlier app instance still held the strip's single BLE connection. The page now logs each command's report (reached / unreachable / unsupported), so a recurrence will be visible.
- Fixed on the way: the page chose the wizard phase from the first command (both phases start with a power command), so it never left the blink question; the backend now sends the phase. The pool also coalesced the blink `[off, on]` into `on` when dispatched together; the service now sends one command per dispatch.
