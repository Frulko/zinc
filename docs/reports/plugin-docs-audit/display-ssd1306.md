# display-ssd1306 doc audit

## What it is
A driver for the cheap 128x64 or 128x32 I2C OLED (SSD1306): your colour drawing is dithered to 1 bit and only changed pages are sent. Works on ESP32, a Raspberry Pi, and as a Mac emulator window.

## Targets and status
- plugin.json: `esp32` (esp_driver_i2c), `rpi1`, `linux`, `macos`. 12 options (`address`, `sda`, `scl`, `freq`, `i2c`, `dither`, `threshold`, `invert`, `flip`, `contrast`, `scale`, `debug`).
- Verified: macOS emulator, ESP32 build + QEMU CRC (no I2C device in QEMU), rpi1 build. Not verified: real chips and timings (`displays.md` "Verified / not verified"). SH1106 not supported.

## What the docs have
- [~] Overview: a section of `docs/plugins/displays.md` (no own page)
- [x] Wiring table (ESP32 / Pi pins) and options table matching plugin.json
- [~] Quick start: guide 05 snippet (`ssd1306`, address 60); no run commands
- [x] Examples: `examples/led/oled-clock` (README 23 lines), `examples/robot-eyes-oled`, `templates/iot-board`
- [ ] Screenshot (none in docs/img for the OLED demos)
- [ ] Tutorial
- [~] Commands: `zinc run` + `ZINC_SHOT` generic; no `zinc run --target esp32` / `zinc flash` recipe on the page
- [~] Troubleshooting: only SH1106 and address 0x3D notes
- [~] Tests: `display_drivers` runs `led/oled-clock` ("ssd1306: 128x64"); `test_hw.cpp` unmapped in affected.json

## What is missing (priority order)
1. Screenshots of `examples/led/oled-clock` and `examples/robot-eyes-oled`: `ZINC_SHOT=oled.bmp ZINC_FRAMES=60 zinc run examples/led/oled-clock`.
2. A 6-step tutorial "A clock on an OLED": wire four pins, `zinc new --template iot-board`, run on the Mac, `zinc run --target esp32`, `zinc flash`. (hardware for the last steps)
3. A page of its own (the `displays.md` sections are good reference, but there is no overview/quick start).
4. Troubleshooting: blank screen (address 0x3C vs 0x3D, SDA/SCL swapped, no pull-ups), `i2cdetect`, mirrored picture (`flip`), 128x32 setup (`height: 32`).
5. Dithering comparison picture: `threshold` vs `bayer` vs `fs` on the same frame.
6. Explain 128x32 and 128x64 in `zinc.json` (`width`, `height`) with one example each.
7. Map `plugins/display-ssd1306/` to `display_drivers` in tests/affected.json. Photo of the real OLED. (hardware)

## Wrong or stale
- Nothing contradicting the code found.

## Suggested pages
- API/reference: display-ssd1306 options
- Guide: An OLED on an ESP32 or a Raspberry Pi
- Steps: Wire and flash an OLED clock
- Explanation: 1-bit dithering and page updates
- Notes: Wiring, Troubleshooting, SH1106 (not supported)
- Examples: OLED clock, robot eyes
