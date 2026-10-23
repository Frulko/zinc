# Pi OS 03: fast boot budget and techniques

Research only (2026-10-22). Sources at the end; every number carries its source. "(U)" = unverified, from memory, a secondary source or inference: measure before relying on it. Nothing was changed on any device.

## 0. Method and limits

- The reference Pi 3B+ did not answer: `spark.local` did not resolve and `192.168.2.107:22` timed out (two tries, as instructed). Section 6 is therefore empty; the only Pi 3B+ baseline is Raspberry Pi's own June 2026 firmware log (S1).
- Official Raspberry Pi doc pages were fetched in part only (the pages are 130k-250k characters; the bootloader-config section and `boot_delay`/`disable_fw_kms_setup` text were not fully read). Settings below are cross-checked against S1 and S3 where marked.
- The "tuned" columns are estimates built from the published stage numbers, not measurements. The first job after choosing a base is to reproduce the table with a camera or a GPIO toggle (S1 recommends a hardware trigger) on the real boards.

## 1. Budget table (time from power applied)

Stages: A = BootROM + bootcode/EEPROM, B = GPU firmware (config.txt, DT, overlays, kernel and initramfs read), C = kernel to PID 1, D = userspace to first app frame. "First frame" = app draws its splash.

| Stage | Pi 3B+ stock | Pi 3B+ tuned (est.) | Pi 4 stock | Pi 5 stock | Best published |
|---|---|---|---|---|---|
| A. ROM + bootcode / EEPROM | ~1.4 s until `config.txt` is read (includes bootcode.bin, 3 MB start.elf load) (S1 log) | ~1.0 s (start_cd.elf saved ~0.5 s on a Pi 3, S4; (U) with KMS) | ~2-4 s (U): EEPROM, SDRAM train, boot-order probing, HDMI diag delay 5 s window (S3 `HDMI_DELAY` default 5) | CM5 "Starting OS" at 6.77 s with defaults (S1); SBC adds net-install UI and USB PD negotiation (S1) | Pi 3: 1.25 s for K1 (S4) |
| B. Firmware: config, DT, overlays, kernel + initramfs read | 1.4 s -> 6.79 s "Starting ARM" = ~5.4 s: initramfs 11.7 MB, kernel8.img 10 MB, 2 overlays, 2.6 s gap after the kernel read (S1) | ~1.0-1.5 s: no initramfs, 4-5 MB gz kernel, 0-1 overlay, small DT | similar to Pi 3 order, faster SD bus (U) | firmware loads kernel directly from the EEPROM boot path; ~1 s (U) | Zero 2 W: kernel read 1.54 s for 9.3 MB, ~6 MiB/s (S5) |
| C. Kernel to PID 1 | Raspberry Pi OS: ~2-4 s with modules, initramfs, serial console (U, typical) | 0.4-0.8 s | 1.05 s (S6 forum, tuned userspace) | ~1 s (U) | ~0.4 s on Zero 2 W Buildroot (S5) |
| D. Userspace to app | systemd Lite: ~6-10 s to multi-user (U, check section 6 when device returns) | 0.1-0.3 s (app is init or first service) | 4.98 s on a trimmed Pi OS (S6) | n/a | 0.12 s -> 0 init stage; Qt app 1.07 s (S4) |
| **Total to first frame** | **~15-20 s** (S1 log + typical Lite, (U)) | **~3-3.5 s** (est.) | ~8-10 s stock (U) | ~12-20 s stock (U); ~21 s microSD to desktop quoted, (U) | **Pi 3: 2.82 s to Qt app (no USB, no net) (S4); Zero 2 W: <3.5 s to userspace (S5)** |

Targets for Zinc: Pi 3B+ 3 s to the splash and 4 s to the first interactive frame; Zero 2 W the same; Pi 4 about 3.5 s; Pi 5 about 5 s (the EEPROM and RP1 stages are a floor, S1: "large gains (measured in seconds) are not achievable" at that stage on gen 5).

