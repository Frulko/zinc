# Zinc Pi OS: which base system (research, 2026-10-22)

Question: base for a minimal, very fast booting Raspberry Pi image whose only user interface is a full-screen Zinc app (DRM/KMS), with `zinc agent`, flashed with Raspberry Pi Imager. Boards: Pi 3B+ (reference, 7" DSI), Zero 2 W, Pi 4, Pi 5, CM4/CM5. One developer, Intel Mac, no Linux host.
Legend: [V] seen in a fetched source today; [S] only in a search snippet or secondary source; [U] unverified, from general knowledge, check before relying on it.

## 1. Recommendation (short)

Buildroot, in a `BR2_EXTERNAL` tree, built in a Linux container (Docker/OrbStack on the Mac for iteration, GitHub Actions for release images). Zinc app as the one product; BusyBox or a tiny own init (no systemd); Pi firmware `tryboot` A/B with RAUC (or a 100-line own updater) as the OTA path; Imager repo JSON with a Zinc entry. No package manager on the device: "more software" means Zinc apps pushed by `zinc agent`, plus a documented rebuild for anyone who wants more.
Staged path: none needed between bases. Stage 1 = stock `raspberrypi3_64_defconfig` + Zinc package + a hand-trimmed kernel/config.txt, measure. Stage 2 = A/B + Imager entry + first-run parsing. Keep Yocto as the fallback only if Zinc ever needs a vendor BSP or a commercial support contract (it will not for these boards).

## 2. Evidence by criterion

### 2.1 Boot time actually achieved

- Furkan Tokac, Pi 3, Buildroot fork, camera-measured: power to Linux shell 1.75 s, power to Qt/QML app 2.82 s, against 10.17 s for a normal Buildroot image. Breakdown (normal -> optimised): firmware 1.25 -> 1.25 s, pre-boot DT handling 2.12 -> 0.25, kernel 5.12 -> 0.25, init 0.12 -> 0.00, Qt app 1.56 -> 1.07. Tricks: DTB appended to kernel, NET/SOUND/USB/debug options removed (HW_RANDOM alone 0.7 s), BusyBox removed and the app is `/sbin/init`, static link of Qt (-0.33 s). Cost: no USB, no network. https://www.furkantokac.com/rpi3-fast-boot-less-than-2-seconds/ [V]; reported by https://www.tomshardware.com/news/raspberry-pi-3-2-second-boot-time [S].
  Lesson: the GPU firmware stage (about 1.25 s on Pi 3) is a floor no OS base changes; everything after it is ours, and only an image where we control kernel config and PID 1 gets near it. USB (touch, keyboard) and network cannot be dropped for Zinc, so expect 3-5 s on a Pi 3B+ for a fully featured image [U: estimate, to be measured in stage 1].
- Raspberry Pi forum report: Buildroot about 4 s, Wi-Fi up about 10 s, against 30-45 s on the normal distribution (model and method not given). [S] (search result of 2026-10-22, forum thread not opened)
- Stock Raspberry Pi OS Lite: no systematic Pi 3/4/5 number found. Counter-example: Trixie Lite on a Pi Zero W took about 2.5 min on first boot, cloud-init and NetworkManager being the main culprits; 34.8 s after tuning. https://hallard.me/?p=4503 [S]. Pi OS needs systemd tuning, removal of cloud-init/NetworkManager/avahi/triggerhappy and so on to approach Buildroot, and the result is then a Pi OS nobody can upgrade with apt.
- Boot-delay knobs from the firmware itself (apply to any base): `boot_delay`, `disable_splash=1`, `BOOT_ORDER` in the EEPROM on Pi 4/5 (SD first). Pi 5 shows the splash again after abrupt power cuts despite `disable_splash=1` (open question). https://meta-raspberrypi.readthedocs.io/en/latest/_sources/extra-build-config.md.txt [S], https://dietpi.com/forum/t/raspberry-pi-5-boot-splash-screen-pink-white-returns-after-abrupt-power-cycles-despite-disable-splash-1/25298 [S].
- A University of Texas test plan for a Buildroot CM5 display sets "< 10 s to usable display" as target only. [S]
- No measured Pi 4 / Pi 5 Buildroot kiosk number was found. Zinc must produce its own (task: `systemd-analyze`-free measurement with a UART timestamp or a camera, logged in `docs/reports/zinc-next-perf.md`).

### 2.2 Image size

- Yocto core-image-minimal on meta-raspberrypi: 75 MB, boots in at most 12 s, no Wi-Fi drivers; rpi-hwup-image 142 MB, 18 s (2017 mailing list, old). https://www.yoctoproject.org/pipermail/yocto/2017-December/039206.html [S]
- Buildroot `raspberrypi5_defconfig` ships a 120 MB ext4 rootfs (includes the stock config, no Mesa, no Wi-Fi). https://raw.githubusercontent.com/buildroot/buildroot/master/configs/raspberrypi5_defconfig [V]. Expect 60-150 MB for Zinc + Mesa vc4/v3d + firmware blobs [U]; the Pi kernel modules and linux-firmware blobs dominate.
- Pi OS Lite and rpi-image-gen "slim": hundreds of MB (Debian userland, systemd, apt). No figure fetched; rpi-image-gen quick start builds `deb13-arm64-min`. https://github.com/raspberrypi/rpi-image-gen [V]. Alpine diskless: tens of MB base [U].

### 2.3 Hardware support (Pi firmware, KMS, Pi 5, Wi-Fi, DSI, audio)

- Buildroot `board/raspberrypi/` covers Zero 2 W, 3, CM3/CM3+, 4, 400, CM4/CM4S, 5, 500, CM5 with per-board `config_*.txt` and `cmdline` files, 32 and 64 bit variants. https://github.com/buildroot/buildroot/tree/master/board/raspberrypi [V]
- Pi 5: defconfig added June 2024; uses the downstream raspberrypi/linux kernel with `bcm2712_defconfig` and a fragment forcing 4 KB pages (the Pi 5 kernel default is 16 KB); serial `ttyAMA10`. https://lists.buildroot.org/pipermail/buildroot/2024-June/754814.html [S]; the current defconfig pins a raspberrypi/linux commit. [V]
- Pi firmware blobs in Buildroot: `BR2_PACKAGE_RPI_FIRMWARE`, kernel is the Pi downstream tree (needed for DSI panel, official touchscreen drivers, vcio/vcmailbox). [V for firmware/kernel; DSI/touch overlays: U, confirm `dtoverlay=vc4-kms-dsi-7inch` works with the Buildroot firmware package]
- Mesa vc4 (Pi 3) and v3d (Pi 4/5) gallium drivers, libdrm, libinput, ALSA, wpa_supplicant/iwd, avahi, dropbear/openssh, chrony: all are Buildroot packages [U: names from general knowledge, verify in `make menuconfig`]. brcmfmac firmware: via linux-firmware or a Pi-specific brcmfmac package [U].
- Yocto: `meta-raspberrypi` covers the same boards and is the reference BSP for several commercial products (Boot to Qt, balenaOS). https://meta-raspberrypi.readthedocs.io [S]
- Pi OS / pi-gen / rpi-image-gen: everything works by definition (same kernel, firmware, libcamera, Wi-Fi blobs, DSI overlays, RP1), the best support of all options.
- Alpine: Pi 3, 3+, 4, 400, Zero 2 W, CM3/3+/4, 5 listed on aarch64 (kernel `linux-rpi`); Pi 5 since Alpine 3.19. https://wiki.alpinelinux.org/wiki/Raspberry_Pi [S]. Alpine uses musl; Zinc is cross built with zig, so musl is a natural target, but plugins with vendored libraries (SDL3, mbedTLS, Mesa interop) need a check [U].

### 2.4 Build time and disk on the Mac; container and CI

- Buildroot and Yocto need a Linux host (no macOS host). The Mac is x86_64: a Linux amd64 container (Docker Desktop, OrbStack, Lima) runs without emulation, so build speed is near native; keep the Buildroot tree and `dl/` in a container volume, not a macOS bind mount (file-system overhead) [U, common advice]. Use ccache and `BR2_DL_DIR`/`BR2_CCACHE_DIR` volumes; a prebuilt external toolchain (Bootlin) removes the 10-20 min toolchain build [U].
- Buildroot minimal image first build on a 6-core: typically 30-60 min, then incremental minutes; disk 10-20 GB with sources [U: no source fetched]. Compare the engine's own 130 s warm build in AGENTS.md; the Zinc package is cross built with the pinned zig, so Buildroot only has to run a prebuilt `zinc` or a `zig`-driven package recipe.
- Yocto Wrynose (6.0, LTS to April 2030, released 2026-05) raises the host requirement to 32 GB RAM and 140 GB disk, mainly for LLVM. https://www.cnx-software.com/2026/05/14/yocto-project-6-0-wrynose-released-with-linux-6-18-lts/ [S]. A full Pi 4 image took about 3430 s on a 12-CPU machine and wanted about 50 GB (Thistle, 2023). https://docs.thistle.tech/thistle_yocto_build/getstarted/rpi [S]. Fits this Mac only barely and shares its heat budget (AGENTS.md: the limit is heat).
- rpi-image-gen: Linux only, arm64 Debian host (Bookworm/Trixie) is the supported setup; other hosts through QEMU "not formally supported"; needs `CAP_SYS_ADMIN` (container only with `--privileged`/unconfined); tools: bdebstrap, mmdebstrap, genimage. https://github.com/raspberrypi/rpi-image-gen [V]. On this Mac: a privileged amd64 container with QEMU user-mode emulation, slow and unsupported; CI on GitHub's arm64 runners [U: availability] is the sane route.
- pi-gen: Docker build supported by the project (`build-docker.sh`), uses QEMU on x86, about an hour for Lite [U].
- GitHub Actions: all options run there; Buildroot with ccache and a cached `dl/` is cheapest [U].

### 2.5 Maintenance burden for one person

- Buildroot: three-year LTS since 2025.02 (next LTS 2027.02), quarterly stable releases in between (2026.02 on 2026-03-04, 2026.05 released). https://buildroot.org/lts.html [V], https://en.wikipedia.org/wiki/Buildroot [S]. Upgrade = bump the Buildroot checkout, rebase a small external tree; kernel and firmware bumps are one-line commit-hash changes in the board config. Security: CVEs tracked by the project (`pkg-stats`); a rebuild ships the fix; the owner must ship the update (OTA).
- Yocto: LTS every two years, four-year support (Scarthgap 5.0 then Wrynose 6.0 to April 2030), but layers (poky, meta-openembedded, meta-raspberrypi) are separate repositories with their own branch matrix; recipe language and sstate cache are a steeper learning curve for a solo dev. https://www.cnx-software.com/2026/05/14/yocto-project-6-0-wrynose-released-with-linux-6-18-lts/ [S]
- Pi OS based (pi-gen, rpi-image-gen): lowest per-package burden: Debian security updates arrive through apt; but our image has to track Raspberry Pi OS's own repo and rebuild when it moves. rpi-image-gen: 1,371 commits, 953 stars, no releases or tags published, no A/B in the README; issue #308 (A/B shared-data sync can wipe persistent data) shows the A/B layer is young. https://github.com/raspberrypi/rpi-image-gen [V], https://github.com/raspberrypi/rpi-image-gen/issues/308 [S]
- Alpine: apk updates are small; musl differences are the tax. [U]

### 2.6 OTA updates

- Pi firmware A/B: `autoboot.txt` selects a boot partition; `tryboot` (set from userland through `vcmailbox`) boots the alternate configuration once and falls back at the next reset. Pi 5/CM5 have it in EEPROM; Ubuntu documents the same design (piboot-try); the bootloader itself is not protected, only DTB, overlays, kernel and initramfs. https://ubuntu.com/hardware/docs/boards/explanations/piboot-ab/ [S]
- Bootlin, RAUC on Pi 5 (2025-05-13, updated 2025-05-23), firmware tryboot with no U-Boot (U-Boot lacked PCIe for BCM2712): RAUC had no official Pi backend, so a custom backend edits `autoboot.txt` and sets the flag with `vcmailbox`; layout = vFAT with `autoboot.txt`, two boot partitions, two rootfs; uses `[boot_partition=N]` in `config.txt` (rpi-eeprom 2025-03-10, called experimental); mark-good logic is basic (the firmware does not count attempts); a 2026 comment notes `[all]` in `autoboot.txt` must only point to a slot that has booted. The kernel must be the Pi downstream tree for `vcio`. https://bootlin.com/?p=19769 [V]
- Home Assistant OS: RAUC, signed bundles, A/B slots, "readily available from Buildroot". https://developers.home-assistant.io/docs/operating-system/update-system [S]
- Mender: a forum thread argues `autoboot.txt` swap is not atomic and a single point of failure (opinion, unverified). https://hub.mender.io/t/using-autoboot-txt-on-raspberry-pi/6012 [S]. SWUpdate and Mender are available on Yocto (`meta-mender`, `meta-swupdate`) and RAUC/SWUpdate on Buildroot [U].
- rpi-image-gen has an `image-rota` layer: GPT A/B, read-only root, shared persistent partition, generates `autoboot.txt`; docs index https://raspberrypi.github.io/rpi-image-gen/layer/index.html [S]. apt-based systems can instead update in place (no rollback).
- Zinc fit: the update unit is mostly the app and its assets; the system image changes rarely. A small own updater (write inactive slot, flip `autoboot.txt`, `tryboot` reboot, mark good from the app after the first frame) is feasible and keeps RAUC optional [decision].

### 2.7 "Install more software later"

- Pi OS, rpi-image-gen, debos/mkosi Debian: apt works (Debian trixie base). Alpine: apk, with diskless mode needing `lbu commit` to persist changes. https://wiki.alpinelinux.org/wiki/Raspberry_Pi [S]. Buildroot and Yocto: no package manager; Batocera adds pacman/flatpak on a Buildroot base to compensate. https://gamingonlinux.com/2024/03/retro-gaming-linux-distribution-batocera-39-released [S]
- For Zinc users (education, makers) the thing they install is a Zinc app. System packages would be a support burden; the agent's app sync replaces apt. Power users get a documented Buildroot rebuild with their package added.

### 2.8 Raspberry Pi Imager integration

- Imager 2.0 (late 2025) reads a "Repository JSON V4": `imager` block + `os_list`; OS fields `name, description, icon, url, extract_size, extract_sha256, image_download_size, image_download_sha256, release_date, init_format, devices, capabilities`; a custom repo is set in the settings or with `--repo <url>`. https://www.raspberrypi.com/news/how-to-add-your-own-images-to-imager/ [V], https://man.archlinux.org/man/rpi-imager.1.en.txt [S]
- `init_format`: `none` (no customisation), `systemd` (legacy `firstrun.sh` on the boot partition, recommended for Raspberry Pi OS derivatives), `cloudinit` (NoCloud, needs cloud-init and Netplan network-config v2 reading the boot partition), `cloudinit-rpi` (also needs the `cc_raspberry_pi` module and a modified `raspi-config-vendor`), `rpi-preseed` (for images that ship the rpi-preseed package, Imager 2.0.11). https://raw.githubusercontent.com/raspberrypi/rpi-imager/main/doc/schema-notes.md [V]. What Imager writes per format is not documented in those notes; the Trixie article shows `meta-data`, `user-data` (`#cloud-config`), `network-config` (Netplan `wifis:` with `access-points`, `regulatory-domain`) as plain files in the FAT32 boot partition. https://www.raspberrypi.com/news/cloud-init-on-raspberry-pi-os/ [V]. `firstrun.sh` still works, no end date. [V]
- Capabilities such as `i2c`, `spi`, `rpi_connect`, `passwordless_sudo`, `usb_otg`. [V]
- Implication for a Buildroot image: no cloud-init (Python, large, slow). Cheapest compatible path: `init_format: "cloudinit"` and a tiny native parser in `zinc agent`/first-boot for the subset Imager emits (hostname, user, ssh keys, Wi-Fi `network-config`), or `init_format: "systemd"` and run `firstrun.sh` ourselves (it is a shell script: BusyBox sh can run it, but it calls Pi OS tools such as `raspi-config`, `imager_custom`, `nmcli` [U: confirm, so a shim would be needed]). Stage 1 uses `none` and puts Wi-Fi setup in the Zinc UI (needed anyway for a touchscreen-only device). The exact files for each format must be captured from a real Imager 2.x run [U].
- Raspberry Pi OS based images get all of it free (cloud-init is default in Trixie images from 2025-11-24). [V]

### 2.9 Licence compliance and reproducibility

- Buildroot `make legal-info` writes a CSV manifest, per-package licence files, a README of gaps and the source tarballs (not the toolchain or Buildroot source itself); a package without `<PKG>_LICENSE` shows "unknown". https://lists.buildroot.org/pipermail/buildroot/2012-May/356576.html [S, old]. Reproducible builds via `BR2_REPRODUCIBLE` [U].
- Yocto: per-image `license.manifest`, `create-spdx` SBOM, improved SBOM and CVE tracking in 6.0. https://www.cnx-software.com/2026/05/14/yocto-project-6-0-wrynose-released-with-linux-6-18-lts/ [S]. Yocto has the most mature reproducibility and SBOM story.
- rpi-image-gen generates SBOM and CVE reports. [V]. Debian images carry dpkg copyright files; the Raspberry Pi package repository is a supply-chain dependency (outside our control). [U]
- Zinc's own rule (never vendor an unproven component, licences in `third_party/`): Buildroot's source list is pinned by hash in each `.hash` file [U], satisfying that rule with the least work.

## 3. Reference projects

| Project | Base | Why (as far as sourced) |
|---|---|---|
| Home Assistant OS | Buildroot + RAUC | Cross building for SBCs, RAUC "readily available from Buildroot". https://developers.home-assistant.io/docs/operating-system [S] |
| Batocera | Buildroot (forked from Recalbox 2016), pacman and flatpak added | Appliance with emulators. https://gamingonlinux.com/2024/03/retro-gaming-linux-distribution-batocera-39-released [S] |
| Recalbox | Buildroot "from scratch", last release 2024-11 | same source [S] |
| LibreELEC / Lakka | Own build system (OpenELEC heritage), Lakka 6.1 on LibreELEC 12.2 and kernel 6.18 LTS | Appliance, no package manager. https://en.linuxadictos.com/Lakka-6.1-is-based-on-LibreELEC-12.2-and-the-Linux-kernel-6.18-LTS-to-gain-stability-and-compatibility.html [S] |
| balenaOS | Yocto (meta-balena, meta-raspberrypi) [U: not confirmed in this research] | Containers host OS |
| Qt Boot to Qt | Yocto; Pi 4 and Pi 5 64-bit; boots into a demo launcher or your app | Commercial vendor tooling. https://doc.qt.io/Boot2Qt-6.8/b2qt-qsg-raspberry.html [S] |
| Raspberry Pi webkiosk | rpi-image-gen example (Debian) | https://www.raspberrypi.com/news/introducing-rpi-image-gen-build-highly-customised-raspberry-pi-software-images/ [S] |
| flutter-pi, Slint, Volumio (Debian), Kano OS | not researched | mark unverified |

Pattern: appliance products that own the whole screen and ship updates themselves (HAOS, Batocera, Recalbox, LibreELEC) use Buildroot or a Buildroot-like system; vendors selling to industrial customers (Qt, balena) use Yocto; Debian-derived images appear where users are expected to install packages (Volumio, Pi OS).

## 4. Other bases, briefly

- Alpine diskless: small, fast to boot, apk, simple scripted image (`mkimage`, OpenRC). Weak points: musl, persistence model (`lbu`), no Pi-specific A/B tooling, Pi 3B+ DSI touch and vc4 would need checking. [S]
- Debian via debos or mkosi: gives apt and a reproducible recipe; mkosi needs a Linux host; both end in a systemd image that needs the same trimming as Pi OS; no Pi firmware integration beyond what you add. [U]
- piCore / Tiny Core: tiny RAM-loaded system, awkward extension model, small community, not researched further. [U]

## 5. Scores (RULES.md section 4: 1-5; fit x3, performance x3, size x2, maintainability x2, licence/supply x2, portability x1, effort x1; max 70)

| Option | Fit | Perf | Size | Maint | Licence | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| Buildroot + BR2_EXTERNAL | 5 | 5 | 5 | 4 | 5 | 4 | 3 | 65 |
| Yocto (Poky + meta-raspberrypi) | 4 | 5 | 4 | 3 | 5 | 5 | 1 | 57 |
| Alpine diskless | 3 | 4 | 5 | 3 | 4 | 3 | 3 | 51 |
| rpi-image-gen (Debian slim, image-rota) | 3 | 3 | 3 | 4 | 3 | 3 | 3 | 44 |
| debos / mkosi Debian | 3 | 3 | 3 | 4 | 3 | 3 | 3 | 44 |
| piCore | 2 | 4 | 5 | 2 | 3 | 2 | 2 | 42 |
| pi-gen / Pi OS Lite modified | 3 | 2 | 2 | 4 | 3 | 3 | 4 | 40 |

Notes on the scores:
- Fit: Buildroot and Yocto produce an appliance with a Zinc-owned PID 1, no package manager, our kernel config; Pi OS bases fit the Imager flow best but fight the "couple of seconds" target. Pi OS gets 3 because first-run customisation is free.
- Performance: set by the Buildroot/Furkan evidence in 2.1; Yocto equal in capability, Debian bases pay for systemd and the generic kernel/initramfs.
- Licence/supply: Buildroot and Yocto build everything from pinned sources; Debian bases depend on the Raspberry Pi and Debian repositories.
- Effort: Yocto 1 (140 GB, 32 GB RAM host, layer matrix); Buildroot 3 (kernel/firmware wiring and A/B are ours); Pi OS 4 (works at once, trimming is the work).
- The two Debian rows tie at 44 and are both beaten by 21 points; the ranking Buildroot > Yocto holds even if Buildroot effort is scored 2 (64) and Yocto effort 2 (58).

## 6. Risks and open items for Buildroot

1. Boot time on Pi 4/5 with USB, Wi-Fi and DSI is not documented anywhere found: measure in stage 1 (UART timestamps) and log in `zinc-next-perf.md`.
2. The Pi 5 EEPROM and `tryboot` semantics are young (Bootlin: experimental `[boot_partition=N]`, firmware does not count attempts, `[all]` pointing at a bad slot does not fall back): write the A/B test on a real Pi 5 and CM5 during the cross-platform pass (AGENTS.md defers it).
3. Imager `init_format` file formats: capture them from a real Imager 2.x run before writing the parser.
4. Zinc plugins that link vendored libraries (SDL3, mbedTLS, Mesa interop) must be checked against the libc chosen (glibc via Buildroot for least risk; musl later for size).
5. Buildroot LTS 2025.02 ends about early 2028 (inferred, not published); plan to move to 2027.02 LTS.
6. Pi OS-compatible developer variant (apt, ssh, full systemd) via rpi-image-gen can be added later as a second Imager entry if users ask; it does not change the base decision.

## 7. Sources not opened (search snippets only, treated as [S])

Phoronix/CNX/Hackaday coverage of rpi-image-gen (2025-03-21/23), tech.ifeng.com and linuxiac on Imager 2.0.11, Ubuntu piboot-ab doc, Thistle and Qbee RAUC pages, Alpine wiki, Wikipedia Buildroot.
