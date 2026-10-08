# Zinc Next: ESP32 by bytecode upload

The ESP32 runs a **core firmware**, flashed once, that holds the Zinc interpreter. A program is compiled on the computer to bytecode (ZBC),
sent over the serial line, and run; the output comes back. No C++ toolchain, SDK or Docker is needed to change the program.

```
zinc flash --target esp32 [--port /dev/cu.usbserial-0001]    # once per board: the core firmware (esptool is downloaded and checked)
zinc run hello.ts --target esp32 [--port ...]                # upload and run; the port is found by itself
zinc run hello.ts --target esp32 --qemu                      # the same on an emulated ESP32, no board needed
```

## Parts

- `firmware/esp32/`: the ESP-IDF project of the core (`main.cpp` wires the UART to `zn::dev::Core`). The image is kept in
  `firmware/esp32/prebuilt/esp32-core-flash.bin` (690 KB, flash offset 0), so users never build it; `tools/build-esp32-core` rebuilds it
  (ESP-IDF 5.5.5 and the xtensa toolchain are installed into `~/.zinc` the first time) and the new image is committed.
- `src/dev/core.cpp`: the device side, portable C++ (it also runs on the computer as `zinc device-sim`, which is how the protocol is tested
  without a board). `src/dev/client.cpp`: the computer side (serial ports, spawned commands such as QEMU).
- `include/zn/devproto.h`: the protocol. Control lines begin with 0x1E so a bootloader's messages on the same UART do not matter; a module is
  sent as `ZN load <length> <crc32>` and its bytes, the answer is `ZN out <length>` and the text, then `ZN done <status> <leaked> <free heap>`.
  The module is checked (length, CRC-32, decoded, verified) before it runs.
- `src/tc`: the emulator (Espressif's QEMU build, pinned and checksum-verified like the zig, `qemuCommand`) and esptool (`ensureEsptool`).

## Limits of the core

Registers: 3000 slots (24 KB), 128 call frames, modules up to 48 KB; the heap left at start is about 280 KB of the 320 KB. Output is collected
and sent when the program ends (a program that prints without end uses the heap). The program runs in the interpreter: `fib(32)` takes
seconds on the emulator, and a real ESP32 at 240 MHz is in the same range as the Pi 1 numbers of the old benchmarks divided by a few.
Display, GPIO, Wi-Fi and the other host modules are not in the core yet (`zinc:gfx` needs the SPI panel host of the board profiles).

## Checked

`tests/t0/device.sh` (protocol and refusals, through the simulator), `tests/t2/esp32_qemu.sh` (hello, the `library` golden and an uncaught
exception on the emulated ESP32, whose emulator is downloaded on the first run). Not checked: a physical board (none was attached): the
flashing path (`zinc flash`) uses the same image and esptool, and was exercised up to the download and the check of esptool.

## What the pinned QEMU models (ZN-136)

Espressif's QEMU 9.2.2 (`esp_develop_9.2.2_20260417`, the one `zinc run --target esp32 --qemu` downloads). Read from `info qom-tree` of `-machine esp32` and `-machine esp32s3` on the pinned binary (2026-10-08); "unimplemented" devices exist as stubs that read zero and ignore writes.

| Peripheral | esp32 | esp32s3 | Use for a board image |
|---|---|---|---|
| CPU cores, FRC and TIMG timers (systimer on s3) | yes (2 cores) | yes (2 cores) | the interpreter core, timers |
| UART 0 to 2 | yes | yes | the `zinc dev` protocol (serial), console |
| GPIO | yes (`esp32.gpio`) | yes (`esp32s3.gpio`) | `zinc:gpio` (LEDs are wired in the machine: 16 on the esp32) |
| I2C controllers | yes (2, with a TMP105 sensor on the bus, `i2c-ddc` available) | **no** | `zinc:i2c` on the esp32 only; the S3 matrix needs device-sim for its IMU |
| SPI master (GP-SPI) | yes (4 `ssi.esp32.spi`, SPI flash models and `sd-card-spi` attachable) | yes (1) | SPI displays are not drawn: no ST7789 / SSD1306 model |
| LEDC (PWM) | yes (`misc.esp32.ledc`) | no | PWM is accepted, nothing observes it |
| RMT (WS2812) | **no** (unimplemented stub) | no | `zinc:led` strips need device-sim |
| RGB LCD controller | yes (`display.esp.rgb`) | yes | the only modelled display: the RGB panel |
| ADC, touch, DAC | unimplemented stubs | unimplemented stubs | analog inputs read zero |
| TWAI (CAN) | yes | yes | |
| SD/MMC host (`dwc_sdmmc`) and SD card | yes | yes | storage on a card |
| Ethernet (`open_eth`) | yes | yes | `zinc:net` over QEMU user networking |
| eFuse, RNG, AES, SHA, RSA (and HMAC, DS, XTS-AES on s3) | yes | yes | `zinc:crypto` |
| Flash (SPI flash image), NVS partition | the flash image | the flash image | `zinc:storage` (NVS) on the flash file |
| Wi-Fi, Bluetooth, USB OTG, I2S, PCNT, MCPWM | no | no (USB serial JTAG only) | not available under QEMU |

So QEMU is the gate for the interpreter, timers, UART, GPIO, NVS, networking, crypto and an RGB panel; WS2812, SPI/I2C displays and sensors, and the S3 matrix's IMU are gated by device-sim (`zinc device-sim --board <preset>`), as the task says: per driver, QEMU or device-sim.
