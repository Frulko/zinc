# Next Thing Co. C.H.I.P. and PocketCHIP as Zinc targets

Status: research, 2026-10-09. No board was connected for this report: every hardware statement comes from the cited
sources, from the mainline device trees, or from the Zinc tree. Estimates are marked as such. Sources are numbered
[n] and listed at the end. Two primary sites could not be reached on 2026-10-09: linux-sunxi.org (HTTP 403 to scripts)
and chip.jfpossibilities.com (connection refused); their content is cited through other pages that quote them.

## 1. Summary and decisions

| Question | Answer |
|---|---|
| OS to target in 2026 | **Debian 13 trixie armhf on a mainline 6.12 LTS kernel** (Debian `linux-image-armmp` 6.12.86, EOL Dec 2028 [29]), as validated on a PocketCHIP in May 2026 by `pocketchip-debian-builder` [8]. 6.18 LTS (Armbian `pocketchip-sd`, 6.18.54 [9]) needs an SD-card hardware mod. OpenWrt 25.12 + 6.12 boots from NAND too [6]. NTC's 4.4.13 Debian 8 jessie images stay usable for headless programs through a static binary. |
| Zinc binary | New tool-chain target **`armv7-linux`: static musl, `-mcpu=cortex_a8+neon`**. The pinned zig 0.15.2 defaults `arm-linux-gnueabihf` to **glibc 2.34 and Linux 5.10** [27], which rules out jessie (2.19), buster (2.28) and bullseye (2.31); musl static runs on all of them. zig's `cortex_a8` CPU model has **no NEON and no VFPv3** (LLVM keeps the FPU default in clang's driver, not in the CPU model [27][28]), so `+neon` must be explicit. A dynamic glibc (>= 2.36) flavour is needed only for the GPU (Mesa, SDL3, `libzn_webgl` via `dlopen`). |
| Display | `display-fbdev` works unchanged on mainline: sun4i-drm exposes `/dev/fb0` (`sun4i-drmdrmfb`) [8]. Add a KMS dumb-buffer path with page flips (vsync, double buffering, connector choice: composite, LCD, HDMI/VGA DIP). Composite = TV encoder `tve0`, PAL/NTSC, enabled in the mainline CHIP DTS [2]. |
| GPU | Mali-400 MP1 through **lima** (Mesa >= 19.1, Linux >= 5.2): GLES 2.0, 97 % of the dEQP GLES2 suite, but **fragment shaders run at FP16 (`highp` ignored)** [17]. That is tier T2 with a precision quirk; three.js r162 is the last WebGL1 release [repo three-on-zinc.md]. The proprietary blob (r6p2, fbdev/X11, needs kernels <= 4.19) is a dead end [19]. |
| CPU reality | One Cortex-A8 at 1008 MHz (OPP 432-1008 MHz [2]), 32 KB L1, 256 KB L2, 16-bit DDR3 [26]. Its VFPLite unit is **not pipelined: 9-17 cycles per double operation** [25]. Zinc numbers are f64, so numeric code is the first cost; NEON is fast but integer/f32 only and flushes denormals. |
| Testing without a board | QEMU `cubieboard` (Allwinner A10, a real Cortex-A8) with its AXP209, I2C, SPI, GPIO (master since 2026-09-15), EMAC, USB and SD models [22], plus `vkms` + Mesa llvmpipe for KMS/EGL, `gpio-sim` and QEMU's `pcf8574` model for GPIO; `qemu-arm -cpu cortex-a8` for the static binary on Linux CI. |
| Profiles | `chip` (headless, composite, DIPs; 720x576, heap 128M, f64) and `pocketchip` (480x272, touch + keyboard + battery), tier T2, `dynlib: false`. |
| Deploy | `modprobe g_cdc` (ACM serial + CDC-ECM Ethernet in one legacy gadget [6]) then `zinc deploy` over ssh; `zinc flash --target chip --ram` boots kernel + initramfs + app over FEL without touching the NAND. |

## 2. The hardware

| Part | Detail |
|---|---|
| SoC | Allwinner R8 = A13 (sun5i), `sunxi-fel ver` reports `soc=00001625(A13)` [6]. Single Cortex-A8, NEON, VFPv3 (VFPLite), 32 KB I/D L1, 256 KB L2. |
| RAM | 512 MB DDR3 on a 16-bit bus (A13 limit: 16-bit, up to 533 MHz, 512 MB) [26]. |
| Storage | 4 GB Toshiba TC58TEG5DCLTA00 or 8 GB Hynix H27UCG8T2ETR **MLC** NAND, 16 KiB pages, 4 MiB erase blocks [4][6]. No SD slot. |
| GPU | Mali-400 MP1, 312 MHz in NTC's tree, 320 MHz in mainline `sun5i.dtsi` [2]. |
| Video out | TV encoder (composite on the TRRS jack); parallel RGB on the U13 header (LCD-D2..D23), used by the PocketCHIP panel and the VGA/HDMI DIPs. 18 bits routed, the overlays use RGB565 [11]. |
| Radio | Realtek RTL8723BS: Wi-Fi b/g/n 2.4 GHz over SDIO, Bluetooth 4.0 over UART3 (H5) [2][8]. |
| PMIC | X-Powers AXP209 on I2C0 at 0x34: regulators, LiPo charger (up to 1.8 A), fuel ADC, power key, USB input current limit (100/500/900 mA or none) [32]. |
| USB | One OTG (micro-B, power + gadget/FEL), one host (type A). |
| Expansion | U13: TWI1 (pins 9/11, the PocketCHIP keyboard bus), PWM0 (18), LCD pins, UART2 on LCD-D2..D5. U14: UART1 console (3/5), LRADC (11), XIO-P0..P7 (13-20, PCF8574A at 0x38 on TWI2), AP-EINT1/3 (23/24), TWI2 (25/26), CSI pins (27-38; SPI2 on CSIPCK/CSICK/CSIHSYNC/CSIVSYNC, GPIO on CSID0..7 = PE4..PE11) [33]. |
| PocketCHIP | 4.3" 480x272 RGB LCD with PWM backlight (PWM0/PB2), 4-wire resistive touch on the R8's own RTP controller, TCA8418 key matrix on I2C1 at 0x34 (IRQ PG1, 6 rows x 10 columns), LiPo, speaker, top header [11]. |

GPIO numbering: on NTC 4.4 kernels the XIO pins are sysfs `1013..1020` (base found from the `pcf8574a` gpiochip label;
it was 408 on 4.3), native pins are `bank*32+pin` (CSID0 = PE4 = 132) [33]. Mainline uses the GPIO character
device: native pins on the sunxi pinctrl chip, XIO on the `pcf8574a` chip.

## 3. Software state in 2026

### 3.1 What NTC left

- Last images (archive.org "C.H.I.P. Flash Collection", April 2018): `stable-server-b149`, `stable-gui-b149`,
  `stable-pocketchip-b126`, buildroot builds [13]. Kernel `4.4.13-ntc-mlc` (a multi_v7-based config with
  `MTD_NAND_SUNXI`, `DRM_SUN4I`, `KEYBOARD_TCA8418`, `TOUCHSCREEN_SUN4I`, CMA 64 MB) [6], Debian 8 jessie
  (glibc 2.19). The GUI images cannot be upgraded past jessie without breaking the display drivers.
- Flashing: `CHIP-tools/chip-update-firmware.sh` drives `sunxi-fel` then `fastboot`; on modern hosts it needs old
  tools (sunxi-tools v1.4.1, fastboot without `-i 0x1f3a`) or a container; `Thore-Krug/Flash-CHIP` wraps it
  (Linux only, updated 2024) [13][14]. Images and the APT repository are mirrored by chip.jfpossibilities.com [15];
  ModLogNet packaged kernels up to 4.4.138 with `rtl8723bs` and Mali modules [16].
- The NextThingCo GitHub organisation came back to life in June-July 2026 (commits by `computermouth`): Debian
  packages ported to Python 3 and current Debian (`chip-power`, `chip-configs`, `chip-exit`), and
  `CHIP-dt-overlays/firmware/early/*.dts` ported to mainline 6.12: PocketCHIP (validated on hardware), HDMI DIP and
  VGA DIP (both marked unverified) [11][12].

### 3.2 Mainline and community work

