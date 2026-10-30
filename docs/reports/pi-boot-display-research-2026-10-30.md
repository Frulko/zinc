# Pi boot, bootloader, display stack and boot screen: research (2026-10-30)

Owner request (2026-10-30, in French): research on "GRUB, bootloader, an X window optimised for the Pi, a Windows XP-style loading
screen", for the fast-boot Zinc image on Raspberry Pi OS Lite. Research only: nothing built, nothing run on a device, no other file edited.

Tags: **[V]** read in a page fetched today (URL given); **[S]** only in a search snippet; **[R]** from a Zinc report (path given, its author's
figure, not re-checked); **[U]** unverified, inference or memory. Where a page could not be read in full, that is said. No Pi was measured:
every "tuned" figure is an estimate from published stage numbers.

Already covered, not redone (read first):
- `docs/reports/pi-os/00-synthesis.md` (plan: Pi OS Lite, target ~5 s to splash on Pi 3B+, splash drawn first by the app, Plymouth and psplash rejected, section "Splash" l.274), `03-fast-boot.md` (stage budget, section 5 "Display handoff and splash plan"), `02-base-system.md` (Buildroot vs Pi OS, tryboot), `05-pios-fast-boot.md`, `06-pios-tooling-and-references.md`, `07-kiosk-session-practices.md` (SDL KMSDRM needs no logind, tty1 as controlling terminal).
- `docs/reports/pi-compositor-options.md` and `pi-compositor-design.md` (HVS planes, cage/labwc/Weston, recommendation: composition inside Zinc, planes first; cage only as optional outer compositor for non-Zinc programs).
- `docs/reports/pi-orchestrator-design.md` (`zinc agent` becomes the session), `pi-updates-design.md` (update flow), `raspberry-pi.md` (rig), `pi-1080p.md` (display-gl on Pi 3B+), `zinc-next-baremetal-pi.md` (no-Linux option: still needs the VideoCore stage; "under a second to first pixel" is [U]).

## 1. Bootloaders

### 1.1 What a Pi boots with

