# Zinc on a Raspberry Pi without an OS: study for a `rpi-baremetal` target

Date 2026-10-07 (ZN-169). Method: shallow clones and reading of Circle, circle-stdlib, raspberrypi/firmware and documentation, QEMU master, U-Boot, Zephyr, uspi, TinyUSB, Ultibo, rpi-open-firmware, bztsrc/raspi3-tutorial, the Rust OS tutorials, MicroPython and CircuitPython port lists.
Nothing was run on hardware or in QEMU (this Mac has no qemu and no ARM GCC). **[UNVERIFIED]** = not seen in code or docs read; **[ESTIMATE]** = arithmetic. The full evidence trail (file and line citations) lives in the research session; the claims below keep the sources that matter.

## 0. Verdict

1. A MicroPython/ESP32-style experience (flash once, then upload programs, REPL-less log + upload + run) is feasible on Pi 1, Zero, 2, 3, Zero 2 W, 4, 400, CM4 and, with more risk, Pi 5. The foundation is **Circle** (C++ bare-metal environment, README features: SD, FatFs, UART, GPIO, I2C, SPI, PWM, framebuffer, USB host HID/CDC/mass storage, USB CDC serial gadget, TCP/IP, serial and network bootloaders, QEMU support, Pi 5 RP1 drivers).
2. "No Linux" does not mean "no proprietary firmware": Pi 1-4 need the VideoCore blobs on the SD card (`bootcode.bin` Pi 1-3 only, `start*.elf`, `fixup*.dat`); Pi 4/5 also depend on the bootloader EEPROM. `LICENCE.broadcom` allows unmodified binary redistribution for Raspberry Pi use: package it, or download and SHA-256-check it like the toolchain manager does for zig and esptool.
3. **Owner decision S0: Circle is GPL-3.0-or-later with no linking exception.** A firmware image containing Circle is GPLv3 as a whole, VM included; ZBC programs are data and stay free. If GPLv3 is rejected, the permissive route is an own minimal kernel + FatFs + TinyUSB device CDC: upload works on OTG boards, but there is no USB keyboard/mouse (TinyUSB has no host on Broadcom) and Pi 4/5 would lack xHCI.
4. Upload reuses `next/include/zn/devproto.h` and `next/src/dev/core.{h,cpp}` unchanged (the ESP32 pattern: a 28-line `main` wires the UART to `Core`). One protocol extension is needed: `run()` collects output until the program ends, which breaks graphical event loops.
5. `zinc:gfx` maps onto the mailbox property framebuffer (32 bpp, virtual offset double buffer, `WaitForVerticalSync`); the software rasterizer stays the ceiling. No documented bare-metal 2D GPU path (QPU/HVS); Circle `addon/vc4` offers Dispmanx over VCHIQ, experimental, AArch32 only, full `start.elf`.
6. QEMU gates steps 1-5 on `raspi3b`, `raspi0`/`raspi1ap` (ARM1176), `raspi2b`, `raspi4b`. It has no Pi 5, no PWM, no PCIe/xHCI/GENET on `raspi4b`, no VideoCore, no GPIO pin model, no Wi-Fi. The rig (Pi 3B+, DSI 7") covers the rest.
7. Boot time: bare metal removes Linux but not the VideoCore stage. Under a second to first pixel is plausible with `start_cd.elf` and a small kernel **[UNVERIFIED]** (spike S1); a tuned Linux Zero 2 W boot took 3.5 s.
8. Do not attempt: Wi-Fi (closed Cypress/Broadcom blobs through Circle `addon/wlan`), Bluetooth, VideoCore QPU/HVS programming, our own Pi 5 xHCI/RP1 bring-up, a PIC native-code loader before the interpreter path ships, a REPL that runs the compiler on the Pi.

## 1. What Zinc already has

| Item | Where | Use |
|---|---|---|
| Device core | `next/src/dev/core.{h,cpp}` | `Core::feed(bytes)` parses the protocol; write callback is a `std::function`; needs libc++ (circle-stdlib) |
| Protocol | `next/include/zn/devproto.h` | `ZN ping/load/ready/err/out/done`, CRC-32, control lines start with 0x1E |
| ESP32 firmware | `next/firmware/esp32` | the pattern to copy; limits are config values on a Pi |
| Allocator | `next/src/rt/alloc.cpp` (mimalloc) | build with `ZN_NO_MIMALLOC` on bare metal **[UNVERIFIED]** that `zn_rt` builds on newlib |
| Decision D6 | decisions doc | aarch64-linux is the primary Pi target (qemu-user gate), armhf secondary; `rpi-baremetal` is additional |
| Hardware layer plan | `parity/03` (`zn/hw.h`: i2c, spi, gpio, pwm) | a Circle backend is a third implementation |
| Rasterizer | `runtime/raster.cpp`, `render_bands.h` | band thread pool; bare metal needs a core-spinning variant |

## 2. Boot chain and SD contents

| Model | Needed on SD | Kernel |
|---|---|---|
| Pi 1, Zero, Zero W | `bootcode.bin`, `start*.elf`, `fixup*.dat` | `kernel.img` |
| Pi 2, 3, 3+, Zero 2 W | same | `kernel7.img`; with `arm_64bit=1`, `kernel8.img` |
| Pi 4, 400, CM4 | EEPROM bootloader; `start4.elf` + `fixup4.dat` | `kernel8.img` |
| Pi 5 | self-contained EEPROM firmware; non-empty `config.txt` + DTB | `kernel_2712.img` or `kernel8.img` (64-bit only) |

Pi 1-3 minimum: `bootcode.bin` (52,624 B) + `start_cd.elf` (844,508) + `fixup_cd.dat` (3,283) + `config.txt` + kernel, about 0.9 MB of Broadcom files (the `_cd` variant removes codecs and 3D and limits the initial framebuffer: whether 800x480 and the DSI panel work with it is **[UNVERIFIED]**, spike S1). Useful `config.txt` options: `kernel=`, `arm_64bit=`, `kernel_address=` (0x8000/0x200000 per docs, bztsrc links at 0x80000: per-model value, spike S4), `disable_splash=1`, `enable_uart=1`, `uart_2ndstage=1` (dev), `device_tree=` empty, and for Pi 5 `os_check=0`, `enable_rp1_uart=1`, `pciex4_reset=0`.
`rpi-open-firmware` (libre bootcode) is on indefinite hold and not an option.

## 3. What a minimal kernel must do, and what exists

Entry/stack/ctors, exception levels and vectors (Circle `exceptionstub64.S`, stack-trace handler: the crash-report requirement), MMU and caches (mandatory for VM speed; Circle `translationtable64.cpp`), timer, interrupt controller (legacy on Pi 1-3, GIC-400 on Pi 4, GIC on Pi 5, IRQ only), mailbox property interface, UART (PL011, mini-UART), GPIO/I2C/SPI/PWM/PCM (Circle, with RP1 variants on Pi 5), SD + FatFs (`addon/SDCard`, `addon/fatfs`, BSD-style), heap, multicore (Pi 2/3/4), watchdog.
USB: Circle (DWC2 host Pi 1-3, xHCI Pi 4/5, HID keyboard/mouse/touch, CDC serial host, CDC gadget on 3(A)(+), Zero (2) (W), 4B), uspi (GPLv3, no gadget), TinyUSB (MIT, device CDC only on Broadcom). Network: Circle has TCP/IP, DHCP, DNS, HTTP, MQTT, sockets; drivers SMSC951x, LAN7800 (the rig), GENET (Pi 4), MACB (Pi 5). Wi-Fi only through `addon/wlan` with closed blobs: defer.

## 4. The MicroPython-like experience

Prior art: MicroPython upstream has no Broadcom port; `boochow/micropython-raspberrypi` is a Pi Zero/2 bare-metal port (unofficial, no licence stated); CircuitPython has no Broadcom port; Ultibo (FreePascal, LGPL-2.1 + static-link exception, Pi 1-4, no Pi 5) is the most permissive full stack but sits on a Pascal RTL; Zephyr (Apache-2.0) has thin Pi coverage; U-Boot is a possible loader only.

Architecture (mirrors ESP32):

```
host (zinc CLI)                          Pi (SD card flashed once)
zinc build -> ZBC                        bootcode/start*.elf (or EEPROM) -> kernel (zinc-rpi-core, Circle)
zinc run x.ts --target rpi3 --port P ->  [UART | USB CDC gadget | TCP | main.zbc on SD]
   ZN ping / ZN load n crc  <-------->  zn::dev::Core::feed()  (unchanged)
   ZN out / ZN done  <----------------  vm::runHooked + host modules (gfx, gpio, input, fs)
```

Protocol v2 (backward compatible): streaming `ZN out`, `ZN log` for crash reports, `ZN run/stop/reset`, `ZN ready` with `mods=` and the model, `ZN save <path>` to write `main.zbc` to the SD card; at boot `main.zbc` runs unless a serial `ping` arrives in a short window. There is no REPL today (the compiler is too heavy for the device); the honest v1 is log + upload + run; a `zinc repl` compiling one line on the host is step 14.
UX: `zinc flash --target rpi3 --sd <mount>` copies the pinned Broadcom files (downloaded with SHA-256), a per-model `config.txt` and the prebuilt kernel to the FAT boot volume; `zinc run ... --target rpi3 [--port auto|tcp:IP:7777|--qemu]` reuses `src/dev/client.cpp`.
AOT: interpreter path first. For native code later: per-program kernel via the Circle serial/network bootloader (images up to about 8 MB; 2 MB at 921600 baud is about 22 s **[ESTIMATE]**), or a position-independent blob loader (nothing in the repo does this: spike S6).

## 5. zinc:gfx

Mailbox tags per `circle/lib/bcmframebuffer.cpp` (phys/virt size, depth, virtual offset, allocate, pitch; bus address masked `& 0x3FFFFFFF`), double buffering by virtual offset + `WaitForVerticalSync` (round-trip cost **[UNVERIFIED]**, spike S3), partial updates in plain RAM (damage rectangles as in `display-fbdev`; Circle can DMA 2D copies), 32-bit XRGB (no RGB565 conversion). DSI: Pi 1-4 firmware brings up the official 7"; Pi 5 Circle `addon/rp1dsi` drives it (device-tree need in bare metal **[UNVERIFIED]**, S9). SPI panels: Circle `addon/display` (st7789, ili9341, ssd1306, ssd1309). Input: Circle USB HID and touchscreen classes.

## 6. Licensing

| Component | Licence | Consequence |
|---|---|---|
| Circle core | **GPL-3.0-or-later, no exception** (some files carry no GPL header **[UNVERIFIED]**) | firmware image GPLv3 incl. the VM; offer source; ZBC data unaffected |
| Circle `addon/fatfs` | ChaN, BSD-style | permissive |
| Circle `addon/vc4` | VCHIQ GPLv2 (Linux), userland BSD | |
| Circle `addon/wlan` | Plan 9 licence, hostap, closed blobs | skip |
| circle-stdlib, uspi | GPLv3 (newlib BSD-like, libc++) | |
| TinyUSB | MIT (device only on Broadcom) | |
| bztsrc raspi3-tutorial | MIT | reference |
| Rust OS tutorials | MIT OR Apache-2.0 | reference |
| Ultibo Core | LGPL-2.1 + static-linking exception | FreePascal |
| Zephyr | Apache-2.0 | |
| U-Boot | GPL-2.0+ | separate loader |
| Broadcom firmware | `LICENCE.broadcom` | bundle unmodified with the notice, or download |

## 7. Per-model plan, Pi 5, budgets

Models by Circle status: Pi 1/Zero (tested, no NEON, slowest), Pi 2, **Pi 3/3B+/Zero 2 W (primary: the rig, D6)**, Pi 4/400/CM4, Pi 5 (tested on BCM2712 C1/D0, IRQ only, no CDC gadget, no QEMU). Pi 5: RP1 sits behind PCIe 2.0 x4; firmware hooks `enable_rp1_uart`, `pciex4_reset`, `os_check`; Circle already has xHCI, MACB, GPIO/I2C/SPI/PWM/DMA, DSI for RP1. Same firmware can serve it, verification is hardware-only, so it goes last and best effort; never write RP1 drivers ourselves.
Budgets (estimates until spikes S1/S2): core image 1.5-4 MB, SD footprint 0.9-3.9 MB Broadcom + 35-80 KB DTB + 2-4 MB kernel, boot ~1 s to first pixel (2-3 s with USB), band raster on all cores (Pi 3B+ Linux 4-thread: ~25 ms per 800x480 frame).

## 8. QEMU strategy

Machines: `raspi0`, `raspi1ap`, `raspi2b`, `raspi3ap`, `raspi3b`, `raspi4b` (aarch64 builds). Implemented: interrupt controller, DMA, system timer, GPIO register file, PL011 + mini-UART, RNG, SD, framebuffer (`bcm2835_fb`), DWC2 USB, mailbox + property tags, SPI0, three I2C buses. Missing: PWM, PCIe/GENET on `raspi4b`, VideoCore, external GPIO pins; unhandled tags (vsync, backlight, display dimensions) answer "success, empty". Kernels load directly at 0x8000 (Pi 2) / 0x80000 (Pi 3).

| Layer | Machine | Proves |
|---|---|---|
| T-boot | raspi3b, raspi0/1ap, raspi2b, raspi4b | boot, MMU, UART text, ZBC hello, exception trace (`zinc run --target rpi3 --qemu`, like `tests/t2/esp32_qemu.sh`) |
| T-fb | raspi3b | framebuffer + pixel goldens via `screendump` |
| T-sd | raspi3b + `-drive if=sd` | FatFs, `main.zbc` autorun |
| T-usb-hid | raspi3b + `-device usb-kbd` | HID on DWC2 (not Pi 4: no xHCI) |
| T-net | raspi3b + usb-net + slirp | TCP upload (may need a patched QEMU **[UNVERIFIED]**) |
| T-i2c/spi | raspi3b | transfer logic; GPIO/PWM via the `hw.h` sim backend |

Hardware-only: boot timing and SD speed, VPU stage and `start_cd.elf`, DSI panel, USB enumeration, DMA cache coherency, thermal/under-voltage, USB gadget, Ethernet, Pi 5 anything, Wi-Fi. CI pins an upstream QEMU per OS like the Espressif QEMU in `src/tc`.

## 9. Foundations compared (judgement, weighted, max 135)

| Foundation | Total | Strength | Weakness |
|---|---|---|---|
| Circle + circle-stdlib | ~107 | Pi 1-5, USB HID+CDC, FB, SD, net, QEMU | GPLv3 (only licence score 1) |
| Buildroot Linux (fallback, = D6) | ~108 | everything works | boot speed, heavy |
| U-Boot as loader | ~80 | loader for TFTP/serial/USB | adds a stage, no VM |
| Ultibo | ~77 | permissive full stack | FreePascal, no Pi 5, C++ fit |
| Zephyr | ~76 | Apache-2.0 | thin Pi coverage |
| Own minimal kernel | ~75 | permissive | weeks of USB/xHCI work, no HID |
| MicroPython-style port | ~52 | | unofficial, Pi 0/2 only |

Recommendation: Circle-based `rpi-baremetal` (order: Pi 3, Zero 2 W + Pi 4, Pi 1/Zero, Pi 5), keeping the Linux Pi target for apps that need threads, ffmpeg, GL, sqlite or sockets. Decide the GPL question first (S0). Naming: `parity/03` already uses `rpi1` for the ARMv6 musl Linux target, so use `rpibm3`-style ids or an `--os none` flag.

## 10. Roadmap (backlog tasks created from it)

0 Decision + toolchain (licence, pinned Arm GNU toolchain, circle/circle-stdlib commits, QEMU in `src/tc`); 1 UART + ZBC VM hello on `raspi3b` (`firmware/rpi`, `ZN_NO_MIMALLOC`); 2 exceptions, MMU, crash report to `ZN log`; 3 framebuffer + zinc:gfx host; 4 SD + FatFs + `main.zbc` autorun + `ZN save`; 5 protocol v2; 6 `zinc flash --target rpi3 --sd`; 7 `zn/hw.h` Circle backend (GPIO, I2C, SPI, PWM) + zinc:gpio; 8 USB HID input; 9 hardware bring-up on the Pi 3B+ rig (spikes S1-S5); 10 multicore band raster; 11 USB CDC gadget and TCP transports; 12 other models; 13 Pi 5 best effort; 14 `zinc repl`; 15 AOT per-program kernel, PIC blob spike.

## 11. Risks and spikes

S0 GPLv3 decision; S1 `start_cd.elf` + DSI + real boot time; S2 `zn_rt` on newlib/libc++, image size, speed on A53 with MMU; S3 virtual-offset flip and vsync cost; S4 load address per model; S5 USB enumeration latency; S6 PIC/AOT blob loader; S7 Pi 5 UART/Circle on D0 (needs a Pi 5); S8 pinned QEMU on macOS arm64 and the TCP path; S9 DSI panel device tree in bare metal; S10 Pi 1 speed/RAM (no hardware); S11 firmware update drift (pin the commit).
