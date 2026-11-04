# Firmware-grade updates for the Zinc images: research (2026-10-27)

Research only, no code changed. Trigger: an update failed on a Pi 3B+ (1 GB) during the on-device rebuild
(`zinc pack`) in `image/files/usr/lib/zinc/zinc-player-update` (Python; downloads a signed engine tarball, rebuilds
the player, test-runs it, flips `current`, keeps `previous`). Marks: [V] verified in a fetched source, [S] seen in a
search snippet only, [U] unverified / from memory. The web search tool was shallow; several claims stay [U] and are
listed in section 7.

## 1. What appliances do

- **Bambu X1C.** No technical documentation of the update pipeline was found. Known: users can roll back in the
  app until Bambu removed old versions (a forum account, not an official statement) [S]
  (https://forum.bambulab.com/t/x1c-can-not-downgrade-fw-anymore/45093); a signed-firmware / authorization scheme
  exists, and its keys were extracted from the Bambu Connect app in 2025
  (https://wiki.rossmanngroup.com/wiki/Bambu_private_keys_leaked_less_than_24_hours_after_announcement) [S].
  A/B slots, delta, encryption: [U]. Do not copy the Bambu model; copy the generic pattern below.
- **Generic pattern (all appliances):** two copies of the OS, write the idle one, boot it once, confirm from userland,
  otherwise fall back. ChromeOS: active partition boots, the inactive one receives the update
  (https://android.googlesource.com/platform/system/update_engine/+/refs/heads/android17-release/README.md) [V-ish].
  Android A/B / virtual A/B: same idea, update_engine streams into the inactive slot
  (https://source.android.com/docs/core/ota/ab) [S]. Both are tied to AOSP/Chromium builds: not reusable.
- **Home Assistant OS = RAUC.** `.raucb` bundles with full partition images (no delta), slots A/B, bootloader per
  board: GRUB (`grubenv`, 3 attempts), U-Boot (env in a `hassos-bootstate` partition), Pi 5 via firmware tryboot
  with a custom RAUC backend; the Supervisor marks the slot good after start; the boot partition is outside A/B and
  updated in place; bundles verified against `/etc/rauc/keyring.pem`
  (https://contributors.home-assistant.io/os/operating-system/update-system/) [V]. This is the closest match to
  Zinc (hobbyist boards, Pi + others, no Docker needed for the OS layer).
- **Batocera, Steam Deck (A/B images via RAUC-like "atomic-update"), Kindle/reMarkable (A/B rootfs, own scripts):**
  [U] not researched; same pattern.

## 2. Frameworks

| Framework | License | Footprint / deps | Bootloaders | Model | Delta / streaming | Signing | NAND/UBI | Notes |
|---|---|---|---|---|---|---|---|---|
| **RAUC** | LGPL-2.1 [U] | C, glib, OpenSSL; daemon + CLI; kernel needs squashfs/dm-verity (verity bundles) [S] (github.com/rauc/rauc) | grub, barebox, U-Boot, EFI; custom backend script for others (Bootlin wrote one for Pi tryboot) [V] | A/B slots, grouped slots (boot+root), data partition | HTTP streaming with no scratch space via NBD (needs kernel NBD) [S]; "adaptive" 4 KiB block delta; casync/desync chunking needs temp space [S] (pengutronix.de blog, RAUC 1.7/1.8) | X.509 CMS (OpenSSL), PKCS#11; optional encryption [V] (rauc.readthedocs.io); **not Ed25519 raw keys** | ubifs, UBI volumes, raw NAND/NOR, JFFS2 [V] | Active (Pengutronix); Yocto/PTXdist/Buildroot recipes, but works on Debian (packaged) [U]; used by HAOS [V] |
| **SWUpdate** | GPL-2.0+ (lib LGPL) [conflicting sources, U] | C, config-driven (kconfig), small, Lua; no glib required [U] | U-Boot and GRUB (env), EFI Boot Guard; custom via Lua/scripts | A/B or recovery; very flexible handlers | streaming without temp copies [S]; zchunk delta over HTTP range [S] (thegoodpenguin.co.uk/?p=1652); rdiff | RSA/CMS, RSA-PSS, mbedTLS build, GPG [S] | UBI handlers incl. atomic `ubiswap`, `ubivol` autoresize [S] | Active (Stefano Babic / DENX); best NAND story; needs a Yocto/Buildroot-style build more than Debian [U] |
| **Mender** | Apache-2.0 (client, artifact) [S] | Go client, ~10+ MB binary [U]; ties to a server (hosted or self-hosted) | U-Boot/GRUB via integration; Pi via mender-convert [U] | A/B rootfs | full images; delta is a paid add-on [U] | artifact signing (RSA/ECDSA) [U] | UBI supported (Yocto) [U] | Server-centric; Mender forum notes autoboot.txt A/B "not atomic, single point of failure" and untested (https://hub.mender.io/t/using-autoboot-txt-on-raspberry-pi/6012) [V] |
| **OSTree / bootc** | LGPL-2.0+ [U] | C/glib, file-level hardlink store; bootc is container-image based (OCI): too big, Rust, systemd-centric | GRUB, U-Boot (via boot-loader-spec / uEnv), no Pi-firmware | file-based tree, atomic deployment switch, `/var` persistent | static deltas, pull of changed objects | **Ed25519 native** for commits and signed static deltas (ostree 2020.7+) (https://man.archlinux.org/man/ostree-static-delta.1.en) [V] | needs a normal filesystem (hardlinks, xattrs): **not on raw UBI/NAND flash directly** [U] | Good for apt-like distros; heavy for 512 MB / armv6; not tested on ARMv6 [U] |
| **Torizon** | OSTree + aktualizr-torizon (Uptane, MPL-2.0 [U]) | OSTree-based; boot counting via U-Boot `upgrade_available=1`, `bootlimit=3` [V] (developer.toradex.com/knowledge-base/torizoncore-overview) | U-Boot | OSTree deployments | OSTree deltas | Uptane (TUF-derived, offline roles) | n/a | Toradex hardware oriented; needs their server or self-hosted Uptane [U] |
| **balenaOS** | Apache-2.0 [U] | A/B rootfs (resin-rootA/B) + hostapp as Docker-style layers (mobynit) [V]; **host updates run via the Supervisor; standalone use is unsupported** (https://forums.balena.io/t/balenaos-standalone-update/86013) [S] | U-Boot/Pi | A/B | layer based | server-side | none | Rejected: depends on container runtime / their cloud |
| **hawkBit** | EPL-2.0 [U] | Java server only | n/a | n/a | n/a | n/a | n/a | A server for RAUC/SWUpdate; not needed (GitHub releases are our server) |
| **Memfault** | commercial SaaS + MIT SDK [U] | observability/OTA for MCU/Linux | n/a | n/a | n/a | n/a | n/a | Not an update engine for us |
| **casync / desync / zchunk** | LGPL-2.1 / BSD-3 / BSD-2 [U] | chunked content-addressed images over HTTP; desync is Go | n/a | transport only | yes (chunk dedupe, range requests); casync needs scratch [S] | external | n/a | Optional later layer under an A/B writer; RAUC already integrates casync/desync [S] |
| **Uptane / TUF** | spec (Apache/CC) | metadata format, roles, rollback/freeze protection | n/a | n/a | n/a | multi-role, offline keys | n/a | Zinc already uses a signed TUF-style index for plugins: reuse it for "what is the newest image/bundle" [U: exact format in repo not re-read] |

Other: ChromeOS/Android update_engine are AOSP/Chromium-only [S]; Batocera/Steam Deck/Kindle: not researched.

## 3. Raspberry Pi specifics

- **tryboot + autoboot.txt (firmware):** `autoboot.txt` sits in the first FAT partition; `boot_partition=N` picks the
  partition; `[tryboot]` section / `tryboot_a_b=1` lets a one-shot `sudo reboot "0 tryboot"` boot the other partition;
  the tryboot flag is cleared on read, so any power-cycle or watchdog reset returns to the default; commit = swap the
  `boot_partition` values in `autoboot.txt` (https://raspberrypi.com/documentation/computers/config_txt.html) [V].
  The firmware has no boot counter: "good" or "bad" only (Bootlin,
  https://bootlin.com/?p=19769) [V]. Bootable partitions must be FAT; on Pi 5 `config.txt` marks a partition bootable
  [V]. `[boot_partition=N]` conditional in config.txt came with rpi-eeprom 2025-03-10 and is "experimental" [V].
  Ubuntu enabled the same A/B boot (current/old/new asset folders + tryboot) on "all Pi models Ubuntu supports"
  from 25.10 (https://ubuntu.com/hardware/docs/boards/explanations/piboot-ab/) [V]; it relies on
  `dtparam=watchdog=on` and `panic=10` to fall back [V]. A July 2026 kernel patch series adds tryboot to the firmware
  driver, tested on Pi 5 only, author thinks "all Raspberry Pis" [S] (lkml.rescloud.iu.edu/2607.3/12945.html).
- **Which models:** Pi 4/5/CM4/400 use the EEPROM bootloader; all other models (Pi 1, 2, 3, Zero, Zero 2) boot from
  `bootcode.bin` on the SD card [V] (raspberrypi.com documentation, boot EEPROM section). Whether Pi 3 / Zero 2 honour
  `tryboot` is **[U]**: the docs fetched give no model list; Ubuntu's claim covers Ubuntu-supported models (Pi 2 v1.2+,
  3, 4, 5, Zero 2). **Pi 1 / original Zero: no evidence of tryboot support: assume absent [U].** The Pi 5 EEPROM
  itself has no A/B [V].
- **Without tryboot (Pi 1, Zero, maybe 3):** options (a) U-Boot loaded by the firmware (`kernel=u-boot.bin`),
  with `boot.scr`, `bootcount`/`bootlimit`/`altbootcmd` and an env file on FAT (U-Boot bootcount doc
  https://docs.u-boot-project.org/en/latest/_sources/api/bootcount.rst.txt [V]: counter, `upgrade_available`,
  `altbootcmd` when the limit is passed, FAT/ext-backed storage); mainline U-Boot has Pi 1/Zero/3 defconfigs [U]; this is
  how Raspberry Pi boards run under RAUC/HAOS/Mender in Yocto [S]. (b) Firmware-only "config swap": the
  firmware reads `config.txt` -> `kernel=`/`cmdline.txt`; an initramfs-less scheme where userland rewrites a
  `cmdline.txt` root=, and boot counting is done by the kernel booting an initramfs stage (small shell) that counts
  attempts in a file on FAT and rewrites config.txt. Works everywhere, but the FAT write is not atomic, so the rule
  is: write `new` file then rename (FAT rename is not guaranteed atomic either; keep a checksum + two copies) [U].
- **Pi Foundation tooling:** `rpi-image-gen` and `rpi-sb-provisioner` exist (secure boot, image generation); no
  A/B updater of their own was found. Not researched in depth [U].
- **Bootlin result worth reusing:** RAUC without U-Boot on Pi 5: custom bootloader backend with `get-primary`,
  `set-primary`, `get-state`, `set-state`, reading/writing `autoboot.txt`, each slot = vFAT boot partition + rootfs
  [V].

## 4. CHIP (Allwinner R8, armv7, raw NAND)

- NAND is SLC raw: needs UBI/UBIFS. Mainline U-Boot and kernel cannot drive the CHIP's NAND; NTC's patched kernel and
  U-Boot can (https://linux-sunxi.org/NextThingCo_CHIP) [V]. postmarketOS notes UBIFS rootfs + fastboot flashing
  and NTC's downstream kernel (https://gitlab.postmarketos.org/postmarketOS/pmaports/-/merge_requests/1098) [V].
- Existing layouts: meta-sunxi/meta-chip build UBI images with ubinize and boot `ubi.mtd=4` with a `chip-rootfs`
  volume; CHIP Pro U-Boot keeps its env in a `uboot-env` UBI volume; MTD map: spl, spl-backup, uboot, uboot-backup,
  UBI [S]. No A/B for CHIP existed in anything found. Buildroot CHIP defconfig: not found [U].
- A/B on UBI is natural: two volumes `rootfs_a` / `rootfs_b` (+ `data`) in one UBI device; an update writes a whole
  volume with the UBI update ioctl (atomic per volume: interrupted -> volume marked invalid). RAUC supports
  `ubivol`/`ubifs` slots and SWUpdate has `ubivol` plus the atomic `ubiswap` [V/S]. U-Boot env redundancy (two env
  copies in UBI volumes) gives power-cut-safe boot-count.
- Squashfs on `ubiblock` (read-only) + overlay for `/var` avoids UBIFS write amplification on rootfs; no
  hardlink/xattr needs, so image-based (not OSTree) is the right class for NAND.
- Risk: the NTC kernel is old; RAUC's verity bundles need a newer kernel (dm-verity + NBD for streaming) [S]: check the
  kernel config; a non-verity (crypt-only / signature on whole bundle) bundle format still works but needs scratch
  space for verification [U].

## 5. Why the current updater failed, and the root issue

The updater compiles on the device (`zinc pack` of the player, line ~211): CPU, RAM, thermal and SD wear all scale
badly on a 1 GB Pi 3 and are impossible on 512 MB boards. Fix independent of any framework: **never build on the
device**. CI produces, per architecture and per player version, ready-to-run artifacts (engine + player `.zapp`
already packed), signed; the device only downloads, verifies, stages, test-starts and flips. That alone removes the
failure class seen today.

## 6. Recommendation

**Three layers, one concept: immutable artifact, signed on CI, installed into an inactive slot, boot/start once,
"mark good" from the player, else fall back.**

| Layer | What | Update path | Cadence |
|---|---|---|---|
| L0 Bootloader / firmware | Pi firmware (`bootcode.bin`, `start*.elf`, EEPROM), U-Boot, SPL | not A/B-protected; updated rarely, with the OS image, in the shared boot FAT; Pi 5 EEPROM is out of scope | almost never |
| L1 System image | kernel, rootfs (read-only squashfs/ext4), systemd units, apt-installed libs | **A/B slots via RAUC** (bundle = vfat boot + rootfs image, per board `compatible`) | quarterly |
| L2 Engine + apps | `/usr/lib/zinc/engine-X.Y.Z`, player `.zapp`, apps (already symlink-flipped `current`/`previous`) | the existing symlink model, but **artifacts prebuilt on CI**; installed on the data partition, verified Ed25519, started in a probation window (service must send `READY=1` + health, else symlink flips back automatically and the generation is marked bad) | weekly |

Layout: `boot` FAT (A) + `rootfs A`, `boot` FAT (B) + `rootfs B` (Pi) or UBI volumes `rootfs_a/rootfs_b` (CHIP), a
`data` partition (apps, engine generations, Wi-Fi, logs; grown at first boot; survives L1 updates).

Options scored (1 poor - 5 good):

| | A. RAUC (L1) + Zinc symlink bundles (L2) | B. SWUpdate (L1) + Zinc bundles (L2) | C. Own minimal slot updater (all) | D. OSTree/bootc |
|---|---|---|---|---|
| Fit (Pi 3+, Pi1/Zero, CHIP, Pi 5, handhelds) | 5 (U-Boot, UBI, custom Pi backend; HAOS proves Pi + tryboot) | 5 (best NAND/UBI, U-Boot) | 3 | 2 (no raw NAND, heavy) |
| Footprint (RAM/flash) | 4 (C + glib + OpenSSL; few MB) [U numbers] | 5 (smallest, kconfig) | 5 | 1 |
| Robustness (proven in the field) | 5 (HAOS, many Yocto products) | 5 | 2 (new code, power-cut bugs) | 4 |
| Effort | 3 (backend for Pi tryboot, Debian packaging, certs) | 3 (sw-description, Debian build) | 2 (writing 3 bootloader backends) | 1 |
| Licence/policy ("vendor proven, don't reinvent") | 5 (LGPL, called as a separate process) | 4 (GPL-2.0+ binary used as a program; check) | 1 (reinvents) | 3 |
| Signing fit (we use Ed25519) | 3 (X.509 CMS: one CA cert Zinc controls; Ed25519 gate stays in front) | 3 (RSA/CMS) | 5 | 5 |
| **Total** | **25** | 25 | 18 | 16 |

RAUC and SWUpdate tie. **Pick A, RAUC**, because: HAOS documents exactly our shape (Pi + generic boards, signed
bundles, mark-good from the app, data partition), Pi tryboot has a published RAUC backend recipe (Bootlin), streaming
install needs no scratch space on 512 MB boards (needs NBD in the kernel [S]), and it is packaged for Debian-style
systems [U]. Keep SWUpdate as the fallback for CHIP if RAUC's `ubivol` or verity bundles do not fit the NTC kernel.
Run RAUC as an external program (separate license boundary). Zinc keeps its own signature in front: release
manifest signed by the existing Ed25519 key (TUF index), and the RAUC bundle certificate is a second, device-embedded
CA; the updater verifies both, so Ed25519 remains the root of trust and RAUC's X.509 is an implementation detail.

Per hardware:
- **Pi 4/5 (and Zero 2/3 if tryboot works there [U]):** firmware tryboot, RAUC custom backend, `autoboot.txt`, FAT boot
  partition per slot, `panic=10` and watchdog on.
- **Pi 1 / Zero / any Pi where tryboot is not available:** firmware loads U-Boot (`kernel=u-boot.bin`), U-Boot env
  on FAT (`bootcount`, `bootlimit=3`, `altbootcmd`, `upgrade_available`), RAUC `bootloader=uboot`. Costs ~1 s boot
  time [U]; accept it, or measure first.
- **CHIP:** NTC U-Boot (env redundant in UBI), UBI volumes A/B, RAUC `ubivol` slots (or SWUpdate `ubivol`).
- **Later handhelds:** whatever U-Boot-based board supports the same U-Boot env scheme -> same bundle format, only
  `compatible` and slot map differ.

Rollback rules (same on all): kernel/boot failure -> bootloader count or watchdog returns to the old slot; kernel up
but the player never says `mark-good` within N seconds -> reboot into the old slot; L2 failure -> symlink flip back
without a reboot. Never write to the booted slot; never edit boot FAT in place without writing a new file then
renaming; keep the boot files of the non-active slot untouched.

Suggested order of work (not tasks): (1) CI builds and signs prebuilt player/engine bundles; replace `zinc pack` on
device with install-and-probe (fixes today's failure, ~1 week, no framework); (2) A/B image build for Pi 3/4/5 with
RAUC; (3) U-Boot variant for Pi 1/Zero; (4) CHIP UBI variant. Streaming: use HTTP range-based RAUC streaming on
512 MB boards; otherwise download to the data partition.

## 7. Unverified / to check before building

- tryboot support on Pi 3 / Zero 2 / Pi 2; any support on Pi 1 / Zero (test on hardware, or read the Raspberry Pi
  "TRYBOOT boot flow" section of the documentation beyond char 100000 of the fetched page).
- RAUC and SWUpdate exact licences, RAM/flash numbers on armv6/armv7, Debian package availability (trixie, armhf/armv6).
- Whether the NTC kernel (CHIP) has dm-verity, NBD, squashfs and what UBI ioctl version; whether U-Boot (NTC) can
  use `bootcount` with a UBI-stored env.
- Mender client size and delta licensing; Bambu internals; Steam Deck / Batocera / reMarkable mechanisms.
- RAUC accepting Ed25519 certificates (OpenSSL supports them; CMS signing with Ed25519 depends on the OpenSSL version).

## Sources

- https://raspberrypi.com/documentation/computers/config_txt.html (autoboot.txt, tryboot_a_b)
- https://ubuntu.com/hardware/docs/boards/explanations/piboot-ab/
- https://bootlin.com/?p=19769 (RAUC + tryboot on Pi 5)
- https://hub.mender.io/t/using-autoboot-txt-on-raspberry-pi/6012
- https://contributors.home-assistant.io/os/operating-system/update-system/
- https://rauc.readthedocs.io/en/latest/ ; https://pengutronix.de/en/blog/2022-07-15-rauc-v1-7-released.html ; https://rauc.readthedocs.io/en/v1.8/changes.html
- https://www.thegoodpenguin.co.uk/?p=1652 ; https://developer.ridgerun.com/wiki/index.php/Integration_of_Zchunk_Delta_Updates_in_SWUpdate_within_Yocto_for_NVIDIA_Jetson_Platforms
- https://github.com/sbabic/swupdate/releases
- https://man.archlinux.org/man/ostree-static-delta.1.en
- https://developer.toradex.com/knowledge-base/torizoncore-overview
- https://forums.balena.io/t/balenaos-standalone-update/86013 ; https://os-docs.balena.io/architecture
- https://docs.u-boot-project.org/en/latest/_sources/api/bootcount.rst.txt
- https://linux-sunxi.org/NextThingCo_CHIP ; https://gitlab.postmarketos.org/postmarketOS/pmaports/-/merge_requests/1098
- https://forum.bambulab.com/t/x1c-can-not-downgrade-fw-anymore/45093 ; https://wiki.rossmanngroup.com/wiki/Bambu_private_keys_leaked_less_than_24_hours_after_announcement
- https://source.android.com/docs/core/ota/ab ; https://android.googlesource.com/platform/system/update_engine/+/refs/heads/android17-release/README.md
