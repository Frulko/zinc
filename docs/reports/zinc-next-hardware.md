# Hardware validation (ZN-055)

Status: **not run**. The session that built the engine had no board: no serial device, and the Raspberry Pi 3B+ of the test rig (`spark`) did not answer on either of its addresses
(`ssh` timed out). Everything below the emulator (ESP32 under QEMU) and the Docker/QEMU-free cross builds is verified; the rows here are for a person with the boards.

`tools/validate-hardware` runs each step and prints `ok` or `FAIL`; paste its output and the board details in the table.

| Check | Command | Board and versions | Result |
|---|---|---|---|
| ESP32 flash | `tools/validate-hardware esp32 /dev/cu.usbserial-XXXX` (`zinc flash --target esp32`) | chip, ESP-IDF 5.5.5 core image, esptool v5.4.0 | |
| ESP32 run | same script: `zinc run hello.ts --target esp32 --port ...` and `library.ts` | | |
| Pi aarch64 | `tools/validate-hardware pi pi@host aarch64-linux` | Pi model, OS, `uname -a` | |
| Pi armhf | `tools/validate-hardware pi pi@host armhf-linux` (needs a 32-bit userland, or a Pi 1/Zero) | | |
| reMarkable Paper Pro | `zinc build --target aarch64-linux` of an example, copy, run (display plugins are `plugins/display-rmpp`, not ported to the new engine) | | |

Notes for the run: the Pi rig is documented in `docs/reports/raspberry-pi.md` (start programs detached, check `vcgencmd get_throttled`, stop `lightdm`); the AOT program for a Pi has no graphics host
(cross builds link the runtime without it), so the checks print text. Closing ZN-030's first acceptance criterion needs the ESP32 rows to pass on a real board.
