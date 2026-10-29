# zinc:imu (plugins/imu-qmi8658) audit (score 1/5)

## What it is
Tilt, shake, acceleration and gyro of the QMI8658 sensor on the Waveshare ESP32-S3-Matrix, with a keyboard/mouse emulation on the computer so the same demo runs on a Mac.

## Targets and status
- plugin.json: esp32 (I2C, options sda 11, scl 12, address 107, axes x/y/z), macos and linux (emulation).
- Note: the folder is `imu-qmi8658` but the module is `zinc:imu`; `grep "zinc:imu-qmi8658"` finds nothing, and the board preset key is `imu-qmi8658`.
- Real board: described as proven for the demos in docs/boards.md; no automated test of the plugin itself (no tests/ entry in affected.json; only the demos' `framehash.golden` and the simulator scenario).

## What the docs have
- [ ] no `docs/plugins/imu*.md`. Everything is a subsection of `docs/boards.md` ("zinc:imu") plus the header comment of `index.ts`.
- [x] quick start and options in boards.md, [x] axis-check procedure ("run tilt-sand, lower the right edge")
- [x] demos: `examples/boards/s3-matrix/{tilt-sand,dice,level,text-scroller}` with READMEs and frame hashes, `templates/iot-board`
- [ ] API table, [ ] screenshots, [ ] tutorial, [ ] wiring/pins page, [ ] plugin test

## What is missing
1. Create `docs/plugins/imu.md` (or rename the plugin folder to match the module) with a full API table: `begin`, `emulated`, `update`, `accel`, `gyro`, `temperature`, `tiltX/Y`, `angleX/Y`, `motion`, `shaken`, `Vec3`; units and axis frame; the plugin options `sda scl address freq x y z`.
2. Screenshots of tilt-sand and level in the emulator: `ZINC_SHOT=docs/img/s3-matrix-tilt-sand.png zinc run examples/boards/s3-matrix/tilt-sand` (8x8 matrix: use ZINC_SCALE=4).
3. Tutorial "A tilting sand box on the S3-Matrix": flash, calibrate axes (flip sign / swap letters), tune `SHAKE_G`. (hardware)
4. Document the simulator path: `zinc run --simulate esp32-s3-matrix` gives tilt/rotation from the device panel (`deviceQuery('motion')`).
5. A test or golden for the emulation (arrow keys tilt, Space shake) so the doc claims are proven.
6. Troubleshooting: "imu: no sensor, emulated" on a real board (wrong pins, address 0x6B vs 0x6A, I2C pull-ups). (hardware)
7. Note ZN-718: no prebuilt thunk for this plugin in the archive (backlog/later.md 448, 451).

## Wrong or stale
- index.ts header and boards.md say "Space shakes", the code reads `wasPressed(Btn.A)`: check that Space is Btn.A on the computer (not verified here) and say so in the doc.
- boards.md line 99 and the "accel y down" statement are consistent with code; no hard contradiction found.

## Suggested pages
Overview; API reference (generated, `zinc:imu`); Waveshare ESP32-S3-Matrix wiring and options; Tutorial: tilting sand; Tutorial: a digital dice with shake; Calibrating axes; Emulation on the computer; Examples gallery (s3-matrix demos).
