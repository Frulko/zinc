# display-st7789 doc audit

## What it is
A driver for small colour LCDs (ST7789, ILI9341) over SPI or an 8-bit parallel bus on an ESP32, sending only the changed bands, with PWM backlight and optional CST820 touch. On the Mac the normal window stands in.

## Targets and status
- plugin.json: `esp32` (esp_lcd, spi, gpio, ledc, i2c), `macos` (empty: normal window). 23 options (bus, pins, `hz`, `lines`, offsets, `madctl`, `invert`, touch pins and flips, `perf`, `debug`, `tdebug`).
- Verified: ESP32 firmware builds and runs in QEMU with `debug: 2` (checksum only); screenshots of the 2432S022 demos exist. Not verified: real SPI/i80 timings (docs say no hardware), though the boards.md page records board work. later.md ZN-718: the plugin does not link with zig.

## What the docs have
- [~] Overview: section in `docs/plugins/displays.md`; board detail in `docs/boards.md` (ESP32-2432S022)
- [x] Wiring/pins table, options explained in prose
- [~] Quick start: guide 05 shows ssd1306, not this driver; a st7789 zinc.json is only in `examples/boards/esp32-2432s022`
- [x] Examples: `examples/boards/esp32-2432s022` (README), `esp32-2432s022-hello`, `examples/3d/cubes`, `examples/esp32-widgets`
- [x] Screenshots: `docs/img/esp32-2432s022-*.png` (7)
- [ ] Tutorial
- [~] Commands: build/run/flash for the board are in boards.md, not in the driver page
- [~] Troubleshooting: debug levels 1-3 explained; no symptom table (white screen, colours inverted/BGR, shifted image, touch axes)
- [~] Tests: `esp32sim_touch` and QEMU runs; no test named for the driver; no mapping `plugins/display-st7789/` in affected.json

## What is missing (priority order)
1. A symptom table: white/blank screen, swapped red/blue (`madctl: 8`), washed colours (`invert`), image shifted (`xoff/yoff`, 240x240 `yoff: 80`), touch mirrored (`tswap/tflipx/tflipy`).
2. A recipe `zinc.json` per common module (ST7789 240x240 SPI, 135x240, ILI9341 320x240, CYD 2432S022 i80) with a pins table each.
3. A 6-step tutorial "Hello on a 2.4-inch SPI LCD": wire 7 pins, set zinc.json, `zinc run --target esp32 --emulator`, flash, calibrate touch. (hardware for the end)
4. Document `perf` and `tdebug` options (in plugin.json and code, not in displays.md).
5. A screenshot of an SPI (non-CYD) setup and a photo of the board. (hardware, owner)
6. Fix or note ZN-718 (does not link with zig) in "Known limits".
7. Add `plugins/display-st7789/` to tests/affected.json (esp32sim_touch, display tests).

## Wrong or stale
- Doc says default `data` is `[15,13,12,14,27,25,33,32]`; plugin.json default is `[-1]` (the list is the board preset's value). State it as the preset, not the default.
- Support matrix row says "SPI or 8-bit i80 + DMA ... no" for rpi/linux; fine, but ZN-718 says link fails with zig.

## Suggested pages
- API/reference: display-st7789 options
- Guide: A colour LCD on an ESP32 (SPI and i80)
- Steps: Wire, configure and calibrate touch
- Explanation: Band rendering and DMA
- Notes: Module recipes, Troubleshooting, QEMU debug levels
- Examples: ESP32-2432S022 demos, 3D cubes
