# display-ws2812 doc audit

## What it is
A driver for WS2812/NeoPixel LED matrices: you draw with the normal Zinc API and the driver maps pixels to the zig-zag wiring, applies gamma and brightness, and pushes bytes. A Mac window shows round LED dots.

## Targets and status
- plugin.json: `esp32` (RMT), `rpi1`, `linux` (SPI), `macos` (emulator). Options `pin`, `spidev`, `serpentine`, `vertical`, `origin`, `rotate`, `brightness`, `gamma`, `order`, `scale`, `debug`.
- Verified: emulator, ESP32 build + QEMU CRC, wiring map unit (`test_map.cpp`), same first-frame CRC on Mac and ESP32. Not verified on real LEDs.

## What the docs have
- [~] Overview: section of `docs/plugins/displays.md` (the best-documented driver, but no own page)
- [x] Wiring table (DIN level shifter, 5 V, GND) and full options table
- [x] Quick start zinc.json
- [x] Examples: `examples/led/scroll-text`, `falling-cubes`, `examples/boards/s3-matrix/*`; READMEs with run commands
- [ ] Screenshot/GIF of a matrix (emulator or real)
- [ ] Tutorial
- [x] Commands: `zinc run`, `--target esp32`, `zinc build --target rpi1` in the example README
- [~] Troubleshooting: Pi `core_freq`, level shifter; no symptom table (first LED wrong colour, mirrored text)
- [~] Tests: `display_drivers` (t1) runs scroll-text and dice; `test_map.cpp`/`test_hw.cpp` not mapped in affected.json

## What is missing (priority order)
1. Screenshots/GIF of the marquee: `ZINC_SHOT=led.bmp ZINC_FRAMES=90 zinc run examples/led/scroll-text`; a few frames as a GIF.
2. A symptom table: first pixel wrong colour (`order`), text upside-down or mirrored (`origin`, `rotate`), broken every other row (`serpentine`), flicker on a Pi (`core_freq`, level shifter), too hot (`brightness`).
3. A 5-step tutorial "A scrolling sign on an ESP32": wire, set `pin`, run the emulator, flash, adjust `vertical/origin`. (hardware for the last steps)
4. A wiring diagram for 8x32 flexible panel vs 8x8 matrix vs 16x16.
5. Power guide: current per LED, brightness cap, fuse. (owner to review)
6. Own plugin page that links `zinc:pixelfont`, boards.md S3-Matrix and the examples.
7. Map `plugins/display-ws2812/` to `display_drivers` and `test_map` in tests/affected.json.

## Wrong or stale
- Nothing contradicting found. The doc mentions HUB75 and MAX7219 as separate drivers (not present): fine.

## Suggested pages
- API/reference: display-ws2812 options
- Guide: LED matrices with NeoPixels
- Steps: Wire, map and flash a matrix
- Explanation: Wiring maps (serpentine, origin, rotate)
- Notes: Power and level shifting, Troubleshooting
- Examples: scroll text, falling cubes, S3-Matrix demos