- **Pi 3B+ / Zero 2 W (no EEPROM):** SoC BootROM, `bootcode.bin` (SD), `start*.elf` + `fixup*.dat`, then `config.txt`, `cmdline.txt`, device tree, overlays, kernel, initramfs [R pi-os/03 §3]. On Raspberry Pi's own June 2026 log of a stock Pi 3B+ image, `config.txt` is read at 1.41 s, the initramfs at 2.84 s, `kernel8.img` at 4.13 s, "Starting ARM" at 6.79 s [R pi-os/03 §3, from the white paper RP-010196 "Optimising boot time on Raspberry Pi single-board computers", 1 Jun 2026: https://pip-assets.raspberrypi.com/categories/685-app-notes-guides-whitepapers/documents/RP-010196-WP-1-Optimising%20boot%20time%20on%20Raspberry%20Pi%20single-board%20computers.pdf; the search snippet confirms the paper and its date, I did not re-read the PDF].
- **Pi 4 / 5 / CM4 / CM5:** SPI EEPROM bootloader replaces `bootcode.bin`; it reads `BOOT_ORDER` (default `0xf41`: SD, then USB-MSD, then repeat; NVMe is mode `6`, Pi 5/CM4/CM5 only), then `autoboot.txt`, `config.txt`, the firmware, the kernel [V https://www.raspberrypi.com/documentation/computers/raspberry-pi.html, bootloader properties table].
- EEPROM knobs that cost time, with documented defaults [V same page]: `HDMI_DELAY=5` (diagnostics screen delayed up to N s so it does not flash on a normal boot; set 0 or `DISABLE_HDMI=1`), `NET_INSTALL_AT_POWER_ON` (shows a network-install screen after cold boot; default images set 1), `SD_BOOT_MAX_RETRIES=0`, `BOOT_UART=0`, `POWER_OFF_ON_HALT`. On Pi 5, `disable_fw_kms_setup` already defaults to 1 and `os_check=1` checks for a compatible DT [V https://www.raspberrypi.com/documentation/computers/config_txt.html].
- Latest EEPROM releases still shave time: rpi-eeprom v2026.05.11-2712 reports about 1 s less on a Pi 5 booting from NVMe and about 250 ms on CM4/CM5 by skipping an SD timeout [S https://newreleases.io/project/github/raspberrypi/rpi-eeprom/release/v2026.05.11-2712]. The white paper itself says gains at the Pi 5 EEPROM/RP1 stage are small [R pi-os/03 §0: "large gains (measured in seconds) are not achievable"].
- The EEPROM cannot ship inside the image (it is flash on the board): it needs a one-time `rpi-eeprom-config --apply` step or a `recovery.bin` SD [R pi-os/03 technique 8].

### 1.2 GRUB, UEFI, U-Boot

- **GRUB cannot run on a Pi by itself.** It needs a UEFI or U-Boot EFI layer under it. Two routes exist:
  - **U-Boot + grub-efi** (what Debian's raspi team discusses for images, https://salsa.debian.org/raspi-team/image-specs/-/work_items/78 [S]): the argument for it is a real kernel command line and booting older kernels after a bad update; direct firmware boot silently ignores some command-line changes (same snippet). Not our problem: our image has one kernel and a fixed `cmdline.txt`.
  - **UEFI firmware (EDK2).** Pi 4: pftf/RPi4 (https://github.com/pftf/RPi4), last release I could see v1.37, last push reported as 2025-02-21 by a third-party index [S], 3 GB RAM limit by default because of a Broadcom DMA bug [S]. Pi 5: worproject/rpi5-uefi, latest release v0.3 (March 2024), last push reported 2025-02-04 [S https://www.github.com/worproject/rpi5-uefi]. Pi 3B+ has no maintained UEFI I could find [U]. These are community ports for installing generic distributions (Windows, BSD, Debian ISO); they add a full firmware stage after the VideoCore stage and nothing in a fixed-function kiosk.
- **U-Boot on a Pi:** works, but it is one more stage and a menu timeout (`bootdelay` build default usually 1-2 s, and an extlinux menu timeout is separate [S https://forums.developer.nvidia.com/t/u-boot-and-syslinux-boot-problem-solved/41069, https://yhetil.org/guix/878rork63k.fsf@contorta]); its one real gain is `bootcount`. No measurement of the U-Boot cost on a Pi was found. Bootlin dropped U-Boot on the Pi 5 because it lacked PCIe support for the BCM2712, so it could not reach an NVMe root [V https://bootlin.com/?p=19769, May 2025; comments run to June 2026].
- Pi 4 firmware loads kernel and DTB directly and applies `config.txt` DT edits and overlays, which U-Boot and GRUB do not [S https://packages.altlinux.org/ru/p9/srpms/rpi4-boot-switch/].

### 1.3 A/B and rollback

- **Pi's own A/B: `autoboot.txt` + `tryboot`.**
  - `autoboot.txt` (max 512 bytes in the mirror I read [S https://shumeipai.nxez.com/documentation/computers/config_txt.html]) picks the boot partition with `[all]` and `[tryboot]` sections; `tryboot` is a one-shot flag set with `sudo reboot '0 tryboot'` (or `vcmailbox 0x00038064 4 0 1`), clear-on-read, so a failed boot returns to the normal partition at the next reset [V raspberry-pi.html and Bootlin].
  - `tryboot_a_b=1` in `autoboot.txt` loads the normal `config.txt`/`boot.img` instead of `tryboot.txt` [V config_txt.html]. The `[boot_partition=N]` conditional in `config.txt` (rpi-eeprom 2025-03-10) lets `cmdline.txt` follow the slot; Bootlin calls it experimental and undocumented then; the config_txt page now documents it with an A/B `cmdline` example [V both].
  - **No attempt counter, no automatic fallback for a bootable-but-broken slot.** The firmware keeps no boot-attempt history; an `[all]` entry pointing at a bad slot does not fall back [V Bootlin; R pi-os/02 l.127]. A hardware watchdog (`dtparam=watchdog=on`) plus `panic=10` covers kernel hangs [V https://ubuntu.com/hardware/docs/boards/explanations/piboot-ab/].
  - Ubuntu 25.10+ ships this for every Pi it supports (`piboot-try`, two one-shot units; covers kernel, initramfs, DTs, overlays, `cmdline.txt`; **not** the bootloader; on Pi 5 a kernel not recognised as Pi 5-compatible can freeze the bootloader and need a power cycle) [V same Ubuntu page]. That is the strongest production evidence that tryboot is good enough.
  - tryboot on **Pi 3B+ and Zero 2 W is unverified** in our reports [R pi-os/00 l.321]; the config_txt page lists no model restriction [V], Ubuntu enables it on all supported models [V]. Test it before promising it.
- **RAUC** has no official Pi backend; Bootlin wrote a custom one (four handler commands around `autoboot.txt`) [V Bootlin]. **Mender** has a thread on using `autoboot.txt` (https://hub.mender.io/t/using-autoboot-txt-on-raspberry-pi/6012 [S]). **SWUpdate** and RAUC are the proven tools if the proven-libraries rule is applied [R pi-os/00 l.225]. Both are written for U-Boot/GRUB bootcount; on a Pi they reduce to "flip two lines in `autoboot.txt`".
- Fit with `pi-updates-design.md`: its update unit is the app and the agent; the system image changes rarely. A 100-line own flow (write inactive slot, rewrite `autoboot.txt`, `reboot '0 tryboot'`, agent marks good after first frame, watchdog + `panic=10`) matches Ubuntu's design and costs no boot time. Take RAUC only if signed bundles and a streaming install become requirements.

### 1.4 Boot-time numbers

| Source | Board | Result | Note |
|---|---|---|---|
| Stock Pi OS log, RP-010196 (Jun 2026) | Pi 3B+ | 6.79 s to "Starting ARM" | initramfs 11.7 MB read ~0.75 s, kernel 10.2 MB ~0.66 s, 2.6 s gap after kernel load [R pi-os/05 §0] |
| Furkan Tokac, Buildroot fork, camera-measured | Pi 3 | 1.75 s to shell, 2.82 s to Qt app (stock 10.17 s) | firmware 1.25 s, kernel 0.25 s after trimming; old kernel; [V search + R pi-os/02] https://www.furkantokac.com/rpi3-fast-boot-less-than-2-seconds/ , https://www.tomshardware.com/news/raspberry-pi-3-2-second-boot-time |
| Manawyrm, Buildroot, Linux 6.6.26 | Zero 2 W | 3.4 s | kernel read at 6 MiB/s on that board [R pi-os/03 S5] https://kittenlabs.de/blog/2024/09/01/extreme-pi-boot-optimization/ |
| Pi OS Lite hand-tuned (2018) | Pi 3B | 3.5-4 s power to picture | hand-built kernel, no USB [R pi-os/05 §0] |
| CM5 defaults | CM5 | "Starting OS" at 6.77 s | EEPROM + SDRAM training + PD negotiation [R pi-os/03 table] |
| Kernel trimming | Pi 3 | ~1.3 s saved | [S https://medium.com/smartmechatronics/embedded-linux-boot-time-reduction-eda5f5b4c014] |

Reading: the firmware stage (1.2-1.4 s on a Pi 3) and the file reads (initramfs, kernel size) are a floor on any base; the rest is kernel config and userspace. Under 2 s is Buildroot + trimmed kernel + no initramfs; Pi OS Lite lands at 5-8 s [R pi-os/05].

### 1.5 Recommendation (bootloader)

1. **No GRUB, no UEFI, no U-Boot.** They add a stage and a menu to a single-kernel appliance and add nothing the firmware lacks, except bootcount, which a watchdog + marker-after-first-frame replaces.
2. **Firmware direct boot, `autoboot.txt` + `tryboot` A/B, own small updater** (RAUC later if signing/streaming demands it). Add `dtparam=watchdog=on`, `panic=10`. Verify tryboot on the Pi 3B+, Zero 2 W, Pi 4, Pi 5 before it is advertised.
3. **Per-board EEPROM provisioning** on Pi 4/5: `HDMI_DELAY=0` (or `DISABLE_HDMI=1`), `NET_INSTALL_AT_POWER_ON=0`, `BOOT_ORDER` SD-first, `BOOT_UART=0`; keep EEPROM at the `default` channel at least at the May 2026 release.
4. Keep the base question as in `pi-os/00`: Pi OS Lite now, Buildroot later; the bootloader choice is the same for both.

## 2. Display stack for the Pi

### 2.1 Options compared

| Stack | What it is | Cost / evidence | For Zinc |
|---|---|---|---|
| **SDL3 `kmsdrm` direct (today)** | The app is DRM master: KMS + GBM + EGL/GLES (`display-gl`) or dumb buffers + planes (`display-fbdev`); no compositor | SDL3 Raspberry Pi doc lists X11, Wayland and KMSDRM; "KMSDRM runs without a compositor" [V https://wiki.libsdl.org/SDL3/README/raspberrypi]. Needs only groups `video,render,input,tty`, no logind [R pi-os/07]. Zero extra processes. Proven on Pi 3B+: 1080p GLES2 scenes 30-60 fps [R pi-1080p.md] | **Default** |
| **Wayland kiosk: cage** | wlroots compositor running one maximised app; from a TTY uses KMS+DRM; wlroots 0.20 based; XWayland optional [V https://github.com/cage-kiosk/cage] | wlroots uses only primary + cursor planes, so it either scans out one fullscreen buffer or composes with GLES2 [R pi-compositor-options §Summary 4]. No published latency/RSS figure for cage on a Pi was found | Only for non-Zinc programs (browser, X11 apps) on Pi 3+ with 1 GB+ [R pi-compositor-options] |
| **labwc** | Pi OS desktop compositor since Wayfire was dropped; Raspberry Pi says labwc "runs just as fast as X on older Raspberry Pi models" and tells older Pis on X to switch [V https://raspberrypi.com/news/a-new-release-of-raspberry-pi-os via search; vendor claim, no numbers] | Desktop-level; kiosk recipe in the Pi tutorial runs a program from `~/.config/labwc/autostart` [R pi-os/06 l.140]. Forum reports screen-blanking and Wayfire-to-labwc regressions on Pi 5 [S https://forum.magicmirror.builders/topic/19661/new-raspi-os-release/19] | Not needed |
| **Xorg modesetting + glamor** | Standard X on full KMS | X11 is still in Trixie per forum reports (not official notes) [S same MagicMirror thread]. Extra: X server process, a window manager or none, input via libinput/udev. No Zinc-specific number | Do not ship |
| **fbturbo** | Old xf86-video-fbturbo, CPU/DispmanX-era path for pre-KMS firmware | Tied to the legacy firmware display path that full KMS replaced; the compositor report states `vc4-fkms-v3d`/DispmanX are deprecated and the image uses full KMS [R pi-compositor-options §1.2]. Current maintenance of fbturbo [U] | Dead end, do not use |
| **XLibre** | Fork of Xorg server (5 Jun 2025); stable 25.2.0 on 21 Jun 2026; glamor_egl refactor, a dumb-gbm backend, memory-leak fixes [V https://github.com/X11Libre/xserver/wiki/XLibre-XServer-25.2-Changes] | No Pi, RSS or latency figure found; "drop-in replacement for Xorg" [S AUR pages] | Not a reason to ship X |
| **Tiny X servers (Xvfb-class, KDrive/TinyX, Xfbdev)** | Small, no GL | Not researched on current Pi firmware; no source with Pi numbers found [U] | Skip |

Missing evidence (stated plainly): no head-to-head latency, RSS or boot cost of SDL kmsdrm vs cage vs labwc vs Xorg on a Pi was found by search; the SDL page itself warns parts of it may be out of date. These must be measured by us (see candidate lines).

### 2.2 Why direct KMS wins here

- Zinc already draws with its own raster/GLES and already owns planes (video 37 ms to 3.5 ms CPU per frame with an overlay plane, ZN-731 [R pi-compositor-options §Summary 1]). A compositor only adds a copy or a plane arbitration step and a process.
- Input: Zinc reads evdev directly; libinput/xkb is a gap to fill in the engine, not a reason for X [R pi-os/01 §0 item 2].
- Boot: no X server, no WM, no udev coldplug in the critical path [R pi-os/03 technique 11]. The session unit starts the app on tty1 directly [R pi-os/07].
- Single app vs several Zinc apps: the design in `pi-compositor-design.md` composes several Zinc layers inside Zinc, planes first, so even "a desktop of several Zinc apps" does not need X or Wayland. Pi 5 DSI/DPI pipes have no planes (one RGB plane), so layers there are GPU-composed [R pi-compositor-options §Summary 3].

### 2.3 Recommendation (display)

1. **Ship no X server and no Wayland compositor in the base image.** SDL3 `kmsdrm` (display-gl on Pi 2+, display-fbdev on Pi 0/1) stays the only path. The "off switch" requested in the compositor report is the same path.
2. **Optional package `zinc-cage`** (apt, not in the image) for the day a non-Zinc program must be shown; XWayland inside cage covers X11 apps. It is a compatibility feature, not part of boot.
3. **Do not invest in tuned X (fbturbo, XLibre, TinyX).** Their advantage is serving X clients, which Zinc apps are not.
4. Keep `SDL_KMSDRM_DEVICE_INDEX` as the fallback knob only if a probe shows the wrong card [R pi-os/07].

## 3. A Windows XP-style boot screen

Goal: logo + animated progress bar from power-on to the app, with no black flash.

### 3.1 Stage by stage

| Stage | What can show | Custom image? | Evidence |
|---|---|---|---|
| Firmware (Pi 3B+, bootcode/start.elf) | Rainbow square; `disable_splash=1` removes it | No | "If `disable_splash` is set to `1`, the rainbow splash screen will not be shown on boot." default 0 [V config_txt.html] |
| EEPROM (Pi 4/5) | Diagnostics screens only (boot failure, net install); `HDMI_DELAY`, `DISABLE_HDMI` | No custom splash option found [V bootloader page; R pi-os/03 §5: absence of evidence] | Pi 5 reports the splash returning after abrupt power cuts despite `disable_splash=1` [R pi-os/03 S19: https://dietpi.com/forum/t/raspberry-pi-5-boot-splash-screen-pink-white-returns-after-abrupt-power-cycles-despite-disable-splash-1/25298] |
| U-Boot | Can show a BMP splash | N/A: we do not use U-Boot (section 1) | [U] |
| Kernel fbcon logo | Static image drawn by the kernel; `logo.nologo` removes the Tux; `quiet`, `loglevel=3`, `vt.global_cursor_default=0`, `fbcon=map:2` quiet the console | Yes: built-in logo (224-colour ppm, rebuild kernel) or the **`fullscreen_logo`** feature | rpi-image-gen layer `rpi-splash-screen`: `fullscreen_logo=1 fullscreen_logo_name=logo.tga vt.global_cursor_default=0`, uncompressed 24-bit TGA, max 1920x1080, under 224 colours, file in `/lib/firmware/logo.tga`, included by an **initramfs hook** [V https://raspberrypi.github.io/rpi-image-gen/layer/rpi-splash-screen.html]. Known issue: `auto_initramfs=0` + these cmdline options = no boot (raspberrypi/linux #7086 [S]). A `logo.nologo` report says the logo still shows on the latest Pi OS [S via search] |
| Plymouth | Themes, animation, progress; runs from initramfs and rootfs | Yes | See 3.2 |
| psplash | Tiny framebuffer splash with a progress bar fed by a pipe | Yes | No Pi measurement found; postmarketOS says pbsplash (their own) is far smaller than Plymouth, and Plymouth "took longer to launch" [S https://postmarketos.org/edge/2026/04/30/Switching-from-pbsplash-to-Plymouth/ and https://gitlab.com/postmarketOS/pmaports/-/merge_requests/4916] |
| Tiny early userspace binary on DRM/fb | Anything, including the XP bar | Yes | Own code; see 3.4 |

The kernel logo is static. An animated bar needs a userspace process (Plymouth, psplash or our own).

### 3.2 Plymouth: cost and handoff facts

- Needs DRM to render well; the frame-buffer renderer is "not well tested" [S postmarketOS/search summary]. Hans de Goede (Red Hat): Plymouth blocks the initrd-to-rootfs transition while it probes DRM connectors, initrd size dominates early time (halving a 40 MB initrd saved ~3 s load + 0.6 s unpack), and drawing through `simpledrm` makes the splash earlier [S https://hansdegoede.dreamwidth.org/2024/04/29]. His 47 s to 9 s first frame was an EFI/efifb PC, not a Pi.
- `simpledrm` to native driver switch flickers or blanks (Plymouth issue 167, MR 163 [R pi-os/03 S17]); workaround `initcall_blacklist=simpledrm_platform_driver_init` has "mixed results" [R pi-os/03 S18]. On a Pi the same moment is the `vc4` modeset.
- Handoff semantics (dri-devel, Sept 2021, https://lore.kernel.org/all/20210907130746.7b667dac@eldfell/T/ [S]): the kernel does not wipe KMS state when a client closes the device; flicker comes from userspace; removing a still-scanned-out framebuffer (RmFB) turns the output off, so a smooth handover **leaks the FB**; an open DRM master wins over fbdev/fbcon; Plymouth hands over by stopping its ioctls and dropping master while keeping the framebuffer, and fbcon can briefly grab the screen between Plymouth and the display server.
- `plymouth quit --retain-splash` leaves the last frame on screen while the real display server starts: the only direct hit was a packaging commit that added it for display-manager services (openmamba, https://src.openmamba.org/rpms/plymouth/src/tag/0.9.3-2mamba [S]); I could not read the Plymouth README (gitlab blocked by Anubis), so its exact semantics are [U].
- Cost on a Pi: a Plymouth theme needs the daemon, libs and the theme in the initramfs; our own reports measure the initramfs read alone at ~0.75 s on a Pi 3B+ for the stock 11.7 MB image [R pi-os/05 §0 item 2]. Pi OS Lite trixie ships Plymouth only if installed [U]. An XP-style theme is feasible (the `script` module draws sprites and a bar; the `two-step` theme has a progress animation [U]), at a cost the reports already judge too high.

### 3.3 Seamless handoff to the Zinc app (rules that follow from the above)

1. One mode, set once: use the firmware mode (`simple-framebuffer`) or fix it with `video=` on the cmdline so `vc4` takes over without a second modeset [R pi-os/03 §5 plan 3, 6].
2. Whoever draws last before the app must **leave its framebuffer on the CRTC** (no RmFB, no `drmModeSetCrtc(…, 0)`), then drop master or exit; the next DRM master commits the same mode with its first frame ready.
3. The app's first commit must be a full atomic commit of the same mode and a frame that equals the splash's last frame; reading the current CRTC with `drmModeGetCrtc` gives mode and fb id to reuse [R pi-os/03 §5 plan 3]. Whether SDL3's kmsdrm backend does a blank-free modeset when the mode equals the current one is **[U]**: read `SDL_kmsdrmvideo.c` and measure with `drm.debug` on the Pi before relying on it. If it does not, the engine's `display-gl`/`display-fbdev` plugins (which already open `/dev/dri/card0`) can adopt the current CRTC.
4. Keep fbcon away: `fbcon=map:2` or no `console=tty1`, `vt.global_cursor_default=0`, and the Zinc session on tty1 with KD_GRAPHICS so no text console redraws between stages [R pi-os/07 item 4: SDL already sets KD/VT modes].
5. Backlight: on the official DSI panel, avoid anything that powers it down between stages (the vc4 DSI bring-up is the likeliest source of a visible blank) [R pi-os/03 §5 plan 5].

### 3.4 Can Zinc own the whole boot screen?

Yes, in two layers that fit the existing plan (`pi-os/00` "Splash" and `src/host/splash.cpp`, ZN-446, ZSP1 format with `minMs`/`fadeMs`, currently skipped on display plugins [R pi-os/01 §3]):

- **Layer 1, kernel, static (zero userspace cost):** custom `fullscreen_logo` TGA (XP-style logo on black) so something branded is on screen from the first kernel moments. Needs a tiny initramfs holding only the TGA (`initramfs zinc-splash.cpio.gz followkernel`), whose size is a few hundred KB, not the stock 11.7 MB [R pi-os/00 l.42; initramfs hook mechanism V rpi-splash-screen layer]. Alternative with no initramfs: logo compiled into the kernel (`CONFIG_LOGO`, 224-colour ppm), which suits the trimmed kernel step [R pi-os/03 §5 plan 2].
- **Layer 2, userspace, animated:** the first thing `zinc-session` runs. Two shapes:
  - **(a) the app is the splash** (the existing plan): the Zinc process opens DRM, draws the logo and bar from data embedded in the executable (no file reads), keeps animating on its own timer while it loads the program, and the program's first frame replaces it in the same process: no handover at all, no DRM master transfer, no black flash. The XP bar becomes a ZSP1 extension (`progress: marquee|value`) drawn by `splash.cpp`. It requires the engine splash to work on the display plugins (the open gap, `splash.cpp:187`) [R pi-os/01 §3].
  - **(b) a separate early binary** (`zinc-bootsplash`): a few-hundred-line static C (musl) program that does `drmModeGetCrtc`, draws into a dumb buffer, animates a marquee bar from a timer, listens on a FIFO/socket for "progress n" and "done", and on "done" drops master and exits leaving the FB. Started by systemd with `DefaultDependencies=no` before everything else, or directly as the first child of the session. It would start about as early as the kernel logo and cover the load time of a big `zinc` binary (18.6 MB for `bin/zinc` in the v0.8.0 tarball [R pi-updates-design.md, header]; at the ~15 MB/s firmware-side read rate seen on the Pi 3B+, page-in from the SD card is a visible fraction of a second [R pi-os/05 §0, arithmetic mine, U for runtime page-in]).
- **Should (b) be a Zinc AOT program?** An AOT Zinc program links zrt and the display plugin; its size, not its language, decides. If a splash AOT binary with only `display-fbdev` (CPU raster, KMS dumb buffers, no SDL, no GL) is a few MB static, it is a fair option and proves the engine on its own boot (and the XP bar is then Zinc code). If it pulls SDL3/Mesa, it defeats the purpose. The sizes are unmeasured: build it and look. Until then (b) in C is the safe form; (a) is the form with no handover risk.

### 3.5 Recommendation (boot screen)

1. **Decide by measurement, in this order:** (i) `disable_splash=1`, quiet cmdline, no fbcon; (ii) kernel `fullscreen_logo` TGA via a tiny logo-only initramfs (or compiled-in logo); (iii) make the engine splash work on display plugins and add the animated bar to ZSP1 (shape (a)); (iv) only if the app's exec-to-first-frame on the Pi 3B+ is more than about 0.5-1 s after the kernel logo, add `zinc-bootsplash` (shape (b)) for the gap.
2. **No Plymouth and no psplash** (agrees with `pi-os/00`): a daemon and an initramfs for something the app or a 30-line program does, plus the simpledrm/vc4 flicker issue.
3. **The XP look:** black background, centred logo, a three-block marquee bar sliding on a fixed-rate timer, independent of real progress (XP's bar was never real progress either), plus a fade-out (`fadeMs`) into the first frame of the app. Stay with the same pixel format and mode throughout.
4. Prove the "no black flash" claim with a high-speed camera or a GPIO/photodiode trigger (the white paper recommends a hardware trigger [R pi-os/03 S1]); a screenshot cannot see a blank frame.

## Recommendations for Zinc (final list)

1. Do not use GRUB, UEFI (pftf/rpi4, worproject/rpi5-uefi) or U-Boot on the Pi image: more stages, a menu, no gain for a one-kernel appliance.
2. Boot straight from the VideoCore firmware; A/B with `autoboot.txt` + `tryboot` + `[boot_partition=N]` `cmdline.txt`, hardware watchdog and `panic=10`; mark the slot good from the agent after the first frame. Verify on Pi 3B+, Zero 2 W, Pi 4, Pi 5 (Pi 3B+ and Zero 2 W are unverified).
3. Provision the EEPROM on Pi 4/5 once per board (`HDMI_DELAY=0`, `NET_INSTALL_AT_POWER_ON=0`, SD-first `BOOT_ORDER`, `BOOT_UART=0`); it cannot live in the image.
4. Keep the firmware stage honest: on a stock Pi 3B+ it is ~6.8 s with a 10 MB kernel and 11.7 MB initramfs; the wins are file size (trimmed kernel, no or tiny initramfs), not a different bootloader.
5. Ship no X and no Wayland compositor. SDL3 `kmsdrm` (display-gl / display-fbdev) is the display path; cage as an optional apt package for non-Zinc programs only. Ignore fbturbo, XLibre and tiny X servers.
6. Boot screen is Zinc's, not Plymouth's: `disable_splash=1`, quiet cmdline without fbcon text, a `fullscreen_logo` TGA from a tiny logo-only initramfs, then the engine splash with an animated XP-style bar as the app's first act, in the same process (no handover).
7. Only if the gap between the kernel logo and the app's first frame is visible: a small static `zinc-bootsplash` that adopts the CRTC, animates the bar, and leaves its framebuffer on screen for the app (leak the FB, drop master, never RmFB).
8. Make the engine adopt the firmware/previous mode (read `drmModeGetCrtc`, same mode, same fb or an identical first frame) so `vc4` and the app never do a second visible modeset; check what SDL3 kmsdrm does first.
9. Measure before deciding anything above that is marked [U]: time from power to first lit pixel, to logo, to bar, to first app frame on each board, with a camera or a trigger.

## Candidate `backlog/later.md` lines (listed here only; not added)

- ZN-?: measure power-on to first lit pixel, logo, bar and first app frame on Pi 3B+, Zero 2 W, Pi 4, Pi 5 with a camera or GPIO trigger, once, as the baseline for every boot-screen choice: all numbers in this report are estimates.
- ZN-?: verify `autoboot.txt` + `tryboot` A/B (`reboot '0 tryboot'`, clear-on-read, `[boot_partition=N]`) on the Pi 3B+ and Zero 2 W, and a bad-kernel and bad-rootfs fallback with the watchdog on all four boards; the update design depends on it.
- ZN-?: write the own A/B updater flow around `autoboot.txt` (write inactive slot, flip, tryboot, agent marks good) and decide RAUC only if signing or streaming needs it; Ubuntu's piboot-try is the reference.
- ZN-?: provisioning script for the Pi 4/5 EEPROM (`rpi-eeprom-config --apply` with `HDMI_DELAY=0`, `NET_INSTALL_AT_POWER_ON=0`, SD-first order), or a `recovery.bin` SD; the EEPROM cannot ship inside the image.
- ZN-?: make the engine splash (`src/host/splash.cpp`) draw on `display-fbdev` and `display-gl` and add an animated XP-style marquee bar to the ZSP1 format; today it skips display plugins, so the Pi image has no engine splash at all.
- ZN-?: kernel `fullscreen_logo` splash: logo-only initramfs (`logo.tga`, 24-bit, under 224 colours) and cmdline (`fullscreen_logo=1 fullscreen_logo_name=logo.tga vt.global_cursor_default=0`), measure its cost against the stock initramfs read (~0.75 s); a branded frame from the first kernel moments.
- ZN-?: read SDL3 `SDL_kmsdrmvideo.c` and the `display-gl`/`display-fbdev` DRM init, and test on the Pi 3B+ DSI panel whether opening DRM with the firmware mode causes a blank; if so, make the plugins adopt the current CRTC and framebuffer.
- ZN-?: build a splash-only Zinc AOT binary with `display-fbdev` and no SDL, measure its size and exec-to-first-pixel on the Pi 3B+; decides whether the early boot screen can itself be a Zinc program.
- ZN-?: measure RSS, boot cost and input-to-frame latency of SDL3 kmsdrm vs cage vs labwc (and Xorg for reference) with the same Zinc app on Pi 3B+ and Pi 4: no published number exists, and it settles the "ship a compositor?" question for good.
- ZN-?: optional apt package `zinc-cage` (cage + XWayland, kiosk unit) for showing non-Zinc programs on Pi 3+; compatibility feature, outside the boot path.
- ZN-?: Pi 5 splash that returns after abrupt power cuts despite `disable_splash=1` (DietPi forum): confirm on our Pi 5, document the workaround or accept it.

## Sources not reached

- Plymouth README and `plymouth-quit-wait` documentation (gitlab behind Anubis, freedesktop 403): `--retain-splash` semantics, theme costs and the `script` module are [U].
- Full text of RP-010196 (only the search snippet and our own earlier extraction, `pi-os/03`).
- Any measurement of U-Boot, cage, labwc or Xorg boot cost on a Pi.
