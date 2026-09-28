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
(SSD1306, JSX). Text for LED matrices: `zinc:pixelfont` (5x7 and 3x5 bitmap fonts, one `rect` per lit run).

## Support matrix

| driver | esp32 | rpi1 / linux | macos | wasm, ps1, ps2 |
|---|---|---|---|---|
| `ws2812` | RMT (any GPIO) | SPI MOSI via `/dev/spidev0.0` | emulator window (LED dots) | no |
| `ssd1306` | I2C master | `/dev/i2c-1` | emulator window (1-bit pixels) | no |
| `st7789` (+ ILI9341) | SPI + DMA, band rendering | no | normal window (no emulation needed) | no |

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

## st7789 (SPI LCD, ILI9341 with `"controller": "ili9341"`) — ESP32

| signal | option | default GPIO |
|---|---|---|
| SDA/MOSI | `mosi` | 23 |
| SCL/SCK | `sclk` | 18 |
| CS | `cs` | 5 |
| DC | `dc` | 16 |
| RES | `rst` | 17 (-1: none) |
| BLK/LED | `bl` | 4 (-1: always on) |

Other options: `hz` (40 MHz), `lines` (band height, default 16: 2 DMA buffers of `width*lines*2` bytes plus one
`width*lines*4` render band, no framebuffer), `xoff`/`yoff` (panel RAM offset, e.g. `yoff: 80` for 240x240 ST7789,
52/40 for 135x240), `madctl` (-1: 0x00 for ST7789, 0x48 for ILI9341), `invert` (-1: on for ST7789, off for ILI9341),
`debug` (1: CRC log per frame; 2: CRC only, no SPI I/O — Espressif QEMU never completes SPI DMA). Only the damaged rectangle is sent, band by band, rendering the next band while DMA sends the previous one.

## Verified / not verified

No real hardware was available. Verified: macOS emulators (screenshots), ESP32 firmware builds (ESP-IDF v6.0) and
runs in Espressif QEMU with `debug` CRC logs (QEMU has no LEDs, I2C device or LCD: the RMT transfer times out, the
I2C probe fails and SPI DMA never completes, so the drivers run checksum-only; st7789 needs `debug: 2`), the same
first-frame CRC for scroll-text on macOS and ESP32, the WS2812 wiring map (`plugins/display-ws2812/test_map.cpp`),
rpi1 builds under QEMU (no SPI/I2C device: the driver declines). Timings, wiring maps on real panels, I2C/SPI traffic
on real chips: not verified.