Key inference (U, derived from S1 and S5): the GPU firmware reads boot files at only ~6 MiB/s (about 170 ms per MB). On a stock Pi 3B+ the kernel (10 MB) plus initramfs (11.7 MB) cost about 3.5 s of the 5.4 s of stage B. Every megabyte on the boot partition costs about 0.17 s, so file size is the first lever on Pi 3 and Zero 2 W.

## 2. Prioritized techniques

Gain is per board where stated; "risk" is what can break.

| # | Technique | Gain | Cost / risk |
|---|---|---|---|
| 1 | Remove the initramfs (`auto_initramfs` off, root on `root=` directly, drivers built in) | 2-3 s on Pi 3B+ (S1 log: 11.7 MB read) ; 0.28 s measured on Zero 2 W (S5, small initramfs) | Needs root driver (mmc, ext4/squashfs/erofs) built in; no recovery shell |
| 2 | Shrink the kernel: trimmed config, `KALLSYMS=n`, no USB/sound/media/BT you do not use, built-in vs modules decided per driver | 1-2 s of stage B on Pi 3 (stock 10 MB -> 4-5 MB gz; S5 8.5 MiB uncompressed vs stock 25 MiB) and 0.5+ s in stage C | Maintenance of a defconfig; lose oops symbols (S1 notes the trade-off) |
| 3 | App is `/sbin/init` or `init=` script that mounts and execs the app first; no systemd, no udevd in the critical path | Userspace 5-8 s -> <0.3 s (S4 K4 120 ms -> 0, S5 `init=/init.sh`) | You own mounts, reaping, shutdown; solved by BusyBox or a 100-line init that execs the app |
| 4 | `quiet loglevel=3`, drop `console=serial0` / `console=tty1`, no `fsck.repair`, `rootwait` kept but root device built in | 0.1-0.5 s (UART at 115200 is the bottleneck; S1 recommends `quiet`; S7 Microchip: loglevel 0 helps) | Lose boot diagnostics: keep a debug image with console on |
| 5 | config.txt: `camera_auto_detect=0`, `display_auto_detect=0`, `force_eeprom_read=0`, `disable_poe_fan=1`, hardcoded EDID/`hdmi_force_hotplug` where HDMI is used; load the DSI overlay explicitly | 0.63 s measured on Zero 2 W for the group of probes (S5); stage B text in S1 shows probes via I2C are "slow buses" | None for a fixed-hardware image. Official 7" DSI: load `vc4-kms-dsi-7inch` explicitly (S8, (U) for its timing) |
| 6 | Read-only squashfs/erofs rootfs (zstd or lz4) with a tmpfs overlay | Removes journal replay (several seconds after unclean power loss, S1) and fsck; erofs 16K reads >3x ext4 on CM5 (S1); on Pi 3 SD, compression cuts bytes read (U) | Updates need an A/B or full-image scheme; app data lives on a separate partition |
| 7 | Disable networking in the boot path: Wi-Fi (`brcmfmac`, `cfg80211`, `wpa_supplicant`/`iwd`) started by the app or a late service after the first frame | brcmfmac firmware load and sdio probe are 0.5-1.5 s of kernel and CPU contention on a Pi 3 (U); nothing waits on it | Wi-Fi up later; app must handle "offline" state (it must anyway) |
| 8 | EEPROM (Pi 4/5): `BOOT_ORDER=0xf1` (SD only, restart), `NET_INSTALL_ENABLED=0`, `NET_INSTALL_AT_POWER_ON=0`, `BOOT_UART=0`, `HDMI_DELAY=0` or `DISABLE_HDMI=1`, `SD_BOOT_MAX_RETRIES=0`, `USB_MSD_DISCOVER_TIMEOUT=5000` if USB stays in order | Pi 5: "one of the larger single gains" is `PSU_MAX_CURRENT=5000` with a non-PD supply (S1); the others 0.1-1 s each; default BOOT_ORDER is `0xf41`, USB probe up to 20 s only if SD fails (S3) | Applied per device with `rpi-eeprom-config --apply`, cannot ship in the image (EEPROM is flash on the board): needs a one-time provisioning step or `recovery.bin` SD |
| 9 | `boot_delay=0` (default is already 0 in the doc, S9), `bootcode_delay` unset, `initial_turbo=60` kept (default behaviour), `disable_splash=1`, `avoid_warnings` unset | `disable_splash` removes the rainbow (visual, ~0 s); `boot_delay` only matters if a previous image set it (S4 "just over 10 s with boot delay set to 0" shows people mistake the setting) | `initial_turbo` has a reported SD-reliability interaction on Pi 5 (S10, (U)) |
| 10 | `start_cd.elf` + `fixup_cd.dat` (cut-down firmware, enabled only by `gpu_mem=16`, S2) | ~0.5 s on Pi 3 (S4) | Breaks GLES through firmware (S4's Qt app failed). With `vc4-kms-v3d` the 3D is ARM-side and CMA-backed, so it may work (U): test first, and test the DSI display and the DRM driver |
| 11 | Static `/dev` (devtmpfs only) and evdev for input; no udev coldplug. If libinput is wanted, start `udevd` and `udevadm trigger` after the first frame | udev coldplug and `systemd-udev-settle` are "a common hidden bottleneck", seconds on constrained hardware (S1); Bootlin recommends static device files (S11) | libinput needs the udev database for device tags; Zinc can read evdev directly (touch `ft5x06` + keys) |
| 12 | Kernel options measured on a Pi 3: `HW_RANDOM` off (~0.7 s), `FTRACE` off (~0.5 s), `ALLOW_DEV_COREDUMP` off (~0.2 s), `NAMESPACES` off (~0.1 s), `STRICT_*_RWX` off (~0.1 s) (S4, old kernel (U)) | up to 1.5 s on a 4.x kernel; re-measure on 6.12 | Security hardening lost (S5 also disables KASLR and Spectre mitigations); keep `HW_RANDOM` only if needed |
| 13 | Time sync after the first frame: no RTC on Pi 3/4; `systemd-timesyncd` or `chrony` in the background, `fake-hwclock`-style saved timestamp at shutdown, build-time clock floor | Avoids gating on NTP (S1: do not gate services on time sync) | Clock is wrong until sync: TLS cert checks fail early; the app must not depend on time at boot. Pi 5 has an RTC (battery optional) |
| 14 | Overclock the GPU for file reads (`core_freq=550`) | ~20% faster kernel read (S5) | Author calls it "not recommended"; skip |
| 15 | Boot media: A1/A2 SD at 50 MB/s is fine for Pi 3 because the firmware reads at 6 MiB/s regardless (S1, S5); USB/NVMe only helps the kernel and rootfs phases | Small on Pi 3; NVMe on Pi 5 "~21 s SD vs <17 s NVMe" is a desktop figure (U) | The Pi 3 USB boot path needs bootcode.bin on SD anyway (S12 doc) |

Sequence by value for Zinc: 1, 2, 3, 7, 5, 4 together give most of the gain on Pi 3B+ and Zero 2 W; 8 is the main lever on Pi 4/5.

## 3. Per-board boot chain notes

### Pi 3B+ (reference) and Zero 2 W
- Chain: SoC BootROM -> `bootcode.bin` (SD) -> `start*.elf` + `fixup*.dat` -> `config.txt`, `cmdline.txt`, DT, overlays, kernel, initramfs -> ARM starts (S1 log, S12). No EEPROM: none of the EEPROM settings apply; `bootcode.bin` is the first stage (S12). BOOT_UART for bootcode.bin is patched by `sed` in the binary (S12).
- S1 log, stock Raspberry Pi OS Pi 3B+, June 2026: `config.txt` read at 1.41 s; 2.0 s `HDMI0` init; 2.84 s initramfs read; 3.0-3.2 s overlays `vc4-kms-v3d` and `disable-bt` (each about 50-100 ms of read + apply); cmdline 3.25 s; kernel8.img loaded 4.13 s; DT loaded and "Starting ARM" at 6.79 s. The 2.6 s between kernel load and DT is the bulk read of the 10 MB kernel (log lines are printed after the read, so the boundary is blurry (U)).
- Files needed (S2, S4): `bootcode.bin`, `start.elf`+`fixup.dat` (or `start_cd.elf`+`fixup_cd.dat` with `gpu_mem=16`), `config.txt`, `cmdline.txt`, DTB (`bcm2710-rpi-3-b-plus.dtb`), the one overlay you need, `kernel8.img`. Delete `overlay_map.dtb` is not allowed if overlays are used (the log shows it read, S1); `start4*.elf` etc are for Pi 4/5 only.
- Alternative: embed the DT in the kernel (S4: ARM32 `ARM_APPENDED_DTB`, net cost 0.7 s for them): not applicable to arm64 and overlays; skip.

### Pi 4
- SPI EEPROM bootloader: ROM -> second stage reads SDRAM config, config, BOOT_ORDER (default `0xf41`: SD then USB-MSD then restart), then `start4.elf` and kernel (S3). Settings above in technique 8. S1 recommends for headless Pi 4 `max_framebuffers=0` and `disable_fw_kms_setup=1`; we have a display, so keep the framebuffer (it carries the splash, see section 5) and set only `disable_fw_kms_setup=1` if the app/kernel picks the mode itself (U: it removes the firmware EDID parse; DRM then needs `video=` on cmdline).
- `arm_boost` default 1.8 GHz on newer 4B (S2); leave default.

### Pi 5
- ROM -> SPI EEPROM bootloader (bootsys, bootmain) -> RP1 probe and firmware load (largely blocking, S1) -> kernel loaded directly (no `start.elf`) (S3). `disable_fw_kms_setup` is the default on Pi 5 (S1). `os_check=1` default (S2). 16K page-size kernel (`kernel_2712.img`) and 16K erofs give >3x reads (S1).
- SBC defaults slow it (net install UI, USB PD negotiation, S1); CM5 stock "Starting OS" 6.77 s (S1) is the best number to quote for the floor.
- NVMe: set `dtparam=pciex1_gen=3` to cut boot latency (S1); not relevant for an SD image.

## 4. Kernel and init detail

- **Compression**: S5 measured an uncompressed 8.5 MiB kernel (gzip 4.1 MiB). With the firmware reading ~6 MiB/s (S5, S1) the compressed Image.gz saves ~0.7 s of read for ~0.15 s of A53 decompression (U, inferred); Bootlin says to try "None" only when CPU is slow and storage fast (S11), which is the opposite of the Pi's firmware path. Test both on the Pi 3B+; also test lz4/zstd kernels, arm64 firmware support for them is (U).
- **Built-in vs modules**: put the display path (vc4, panel, ft5x06, touch, mmc, the root FS) in the kernel (`=y`) so nothing waits on modprobe; keep brcmfmac, bluetooth, audio as modules loaded after the first frame (technique 7).
- **Cmdline** for the tuned image (U, to be validated): `root=/dev/mmcblk0p2 rootfstype=erofs ro rootwait quiet loglevel=3 init=/sbin/zinc-init vt.global_cursor_default=0 logo.nologo=0`; no `console=` entries; `fsck` not used with a read-only root. `rootwait` costs nothing if the device is ready (it only waits when absent); the alternative `rootdelay=N` always waits N seconds, so avoid it. `lpj=<value>` skips the calibration on single boots (~0.1-0.2 s on non-timer-based ARM, (U); ARM64 uses the arch timer, so the gain is probably zero: skip).
- **Async probing / deferred**: `driver_async_probe=` for slow drivers (mmc, brcmfmac) and `initcall_debug` + `printk.time=1` to find the culprits (S1 recommends `printk.time=1`; the Bootlin methods S11). Use `bootgraph.py` on the dmesg to chart it (U).
- **SMP**: Bootlin saved time by booting single CPU then onlining others (S11, BeagleBone, (U) for Pi); only worth it if the app is the critical path.
- **Init**: S4 (Qt on Pi 3) measured BusyBox init at 120 ms and removed it entirely by installing the app as `/sbin/init` and mounting from the app. Qt measured a 13% total gain from a custom init script over systemd on Pi 4 (S13, Sept 2024). Bootlin found plain init scripts cost little compared to the kernel (S11).
- **systemd** if kept (Raspberry Pi OS Lite path): mask `systemd-udev-settle`, `apt-daily*`, `man-db`, `e2scrub*`, `raspi-config`, `rpi-eeprom-update`, `ModemManager`, `NetworkManager-wait-online`, `avahi`, `triggerhappy`, `dphys-swapfile`, `bluetooth`, `keyboard-setup`, `console-setup`, `systemd-timesyncd` to later; disable journal persistence; `systemd-analyze critical-chain` to prune. Reaching below ~3-4 s of userspace on Pi 3 is not realistic with systemd (U; S6 reached 4.98 s on a Pi 4 after disabling network, splash, Bluetooth, sshd and wait-for-network). That is why the base should not be Raspberry Pi OS Lite.
- **Swap**: avoid swap on boot paths on 512 MB boards; the Zero 2 W showed `openat` taking 2 s under swap pressure (S1). Use zram if needed.

## 5. Display handoff and splash plan

What happens on a Pi 3B+ with the official 7" DSI display (fact vs (U)):
1. Firmware (bootcode/start.elf) initialises the display itself and draws the rainbow splash a few seconds after power-on; the third-party claim is ~2-3 s for Touch Display 1, whose DSI is brought up by the firmware (S14, (U)). The firmware also creates a framebuffer and a `simple-framebuffer` DT node (S15: the intended design). It is the first visible light; `disable_splash=1` removes the rainbow (S2).
2. Kernel: `simplefb` (built in for the Pi kernel, S16) or `simpledrm` registers the firmware framebuffer very early (at about 0.1-0.3 s kernel time); `fbcon` with `CONFIG_LOGO` draws the Tux logo there if enabled (`logo.nologo` disables it).
3. `vc4` (KMS) probes (about 0.5-1 s into the kernel with the DSI panel bridge and ft5x06), takes over from the firmware framebuffer and does a mode set: this is where the flicker or black frame appears. Plymouth shows the same low-resolution splash on simpledrm then switches to the native driver (S17). The fix on other platforms is to treat simpledrm as fbdev until a timeout, or `initcall_blacklist=simpledrm_platform_driver_init` (S18), with mixed results.

No Pi bootloader can show a custom image: not on Pi 3 (`bootcode.bin`/`start.elf`: only the rainbow, S2), and not on Pi 4/5, where the EEPROM only shows diagnostics screens (boot failure, net install) and a `DISABLE_HDMI`/`HDMI_DELAY` option (S3). A search found no splash-image option in the EEPROM (S19, (U): absence of evidence). S1 notes `max_framebuffers=0` disables the firmware framebuffer and so any early splash.

Plan (cheapest first, each step independent):
1. `disable_splash=1`: no rainbow. On the Pi 3B+ with the DSI panel the screen then stays black from power-on until the kernel or app draws (about 2 s); acceptable.
2. Kernel: `CONFIG_FB_SIMPLE=y`, `CONFIG_DRM_VC4=y`, panel, bridge and `ft5x06` built in, `CONFIG_LOGO=y` with a custom `logo_linux_clut224.ppm` (224 colours, the same artwork as the app splash, black background) and `CONFIG_FRAMEBUFFER_CONSOLE=y` only if the logo is wanted; `vt.global_cursor_default=0`, no `console=tty1`. Cost: ~0.1 s; benefit: a branded frame at about 2 s instead of black (U for the exact time).
3. Handoff: have `vc4` and the app avoid a full mode set: the app opens `/dev/dri/card0` and commits the same mode as the firmware framebuffer (read the current CRTC state with `drmModeGetCrtc`, re-use mode and the same `1024x600` / `800x480` for the official 7" panel), so the panel never loses sync. Whether downstream `vc4` keeps the firmware-initialised pipeline without a blank is (U): test on the Pi 3B+ first (it is the board most likely to flicker, since the panel is DSI).
4. The app draws its splash as the first thing, before loading any asset: init execs the app; the app opens DRM, paints an embedded 1-bit/RGB565 logo from the executable (no file reads), flips, then loads. This is the splash that matters for perceived speed: no plymouth, no psplash, no fbsplash. Skip those: plymouth is a daemon plus a library set, and its simpledrm flicker bug (S17) is the reason; psplash and fbsplash add a process and a framebuffer write for no benefit once the app owns the first frame.
5. DSI panel timing: the official 7" (Toshiba TC358762 bridge + Atmel MCU with ft5x06) is brought up by the firmware on Pi 3 and by the kernel (`vc4-kms-dsi-7inch` overlay) otherwise; kernel-side init of a Touch Display 2 leaves the screen black for a long stretch (S14, (U), Touch Display 2 not in our fleet). Measure the first-frame delay with `drm.debug` and `printk.time` on the target.
6. Final stage, only if needed: kernel `video=` on the cmdline fixes the mode and avoids EDID reads on HDMI.

## 6. Baseline from the reference device (Pi 3B+, pi@spark.local)

Not obtained. Two tries as specified: `command ssh ... pi@spark.local` failed with "Could not resolve hostname spark.local"; `pi@192.168.2.107` timed out on port 22. No other command ran. Re-run when it answers:

```
command ssh -o ConnectTimeout=8 -o BatchMode=yes pi@spark.local 'systemd-analyze; systemd-analyze blame | head -30; systemd-analyze critical-chain; cat /boot/firmware/config.txt /boot/firmware/cmdline.txt; uname -a; vcgencmd version; vcgencmd get_throttled; lsmod | wc -l' </dev/null
```

Things to read in the output: firmware vs kernel vs userspace split from `systemd-analyze`; whether `NetworkManager-wait-online`, `cloud-init` (the S1 log's `ds=nocloud` shows a cloud-init Imager image) or `systemd-udev-settle` dominate; `dtoverlay` lines to drop; `initramfs` line (`auto_initramfs`); `console=` entries.

## 7. Base system recommendation (informed by the numbers)

Buildroot, with a custom kernel defconfig and the app as PID 1 (via a tiny init or BusyBox): it is the base of the best published results (S4 2.82 s on Pi 3, S5 <3.5 s on Zero 2 W), gives small erofs/squashfs rootfs and static builds, and matches the project rule "proven libraries". Yocto reaches the same figures with far more build cost; a modified Raspberry Pi OS Lite cannot go below ~8-10 s on Pi 3 (S6 6 s on Pi 4 after disabling most services; kernel and initramfs size alone cost ~3.5 s on Pi 3 per S1). Decision belongs to the base-system report; this one only supplies the budget.

## 8. Open items to measure first (in this order)

1. Pi 3B+ firmware stage with no initramfs, gz kernel 4-5 MB, one overlay: confirm ~1.0-1.5 s (technique 1, 2).
2. Cut-down firmware with `vc4-kms-v3d` and the DSI overlay: works or not (technique 10).
3. Whether `vc4` handoff blanks the official DSI panel; screen probe with a camera (section 5 step 3).
4. Image.gz vs Image vs lz4 kernel read vs decompress (section 4).
5. brcmfmac load cost on Pi 3B+ with `quiet` (technique 7).
6. Pi 5: `PSU_MAX_CURRENT` and EEPROM provisioning path for production images (technique 8).

## Sources

- S1 Raspberry Pi Ltd, "Optimising boot time on Raspberry Pi Single Board Computers", white paper RP-010196, release 1, 1 Jun 2026 (build 16/07/2026), includes Pi 3B+ firmware log and CM5 7 s figure. https://pip-assets.raspberrypi.com/categories/685-app-notes-guides-whitepapers/documents/RP-010196-WP-1-Optimising%20boot%20time%20on%20Raspberry%20Pi%20single-board%20computers.pdf
- S2 Raspberry Pi docs, config.txt (disable_splash, auto_initramfs, disable_poe_fan, initial_turbo, cut-down firmware via gpu_mem=16, os_check, camera/display_auto_detect), fetched 2026-10-22. https://www.raspberrypi.com/documentation/computers/config_txt.html
- S3 Raspberry Pi docs, bootloader and EEPROM settings (BOOT_ORDER default 0xf41, HDMI_DELAY 5, DISABLE_HDMI, USB_MSD_DISCOVER_TIMEOUT 20000, NET_INSTALL_*, PSU_MAX_CURRENT, SD_BOOT_MAX_RETRIES, POWER_OFF_ON_HALT), fetched 2026-10-22. https://www.raspberrypi.com/documentation/computers/raspberry-pi.html
- S4 Furkan Tokac, "Raspberry Pi 3 Fastboot - Less Than 2 Seconds" (1.75 s to shell, 2.82 s to Qt app, stage table, kernel options); article date not shown on the fetched page, (U) about 2018-2019, old kernel. https://www.furkantokac.com/rpi3-fast-boot-less-than-2-seconds/ ; press coverage: https://www.tomshardware.com/news/raspberry-pi-3-2-second-boot-time (date not retrievable)
- S5 Manawyrm, "Extreme Pi Boot Optimization", 2024-09-01 (Zero 2 W, Buildroot, Linux 6.6.26, 3.4 s, kernel read 6 MiB/s). https://kittenlabs.de/blog/2024/09/01/extreme-pi-boot-optimization/
- S6 RetroPie forum, Pi 4 EmulationStation 1.050 s kernel + 4.980 s userspace (search snippet, forum post date not checked). https://retropie.org.uk/forum/post/132298
- S7 Microchip, boot time results (loglevel). https://onlinedocs.microchip.com/oxy/GUID-6144D499-78AB-4E21-9291-C5654BEA413A-en-US-1/GUID-AFACFBA4-ED30-4EA7-96B1-2319486AA7E5.html
- S8 Waveshare wiki, 7inch DSI LCD overlay `vc4-kms-dsi-7inch`. https://www.waveshare.com/wiki/7inch_DSI_LCD
- S9 Raspberry Pi docs, legacy config.txt options (boot_delay, boot_delay_ms, bootcode_delay, gpu_mem, max_framebuffers defaults). https://www.raspberrypi.com/documentation/computers/legacy_config_txt.html
- S10 linux-arm-kernel list, "[PATCH v5 0/4] Add minimal boot support for Raspberry Pi 5", 2024-05/06 (initial_turbo and SD). https://lists.infradead.org/pipermail/linux-arm-kernel/2024-June/931357.html
- S11 Bootlin, Opdenacker, "Timing boot time reduction techniques", ELCE 2019 (BeagleBone Black 9.45 s -> 2.4 s); Phoronix summary https://www.phoronix.com/news/Bootlin-Lyon-Linux-Boot-Time ; slides https://bootlin.com/pub/conferences/2019/elce/opdenacker-timing-boot-time-reduction-techniques/opdenacker-timing-boot-time-reduction-techniques.pdf ; 2009 static /dev https://free-electrons.com/pub/conferences/2009/elce/boot-time.pdf
- S12 Raspberry Pi docs, Pi 3 bootcode.bin flow and BOOT_UART patch (same page as S3).
- S13 Qt blog, "How to optimize boot time in user space on a Raspberry Pi 4 / Boot2Qt", 2024-09-11 (13%). https://qt.io/blog/boot2qt-/-how-to-optimize-boot-time-in-user-space-on-a-raspberry-pi-4
- S14 industrialmonitordirect, Touch Display 2 boot delay (third-party, (U)). https://industrialmonitordirect.com/blogs/knowledgebase/raspberry-pi-touch-display-2-boot-delay-fix
- S15 raspberrypi/firmware issue 597, firmware creates simple-framebuffer. https://github.com/raspberrypi/firmware/issues/597
- S16 Ubuntu raspi kernel patch, FB_SIMPLE=y, 2022-07. https://lists.snapcraft.io/archives/kernel-team/2022-July/131729.html
- S17 Plymouth issue 167 and MR 163 (simpledrm flicker). https://gitlab.freedesktop.org/plymouth/plymouth/-/issues/167
- S18 Arch forum, `initcall_blacklist=simpledrm_platform_driver_init`. https://bbs.archlinux.org/viewtopic.php?id=300842
- S19 DietPi forum, Pi 5 splash returns after power cycles despite `disable_splash=1`. https://dietpi.com/forum/t/raspberry-pi-5-boot-splash-screen-pink-white-returns-after-abrupt-power-cycles-despite-disable-splash-1/25298
- Pi 5 microSD vs NVMe ~21 s vs <17 s: aggregator citing Tom's Hardware/Pimoroni, (U), not traced to the original.