| Project | Date | Kernel / boot | State |
|---|---|---|---|
| Mainline Linux | since 4.5 | `sun5i-r8-chip.dts`: AXP209, battery/AC supplies, codec, `tve0` + `tcon0` (composite), PCF8574A XIO, `rtl8723bs-bt` on UART3, OTG; **no NAND node** [2] | `mali` node enabled in `sun5i.dtsi` (lima binds) |
| SLC emulation on MLC | Linux 5.8 (2020) | `slc-mode` partition property, Toshiba pairing scheme, UBI attaches such partitions [3] | the CHIP DTS does not enable it: an overlay or own DT is needed |
| macromorgan gist | 2020 | 5.10-rc4, U-Boot via FEL, rootfs `slc-mode` UBI on mtd5 [5] | "super unstable" boot from NAND |
| U-Boot slc-mode series (Chris Morgan) | 2021-22 | Toshiba + Hynix CHIP NANDs, boots kernel from UBIFS [4] | asked for a rebase, merge not confirmed |
| earth.li (Jonathan McDowell) | 2023 | 6.3 + U-Boot 2022.01, Debian bullseye, root on an SD card wired to PE4-PE9 (mmc2, 1-bit) [10] | Wi-Fi OK, BT scans, AXP209 temperature + USB limit fix |
| DatanoiseTV `second-boot` | May 2026 | **mainline U-Boot v2025.01 + 2 patches** (SPL geometry, Toshiba MLC scrambling for ECC parity), kernel 6.12, OpenWrt 25.12.4 on slc-mode UBI, CDC-ACM + CDC-ECM gadget [6][7] | boots from NAND across cold power cycles; Wi-Fi driver binds but OpenWrt cannot create the station interface (`iw interface add` -95) |
| `pocketchip-debian-builder` ("PocketTRIX") | May 2026 | Debian 13 trixie armhf, Debian kernel 6.12.86 armmp, mainline U-Boot over FEL for USB root, patched legacy CHIP U-Boot for NAND/SLC [8] | LCD (sun4i-drm), lima + glamor, TCA8418 keyboard with Fn layers, touch (calibration needed), Wi-Fi (NetworkManager), Bluetooth (after `uart-has-rtscts` on UART3), battery via `axp20x-battery`; audio loads but untested; **no suspend to RAM** |
| Armbian `pocketchip-sd` | Sep 2026 | 6.18.54, Debian 13 minimal or Ubuntu 26.04 Xfce [9] | for a board with an SD breakout; a stock PocketCHIP hangs at "Starting kernel" [9] |

The OpenWrt Wi-Fi failure is most likely OpenWrt's netifd creating its own interface, which the staging driver does
not support; the Debian image uses the driver's own `wlan0` and works (inference from [6] and [8]).

### 3.3 NAND, UBI and boot media

- The NAND is MLC with paired pages: interrupted writes corrupt the partner page. Mainline UBI refuses MLC unless
  the partition is in SLC mode (half capacity, ~1.7 GiB writable on a 4 GB part [6]). UBI also refuses a 4 MiB
  physical erase block; SLC mode presents 2 MiB, which UBI accepts [6].
- The boot ROM reads the SPL from NAND (BCH-64/1024 ECC, randomizer), else falls back to FEL. U-Boot and the kernel
  must agree on scrambling and ECC, which is what the DatanoiseTV patches fix [6].
- Boot media: NAND (needs the above), **FEL over USB** (always available: FEL pin to GND at power-on, device
  `1f3a:efe8`; cannot be bricked by software [6]), USB mass storage (only from a mainline U-Boot loaded by FEL or
  flashed to NAND; the stock 2016 U-Boot has no USB storage [8]), SD (hardware mod on PE4-PE9 [10]).
- `sunxi-fel` builds on macOS with libusb but has no Homebrew formula; DatanoiseTV carries a macOS patch for bulk
  transfer errors [6].

### 3.4 Which OS and kernel to target

| Option | Use for Zinc | Notes |
|---|---|---|
| **Debian 13 trixie armhf + 6.12 LTS (armmp)** | primary, GUI and headless | glibc 2.41, Mesa with lima, BlueZ, NetworkManager; LTS until Dec 2028 [29]; armhf stays a Debian architecture in forky (ARMv7 + VFPv3 floor) [30] |
| OpenWrt 25.12 + 6.12 | minimal headless appliances | musl userland: the static binary fits; Wi-Fi needs the netifd fix |
| Armbian 6.18 LTS | boards with the SD mod | newest kernel, same userland |
| NTC 4.4.13 jessie (as shipped) | compatibility only, headless and fbdev | no GPIO chardev (sysfs only), no lima, glibc 2.19 |

Recommended split of the five boards: two on Debian trixie in NAND SLC mode (one bare CHIP, one PocketCHIP), one kept
on stock NTC 4.4 for compatibility checks, two as the headless fleet (Debian or OpenWrt), all recoverable by FEL.

### 3.5 glibc, kernel and musl

| Distribution | glibc | Runs a zig 0.15.2 default `arm-linux-gnueabihf` build (needs 2.34)? |
|---|---|---|
| Debian 8 jessie (NTC) | 2.19 | no |
| Debian 10 buster | 2.28 | no |
| Debian 11 bullseye | 2.31 | no |
| Debian 12 bookworm | 2.36 | yes |
| Debian 13 trixie | 2.41 | yes |

zig sets 2.34 as the floor for 32-bit Arm because full 64-bit `time_t` needs it [27]. A lower version can be
requested (`arm-linux-gnueabihf.2.19`), but old 32-bit glibc with 32-bit time is a corner of zig that Zinc would
have to test on its own. **Static musl (`arm-linux-musleabihf`, `-static`) is better for everything that does not
load system libraries**: one binary for jessie/4.4, trixie, OpenWrt and Buildroot; musl 1.2 tries the time64
syscalls and falls back on old kernels, and libuv needs only Linux >= 3.10. Costs: no `dlopen` (so no
`libzn_webgl`, no Mesa, no `zinc:ffi`: `dynlib: false`, like rmpp), no NSS (`.local` mDNS names do not resolve
through `getaddrinfo`). The existing `armhf-linux` target (glibc, `-mcpu=arm1176jzf_s`, ARMv6 + VFPv2, no NEON,
no Thumb-2) runs on a trixie CHIP but leaves NEON and Thumb-2 unused.

## 4. Display paths

### 4.1 Outputs

