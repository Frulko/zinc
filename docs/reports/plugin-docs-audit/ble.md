# zinc:ble audit (score 4/5)

## What it is
Two Zinc programs talk by Bluetooth Low Energy over the Nordic UART Service: a Mac scans and connects, an ESP32 advertises, both exchange lines of text. Useful for a maker wiring a board to a Mac without cables.

## Targets and status
- plugin.json: macos (CoreBluetooth, central only), linux and windows (empty entries, `state()` is `'unsupported'`).
- esp32 peripheral lives in `firmware/esp32-mquickjs`, not in this plugin.
- Verified against the simulated radio only (`ZINC_NATIVE=sim`); never run against a real ESP32 (the doc says so). Mac `advertise()` throws.

## What the docs have
- [x] overview, [x] requirements (macOS permission, usage-text, `ZINC_BLE_ASK`), [x] quick start
- [x] API table covers every export (UART_SERVICE, state, scan, stopScan, connect, advertise, stop, Link.send/close/id/name)
- [x] wire protocol, [x] troubleshooting (Terminal.app crash, nameless devices, one link per device)
- [x] runnable example `examples/esp32-ble/{mac,esp32}` with READMEs, [x] test `tests/t1/ble.sh`
- [ ] screenshot / GIF, [ ] step-by-step tutorial, [ ] doc for the `Device` class fields beyond the one-line mention

## What is missing
1. Screenshot of `ZINC_NATIVE=sim ZINC_SHOT=docs/img/esp32-ble-mac.png zinc run examples/esp32-ble/mac` (devices list + conversation).
2. A 6-step tutorial "Talk to an ESP32 from your Mac": flash `examples/esp32-ble/esp32`, run the Mac app from iTerm2, allow Bluetooth, send a line, read the reply, export with `"permissions": ["bluetooth"]`. (hardware)
3. Measured throughput and latency on a real pair, promised in "Speed" and in `zinc-next-perf.md`. (hardware)
4. A page for the ESP32 peripheral side (`advertise` use, firmware module, MTU) next to the Mac one; today it is only in the example README.
5. Mention phone apps (nRF Connect, Bluefruit) as a 2-minute test with a screenshot. (owner)
6. Linux/Windows plan: one line on what is missing (BlueZ, WinRT).

## Wrong or stale
- Nothing contradicts the code found. "built and run on x86_64" is old: the dev machine is now an M1 Pro; re-verify and update the table.

## Suggested pages
Overview and quick start; API reference (generated); Wire protocol; Permissions on macOS and export; Tutorial: Mac and ESP32 chat; Example: esp32-ble (screenshots); Simulated radio for tests; Notes and limits (security, speed).
