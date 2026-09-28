# Boards: Waveshare ESP32-S3-Matrix, ESP32-2432S022 and Pimoroni Scroll pHAT

Three ready-made boards with presets, drivers and demos:

| board | target | display | input | demos |
| --- | --- | --- | --- | --- |
| [Waveshare ESP32-S3-Matrix](#waveshare-esp32-s3-matrix) | `esp32` (chip `esp32s3`) | 8x8 WS2812 (`ws2812`) | QMI8658 IMU (`zinc:imu`) | `examples/boards/s3-matrix/{text-scroller,tilt-sand,dice,level}` |
| [ESP32-2432S022 (2.2" CYD)](#esp32-2432s022-jczn-22) | `esp32` (chip `esp32`, no PSRAM) | 240x320 ST7789, 8-bit i80 (`st7789`, `bus: "i80"`) | CST820 touch (pointer), `zinc:device` (backlight, figures) | `examples/boards/esp32-2432s022` |
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

## ESP32-2432S022 (JCZN 2.2")

A "cheap yellow display" board: ESP32-WROOM-32 module (dual-core Xtensa LX6 at 240 MHz, 520 KB SRAM, **no PSRAM**,
4 MB flash), a 2.2" 240x320 ST7789 IPS panel on an **8-bit parallel (i80) bus** (not SPI), a CST820 self-capacitive
touch controller (`ESP32-2432S022C`; the `…N` variant has no touch), an FM8002A/SC8002B speaker amplifier on GPIO26,
a TF slot, a CH340C USB-UART with auto-reset, and a LiPo charger. Demo: `examples/boards/esp32-2432s022`.

| what | pin / value | source |
| --- | --- | --- |
| LCD data D0..D7 | GPIO15, 13, 12, 14, 27, 25, 33, 32 | factory sample `Bus_Parallel8` config (`pin_d0..d7`); schematic LCM sheet (DB8..DB15 = IO15, 13, 12, 14, 27, 25, 33, 32) |
| LCD WR / RD / DC (RS) / CS | GPIO4 / GPIO2 / GPIO16 / GPIO17 | factory sample (`pin_wr`, `pin_rd`, `pin_rs`, `pin_cs`); schematic |
| LCD reset | none: TFT_RST is the ESP32 EN line (reset with the chip) | schematic (`TFT_RST` on EN), `pin_rst = -1` |
| bus mode | 8-bit (IM0 tied to 3.3 V), MCU8080, 25 MHz in the vendor code | schematic, `cfg.freq_write = 25000000` |
| panel | ST7789, 240x320, offsets 0, MADCTL BGR (`rgb_order = false`), no inversion (`invert = false`), 16-bit RGB565 sent high byte first (`LV_COLOR_16_SWAP 1`) | factory sample, LovyanGFX `Panel_LCD` (`MAD_BGR` when `rgb_order` is false), `lv_conf.h` |
| backlight | GPIO0 → AO3402 N-MOSFET gate (10 kΩ pull-down), active high; also the BOOT strap and button | factory sample (`digitalWrite(0, HIGH)`), schematic |
| touch I2C | SDA GPIO21, SCL GPIO22, address 0x15; INT not connected, RST on EN | factory sample (`CST820 touch(21, 22, -1, -1)`, `I2C_ADDR_CST820 0x15`), schematic, CST820 datasheet (7-bit address 0x15, 400 kHz max) |
| touch registers | 0x02 finger count, 0x03..0x06 X/Y (12 bits, high nibble first), write 0xFE = 0xFF to keep it from auto-sleeping | vendor `CST820.cpp` |
| audio | GPIO26 (DAC2) → SC8002B amplifier, JST 1.25 speaker socket | schematic (unused by the demo) |
| TF card | CS GPIO5, MOSI GPIO23, CLK GPIO18, MISO GPIO19 | schematic (unused) |
| USB | CH340C, DTR/RTS auto-reset into the bootloader | schematic |

Sources: `2.2inch_ESP32-2432S022/` vendor package: `1-Demo/Demo_Arduino/1_1_Factory_samples` (LovyanGFX config,
`CST820.cpp`), `3_1-TFT-LVGL-Benchmark`, `lv_conf.h`, `5-Schematic/ESP32-2432022-{LCM,MCU}-V1.0.png`,
`2-Specification`, `4-Driver_IC_Data_Sheet/CST820数据手册V1.1.pdf`.

### What the preset sets (`boards/esp32-2432s022.json`)

- `width`/`height` 240x320 (portrait, USB-C at the bottom) on every target, `resize: "letterbox"` on macOS (the
  emulator window is the panel at 2x);
- display `st7789` with `bus: "i80"`, the pins above, `hz: 10000000` (10 MHz WR clock; on a real board 20 MHz
  made the panel ignore every command and stay white, while 10 and 5 MHz worked, checked by reading the controller
  back over a bit-banged bus: RDDPM / RDDCOLMOD / RAMRD; the ST7789 datasheet asks for ~15 MHz at most), `lines: 12`,
  `madctl: 8` (BGR), `invert: 0`, `bl: 0` with `brightness: 255` (LEDC PWM), `touch: "cst820"` on 21/22 at 0x15;
- `targets.esp32`: `chip: "esp32"`, `flashSize: "4MB"`, `heap: 196608` (asked for; see below), and `sdkconfig`
  lines: 240 MHz CPU (IDF defaults to 160), `CONFIG_FREERTOS_HZ=1000` (1 ms ticks: the frame loop's short sleeps and
  `vTaskDelay(1)` stop costing up to 10 ms), `-O2` (`CONFIG_COMPILER_OPTIMIZATION_PERF`), and `appSize: "2M"` (the demo is ~1.65 MB, most of it baked
  fonts, more than the 1.5 MB of `SINGLE_APP_LARGE`; zinc then writes a custom partition table).

`targets.esp32.sdkconfig` is general: any project can add `sdkconfig.defaults` lines that way (`true`/`false` become
`y`/`n`); a change triggers a clean `idf.py set-target`.

### Memory: a PSRAM-less ESP32

The classic ESP32 has ~180 KB of byte-addressable DRAM for static data and heap, in several blocks (the largest free
one is ~110 KB). What the demo firmware uses, from `idf.py size` and the boot log in QEMU:

| | bytes |
| --- | --- |
| static DRAM (`.data` + `.bss`: the two draw-command frame buffers, IDF) | 93.5 KB of 180.7 KB (148.7 KB before the changes below) |
| display driver: one 12-line render band (240x12x4) + the I2S bus' own DMA copy buffer | ~11 KiB + ~11 KiB |
| Zinc heap (TLSF) | 161 KiB in 2 blocks |
| left to ESP-IDF (drivers, FreeRTOS, rasterizer scratch) | ~31 KiB |

Changes that made this fit (they help every ESP32 build):

- the Zinc heap may span **several regions**: `hal_heap_region_more` (optional HAL hook, weak default) lets the ESP32
  HAL add the next largest internal blocks until `ZRT_HEAP_BYTES` is reached, keeping 32 KiB for ESP-IDF. The boot
  log says what it got: `zinc: heap 161 KiB in 2 block(s), 31 KiB internal RAM left`;
- an allocation failure now reports `panic: out of memory (heap budget N bytes)` instead of recursing into the
  allocator until the stack overflows;
- the runtime TrueType outline scratch (36 KiB, only used where TTF fonts are embedded: hosts) is allocated on first
  use instead of being static; on esp32 the stroke scratch and the crash-overlay text are sized down
  (`ZRT_STROKE_POINTS=512`, `ZRT_OVERLAY_TEXT=1024`);
- `zinc:ui/solid` no longer keeps disposed computations (every `<Show>` branch or list row ever mounted used to stay
  in a global list: ~100 KiB per mount/unmount cycle of a page), Show/For roots are owned by their scope, and an
  effect that tracked no signal is dropped after its first run;
- the i80 driver on the classic ESP32 converts RGB565 in place in the render band (the I2S driver copies it into its
  own DMA buffer before returning), so it needs no ping-pong buffers.

On a PSRAM board (`"psram": true`) none of this matters: the heap goes to PSRAM (1 MiB).

### Display driver details (`plugins/display-st7789`, `bus: "i80"`)

esp_lcd's i80 bus (`esp_lcd_new_i80_bus`: the I2S peripheral in LCD mode on the ESP32, LCD_CAM on the S3), 8 data
lines, DC levels cmd 0 / data 1, 8-bit commands and parameters. Init: software reset, sleep out, the ST7789 panel
tuning the vendor's LovyanGFX sends (porch, gate, VCOM 0x28, power, 60 Hz, gamma), COLMOD 0x55, MADCTL, inversion,
display on, then the LEDC backlight (5 kHz, 8 bits). Frames: the damaged rows are rendered in bands; each band first
renders only the damaged rectangles (`HalFrame.render_damage`) over a sentinel colour, so bands no rectangle touches
are skipped and a band sends only the bounding box of what changed (two small changes far apart cost two small
transfers). RD (GPIO2) is driven high: the panel is never read.

Touch: `poll()` reads 5 bytes from 0x02 each frame (≈0.2 ms at 400 kHz) and feeds `px`/`py`/`pdown` and one touch
point, so `zinc:ui` sees a mouse-like pointer (tap, drag, inertial scroll, slider drags). `tswap`/`tflipx`/`tflipy`
fix a mirrored or rotated touch layer. Without an answering controller (the N variant, QEMU) the demo tours its pages
by itself.

### zinc:device (`plugins/device`)

```ts
import * as device from 'zinc:device';
device.setBacklight(0.6);        // 0..1, perceptual (PWM duty = level²); remembered only in the emulator
device.hasBacklight(); device.hasTouch();
device.memory();                 // { zincUsed, zincSize, chipFree, chipMinFree } in bytes (-1: unknown on hosts)
device.frameMs(); device.drawCmds(); device.chip(); device.cpuMhz();
```

The backlight goes through the display driver (`zinc_display_backlight`, weakly linked), so the module works with or
without it. `chipFree` is the ESP32's byte-addressable internal RAM outside the Zinc heap.

### Build, flash, QEMU

```sh
zinc run examples/boards/esp32-2432s022                        # macOS emulator: 240x320 at 2x, the mouse is the finger
zinc build examples/boards/esp32-2432s022 --target esp32       # firmware (ESP-IDF v6.0 in docker)
zinc flash examples/boards/esp32-2432s022 --target esp32 --port /dev/cu.usbserial-110   # CH340: /dev/cu.usbserial-* or /dev/cu.wchusbserial*
zinc monitor --port /dev/cu.usbserial-110                      # figures every 5 s
```

The CH340's DTR/RTS reset the chip into the bootloader by themselves; if not, hold BOOT, tap RST, release BOOT. BOOT
is GPIO0, the backlight pin: pressing it at run time darkens the screen, which is expected.

QEMU (`zinc run … --target esp32`) has no I2S LCD mode: the i80 bus setup would wait forever for the peripheral.
Add `"targets": { "esp32": { "display": { "debug": 3 } } }` to the project for QEMU runs (no bus I/O, no touch, the
auto tour starts, and the driver prints a damage summary every 100 frames); `debug: 2` also logs a checksum per frame
and stops after 60 frames. Remove it before flashing.

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

- the ESP32-2432S022 demo: macOS emulator on all five pages (screenshots, a scripted keypad check), the firmware
  (ESP-IDF v6.0, 1.2 MB) and a QEMU run of several minutes with `debug: 3`: the heap spans 2 blocks (161 KiB), the
  UI peaks at 127 KiB over the auto tour and stays there (no growth across page visits);

To check on the real hardware:

- the ESP32-S3-Matrix LED order, orientation and RGB colour order (`text-scroller` must read left to right, upright
  with USB-C at the bottom, in the listed colours);
- the IMU axis mapping and signs (`tilt-sand`, see above), the shake threshold, the QMI8658 register setup;
- the heat at `brightness: 32` over time;
- flashing over the native USB (auto-reset into the bootloader) and `zinc monitor` on the USB-Serial/JTAG port;
- the ESP32-2432S022: the whole display path (the i80 timing is verified at 10 MHz and the byte order on the wire too; MADCTL BGR, no inversion, the
  LovyanGFX panel tuning), the touch orientation (`tswap`/`tflipx`/`tflipy`), the LEDC backlight on GPIO0, and the
  frame rates (QEMU does not model time; the demo README gives estimates);
- the Scroll pHAT: column/bit orientation (`rotate: 180` if the badge is upside down), the brightness mapping, the
  I2C write with the trailing update byte.
