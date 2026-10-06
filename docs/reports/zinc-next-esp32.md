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
