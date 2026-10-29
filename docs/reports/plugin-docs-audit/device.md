# zinc:device audit (score 2/5)

## What it is
Small services for board demos: backlight, touch map and calibration, power off, memory/frame figures, chip and firmware info.

## Targets and status
- plugin.json: esp32, macos, linux, windows (on the computer most calls return -1/''/false). Three implementations: host, AOT firmware (`device.esp32.cpp`), mquickjs (`device.abi.c`).
- Verified on the ESP32-2432S022 board (docs/boards.md); tests `device_*` in tests/t1 are about `zinc device` (the CLI), not this plugin. The plugin-specific tests are `touch_check` and the QEMU/board checks; no t0 for the module's host answers.

## What the docs have
- [x] a section "zinc:device" in `docs/boards.md` (not a `docs/plugins/device.md`): code sample, mquickjs notes, power-off and BOOT behaviour
- [x] header comment in index.ts; [x] example use in `examples/boards/esp32-2432s022`, `examples/esp32-widgets`, `examples/touch-check`
- [ ] own plugin page, [ ] full API table, [ ] screenshots of the System page, [ ] tutorial, [ ] test of host answers
- A screenshot exists (`docs/img/esp32-2432s022-system.png`) but is not linked from a device page.

## What is missing
1. `docs/plugins/device.md` with an API table of all exports: `setBacklight`, `backlight`, `hasBacklight`, `hasTouch`, `touchMap`, `setTouchMap`, `calibrateTouch`, `powerOff`, `Memory`, `memory`, `zincHeapUsed`, `frameMs`, `drawCmds`, `chip`, `cpuMhz`, `flashSize`, `idfVersion`, `firmware`, with the value returned on the computer.
2. Embed `docs/img/esp32-2432s022-system.png` and a fresh capture: `ZINC_SHOT=docs/img/device-system.png zinc run examples/boards/esp32-2432s022`.
3. Tutorial "A brightness slider and a heap gauge": 5 steps from `setBacklight` to `memory()` bars. (the board for the real PWM) (hardware)
4. Tutorial "Calibrate the touch" with `calibrateTouch()` and the five crosses (photo of the board). (hardware)
5. Disambiguate from the `zinc device` CLI (agent client, docs/reports/zinc-next-agent.md) in the first line: two different things named device.
6. A unit test on the computer path (backlight remembered, `hasBacklight()` false, `memory()` -1).
7. Pointer to backlog/later.md ZN-731 (captures show a hole where hardware pictures are) so writers compose pictures.

## Wrong or stale
- `zincHeapUsed()` and `Memory` as a class are missing from the boards.md sample.
- Plugin keys: the doc says "GPIO 0, GPIO 4 in the emulator" for the backlight: verify against `firmware/esp32-mquickjs` when writing the page.

## Suggested pages
Overview (and not to be confused with `zinc device`); API reference (generated); Backlight and power; Touch map and calibration; Memory and frame figures; Tutorial: a system page on a board; Examples (esp32-2432s022, touch-check, esp32-widgets).
