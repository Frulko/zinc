# Boards: Waveshare ESP32-S3-Matrix and Pimoroni Scroll pHAT

Two ready-made boards with presets, drivers and demos:

| board | target | display | input | demos |
| --- | --- | --- | --- | --- |
| [Waveshare ESP32-S3-Matrix](#waveshare-esp32-s3-matrix) | `esp32` (chip `esp32s3`) | 8x8 WS2812 (`ws2812`) | QMI8658 IMU (`zinc:imu`) | `examples/boards/s3-matrix/{text-scroller,tilt-sand,dice,level}` |
| [Raspberry Pi + Pimoroni Scroll pHAT](#pimoroni-scroll-phat) | `rpi1` | 11x5 white LEDs, IS31FL3730 (`scrollphat`) | none | `examples/boards/scrollphat/{badge,cpu-graph,snake}` |

Every demo also runs on the Mac in an emulator window (`zinc run <demo>`), where the IMU is driven by the keyboard and
the mouse.

## Board presets

`zinc.json` takes `"board": "<id>"`; `boards/<id>.json` then supplies defaults that the project can override:

```json
{ "name": "dice", "entry": "src/main.ts", "board": "waveshare-esp32-s3-matrix", "targets": { "macos": {}, "sim": {}, "esp32": {} } }
```

A preset has `all` (settings for every target, including `sim` and `macos`: size, display), `targets.<id>` (settings
for one target, e.g. the ESP32 chip) and `plugins` (plugin options). The project's own `targets.<id>` and `plugins`
win, key by key; a `display` object merges with the preset's, so `"targets": { "esp32": { "display": { "brightness": 20 } } }`
only lowers the brightness.

## Waveshare ESP32-S3-Matrix

ESP32-S3FH4R2 (dual-core Xtensa LX7 at 240 MHz, 512 KB SRAM, 2 MB quad PSRAM and 4 MB flash in the package), USB-C
wired to the chip's own USB-Serial/JTAG controller, an 8x8 WS2812B matrix and a QMI8658 6-axis IMU.

| what | pin / value | source |
| --- | --- | --- |
| WS2812 data in | GPIO14 | Waveshare wiki; ESPHome device page; the MicroPython and Arduino projects below |
| LED order | 64 LEDs, row-major, progressive (not zig-zag), LED 0 top-left when the USB-C port is at the top | `NEO_MATRIX_TOP + NEO_MATRIX_LEFT + NEO_MATRIX_ROWS + NEO_MATRIX_PROGRESSIVE` in the Robojax/Waveshare Arduino examples; `index = y * 8 + x` and "rotation 180 with the USB connector at the bottom" in pablogventura/esp32s3-matrix |
| colour order | RGB (not the usual GRB) | `NEO_RGB` (Robojax), `FastLED.addLeds<WS2812B, 14, RGB>` (inobrevi fluid simulation), ESPHome `type: RGB` |
| QMI8658 I2C | SDA GPIO11, SCL GPIO12, address 0x6B; INT1 GPIO10, INT2 GPIO13 (unused) | ESPHome device page, pablogventura/esp32s3-matrix `config.py` |
| QMI8658 registers | WHO_AM_I 0x00 = 0x05, CTRL1 0x02, CTRL2 0x03, CTRL3 0x04, CTRL7 0x08, TEMP 0x33, accel 0x35, gyro 0x3B, reset 0x60 = 0xB0 | lewisxhe/SensorLib `SensorQMI8658_Reg.hpp` |
| download mode | hold BOOT, press and release RESET, release BOOT | Waveshare wiki |

Sources: [Waveshare wiki](https://www.waveshare.com/wiki/ESP32-S3-Matrix),
[docs.waveshare.com](https://docs.waveshare.com/ESP32-S3-Matrix),
[ESPHome devices](https://devices.esphome.io/devices/waveshare-esp32s3-matrix/),
[CircuitPython board page](https://circuitpython.org/board/waveshare_esp32_s3_matrix/) (2 MB PSRAM, 4 MB flash),
[Robojax tutorial](https://robojax.com/tutorial_view.php?id=841&lang=en),
[pablogventura/esp32s3-matrix](https://github.com/pablogventura/esp32s3-matrix),
[inobrevi fluid simulation](https://github.com/inobrevi/ESP32-S3-Matrix-by-Waveshare-fluid-simulation),
[lewisxhe/SensorLib](https://github.com/lewisxhe/SensorLib).

> **Heat.** Waveshare warns that a bright matrix heats up quickly and can damage the board. The preset caps the LEDs at
> `brightness: 32` (of 255, applied after gamma, about 12 %); stay at or below ~50 (20 %). Full-white screens are the
> worst case; the demos draw mostly on black.

### What the preset sets (`boards/waveshare-esp32-s3-matrix.json`)

- `width`/`height` 8x8 on every target; display `ws2812` with `pin: 14`, `serpentine: false`, `origin: "top-left"`,
  `rotate: 180` (upright with the USB-C port at the bottom), `order: "RGB"`, `brightness: 32`.
- `targets.esp32`: `chip: "esp32s3"`, `psram: true`, `flashSize: "4MB"`.
- `plugins.imu-qmi8658`: `sda: 11`, `scl: 12`, `address: 107` (0x6B), axes `x: "-y"`, `y: "+x"`, `z: "+z"`.

### The esp32s3 build (`--target esp32`)

The `esp32` target keeps its id (plugins, native modules and `runtime/mod/*_esp32.cpp` apply to every ESP32 chip);
`targets.esp32.chip` picks the chip. For the board this means:

- `idf.py set-target esp32s3`, run again whenever the chip or the generated `sdkconfig.defaults` change (the build
  directory starts over then);
- `CONFIG_ESPTOOLPY_FLASHSIZE_4MB`; `CONFIG_SPIRAM` in quad mode at 80 MHz, `CONFIG_SPIRAM_IGNORE_NOTFOUND` (boards
  without PSRAM still boot) and `CONFIG_SPIRAM_USE_CAPS_ALLOC` (malloc stays in internal RAM);
- the Zinc heap (TLSF) is allocated in PSRAM: 1 MiB by default instead of 160 KiB (`targets.esp32.heap` overrides);
  without PSRAM at boot it falls back to internal RAM (`hal_heap_region`, `targets/esp32/hal_esp32.cpp`);
- console: UART0 (Espressif QEMU, external USB-UART adapters) plus the USB-Serial/JTAG port as secondary output, so
  `printf` / `console.log` show up on the USB-C cable.

Other ESP32-S3 boards: set `targets.esp32.chip`, `psram` and `flashSize` in `zinc.json` directly, or add a preset.
Octal-PSRAM modules (N8R8, N16R8) would need `CONFIG_SPIRAM_MODE_OCT`, not handled yet.

### Build, flash, console

```sh
zinc run examples/boards/s3-matrix/dice                        # Mac: emulator window (Space = shake)
zinc build examples/boards/s3-matrix/dice --target esp32       # firmware (ESP-IDF v6.0 in docker espressif/idf:v6.0)
zinc run examples/boards/s3-matrix/dice --target esp32         # the firmware in Espressif QEMU (esp32s3 machine)
pip install esptool                                            # once: the flasher runs on the host
zinc flash examples/boards/s3-matrix/dice --target esp32 [--port /dev/cu.usbmodem1101]
zinc monitor --port /dev/cu.usbmodem1101                       # serial console (Ctrl+C quits)
```

`zinc flash` builds, merges bootloader + partition table + app into `idf/build/merged-binary.bin` (`idf.py merge-bin`)
and writes it at offset 0 with the host's `esptool` (v5 `esptool write-flash`, v4 `esptool.py write_flash`). The
firmware is built in Docker, but Docker Desktop on macOS cannot pass USB serial devices to containers, which is why
flashing needs esptool on the Mac itself; `zinc flash` explains this and prints the install command when it is
missing. Without `--port` it takes the first `/dev/cu.usbmodem*` / `/dev/ttyACM*`. If the board does not answer, put
it in download mode (hold BOOT, tap RESET, release BOOT), flash, then press RESET.

`zinc monitor --port <device> [--baud n]` prints the port raw (`stty raw` + read). `python -m serial.tools.miniterm
<device> 115200` (pyserial) or `idf.py monitor` in a Linux container with the device passed through are alternatives.

QEMU has no WS2812 or IMU: the IMU reports "no QMI8658" and is emulated (a level board), and the WS2812 driver keeps
running without the LEDs, so the run ends at `ZINC_QEMU_TIMEOUT` (default 120 s). For a run that stops by itself after
the frame budget and logs a checksum per frame, add `"debug": true` to the display options.

### zinc:imu (`plugins/imu-qmi8658`)

```ts
import * as imu from 'zinc:imu';
onFrame((dt: number) => {
  imu.update(dt);                        // one sample per frame (and shake detection)
  imu.accel.x; imu.gyro.z;               // g and degrees/s, screen frame: x right, y down, z out of the screen
  imu.tiltX(); imu.tiltY();              // -1..1 (sine of the angle), + = right / bottom edge lower
  imu.angleX(); imu.angleY();            // the same in degrees
  if (imu.shaken()) roll();              // once per jolt above ~0.9 g, at most every 0.5 s
  imu.temperature(); imu.motion(); imu.emulated();
});
```

The ESP32 driver (`native/imu.esp32.cpp`, `i2c_master`) checks WHO_AM_I, resets the chip, sets ±4 g / ±512 dps at
~112 Hz and burst-reads temperature, accelerometer and gyroscope. Options: `sda`, `scl`, `address`, `freq`, and the
axis mapping `x`, `y`, `z`: which sensor axis, with its sign, points to the screen's right, down and out of the
screen. Elsewhere (macOS, Linux, sim, QEMU) the sensor is emulated: arrow keys / WASD tilt while held, a mouse drag
tilts proportionally (100 window points = full tilt), Space shakes.

The preset's axes come from the inobrevi fluid simulation, which rotates the matrix by 90 degrees against the sensor
axes. **Check them on the board**: run `tilt-sand`, lower the right edge: the sand must pour right; lower the bottom
edge (the USB-C side): it must pour down. If an axis is reversed, flip its sign (`"x": "+y"`); if tilting right moves
the sand up or down, swap the letters. `level` prints the angles once per second for this.

## Pimoroni Scroll pHAT

The original Scroll pHAT: 11x5 white LEDs driven by an ISSI IS31FL3730 on the Pi's I2C bus (SDA GPIO2 / pin 3, SCL
GPIO3 / pin 5, 3.3 V and GND), address 0x60, one global brightness for the whole matrix (no per-LED levels).

| register | use | value |
| --- | --- | --- |
| 0x00 configuration | matrix 1 only, 5x11 mode, audio off | 0x03 |
| 0x01..0x0B | matrix 1 data, one byte per column, bit y = row y | frame |
| 0x0C | update column register: any write latches 0x01..0x0B | 0xFF, sent in the same write as the data |
| 0x19 | PWM brightness, 0..127, 128 = full | `brightness` option scaled from 0..255 |

Sources: [IS31FL3730 datasheet](https://cdn.hackaday.io/files/1692447240935296/IS31FL3730.pdf) (configuration, update
column and PWM registers), [Pimoroni scroll-phat `IS31FL3730.py`](https://github.com/pimoroni/scroll-phat/blob/master/library/scrollphat/IS31FL3730.py)
(address 0x60, `CMD_SET_MODE = 0x00`, `MODE_5X11 = 0x03`, `CMD_SET_BRIGHTNESS = 0x19`, data at 0x01 followed by 0xFF,
`buffer[x] |= 1 << y`, rotation = reversed columns with mirrored bits).

### Display `scrollphat` (`plugins/display-scrollphat`)

| option | default | meaning |
| --- | --- | --- |
| `i2c` | `/dev/i2c-1` | Linux I2C bus |
| `address` | 96 (0x60) | 7-bit address |
| `brightness` | 64 | 0..255, mapped to the chip's PWM 0..128 (global) |
| `threshold` | 96 | luminance (0..255) from which a rendered pixel lights its LED |
| `invert` | false | lit where the picture is dark |
| `rotate` | 0 | 180 for a pHAT mounted upside down |
| `scale` | 40 | emulator pixels per LED |
| `debug` | false | log a CRC per sent frame and keep running without the device |

Programs draw in colour with `zinc:gfx` as usual; the driver thresholds the 11x5 frame to on/off and writes the 11
column bytes only when an LED changed (the rasterizer already skips frames without damage). On exit the LEDs are
cleared. On the Mac the emulator shows warm-white LED dots dimmed by `brightness`; `ZINC_FRAMES` and `ZINC_SHOT` work
as with the other emulators. `plugins/display-scrollphat/test_frame.cpp` checks the bit order, the threshold, the
rotation and the skipping of unchanged frames.

### Deploy

Enable I2C on the Pi once: `sudo raspi-config nonint do_i2c 0` (or `dtparam=i2c_arm=on` in `/boot/firmware/config.txt`),
then reboot; `ls /dev/i2c-1` must exist (`i2cdetect -y 1` from `i2c-tools` should list 0x60).

```sh
zinc run examples/boards/scrollphat/badge                                   # Mac emulator
zinc export examples/boards/scrollphat/badge --target rpi1                  # dist/badge-rpi1: static ARMv6 binary + service
zinc deploy examples/boards/scrollphat/badge --target rpi1 --device pi@raspberrypi.local
```

`zinc deploy` exports, copies `dist/<name>-rpi1/` over ssh (rsync) to `/opt/<name>` and installs a systemd service
(`<name>.service`, started now and at boot, as root, so `/dev/i2c-1` is accessible). Stop it with
`sudo systemctl disable --now badge`.

The `rpi1` SDK image is Alpine (musl), Raspberry Pi OS is Debian (glibc): a dynamically linked binary would look for
`/lib/ld-musl-armhf.so.1` and not start. `zinc export` / `zinc deploy --target rpi1` therefore link statically
(`-static`) whenever the program needs no shared library (no pkg-config plugin, no `zinc:net`, no `ZRT_GPIOD`), and
warn otherwise. The binary is ARMv6 hard-float (Pi Zero / 1 and newer); it runs on 32-bit Raspberry Pi OS, and on
64-bit Raspberry Pi OS where the kernel runs 32-bit programs (Pi 3 / 4 kernels do; the Pi 5's 16 KiB-page kernel may
not).

## Verified here / to check on the hardware

No board was available. Verified:

- macOS emulators for all seven demos (screenshots via `ZINC_SHOT`); the demos' logic in the sim target (snake
  autopilot lengths, `tilt-sand/src/sand.check.ts`);
- the four S3-Matrix demos build as esp32s3 firmware (ESP-IDF v6.0: `CONFIG_IDF_TARGET="esp32s3"`, quad PSRAM,
  4 MB flash, secondary USB-Serial/JTAG console in the generated `sdkconfig`) and boot in Espressif QEMU's esp32s3
  machine (`-m 32M` PSRAM: the heap is allocated there), where the IMU probe fails as expected and the emulation takes
  over;
- `tests/conformance/features.ts` prints the same bytes as the sim oracle on `esp32` and on `esp32s3`
  (`ZINC_ESP_CHIP=esp32s3`) in QEMU;
- the three Scroll pHAT demos export as static ARMv6 binaries (`file`: statically linked; `ldd`: not a dynamic
  executable) and run in a Debian bookworm armhf container (glibc, no musl), including `zinc:process` (`hostname -I`);
- `test_frame.cpp` (Scroll pHAT bit order), `zinc flash` without esptool (message) and with it installed in a venv.

To check on the real hardware:

- the ESP32-S3-Matrix LED order, orientation and RGB colour order (`text-scroller` must read left to right, upright
  with USB-C at the bottom, in the listed colours);
- the IMU axis mapping and signs (`tilt-sand`, see above), the shake threshold, the QMI8658 register setup;
- the heat at `brightness: 32` over time;
- flashing over the native USB (auto-reset into the bootloader) and `zinc monitor` on the USB-Serial/JTAG port;
- the Scroll pHAT: column/bit orientation (`rotate: 180` if the badge is upside down), the brightness mapping, the
  I2C write with the trailing update byte.