| Output | Kernel path (mainline) | Mode | Notes |
|---|---|---|---|
| Composite (TRRS) | `tcon0` channel 1 -> `tve0` (`sun4i_tv`), enabled in the CHIP DTS [2][34] | PAL 720x576i50, NTSC 720x480i60 | early driver defaulted to PAL and could not parse named modes on the command line [34]; check the connector with `modetest -M sun4i-drm`. Interlaced, overscan, non-square pixels. |
| PocketCHIP LCD | `tcon0` channel 0 -> `simple-panel` (Olimex 4.3" timings), RGB565 pins, PWM backlight [11] | 480x272 @60 | validated on 6.12 [8][11]; the LCD and `tve0` share TCON0, the overlay disables TVE |
| VGA DIP | `tcon0` RGB565 -> `dumb-vga-dac` (resistor ladder) -> VGA connector, EDID on I2C1 [11] | up to what the TCON pixel clock allows, e.g. 1024x768 | overlay ported to 6.12, unverified |
| HDMI DIP | `tcon0` RGB565 -> **Chrontel CH7033** on I2C1 at 0x76 (`DRM_CHRONTEL_CH7033`) [11] | 720p class | overlay ported, unverified; DIPs brown out on weak supplies [40]; DIP overlays must be applied by U-Boot, not at run time (DRM has no hot-plug of the pipeline) [35] |

Scanout bandwidth on the 16-bit DDR3: 480x272 RGB565 at 60 Hz is 15.7 MB/s, PAL 720x576 RGB565 at 25 frames/s is
21 MB/s, 1280x720 RGB565 at 60 Hz is 110 MB/s, a real share of what the CPU raster can use.

### 4.2 fbdev or DRM/KMS

On mainline, sun4i-drm provides fbdev emulation, so `plugins/display-fbdev` (16 bpp conversion, evdev input,
`KD_GRAPHICS`, band rasterization) runs as on the Pi. Its known weaknesses carry over from the Pi report
(`docs/reports/raspberry-pi.md`): `FBIO_WAITFORVSYNC` returns at once on DRM fbdev emulation (no pacing, tearing), no
page flipping, no connector or mode choice. A **KMS dumb-buffer path** (two dumb buffers, `DRM_IOCTL_MODE_PAGE_FLIP`,
connector by name `Composite-1`, `DPI-1`, `HDMI-A-1`/`VGA-1`) fixes all three without a GPU and without libraries (raw
ioctls, or libdrm which is MIT). `plugins/display-gl/src/kms.cpp` already does the KMS part for GBM/EGL and can be
mined for it. The display engine's frontend can scale a plane, so a program can render at half resolution
(360x288) and let the hardware fill PAL 720x576 (verify plane scaling support on sun4i before relying on it).

On NTC 4.4 the same sun4i-drm driver exists (`DRM_SUN4I=y` in `4.4.13-ntc-mlc`) [6], so fbdev works there too.

### 4.3 GPU: lima versus the blob

| | lima (Mesa, mainline) | ARM blob |
|---|---|---|
| API | GLES 2.0 (+ partial GL 2.1, GLES 1.1), no GLES3 [17] | GLES 2.0 |
| Kernel | >= 5.2, `drm/lima`, display through `kmsro` with sun4i-drm (a tested pair) [17] | out-of-tree module `sunxi-mali` r6p2, breaks after 4.20 memory protections [19] |
| Window system | GBM/EGL on KMS, Wayland, X (glamor works on the PocketCHIP [8]) | fbdev or X11 only [19] |
| Conformance | 97 % of dEQP GLES2 [17] | similar, failing different precision tests [17] |
| Evidence on A13 | kmscube at 60 fps, ~10 % CPU, Mesa 20.2 [18] | NTC's 2016-17 "alpha" PocketCHIP image [19] |
| Verdict | **use** | dead end |

Quirks that matter for Zinc: fragment shaders are FP16 (`highp` has no effect, integers are lowered to FP16,
texture coordinates keep FP24 only when passed straight from a varying) [17]; FP16 render targets clamp to [0, 1];
no float textures (half float through `OES_texture_half_float`). The Mali-400 has a single fragment processor
(MP1), so fill rate and the 16-bit DRAM bound full-screen effects; Mesa's per-draw CPU cost on a 1 GHz A8 makes
batching mandatory. Capabilities must be read on the board (`ZINC_GL_INFO=1`, as done for vc4 in
`docs/plugins/display-gl.md`).

### 4.4 What WebGL1 and three.js can reach

- WebGL1 maps to GLES2. Fragment `highp` is optional in WebGL1; some Utgard drivers reject `precision highp` and
  break pages [38], lima accepts and ignores it, so content compiles but loses precision (depth, skybox and
  far-plane math near 1.0 are the known victims [38]).
- three.js r163 dropped WebGL1; r162 is the newest that runs (`docs/reports/three-on-zinc.md`). Use
  `precision: 'mediump'` and simple materials; PCF shadow maps and PBR need float or depth textures and highp and
  should be treated as unsupported.
- QuickJS on one 1 GHz A8 is slow to parse three.js (~1.2 MB); precompiled QuickJS bytecode is required for usable
  start-up. The macOS run of three on Zinc peaked at 84-87 MB RSS, which fits in 512 MB.
- Reach (estimate): a few hundred draw calls per frame at 480x272 and 30 fps for flat or Lambert scenes; WebGL1
  conformance below the desktop's 695/787, with precision failures; measure with the existing runner, `WGC_JOBS=1`.

### 4.5 2D software raster and NEON

The UI raster is integer work on 32-bit pixels, which suits NEON (8 pixels of RGB565 or 4 of XRGB8888 per
instruction): span fill, source-over blend, 32 to 16 bpp conversion and glyph blits. Clang does not auto-vectorise
float loops onto NEON on A8 without fast-math because NEON flushes denormals [25]; integer loops do vectorise once
`+neon` is set. Hand-written intrinsics for the four kernels above, bit-exact with the scalar path, are the safe
route. Do not enable `+neonfp` (NEON for scalar float) globally: it changes rounding of denormals and would break
the interpreter / AOT / host bit-exactness the tests rely on.

The FP side is the real cost: VFPLite double operations take 9-17 cycles and are not pipelined [25], while the
Pi 3's A53 pipelines them. Expect numeric-heavy TypeScript to be several times slower per clock than on a Pi 3 core;
AOT with typed locals helps more than anything else (ZN-145, 32-bit references and typed locals, becomes testable on
this machine through the QEMU Cortex-A8 below). LLVM marks the A8 with `nonpipelined-vfp` and slow VMLA [28], so
`-ffp-contract=off` (already used) costs nothing.

## 5. Input

| Device | Kernel (mainline) | Zinc |
|---|---|---|
| PocketCHIP keyboard | `tca8418` on I2C1 0x34, DT keymap, autorepeat [11][36] | evdev keys already handled by display-fbdev; needs a Fn layer (brackets, F-keys, Home/End, PgUp/PgDn) as in [8] |
| PocketCHIP touch | `sun4i-ts` on `1c25000.rtp`, single touch `ABS_X/ABS_Y` + `BTN_TOUCH`, 12-bit, inverted X and Y [8][11] | display-fbdev maps the absolute range to the screen; add a calibration matrix (default invert X and Y), median and IIR de-jitter, pressure/settle filtering (what tslib does [37]) |
| Power key | `axp20x-pek` input device [5] | map to a `power` event |
| USB keyboard, mouse, gamepad | usbhid / xpad on the host port (or OTG in host mode) | keyboard and mouse handled; gamepads need an evdev mapping (`BTN_SOUTH`... to `Btn.A`...) |
| LRADC | `sun4i-lradc-keys` (resistor-ladder buttons) | evdev keys |

## 6. Connectivity and I/O

| Function | Mainline status | Zinc path |
|---|---|---|
| Wi-Fi RTL8723BS | `drivers/staging/rtl8723bs`, still staging in Linux 7.3 (Aug 2026) and heavily cleaned up; an rtw88 SDIO port (STA only) was posted in July 2026; staging is dropped only when a replacement covers all hardware [20] | cfg80211: NetworkManager / wpa_supplicant; Zinc only needs status and provisioning (nmcli through `zinc:process`) |
| Bluetooth 4.0 / BLE | `hci_uart` H5 + `btrtl` over serdev, firmware `rtl_bt/rtl8723bs_fw.bin` and a board config (`rtl8723bs_config-NextThingCo-CHIP.bin` naming) [21]; needs `uart-has-rtscts` on UART3 [8] | either BlueZ over D-Bus (ZN-245 loads libdbus by `dlopen`: glibc flavour only), or **Apache NimBLE** (Apache-2.0, the host stack ESP-IDF ships) on a Linux HCI user-channel socket, static-friendly and the same stack as the ESP32 target; user channel takes the adapter from `bluetoothd` |
| GPIO | native pins on the sunxi pinctrl chip; XIO on `pcf8574a` (quasi-bidirectional, I2C speed, one shared interrupt) [2][33] | `runtime/mod/gpio_linux.cpp` opens only `/dev/gpiochip0` and masks pins to 0..63 through libgpiod: it cannot reach XIO or CSID0 (line 132). Needs chip + line or name addressing (board table `XIO-P0`, `CSID0`...), GPIO v2 uapi ioctls (no libgpiod in a static binary), sysfs fallback for 4.4 |
| I2C | TWI2 on U14 (shared with XIO at 0x38), TWI1 on U13 (PocketCHIP keyboard) | `runtime/include/hw.h` Linux backend (i2c-dev) works as is: `/dev/i2c-2` |
| SPI | SPI2 on the CSI pins, disabled in the DTS [2] | overlay enabling `spi2` + `spidev`; `hw.h` spidev backend |
| UART | UART1 = serial console on U14; UART2 on LCD-D2..D5 | termios |
| PWM | `sun4i-pwm` PWM0 on PB2 (U13-18; the PocketCHIP backlight) | `/sys/class/pwm` |
| Audio | `sun4i-codec` ALSA (headphone/mic on the TRRS jack, PocketCHIP speaker) [2][8] | `zinc:audio` (ZN-390, miniaudio): default ALSA backend in the glibc flavour, a tinyalsa (BSD) custom backend in the static one |
| 1-Wire | `w1-gpio` on PD2 (DIP EEPROMs) [2] | DIP detection is U-Boot's job |
| Video decode | `sunxi_cedrus` V4L2 stateless (MPEG-2, H.264) [39] | out of scope; loads but unvalidated [8] |

## 7. Power

- AXP209: `axp20x-battery`, `axp20x-usb`/`ac` power supplies (`/sys/class/power_supply/axp20x-battery/uevent`:
  capacity, status, voltage, current), `axp20x_adc` IIO channels, power key [2][8]. NTC's `chip-power` scripts
  (capacity curves, event monitor) were refreshed in June 2026 [12].
- USB input limit: the AXP209 can cap VBUS at 100/500/900 mA; the stock limit causes random power-offs with USB
  devices or DIPs; `i2cset -f -y 0 0x34 0x30 0x03` removes it (use a >= 1.5 A supply) [10][32].
- Sleep: no proven suspend to RAM on mainline sun5i; the kernel offers `s2idle` [8]. A 2016 U-Boot PSCI series
  measured idle on a CHIP at ~1 W without cpuidle and ~0.45 W with it [31]. Practical policy: screen off, radios down,
  CPU governor `powersave` (OPP down to 432 MHz) and an AXP-driven low-battery shutdown.
- Thermal: the RTP block also carries the SoC temperature sensor (`sun4i-ts` registers a thermal zone).

## 8. Testing without the board

| Tool | What it covers | Gaps |
|---|---|---|
| `qemu-arm -cpu cortex-a8` (user mode, Linux hosts only) | the static `armv7-linux` binary as is, NEON code paths, 32-bit AOT (ZN-145), headless frame goldens through the null HAL | no kernel devices; not on macOS (ZN-133 is parked for this reason) |
| `qemu-system-arm -M cubieboard` (A10) [22] | a real Cortex-A8 with 512 MB or 1 GB; AXP209 model on I2C0 0x34 (the mainline `axp20x` driver probes it), I2C, SPI0, Allwinner GPIO (QEMU master 2026-09-15, so QEMU 11.2), EMAC with user networking (ssh/scp), USB EHCI/OHCI (`usb-kbd`, `usb-tablet`, `usb-storage`), SD card with boot-ROM emulation (U-Boot SPL from SD), RTC, watchdog | no display engine, NAND, Mali, codec, RTL8723BS or RTP; runs on macOS (Homebrew qemu 11.1.2) |
| Guest kernel `vkms` [24] | KMS with dumb buffers, page flip, CRC of planes: the KMS display path and its pacing | no `sun4i-drm` specifics (planes, TVE modes) |
| Mesa llvmpipe / softpipe via `kms_swrast` + GBM | EGL/GLES2 contexts for `display-gl` and `libzn_webgl` (force a GLES2 context) | no FP16 behaviour of lima: precision problems show up only on the board; flag `highp`-dependent shaders statically instead (`src/gl/essl_check`) |
| `gpio-sim` (configfs) [23] | GPIO chardev with named lines (`XIO-P0`, `CSID0`), edges and pulls driven from sysfs | not a PCF8574 |
| QEMU `pcf8574` model on the cubieboard I2C bus at 0x38 | the real `pcf857x` driver path of the XIO expander | needs a small DT overlay for the cubieboard |
| Zinc `hw.h` sim backend, chip models (ZN-126..128) | bus-level traffic of SSD1306, WS2812, IS31FL3730... | already host-native |

The cubieboard machine boots a mainline (Debian armmp) kernel with `sun4i-a10-cubieboard.dtb`; `-kernel/-dtb/-initrd`
or an SD image. Everything above can be a T2 test on macOS, which unparks the armhf criteria of ZN-133 and ZN-145.

## 9. Adding the target to Zinc

### 9.1 Tool chain and flags (`next/src/tc/tc.cpp`, `plugin_build.cpp`)

- New entry in `targets()`: `{"armv7-linux", "arm-linux-musleabihf", "ARMv7-A + NEON, static (NTC CHIP, BeagleBone, i.MX6, Allwinner A10-A20/H3, Pi 2+ 32-bit)"}`.
- Flags in `crossBuild`, `ensureCrossLibs` wrappers and `crossArch()`: `-mcpu=cortex_a8+neon -static` (keep
  `-O2 -ffp-contract=off`). Measure `-mthumb` (Thumb-2, ~25 % smaller code, matters with a 32 KB I-cache and
  256 KB L2) against `-marm` for the interpreter loop before choosing.
- Check with `readelf -A`: `Tag_CPU_arch: v7`, `Tag_FP_arch: VFPv3`, `Tag_Advanced_SIMD_arch: NEONv1`, no
  `NEEDED` entries.
- The GL flavour (later): `arm-linux-gnueabihf.2.36` (bookworm floor) linked against a checksummed Debian trixie
  armhf sysroot (`libdrm`, `libgbm`, `libEGL`, `libGLESv2`, SDL3), the missing sysroot step of ZN-132.

### 9.2 Profiles and capabilities

`next/src/frontend/profile.cpp` and `compiler/src/cli.ts` (same table), `next/src/cli_core.cpp`
(`zigTargetFor`: `chip`, `pocketchip` -> `armv7-linux`), `targets/capabilities.json`, `docs/targets/capabilities.md`:

| profile | numbers | default size | heap | key capabilities |
|---|---|---|---|---|
| `chip` | f64 | 720x576 (PAL composite; NTSC 720x480 and DIP sizes through `zinc.json`) | 128M | threads, display, `touch/pointer/keyboard/gamepad/audio: optional`, net, fs, gpio, power, process, `gpu: gles2`, `tier: T2`, `dynlib: false`, desktop features false |
| `pocketchip` | f64 | 480x272 | 128M | as `chip` plus `touch: true`, `keyboard: true`, `pointer: false`, `audio: true` |

128M leaves room for the kernel, CMA for display and lima, and services on a 512 MB board. `threads` stays true
(libuv, workers) but the band rasterizer sees one online core and creates no thread (`ZINC_RENDER_THREADS`
default).

### 9.3 HAL and plugins

No new HAL abstraction is needed: display and input live in the display plugin (`display-fbdev` today, a KMS
dumb-buffer path next, `display-gl` on lima later), buses in `hw.h`, GPIO in `zinc:gpio`, power in `zinc:system`.
What the CHIP adds is data: a board table (header pin names to gpiochip label + line, sysfs numbers for 4.4),
display presets (composite PAL/NTSC, LCD, DIPs) and the PocketCHIP keymap and touch calibration.

Display plugin choice: `fbdev` now (works on mainline and 4.4); KMS dumb buffers as the default once it exists
(vsync, double buffering, connector selection); `gl` only on the glibc flavour with lima, for the GPU UI renderer
and WebGL.

### 9.4 Deployment, flashing and the dev loop

- USB gadget: `modprobe g_cdc` gives one ACM serial port and one CDC-ECM Ethernet interface (native on macOS and
  Linux) [6]; configfs only when RNDIS/NCM or mass storage are wanted. Address the board as `10.43.43.1` (DHCP from
  the board, as DatanoiseTV does) or over Wi-Fi.
- `zinc deploy --target chip --device root@10.43.43.1` already exports, copies and runs over ssh; it should start
  the program detached and tail the log (the Pi lesson in `docs/reports/raspberry-pi.md`).
- Arduino-like loop: the Zinc device core (`src/dev`, the ESP32 upload protocol) cross-built for `armv7-linux` and
  run as a service on the ACM gadget (`/dev/ttyGS0`), so `zinc run --target chip --port /dev/cu.usbmodem*` uploads
  bytecode with no ssh, network or image.
- `zinc flash --target chip`: pinned `sunxi-fel` (built from source, like the pinned esptool) and pinned,
  checksummed images. `--ram` FEL-boots U-Boot + kernel + an initramfs holding busybox, the gadget and the app,
  without writing the NAND (tens of seconds at FEL speeds); `--nand` reuses the community installers (FEL-boot an
  installer, `ubiformat` the slc-mode UBI from the running kernel) rather than writing our own distribution.
  Keep NTC's Flash Collection images as the restore path.

### 9.5 Expected performance (estimates, to be replaced by measurements)

Anchors: Pi 3B+ (A53, 1.4 GHz) measured in this repo: `kit-gallery` at 800x480 with the whole page moving, one
thread, fbdev: `present` p50 9.6 ms, about 10.9 ms of CPU per frame; `hero` navigation driving, one thread:
12-13 fps (`docs/plugins/display-fbdev.md`, `docs/reports/raspberry-pi.md`). Scaling assumptions for one 1 GHz A8
against one A53 core: integer work ~0.6x (Dhrystone per MHz times clock), memory-bound raster ~0.4-0.5x (16-bit
DDR3), scalar f64 ~0.1-0.2x (non-pipelined VFPLite). Uncertainty is about 2x either way.

| Workload | PocketCHIP 480x272 | Composite PAL 720x576 | HDMI DIP 1280x720 |
|---|---|---|---|
| `kit-gallery`, whole screen moving, SW raster | ~40-60 fps (raster ~6-8 ms, logic ~3-5 ms) | ~25-35 fps | ~10-15 fps |
| typical `zinc:ui` interaction (partial damage) | 60 fps, paced | 50 fps (PAL), paced | 30-60 fps |
| `hero` navigation, driving | ~6-10 fps | ~3-6 fps | ~2-4 fps |
| `bouncing-ball`, balls at 60 fps, AOT | ~5,000-10,000 | ~3,000-6,000 | ~1,000-3,000 |
| `bouncing-ball`, balls at 60 fps, interpreter | ~1,500-3,000 | ~1,000-2,000 | ~500-1,000 |
| start-up of a static binary from SLC NAND | < 1 s | | |

The ball counts assume 4-9 px squares (`examples/bouncing-ball/src/ball.ts`), a full clear and RGB565 conversion
every frame (~3-4 ms at 480x272), ~500-650 cycles per ball in AOT (f64 physics at VFPLite speed, one command, a
small fill) and ~3x that in the interpreter. The f64 cost suggests measuring an `f32` profile variant too; NEON
cannot help doubles. A GPU UI renderer on lima is the way past the single core for full-screen motion.

## 10. Risks and open questions

- MLC NAND remains the fragile part: two different working boot chains (patched mainline U-Boot v2025.01,
  patched legacy CHIP U-Boot), each validated on one Toshiba unit; Hynix boards are less tested [6][8].
- RTL8723BS stays in staging; an rtw88 replacement could change interface behaviour in 2027 [20].
- HDMI and VGA DIP overlays are unverified on mainline [11]; DIPs need the USB current limit removed and a good supply.
- Composite mode selection on mainline needs a check on hardware (PAL default, named modes) [34].
- lima FP16 precision limits WebGL content more than vc4 did; three.js r162 is frozen.
- The f64 number model on a non-pipelined VFP is the main CPU cost; the f32 trade-off needs numbers.
- `sunxi-fel` on macOS needs a patch; FEL needs a jumper (on the PocketCHIP the CHIP must come out, or the pad must
  be reached [6]).

## 11. Ordered backlog

Headless first, then GUI on composite/HDMI, then PocketCHIP. Ids `CHIP-nn` are proposals; `ZN-xxx` are existing
tasks. The same list as JSON (ready for `next/tools/tasks-import` after adding keys) is in the appendix.

| # | Title | Depends on |
|---|---|---|
| CHIP-01 | armv7-linux cross target: static musl, Cortex-A8 + NEON | ZN-132 |
| CHIP-02 | chip and pocketchip profiles and capabilities | CHIP-01 |
| CHIP-03 | QEMU cubieboard simulator for the CHIP | CHIP-01 |
| CHIP-04 | Flash and boot helper: zinc flash --target chip (FEL RAM boot, NAND install) | CHIP-02 |
| CHIP-05 | Deploy and dev loop over the USB gadget (ssh and device core) | CHIP-02, CHIP-04 |
| CHIP-06 | zinc:gpio on Linux: GPIO v2 chardev, named lines, CHIP board table | CHIP-03 |
| CHIP-07 | Buses on the CHIP: I2C, SPI2 overlay, PWM0, UART | CHIP-03, CHIP-06 |
| CHIP-08 | Power: AXP209 battery, charger, power key, low-battery policy | CHIP-03 |
| CHIP-09 | Wi-Fi status and provisioning, BLE with NimBLE on HCI user channel | CHIP-05 |
| CHIP-10 | Headless service export for the CHIP (systemd, watchdog, udev groups) | CHIP-05, CHIP-06 |
| CHIP-11 | KMS dumb-buffer display path for sun4i-drm | CHIP-03 |
| CHIP-12 | NEON kernels in the software rasterizer | CHIP-01 |
| CHIP-13 | Composite TV output: PAL/NTSC, safe area, interlace, pixel aspect | CHIP-11 |
| CHIP-14 | Performance baseline on the CHIP | CHIP-11, CHIP-12 |
| CHIP-15 | HDMI and VGA DIPs | CHIP-11, CHIP-04 |
| CHIP-16 | Gamepads and USB HID on the CHIP | CHIP-11 |
| CHIP-17 | GL flavour on lima: glibc build with a Debian trixie armhf sysroot | CHIP-11, ZN-132 |
| CHIP-18 | GPU UI renderer on Mali-400 with FP16-safe shaders | CHIP-17, ZN-178 |
| CHIP-19 | WebGL1 and three.js r162 on lima | CHIP-17, ZN-203 |
| CHIP-20 | PocketCHIP input: TCA8418 Fn layer, touch calibration and filtering | CHIP-11 |
| CHIP-21 | PocketCHIP device features: 480x272 density, backlight, battery, power key | CHIP-08, CHIP-20 |
| CHIP-22 | PocketCHIP audio through zinc:audio | ZN-390, CHIP-02 |

## Appendix: tasks as JSON

```json
[
  {"title": "CHIP-01 armv7-linux cross target: static musl, Cortex-A8 + NEON",
   "description": "Add armv7-linux to next/src/tc (targets(), crossBuild, ensureCrossLibs wrappers, plugin_build crossArch): zig target arm-linux-musleabihf, -mcpu=cortex_a8+neon (zig's cortex_a8 model has no NEON/VFP3 by default), -static, -O2 -ffp-contract=off. Static musl runs on NTC 4.4 jessie (glibc 2.19), Debian trixie, OpenWrt and Buildroot; zig's default glibc for 32-bit Arm is 2.34. dynlib is false (no dlopen). Measure -mthumb against -marm. See docs/reports/hardware/ntc-chip.md 3.5 and 9.1.",
   "ac": ["zinc build --target armv7-linux hello.ts produces a static ELF32 ARM EABI5 hard-float executable with no NEEDED entries", "readelf -A shows Tag_CPU_arch v7, Tag_FP_arch VFPv3 and Tag_Advanced_SIMD_arch NEONv1", "examples/hero and examples/bouncing-ball link with the graphics host (null HAL) for armv7-linux; sizes recorded for -marm and -mthumb", "hello prints the same output under qemu-arm -cpu cortex-a8 as on the host (Linux CI; on macOS through CHIP-03)", "tests/t2/cross_linux.sh covers the new target"],
   "deps": ["ZN-132"]},
  {"title": "CHIP-02 chip and pocketchip profiles and capabilities",
   "description": "Profile rows in next/src/frontend/profile.cpp and compiler/src/cli.ts (chip: f64, 720x576, heap 128M; pocketchip: f64, 480x272, heap 128M), zigTargetFor chip/pocketchip -> armv7-linux in next/src/cli_core.cpp, entries in targets/capabilities.json (tier T2, gpu gles2, gpio, power, dynlib false; pocketchip with touch and keyboard true, pointer false) and the table of docs/targets/capabilities.md; new docs/targets/chip.md (boards, OS choice, flashing, deploy).",
   "ac": ["zinc build --target chip and --target pocketchip build hello and hero", "zinc:platform exposes PROFILE, SCREEN_W/H, TOUCH, KEYBOARD, GPIO, POWER for both profiles", "a zinc.json requires that the profile does not meet is refused with the profile named", "T0 test of the profile table and the capabilities rows", "docs/targets/chip.md exists and links this report"],
   "deps": ["CHIP-01"]},
  {"title": "CHIP-03 QEMU cubieboard simulator for the CHIP",
   "description": "Run armv7-linux programs on a real Cortex-A8 under qemu-system-arm -M cubieboard (Allwinner A10: AXP209 on I2C0 0x34, I2C, SPI0, GPIO, EMAC, USB, SD): pinned or checksummed kernel (Debian armmp 6.12 or mainline 6.12 LTS) with sun4i-a10-cubieboard.dtb plus an overlay adding QEMU's pcf8574 at 0x38, gpio-sim and vkms; a busybox initramfs that runs the program; zinc run --target chip --qemu. Works on macOS (Homebrew qemu) and Linux; unparks the armhf criteria of ZN-133 and ZN-145.",
   "ac": ["zinc run --target chip --qemu hello.ts boots and prints in under 30 s on the dev Mac", "bouncing-ball and hero headless frames under the simulator match the host goldens (ZINC_FRAMES, frame hashes)", "the guest sees /sys/class/power_supply from the AXP209 model, a pcf8574a gpiochip, gpio-sim lines and a vkms card", "a T2 test runs it and skips with exit 77 when qemu-system-arm is missing"],
   "deps": ["CHIP-01"]},
  {"title": "CHIP-04 Flash and boot helper: zinc flash --target chip (FEL RAM boot, NAND install)",
   "description": "Pin sunxi-tools (built from source, with the macOS bulk-error patch of DatanoiseTV/second-boot) like esptool, and checksummed boot artifacts. --ram: FEL-load mainline U-Boot, kernel, DTB (+PocketCHIP overlay) and an initramfs with busybox, the g_cdc gadget and the app; NAND untouched. --nand: reuse the community installers (pocketchip-debian-builder or second-boot: FEL-boot an installer, ubiformat the slc-mode UBI from the running kernel). Document restore to NTC images (Flash Collection) and the USB current-limit fix.",
   "ac": ["zinc flash --target chip --ram boots a CHIP to a shell reachable over the USB gadget (ACM and ECM) in under 60 s without writing NAND", "detects the FEL device 1f3a:efe8 and explains the FEL jumper when it is absent", "the NAND install is documented and validated on at least one board, which then boots Debian trixie from NAND across three cold power cycles", "the restore path to stock NTC 4.4 is documented"],
   "deps": ["CHIP-02"]},
  {"title": "CHIP-05 Deploy and dev loop over the USB gadget (ssh and device core)",
   "description": "zinc deploy --target chip over ssh (10.43.43.1 on the ECM gadget or Wi-Fi) starts the program detached and tails its log; zinc dev hot reload over ssh; cross-build the device core (src/dev, upload protocol of the ESP32) for armv7-linux and run it as a service on /dev/ttyGS0 so zinc run --target chip --port /dev/cu.usbmodem* uploads bytecode without ssh.",
   "ac": ["deploy and start of hello on a CHIP takes under 10 s and returns the prompt", "zinc run --target chip --port uploads and runs bytecode through the ACM gadget", "works against the stock NTC 4.4 image (g_serial gadget, static binary) and against Debian trixie", "the same flow passes against the CHIP-03 simulator over EMAC user networking"],
   "deps": ["CHIP-02", "CHIP-04"]},
  {"title": "CHIP-06 zinc:gpio on Linux: GPIO v2 chardev, named lines, CHIP board table",
   "description": "runtime/mod/gpio_linux.cpp only opens /dev/gpiochip0 through libgpiod and masks pins to 0..63, so the XIO expander (pcf8574a chip) and native pins such as CSID0 (line 132) are unreachable. Address lines by chip label + offset or by name from a board table (XIO-P0..7, CSID0..7, AP-EINT1/3, PWM0...), use the GPIO v2 uapi ioctls directly (static binaries cannot use libgpiod), kernel edge detection and debounce, sysfs fallback for 4.4 kernels (XIO base found from the pcf8574a label, native = bank*32+pin).",
   "ac": ["a T1/T2 test drives gpio-sim lines named XIO-P0 and CSID0 in the CHIP-03 guest: output, input, both edges, debounce", "the pcf857x path is exercised against QEMU's pcf8574 model", "the existing simulator and ZINC_GPIO_SCRIPT keep working on macOS", "on hardware: XIO-P0 drives an LED and an edge on CSID0 reaches the callback"],
   "deps": ["CHIP-03"]},
  {"title": "CHIP-07 Buses on the CHIP: I2C, SPI2 overlay, PWM0, UART",
   "description": "Board defaults for hw.h (U14 TWI2 = /dev/i2c-2, shared with XIO at 0x38; U13 TWI1 = /dev/i2c-1), a DT overlay enabling spi2 with spidev on the CSI pins, PWM0 through /sys/class/pwm, UART1/UART2 through termios, documented in docs/targets/chip.md.",
   "ac": ["the SSD1306 example renders the same frames on /dev/i2c-2 as in the hw.h simulator", "an I2C EEPROM model on the cubieboard bus is read and written through hw.h in the CHIP-03 guest", "the spi2 overlay builds and exposes /dev/spidev2.0 on hardware", "PWM0 duty cycle and period are set from TypeScript"],
   "deps": ["CHIP-03", "CHIP-06"]},
  {"title": "CHIP-08 Power: AXP209 battery, charger, power key, low-battery policy",
   "description": "zinc:system power on Linux from sysfs (no D-Bus): axp20x-battery capacity, status, voltage and current, axp20x-usb/ac online, power key events from axp20x-pek, CPU governor, a low-battery callback and safe shutdown; document the AXP209 USB current limit (reg 0x30) and that suspend to RAM is not available (s2idle only).",
   "ac": ["battery percentage and charging state match upower on a PocketCHIP within 5 points", "the API reads the QEMU AXP209 model in the CHIP-03 guest", "a power-key press reaches the program as an event", "idle power at the 5 V input recorded with the screen off and the governor at powersave"],
   "deps": ["CHIP-03"]},
  {"title": "CHIP-09 Wi-Fi status and provisioning, BLE with NimBLE on HCI user channel",
   "description": "Wi-Fi: status and join through NetworkManager (nmcli via zinc:process) or wpa_supplicant; RTL8723BS stays a staging driver. BLE: zinc:ble scan, advertise and a GATT peripheral on Apache NimBLE (Apache-2.0, the ESP-IDF host stack) over the Linux HCI user-channel socket, static-friendly and shared with the ESP32 target; DT needs uart-has-rtscts on UART3 for the H5 link. BlueZ D-Bus stays the path for the glibc flavour (ZN-245).",
   "ac": ["a program lists nearby BLE advertisers with RSSI on a CHIP", "a phone sees the CHIP advertising a service UUID and reads a characteristic", "Wi-Fi status and join work from TypeScript on Debian trixie", "the BLE layer builds for armv7-linux and runs its host-side tests without a radio"],
   "deps": ["CHIP-05"]},
  {"title": "CHIP-10 Headless service export for the CHIP (systemd, watchdog, udev groups)",
   "description": "zinc export --target chip writes a systemd unit (restart on failure, sunxi watchdog through /dev/watchdog), a non-root user with gpio, i2c, spi, video and input groups through udev rules, journald logging; the service and iot-board templates gain a chip preset.",
   "ac": ["the iot-board template deployed to a CHIP starts at boot and restarts after a crash", "the watchdog reboots the board when the program hangs (opt-in)", "idle RSS and CPU of the service recorded", "the unit file is covered by a T1 golden"],
   "deps": ["CHIP-05", "CHIP-06"]},
  {"title": "CHIP-11 KMS dumb-buffer display path for sun4i-drm",
   "description": "Software raster presented through two DRM dumb buffers and page flips (vsync pacing, no tearing), connector and mode chosen by name (Composite-1, DPI-1, HDMI-A-1, VGA-1) from zinc.json, evdev input as in display-fbdev; raw ioctls or libdrm (MIT) static; fbdev stays the fallback. Reuse the KMS code of plugins/display-gl/src/kms.cpp.",
   "ac": ["frames are paced at the connector refresh on vkms in the CHIP-03 guest and the plane CRC matches the software surface", "the connector and mode are selectable from zinc.json and listed by ZINC_KMS_INFO=1", "falls back to fbdev when no DRM master is available", "on hardware the PocketCHIP LCD and the composite output both show the program without tearing"],
   "deps": ["CHIP-03"]},
  {"title": "CHIP-12 NEON kernels in the software rasterizer",
   "description": "NEON intrinsics for span fill, source-over blend, XRGB8888 to RGB565 conversion and glyph blits, compiled for armv7 NEON targets and bit-exact with the scalar path; no +neonfp (denormal flush would break interpreter/AOT/host bit-exactness).",
   "ac": ["the pixel corpus gives identical CRCs with and without the NEON kernels under qemu-arm -cpu cortex-a8 or the CHIP-03 simulator", "a microbenchmark of the four kernels is added to next/bench", "on hardware fill and conversion are at least 2x faster than scalar"],
   "deps": ["CHIP-01"]},
  {"title": "CHIP-13 Composite TV output: PAL/NTSC, safe area, interlace, pixel aspect",
   "description": "zinc.json display.tv {standard: pal|ntsc, overscan}: mode selection on the TVE connector, safe-area insets in zinc:ui, pixel-aspect correction (720 wide 4:3), interlace-friendly theme defaults (no 1 px horizontal lines), optional half-resolution rendering scaled by a display-engine plane when sun4i supports it.",
   "ac": ["hero and kit-gallery render inside the safe area at 720x576 PAL and 720x480 NTSC", "circles stay round on a 4:3 TV", "fps and raster time recorded for both standards", "the safe-area insets are covered by a layout golden"],
   "deps": ["CHIP-11"]},
  {"title": "CHIP-14 Performance baseline on the CHIP",
   "description": "Measure on hardware with ZINC_PROFILE and the display stats: bouncing-ball balls at 60 and 30 fps (interpreter, QuickJS, AOT), kit-gallery full-screen motion, hero navigation, start-up time and RSS, for the PocketCHIP LCD, composite and the HDMI DIP; compare -marm/-mthumb and the f64 profile with an f32 variant; replace the estimates of docs/reports/hardware/ntc-chip.md 9.5 and add chip thresholds to the bench gate.",
   "ac": ["the table of section 9.5 holds measured numbers with board, kernel and clock", "f64 versus f32 and ARM versus Thumb-2 results recorded with a recommendation", "bench-gate has chip thresholds", "runs discarded when the AXP209 reports an input-limit event"],
   "deps": ["CHIP-11", "CHIP-12"]},
  {"title": "CHIP-15 HDMI and VGA DIPs",
   "description": "Use NTC's mainline overlays (x-chip-dip-hdmi: Chrontel CH7033 on I2C1 0x76; x-chip-dip-vga: dumb VGA DAC with EDID on I2C1), applied by U-Boot at boot, kernel config DRM_CHRONTEL_CH7033, DRM_SIMPLE_BRIDGE, DRM_DISPLAY_CONNECTOR; output through the KMS path; supply and USB current limit documented.",
   "ac": ["a Zinc program shows on an HDMI monitor through the HDMI DIP at a mode read from EDID", "the same on VGA through the VGA DIP", "the overlays and kernel options are documented in docs/targets/chip.md", "brown-out conditions and the required supply documented"],
   "deps": ["CHIP-11", "CHIP-04"]},
  {"title": "CHIP-16 Gamepads and USB HID on the CHIP",
   "description": "Map evdev gamepads (BTN_SOUTH/EAST/..., ABS_HAT0X/Y, sticks) to zinc:gfx buttons in the display plugin, with hot plug, using the SDL game controller database subset as the mapping source; covers the CHIP host port and the PocketCHIP USB-A port. Makes CHIP + composite + gamepad a TV console.",
   "ac": ["an Xbox-compatible and an 8BitDo pad drive bouncing-ball and the game-2d template", "hot plug works without restarting the program", "uinput-injected gamepad events pass a test in the CHIP-03 guest"],
   "deps": ["CHIP-11"]},
  {"title": "CHIP-17 GL flavour on lima: glibc build with a Debian trixie armhf sysroot",
   "description": "A dynamic armv7 glibc flavour (arm-linux-gnueabihf.2.36, cortex_a8+neon) linked against a checksummed Debian trixie armhf sysroot (libdrm, libgbm, libEGL, libGLESv2, SDL3 with KMSDRM) for display-gl and libzn_webgl; an EGL-on-GBM context without SDL3 for the offscreen WebGL module if SDL3 is not wanted; record lima capabilities (ZINC_GL_INFO=1) and add the fragment-highp-is-FP16 quirk to the GL caps.",
   "ac": ["display-gl runs on lima at the panel refresh with the UI overlay on a PocketCHIP", "the same binary runs in the CHIP-03 guest on vkms with Mesa llvmpipe through kms_swrast", "the lima capability table is in docs/plugins/display-gl.md", "the static armv7-linux flavour is unchanged"],
   "deps": ["CHIP-11", "ZN-132"]},
  {"title": "CHIP-18 GPU UI renderer on Mali-400 with FP16-safe shaders",
   "description": "Run the GL UI renderer (R2/R3) on lima: mediump-only shaders (SDF and AA math checked for FP16 range), aggressive batching to keep Mesa's per-draw CPU cost low on one A8, comparison with the software raster on the same frames.",
   "ac": ["kit-gallery full-screen motion is at least 2x faster than the software raster on a PocketCHIP", "frames are within the ZN-172 tolerance file of the software oracle", "no shader relies on highp in the fragment stage (checked statically)"],
   "deps": ["CHIP-17", "ZN-178"]},
  {"title": "CHIP-19 WebGL1 and three.js r162 on lima",
   "description": "QuickJS + libzn_webgl on a GLES2 lima context: WebGL1 conformance run on the board (WGC_JOBS=1), three.js r162 (last WebGL1 release) with precision mediump, precompiled QuickJS bytecode for start-up; list what fails and why (FP16, no float textures).",
   "ac": ["the WebGL1 conformance pass count on lima is recorded with the failure classes", "a three.js r162 cube and a small Lambert scene render at 30 fps or more at 480x272", "start-up of the three.js example is measured and under 10 s"],
   "deps": ["CHIP-17", "ZN-203"]},
  {"title": "CHIP-20 PocketCHIP input: TCA8418 Fn layer, touch calibration and filtering",
   "description": "In the display plugins' evdev code: a PocketCHIP keymap with the Fn layer (brackets, braces, F-keys, Home/End, PgUp/PgDn), a 6-value touch calibration matrix in zinc.json (default invert X and Y for the sun4i-ts panel), median plus IIR de-jitter and settle filtering as tslib does, and a zinc calibrate screen that writes the matrix.",
   "ac": ["after calibration a tap lands within 4 px of the target across the PocketCHIP screen", "Fn combinations produce the expected keys in a text field", "touch filtering removes jitter on a held stylus (recorded event traces replayed in a test)", "the keymap and filter are covered by tests with injected events"],
   "deps": ["CHIP-11"]},
  {"title": "CHIP-21 PocketCHIP device features: 480x272 density, backlight, battery, power key",
   "description": "zinc:ui density and font sizes for a 4.3 inch 480x272 panel, backlight control through /sys/class/backlight, a battery widget fed by CHIP-08, power key to screen off and radios down (no suspend to RAM), examples/hero and kit-gallery checked at 480x272.",
   "ac": ["hero and kit-gallery fit 480x272 without clipping", "backlight brightness is settable from TypeScript", "the power key blanks the screen and wakes it", "the battery widget shows capacity and charging state"],
   "deps": ["CHIP-08", "CHIP-20"]},
  {"title": "CHIP-22 PocketCHIP audio through zinc:audio",
   "description": "zinc:audio (ZN-390, miniaudio) on sun4i-codec: ALSA backend in the glibc flavour, a tinyalsa (BSD) custom miniaudio backend in the static armv7-linux flavour; speaker and headphone routing on the PocketCHIP.",
   "ac": ["the game-2d template plays its sounds on the PocketCHIP speaker", "output latency measured and recorded", "the static flavour has no libasound dependency"],
   "deps": ["ZN-390", "CHIP-02"]}
]
```

## Sources

1. linux-sunxi wiki, NextThingCo CHIP: https://linux-sunxi.org/NextThingCo_CHIP (quoted through search results; HTTP 403 when fetched)
2. Mainline device trees: https://github.com/torvalds/linux/blob/master/arch/arm/boot/dts/allwinner/sun5i-r8-chip.dts, `sun5i.dtsi` (mali, tve0, nfc, rtp), `sun5i-a13.dtsi` (CPU OPP 432-1008 MHz)
3. Phoronix, Linux 5.8 emulates MLC NAND as SLC: https://www.phoronix.com/news/Linux-5.8-NAND-MLC-SLC-Emulate; MTD pull for 5.8: https://lkml.iu.edu/hypermail/linux/kernel/2006.1/03382.html
4. Chris Morgan, "mtd: Support slc-mode for NTC CHIP" (U-Boot): https://lists.denx.de/pipermail/u-boot/2022-March/477562.html, https://lists.denx.de/pipermail/u-boot/2021-December/469729.html
5. macromorgan, PocketCHIP mainline kernel and U-Boot (2020): https://gist.github.com/macromorgan/b2b241635efc6f4eb84098499bcecb31
6. DatanoiseTV, second-boot / pocketchip (README, flashing.md, nand-install.md, kernel fragment, NTC 4.4 config and DTS): https://github.com/DatanoiseTV/second-boot/tree/main/projects/pocketchip
7. Adafruit blog, "Reinvigorating the PocketCHIP with current software" (2026-05-27): https://blog.adafruit.com/2026/05/27/reinvigorating-the-pocketchip-with-current-software/
8. m4xx3d0ut, pocketchip-debian-builder (README, docs/bluetooth.md, docs/bringup.md): https://github.com/m4xx3d0ut/pocketchip-debian-builder
9. Armbian pocketchip-sd: https://armbian.com/boards/pocketchip-sd; board config https://github.com/armbian/build/blob/main/config/boards/pocketchip-sd.csc; forum https://forum.armbian.com/topic/58981-boot-hanging-on-pocketchip-sd-trixie-61820-minimal-latest-2620-trunk668-at-starting-kernel
10. Jonathan McDowell, "Repurposing my C.H.I.P." (2023): https://www.earth.li/~noodles/blog/2023/04/repurposing-my-chip.html
11. NextThingCo/CHIP-dt-overlays, `firmware/early/x-chip-pocketchip.dts`, `x-chip-dip-hdmi.dts`, `x-chip-dip-vga.dts` (2026-06): https://github.com/NextThingCo/CHIP-dt-overlays
12. NextThingCo GitHub organisation (chip-power, chip-configs, chip-exit, 2026): https://github.com/NextThingCo
13. C.H.I.P. Flash Collection: https://archive.org/details/C.h.i.p.FlashCollection
14. Thore-Krug/Flash-CHIP: https://github.com/Thore-Krug/Flash-CHIP
15. Max Glenister, CHIP notes (jfpossibilities APT mirror): https://blog.omgmog.net/post/chip-stuff/
16. ModLogNet/CHIP-Debian-Kernel: https://github.com/ModLogNet/CHIP-Debian-Kernel
17. Mesa lima driver documentation: https://docs.mesa3d.org/drivers/lima.html
18. "ARM: dts: sun5i: add A10s/A13 mali gpu support" (kmscube on A13): https://lkml.iu.edu/hypermail/linux/kernel/2101.1/00228.html
19. Bootlin, Mali binaries for Allwinner on mainline: https://bootlin.com/blog/more-opengl-binaries-for-the-mali-support-on-allwinner-platforms-with-mainline-linux/; https://github.com/mripard/sunxi-mali; Liliputing on NTC's Mali alpha: https://liliputing.com/pocketchip-update-brings-graphics-acceleration-doubles-available-storage/
20. Phoronix, RTL8723BS in staging for Linux 7.3: https://phoronix.com/news/Linux-7.3-Staging; rtw88 RTL8723BS v2 series: https://lkml.iu.edu/2607.2/13932.html; Dan Carpenter on dropping staging drivers: https://lkml.iu.edu/hypermail/linux/kernel/2603.1/06251.html
21. btrtl RTL8723BS support and the board config name: https://lkml.iu.edu/hypermail/linux/kernel/1808.1/03725.html; serdev series: https://lwn.net/Articles/742531/
22. QEMU cubieboard: https://www.qemu.org/docs/master/system/arm/cubieboard.html; sources `hw/arm/cubieboard.c`, `hw/arm/allwinner-a10.c` (GPIO added 2026-09-15, SPI 2024-10-14), `hw/gpio/pcf8574.c`, `hw/misc/axp2xx.c`: https://github.com/qemu/qemu
23. Linux gpio-sim: https://docs.kernel.org/admin-guide/gpio/gpio-sim.html
24. Linux vkms: https://docs.kernel.org/gpu/vkms.html
25. Cortex-A8 VFP and NEON: https://ffmpeg.org/pipermail/ffmpeg-devel/2008-August/041480.html; https://e2e.ti.com/support/processors-group/processors/f/processors-forum/339933/am3358-fpu-speed; https://en.wikichip.org/wiki/Cortex-A8; https://gcc.gnu.org/ml/gcc/2010-06/msg00606.html
26. A13 DRAM (16-bit bus, MBUS): https://linux-sunxi.org/A10_DRAM_Controller_Performance (quoted through search results)
27. zig 0.15.2 standard library as pinned by Zinc (`~/.zinc/toolchains/zig-aarch64-macos-0.15.2`): `lib/std/Target.zig` (Linux default min 5.10, glibc 2.34 for 32-bit Arm), `lib/std/Target/arm.zig` (`cortex_a8` features without `neon`/`vfp3`, `neon` implies `vfp3`)
28. LLVM `ARMProcessors.td` (cortex-a8: `nonpipelined-vfp`, slow VMLx): https://github.com/llvm/llvm-project/blob/main/llvm/lib/Target/ARM/ARMProcessors.td
29. kernel.org releases: https://kernel.org/releases.html; Phoronix, 6.18/6.12/6.6 LTS extended: https://phoronix.com/news/Linux-6.18-LTS-6.12-6.6-Extend
30. Debian forky armhf hardware: https://www.debian.org/releases/forky/armhf/ch02s01.en.html; Phoronix, armel dropped: https://www.phoronix.com/news/Debian-Drops-MIPS64EL-ARMEL
31. "sunxi: sun5/7i: add the psci suspend function" (CHIP idle 1 W to 0.45 W): https://lore.kernel.org/all/20161006163049.GA938@kwain/T/
32. AXP209: https://linux-sunxi.org/AXP209; VBUS current limit patches: https://lkml.iu.edu/hypermail/linux/kernel/1612.1/01004.html
33. xtacocorex/CHIP_IO pin table and XIO base detection: https://github.com/xtacocorex/CHIP_IO/blob/master/docs/index.md, `source/common.c`, `docs/gpio.md`
34. sun4i DRM composite output and CHIP TV encoder: https://lkml.iu.edu/hypermail/linux/kernel/1510.3/04670.html, https://lkml.iu.edu/1510.3/04662.html; LibreELEC report on `video=Composite-1`: https://forum.libreelec.tv/thread/22256-cvbs-composite-tv-out-in-pal-on-allwinner-a20-cubieboard2/
35. Bootlin on CHIP DIPs and U-Boot overlays: https://bootlin.com/blog/tag/nextthing/
36. TCA8418 binding: https://kernel.org/doc/Documentation/devicetree/bindings/input/tca8418_keypad.txt
37. tslib: https://github.com/libts/tslib
38. Mali-450 `highp` failure in WebGL: https://www.khronos.org/webgl/public-mailing-list/public_webgl/1603/msg00007.php; Chrome on mediump: https://developer.chrome.com/blog/use-mediump-precision-in-webgl-when-possible
39. Bootlin, Allwinner VPU (cedrus) on the CHIP: https://bootlin.com/blog/support-for-the-allwinner-vpu-in-the-mainline-linux-kernel/
40. Parallax forum, HDMI/VGA DIP power: https://forums.parallax.com/discussion/comment/1381628
41. Apache NimBLE Linux HCI socket transport: https://github.com/apache/mynewt-nimble/blob/master/nimble/transport/socket/src/ble_hci_socket.c

Zinc tree references: `next/src/tc/tc.cpp`, `next/src/tc/plugin_build.cpp`, `next/src/frontend/profile.cpp`,
`next/src/cli_core.cpp`, `targets/capabilities.json`, `runtime/mod/gpio_linux.cpp`, `runtime/include/hw.h`,
`plugins/display-fbdev`, `plugins/display-gl`, `next/src/gl/offscreen.cpp`, `docs/reports/raspberry-pi.md`,
`docs/plugins/display-fbdev.md`, `docs/plugins/display-gl.md`, `docs/reports/three-on-zinc.md`, backlog ZN-132,
ZN-133, ZN-145, ZN-178, ZN-203, ZN-245, ZN-390.
