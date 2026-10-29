# display-scrollphat doc audit

## What it is
A driver for the Pimoroni Scroll pHAT, an 11x5 white-LED matrix on a Raspberry Pi (IS31FL3730 over I2C); your normal Zinc drawing is thresholded to on/off LEDs. A Mac window emulates it.

## Targets and status
- plugin.json: `rpi1`, `linux`, `macos` (emulator). Options `address 96`, `i2c`, `brightness`, `threshold`, `invert`, `rotate`, `scale`, `debug`.
- Verified: macOS emulator, frame CRC, rpi1 static build under QEMU. Not verified on a real pHAT (orientation, brightness mapping: boards.md "Not verified").

## What the docs have
- [~] Overview: in `docs/boards.md` ("Pimoroni Scroll pHAT") only; no `docs/plugins` page; one row in `displays.md` matrix, no section
- [x] Requirements: I2C enable, `i2cdetect` expectation
- [~] Quick start: deploy commands exist (`run`, `export`, `deploy`)
- [x] Options table (all 8 match plugin.json)
- [x] Examples: `examples/boards/scrollphat/{badge,cpu-graph,snake}`; badge README only 18 lines
- [ ] Screenshot of the emulator or the real pHAT (none in docs/img)
- [ ] Wiring table (pins) in the driver's page; only in boards.md prose
- [ ] Tutorial
- [x] Test: `display_drivers` (t1 scenario `boards/scrollphat/badge`), `test_frame.cpp`, `framehash.golden`

## What is missing (priority order)
1. A screenshot per demo from the emulator: `ZINC_SHOT=badge.bmp ZINC_FRAMES=60 zinc run examples/boards/scrollphat/badge` (convert to PNG into docs/img).
2. A `scrollphat` section in `displays.md` (wiring SDA GPIO2/pin 3, SCL GPIO3/pin 5, 3.3 V, GND, options) instead of only boards.md.
3. A 5-step tutorial "A scrolling badge on a Pi Zero": enable I2C, check 0x60, run on the Mac, export, deploy.
4. Fonts: point to `zinc:pixelfont` 5x7 / 3x5 and the best size for 11x5.
5. Troubleshooting: no `/dev/i2c-1`, address not at 0x60, upside-down (`rotate: 180`), too dim (`brightness`), flicker.
6. Real-hardware check list: orientation, brightness mapping. (hardware)
7. `test_hw.cpp` and `test_frame.cpp` are not mapped in tests/affected.json; map `plugins/display-scrollphat/` to `display_drivers`.

## Wrong or stale
- Nothing contradicting the code found.

## Suggested pages
- API/reference: display-scrollphat options
- Guide: Scroll pHAT on a Raspberry Pi
- Steps: Enable I2C and deploy a badge
- Notes: Wiring, Troubleshooting, Not verified on hardware
- Examples: badge, cpu graph, snake
