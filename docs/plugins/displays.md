# Small displays: LED matrices, OLEDs, SPI LCDs

Display plugins (`docs/plugins.md`) replace the target's screen: the program draws with `zinc:gfx` / `zinc:ui` as
usual, the shared software rasterizer renders only the damaged rows, and the driver converts them for the device.
The surface size is the display size, set per target in `zinc.json` (`targets.<id>.width/height`).

```json
{
  "entry": "src/main.ts",
  "targets": {
    "macos": { "width": 32, "height": 8, "display": "ws2812" },
    "esp32": { "width": 32, "height": 8, "display": { "driver": "ws2812", "pin": 13, "vertical": true } }
  }
}
```

Examples: `examples/led/scroll-text` (32x8), `examples/led/falling-cubes` (16x16), `examples/led/oled-clock`
(SSD1306, JSX). Ready-made boards (Waveshare ESP32-S3-Matrix with its IMU, Raspberry Pi + Scroll pHAT), their presets and
demos: [docs/boards.md](../boards.md). Text for LED matrices: `zinc:pixelfont` (5x7 and 3x5 bitmap fonts, one `rect` per lit run).

## Support matrix

| driver | esp32 | rpi1 / linux | macos | wasm, ps1, ps2 |
|---|---|---|---|---|
| `ws2812` | RMT (any GPIO) | SPI MOSI via `/dev/spidev0.0` | emulator window (LED dots) | no |
| `ssd1306` | I2C master | `/dev/i2c-1` | emulator window (1-bit pixels) | no |
| `st7789` (+ ILI9341) | SPI or 8-bit i80 + DMA, damage-only band rendering, PWM backlight, CST820 touch | no | normal window (no emulation needed) | no |
| `scrollphat` (Pimoroni Scroll pHAT, IS31FL3730) | no | `/dev/i2c-1` | emulator window (white LED dots) | no |

`ZINC_FRAMES=n` and `ZINC_SHOT=file.bmp` work with the emulators (the picture saved is the emulated device).

## ws2812 (WS2812 / WS2812B / NeoPixel matrices)

| signal | ESP32 | Raspberry Pi |
|---|---|---|
| DIN | GPIO `pin` (default 13), through a 3.3→5 V level shifter (74AHCT125) or a first LED at ~4.3 V | GPIO10 / SPI0 MOSI (pin 19) |
| 5V | external 5 V supply sized for the LEDs (up to 60 mA each at full white) | same |
| GND | common ground with the supply | same |

| option | default | meaning |
|---|---|---|
| `pin` | 13 | ESP32 data GPIO |
| `spidev` | `/dev/spidev0.0` | Linux SPI device (enable SPI; fix `core_freq=250` on older Pis so the 2.4 MHz clock is stable) |
| `serpentine` | true | every other line runs backwards (zig-zag wiring) |
| `vertical` | false | the chain runs along columns (most 8x32 flexible panels) instead of rows |
| `origin` | `top-left` | corner where the data enters: `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| `rotate` | 0 | 0 / 90 / 180 / 270, applied before the wiring map (the surface keeps `width`x`height`) |
| `brightness` | 40 | cap 0..255 applied after gamma (keeps current and heat down) |
| `gamma` | 2.2 | perceptual correction |
| `order` | `GRB` | byte order on the wire (`RGB` for some clones) |
| `scale` | 24 | emulator pixels per LED |
| `debug` | false | log `ws2812: frame n crc xxxxxxxx` per pushed frame; keep running without a device; on ESP32 honour the HAL's QEMU frame budget |

Frames are pushed only when the rasterizer reports damage. ESP32: 0.4/0.8 µs pulses from a 10 MHz RMT channel, the idle
line between frames is the reset latch. Linux: each data bit becomes 3 SPI bits at 2.4 MHz.

HUB75 panels (parallel RGB, multiplexed, needs I2S/LCD DMA refresh) and MAX7219 modules (SPI, 1-bit 8x8 per chip)
are different hardware and would be separate drivers.

## ssd1306 (I2C OLED 128x64 / 128x32)

| signal | ESP32 | Raspberry Pi |
|---|---|---|
| SDA | `sda` (default GPIO21) | GPIO2 (pin 3) |
| SCL | `scl` (default GPIO22) | GPIO3 (pin 5) |
| VCC / GND | 3.3 V / GND | 3.3 V (pin 1) / GND |

| option | default | meaning |
|---|---|---|
| `address` | 60 (0x3C) | 7-bit I2C address (61 = 0x3D on some boards) |
| `freq` | 400000 | ESP32 I2C clock |
| `i2c` | `/dev/i2c-1` | Linux bus (`dtparam=i2c_arm=on`) |
| `dither` | `threshold` | `threshold`, `bayer` (4x4 ordered) or `fs` (Floyd–Steinberg, re-dithers the whole screen on change) |
| `threshold` | 128 | luminance cut for `threshold` |
| `invert` | false | light pixels become dark |
| `flip` | false | rotate 180° (segment/COM remap) |
| `contrast` | 207 | 0..255 |
| `scale` | 5 | emulator pixels per OLED pixel |
| `debug` | false | log a CRC per frame, keep running without a device |

Each 8-row page is rendered, converted and compared with what the panel holds; only the changed column span of a
changed page is sent. SH1106 (1.3" boards, 132 columns, page addressing only) is not supported yet.

## st7789 (SPI or i80 LCD, ILI9341 with `"controller": "ili9341"`) — ESP32

| signal | option | default GPIO |
|---|---|---|
| SDA/MOSI (SPI) | `mosi` | 23 |
| SCL/SCK (SPI) | `sclk` | 18 |
| D0..D7 (i80) | `data` | `[15, 13, 12, 14, 27, 25, 33, 32]` on the ESP32-2432S022 |
| WR / RD (i80) | `wr` / `rd` | -1 (RD is driven high when set) |
| CS | `cs` | 5 |
| DC | `dc` | 16 |
| RES | `rst` | 17 (-1: none) |
| BLK/LED | `bl` | 4 (-1: always on), LEDC PWM at `brightness` (0..255) |

Other options: `bus` (`spi` or `i80`: esp_lcd's Intel 8080 bus, the I2S peripheral in LCD mode on the ESP32, LCD_CAM
on the S3), `hz` (SPI clock or i80 WR clock, 40 MHz default), `lines` (band height, default 16: one `width*lines*4`
render band, plus two `width*lines*2` DMA buffers except on the ESP32's i80 bus, whose driver copies the band itself),
`xoff`/`yoff` (panel RAM offset, e.g. `yoff: 80` for 240x240 ST7789, 52/40 for 135x240), `madctl` (-1: 0x00 for
ST7789, 0x48 for ILI9341; 8 = BGR), `invert` (-1: on for ST7789, off for ILI9341), `touch` (`cst820`: a CST820/CST816
on I2C `tsda`/`tscl` at `taddress`, 21/22/0x15 by default, read as the pointer in `poll`; `tswap`, `tflipx`, `tflipy`
map it to the screen), `debug` (1: CRC log per frame; 2: CRC only, no bus I/O, 60-frame QEMU budget — Espressif QEMU
never completes SPI DMA and has no I2S LCD mode; 3: no bus I/O and no budget, a damage summary every 100 frames).

Only the damage is sent: each band renders the damaged rectangles over a sentinel colour first
(`HalFrame.render_damage`), bands without damage are skipped, and a band sends the bounding box of its changed pixels
(it renders whole rows only when two rectangles sit side by side). The next band renders while DMA sends the previous
one. `zinc_display_backlight(level)` sets the PWM from native code (`zinc:device` uses it). On i80 panels the ST7789
gets the LovyanGFX panel tuning (porch, VCOM, power, gamma); SPI panels keep the controller defaults. Board preset and
pin sources: [ESP32-2432S022](../boards.md#esp32-2432s022-jczn-22).

## Verified / not verified

No real hardware was available. Verified: macOS emulators (screenshots), ESP32 firmware builds (ESP-IDF v6.0) and
runs in Espressif QEMU with `debug` CRC logs (QEMU has no LEDs, I2C device or LCD: the RMT transfer times out, the
I2C probe fails and SPI DMA never completes, so the drivers run checksum-only; st7789 needs `debug: 2`), the same
first-frame CRC for scroll-text on macOS and ESP32, the WS2812 wiring map (`plugins/display-ws2812/test_map.cpp`),
rpi1 builds under QEMU (no SPI/I2C device: the driver declines). Timings, wiring maps on real panels, I2C/SPI traffic
on real chips: not verified.
