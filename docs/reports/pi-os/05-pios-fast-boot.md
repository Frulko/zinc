# Pi OS 05: the most aggressive fast-boot recipe on Raspberry Pi OS Lite (Trixie)

Research only, 2026-10-22. No file edited except this one, no device touched. Tags: [V] verified in a source I read this session (URL given), [U] unverified: inference, memory, or secondary source. Numbers are dated. Companion: `03-fast-boot.md` (generic budget), `04-system-services.md` (cloud-init, Imager).

## 0. Verdict in six lines

1. The Pi 3B+ firmware stage (bootcode, start.elf, config, overlays, kernel read) is the same on Pi OS and on Buildroot. On Raspberry Pi's own June 2026 log it is 6.79 s on a stock image, and ~4.5 s of that is the initramfs read (0.75 s), the kernel read (0.66 s) and a 2.6 s gap right after the kernel file is loaded (likely the firmware gunzipping `kernel8.img`, which is an `Image.gz`) [V log, inference U]. Base OS choice does not touch this; file sizes do.
2. Correction to report 03: the 6 MiB/s read rate came from a Zero 2 W (S5). The Pi 3B+ log gives ~15 MB/s for both the initramfs (11.7 MB in ~0.75 s) and the kernel (10.2 MB in ~0.66 s) [V log, arithmetic mine]. So the initramfs costs ~0.75 s of firmware read, not 2-3 s. It also costs kernel-side unpack plus its own udev/mount work (not measured on a Pi 3B+, [U]; Zero W: kernel phase 13.4 s to 3.98 s after dropping initramfs, udev and driver fixes together, Aug 2026 [V]).
3. Challenging 03's "Pi OS Lite stays at 8-10 s": that assumed the app starts after multi-user. With an early `DefaultDependencies=no` unit and the junk masked, systemd gets the app running ~0.5-1 s after PID 1 starts (Pi 3B Stretch Lite, 2018: kernel 0.67 s, service started 0.84 s into userspace, power-on to picture 3.5-4 s, but with a hand-built kernel, no USB, LZO, `start.elf` untouched [V]). My estimate for Pi 3B+ is 6.5-8 s stock kernel and 4.5-5.5 s custom kernel, versus 3-3.5 s for the Buildroot target in 03 (that one also assumes a smaller firmware stage; see section 9).
4. The measured cost of stock Trixie Lite is large and mostly cloud-init plus NetworkManager: Zero W Trixie 2 min 33.9 s total vs Bookworm 30.9 s to multi-user (Dec 2025 forum) [V]. On faster boards the same units cost 2-4 s (Pi 400, Dec 2025) [V].
5. Everything the Imager customises can survive: let cloud-init run once (first boot only, slow is fine) and write `/etc/cloud/cloud-init.disabled` at its end; keep the initramfs for that first boot only, then turn it off.
6. A PID 1 wrapper is not worth it before measuring; section 5.

## 1. Published boot times (all dated; none is a Zinc-style first frame except where stated)

| Board / OS | Number | Date | Source |
|---|---|---|---|
| Pi 3B+, stock Pi OS (Imager, cloud-init `ds=nocloud`), firmware log | config.txt read 1.41 s; initramfs 11.68 MB, kernel8.img 10.2 MB (`0x9af973`); "Starting ARM" at 6.79 s; cmdline `console=serial0,115200 console=tty1 ... fsck.repair=yes rootwait` | Jun 2026 | S1 (I extracted the PDF text) [V] |
| CM5, defaults | ~7 s to the OS; "large gains (measured in seconds) are not achievable" at the EEPROM stage | Jun 2026 | S1 [V] |
| Pi Zero W, Trixie 32-bit Lite stock | 2 min 33.9 s (kernel 13.4 s + user 2 min 20.5 s); multi-user at 1 min 42 s; cloud-init ~25 s on critical path + ~31 s cloud-final; NetworkManager 49 s (23 s after cloud-init removal: netplan generate ~13 s) | 2026-08-16 | S2 [V] |
| same, tuned | 34.8 s total: purge cloud-init, NM replaced by networkd+wpa_supplicant, `auto_initramfs=0`, `/boot/firmware` `nofail,x-systemd.automount`, fsck pass 0 (saved ~2.4 s), brcmfmac loaded early; kernel 13.4 to 3.98 s | 2026-08-16 | S2 [V] |
| Pi Zero 1 W, Trixie vs Bookworm 32-bit Lite | multi-user 1 min 32.5 s vs 30.96 s; Trixie: NM 38.7 s, cloud-init-local 10.8 s, cloud-init-main 24.4 s | 2025-12-06 | S3 [V] |
| Pi (rpi400 hostname) Trixie | graphical @13.6 s; NM +2.1 s, cloud-init-main +2.6 s, cloud-init-local +0.54 s (fast board: still ~5 s per boot of cloud-init+NM) | 2025-12-06 | S3 [V] |
| Pi Zero 2 W, Bookworm desktop | kernel 3.94 s / 6.67 s + userspace 18.1 s / 16.3 s; blame: man-db 15.2 s, hciuart 9.4 s, logrotate 8.5 s, exim4 6.4 s, e2scrub_reap 3.9 s, NM-wait-online 7.4 s | 2024-07-06 | S4 [V] |
| Pi 3B (Qiita), Raspbian, old kernel | 2.12+8.66 = 10.77 s; disabling bluetooth+hciuart: 1.84+4.15 = 6.0 s; plus `quiet`: 1.46+3.91 = 5.4 s (userspace only; add firmware ~2-5 s) | 2019-07-04 | S5 [V] |
| Pi 3B Stretch Lite, hand-tuned | kernel 0.669 s, userspace 1.225 s, camera service started 0.836 s into userspace, power-on to picture ~3.5-4 s, "bootloader+hardware ~1.5-2 s fixed" (the 2018 firmware was much faster than the 2026 log); kernel no USB, LZO (-0.3 s each), 12 services disabled, plymouth removed (-0.2 s) | 2018-08-01 | S6 [V] |
| Pi 4B, Pi OS desktop, SATA SSD, WiFi/BT off, OC | kernel 0.911 s + userspace 2.132 s = 3.04 s (firmware not counted) | 2021-06 | S7 [V] |
| Pi 4 EmulationStation, trimmed | 1.05 s kernel + 4.98 s userspace | undated | S8 (via 03) [U] |
| Pi 5, stock SD (slow card) | userspace 3 min 17 s (snapd, ModemManager, NM-wait-online...); a faster SD gave 40.7 s | 2025-01 | S9 [V] |
| DietPi vs Pi OS | MichaIng: RPi OS Lite on a Zero W above 2 min mostly cloud-init; "latest RPi OS images seem to have the always-on cloud-init solved"; DietPi 42% faster in a linked benchmark; Pi 5 "under 3 s vs over 15 s" (his claim, no data given) | 2026-08-24 | S10 [V thread, numbers U] |
| Pi 3 Buildroot-style | 2.82 s to Qt app (no USB/net), 1.75 s to shell, old kernel | ~2018 | S11 (via 03) [U] |

No camera-measured power-to-first-frame figure for Pi OS Lite on a 3B+ exists in anything I found; the stock Lite figure for the 3B+ is therefore an estimate (section 9) [U].

## 2. Unit inventory, Trixie Lite (what runs, what to do)

What defines a Trixie Lite image: `pi-gen` master (pushed 2026-10-06) stage lists S12 [V]: `cloud-init` + `rpi-cloud-init-mods` (stage2/04, only when `ENABLE_CLOUD_INIT=1`), `network-manager`, `wpasupplicant`, `raspberrypi-net-mods`, `avahi-daemon`, `bluez` + `bluez-firmware`, `rpi-swap` + `rpi-loop-utils` (replaces dphys-swapfile), `rpi-eeprom`, `man-db`, `udisks2`, `rpi-usb-gadget`, `rpi-connect-lite`, `rpifwcrypto`, `console-setup`, `keyboard-configuration`, `raspberrypi-sys-mods`, `systemd-timesyncd`, `ssh`, `modemmanager-` (explicitly not installed), no `triggerhappy`, no `rsyslog`, no `plymouth` in the lists [V absence from these lists; confirm with `dpkg -l` on a real image]. The enabled-unit list itself I could not read (no device): first command on a real image is `systemctl list-unit-files --state=enabled`; the table is built from the package lists and measured blame lines [U where marked].

raspberrypi-sys-mods (branch `pios/trixie`, default since 2026-09) [V S13]: units `regenerate_ssh_host_keys` (ConditionFirstBoot, ordered Before ssh), `rpi-resize` (ConditionFirstBoot, only `true` plus growfs), `sshswitch` (turns on ssh if `ssh` file on FAT), `apply_noobs_os_config`; `journald.conf.d/40-rpi-volatile-storage.conf` = `Storage=volatile`; `system.conf.d/40-rpi-enable-watchdog.conf` = `RuntimeWatchdogSec=1m`; `timesyncd.conf.d` `SaveIntervalSec=5m`; udev rule `86-rpi-trim.rules`; a `dpkg-limit` generator. No userconf/first-boot-wizard unit exists in this branch: user creation comes from cloud-init or `userconf.txt` [V list, U that nothing else creates users on Lite].

| Item | Cost (measured) | Action |
|---|---|---|
| cloud-init (4 units + generator) | Pi 400: ~3.1 s per boot; Zero W: ~56 s per boot; runs every boot, not only the first (S3, S10) [V] | Run once, then `touch /etc/cloud/cloud-init.disabled` (generator checks the file, S14 [V]; kernel alternative `cloud-init=disabled`). Option B: purge both packages and parse `user-data` ourselves (04 plan) |
| NetworkManager | +2.1 s (Pi 400), +38.7-49 s (Zero W); Pi OS patch runs `netplan generate` on each start (S2, S15 [V]) | Defer, not mask (section 5) |
| NetworkManager-wait-online | 7.4 s (Zero 2 W 2024, S4) | mask |
| ModemManager | 1.8-1.9 s (S4) | not in Lite list; `apt purge modemmanager` if present |
| hciuart / bluetooth | hciuart 9.4 s (S4), ~5 s (S5) | mask both; `dtoverlay=disable-bt` frees PL011 (S16 [V]); defer instead if BT provisioning is wanted |
| avahi-daemon | 4.6 s blame (S2) | defer (needed for `zinc device` mDNS) |
| triggerhappy | 0.1-0.3 s [U] | absent in current lists; purge if present |
| keyboard-setup, console-setup | small, serial in sysinit [U] | mask: console unused |
| man-db (timer) | 15.2 s (S4) | `apt purge man-db` (Zinc image has no manpages need) |
| logrotate.timer | 6.2-8.5 s at boot (S4) [V]: timer is `Persistent=true`, so it fires right after boot | mask (journald is volatile, no rsyslog) |
| apt-daily, apt-daily-upgrade | 0.7 s each, same Persistent catch-up (S9) [V] | mask both timers; update on demand |
| e2scrub_reap / e2scrub_all.timer | 3.9 s (S4) | mask |
| rpi-eeprom-update | 0.66-37.6 s (S9) [V] | mask on Pi 4/5; update by hand (`rpi-eeprom-update -a`) |
| udisks2 | 0.85-2.6 s (S4, S9) | `apt purge udisks2`; gphoto2 does not need it [U] |
| raspi-config.service | 1.4-2 s on Bookworm (S4) | mask if present (Trixie [U]) |
| rpi-swap (zram by default) | zram ~8 s blame on Zero W (S2) | keep zram on 512 MB boards (OOM; Hallard kept it); defer `systemd-zram-setup@zram0.service`; `Mechanism=none` on 1 GB+ is a [U] option in `/etc/rpi/swap.conf.d/` |
| systemd-timesyncd | 40-rpi-sync keeps a clock file | defer; no gating on time |
| getty@tty1 | trivial but owns tty1 | keep off by a drop-in condition (a mask breaks Pi OS's user rename: 00-synthesis) |
| polkit, wpa_supplicant | D-Bus activated | leave; they start with NM, i.e. after deferral |
| rpi-connect-lite, rpifwcrypto, usb-modeswitch, ntfs-3g, p7zip | disk only / user units | `apt purge rpi-connect-lite`; rest optional |
| systemd-udev-settle | "common hidden bottleneck", ~20 s on a Model B (S1) | not pulled by anything in Lite [U]; verify `systemd-analyze critical-chain` |
| /boot/firmware fsck | 2.4 s (S2) [V] | fstab pass 0 and `nofail,x-systemd.automount` |
| Must stay | apt/dpkg, `systemd-udevd` + trigger (device permissions, hotplug), journald (volatile), `ssh` (deferred), `systemd-logind` [U], dbus | |

Exact lines (all idempotent; `|| true` for units absent on a given image):

```sh
systemctl mask NetworkManager-wait-online.service hciuart.service bluetooth.service \
  keyboard-setup.service console-setup.service raspi-config.service rpi-eeprom-update.service \
  apt-daily.timer apt-daily-upgrade.timer man-db.timer logrotate.timer e2scrub_all.timer \
  e2scrub_reap.service dpkg-db-backup.timer getty@tty1.service apply_noobs_os_config.service
apt purge -y modemmanager triggerhappy man-db udisks2 rpi-connect-lite cloud-init rpi-cloud-init-mods  # last two: option B only
apt-get -s purge cloud-init rpi-cloud-init-mods   # run first: if it wants network-manager/netplan/rpi-usb-gadget, stop and mask instead (S2)
```

## 3. The initramfs

- Stock Pi OS (Bookworm and later) ships one, enabled by `auto_initramfs=1` in config.txt (pi-gen config template [V S17]; docs: firmware loads `initramfs8` for `kernel8.img`, S18 [V]). Raspberry Pi calls building it advanced and unsupported (S18 [V]).
- Not needed for boot: the Pi kernel has `EXT4_FS=y`, `VFAT_FS=y`, `MMC_BCM2835=y`, `MMC_SDHCI_IPROC=y`, `MMC_BCM2835_MMC=y`, `DEVTMPFS=y` in `bcm2711_defconfig` of `rpi-6.12.y` and `rpi-6.18.y` [V S19]; the kernel resolves `root=PARTUUID=...` itself without an initramfs [V, standard kernel feature]; Hallard booted Trixie with `auto_initramfs=0` (S2). Modules not built in: `vc4`, `v3d`, panel, `edt-ft5x06`, `brcmfmac`, overlayfs, squashfs, erofs (all `=m`) [V S19]; they load by udev modalias after PID 1, so display comes up only after udev coldplug. Put them in `/etc/modules-load.d/zinc.conf` (loaded by `systemd-modules-load` early in sysinit) as a stock-kernel stopgap; the custom kernel builds them in.
- What the Trixie initramfs actually does (raspberrypi-sys-mods `initramfs-tools`, S13 [V]): `resize_early` (only if ` resize` is in cmdline: `parted resizepart` of partition 2 to the end of the card), `set_partuuid` (random new disk ID, rewrites fstab and cmdline, removes ` resize`), `imager_fixup` (legacy `firstrun.sh`: rewrites `/boot/` to `/boot/firmware/` then `reboot -f`), `rpi_wd` (disarms the hardware watchdog unless `watchdog.open_timeout`). So without the initramfs: no first-boot partition grow, no disk-ID change (PARTUUID collisions if two cards share an ID), `systemd.run=/boot/firstrun.sh` Imager path breaks (cloud-init path is fine), watchdog not disarmed (firmware already printed "Watchdog stopped" in S1 [V]).
- Breaks without it: raspi-config "Overlay file system" (builds its own `boot=overlay` initramfs: `/etc/initramfs-tools/scripts/overlay`, `update-initramfs`, `initramfs ... ` line, `boot=overlay` in cmdline; read from `RPi-Distro/raspi-config` master, may be stale vs Trixie [V old, U Trixie]); `overlayroot`; LUKS/LVM/RAID root; USB-boot root (WP and Hallard say the same).
- Measured gain: firmware read 11.68 MB at ~15 MB/s = ~0.75 s on Pi 3B+ [V log]; plus unpack/init inside the kernel phase [U, 0.5-1.5 s guess]; no direct 3B+ A/B measurement exists. If it must stay, S1 advises `COMPRESS=zstd` in `initramfs.conf` and benchmarking `zcat` vs `unlz4` [V].
- Recipe: keep it for the first boot only (cmdline ` resize`, cloud-init), end the first boot with a oneshot that sets `auto_initramfs=0` in config.txt, deletes `initramfs8`/`initramfs_2712`, and sets `update_initramfs=no` in `/etc/initramfs-tools/update-initramfs.conf` (pi-gen itself does that at build, S20 [V]) so later `apt` kernel upgrades do not regenerate it. Cost: first boot slow (acceptable, it is the cloud-init boot anyway).

## 4. Custom kernel

- Source and install, from the official page (S21 [V]): `make bcm2711_defconfig` (`KERNEL=kernel8`, Pi 3 to Pi 5, 4K pages) or `bcm2712_defconfig` (`KERNEL=kernel_2712`, Pi 5, 16K pages); build `Image modules dtbs`; native docs copy `Image.gz`, cross docs copy `Image`, both to `/boot/firmware/$KERNEL.img`; modules via `modules_install` (`INSTALL_MOD_PATH=` when cross); DTBs and `overlays/` to the FAT. Pi 5 firmware prefers `kernel_2712.img`, falls back to `kernel8.img` (S18 [V]). `kernel=<name>` in config.txt selects any file name [V S18].
- Keeping apt off it: put the kernel at `/boot/firmware/zinc-kernel8.img` (`kernel=zinc-kernel8.img`, `auto_initramfs=0`) so nothing overwrites it, and hold what would overwrite DTBs/overlays or pull a kernel: `apt-mark hold linux-image-rpi-v8 linux-image-rpi-2712 linux-headers-rpi-v8 linux-headers-rpi-2712 $(dpkg -l 'linux-image-6*' | awk '/^ii/{print $2}')`. Do not hold `raspi-firmware`: it carries `bootcode.bin`/`start*.elf`/`fixup*.dat` updates; its `z50-raspi-firmware` kernel hook only fires on kernel package installs (it needs `/boot/firmware` mounted or it errors, seen on a Bookworm-to-Trixie upgrade, version 1:1.20250915-1 [V search result, S22]). Ship our own DTBs/overlays from the same tree. Modules dir `/lib/modules/<custom>` is separate; apt-installed `linux-image-*` leave `/lib/modules/6.12.x+rpt-*` as dead weight (purge them).
- What to cut, with sources: `KALLSYMS=n` (smaller image, loses oops symbols; S1 [V]); vc4, panel (TC358762), ft5x06, brcmfmac stays `=m` or deferred; `HW_RANDOM` is `=y` in the stock config [V S19], measured -0.7 s when off on an old Pi 3 kernel (S11 via 03 [U]); drop sound, media, extra filesystems, 29 RTC drivers (stock: ~35 `RTC_DRV_*=m`, harmless as modules but irrelevant) [V S19]; LZO instead of gzip saved ~0.3 s, no USB 0.3 s in 2018 (S6 [V]); gphoto2 needs USB so keep `USB` and `usbfs`.
- Image vs Image.gz is the cheapest kernel-size experiment and can be done on the STOCK kernel: stock `kernel8.img` is 10.2 MB (gzip), in the log the next stage ends 2.6 s after it is loaded [V S1]; with `zcat kernel8.img > Image` (~25 MB) the read costs 1.7 s at 15 MB/s but the 2.6 s gap may vanish [U: if the gap is the firmware gunzip it is a ~1.5 s win; if it is read speed it is a loss]. Test first (section 10).
- Expected gain (estimates, [U]): trimmed kernel 8.5 MiB uncompressed (S5/03) reads in ~0.6 s; kernel phase 1.8 s to 0.8-1.0 s (S6 got 0.67 s in 2018; Zero 2 W Buildroot 0.4 s, S5 via 03); modules built in remove the udev dependency for first frame. Total custom-kernel gain over stock kernel + recipe: 1.5-3 s on Pi 3B+. The stock kernel with cmdline and config.txt changes is the right first step; the custom kernel is step 2 once the numbers are in.

## 5. Starting the app early under systemd

Mechanics [V from systemd semantics unless tagged]:
- `DefaultDependencies=no` drops the implicit `After=basic.target sysinit.target` and `Conflicts/Before=shutdown.target`; the unit then starts as soon as its explicit `After=` jobs finish. `Type=notify` marks the unit started at `READY=1`; anything with `After=` on it waits for that (or for failure/`TimeoutStartSec`). The notify protocol is one datagram `READY=1` to `$NOTIFY_SOCKET`: no libsystemd needed.
- API filesystems (`/proc /sys /dev /run`) are mounted by PID 1 before any unit; `/dev` is devtmpfs auto-mounted by the kernel (`DEVTMPFS_MOUNT=y` [V S19]). `/dev/dri/card0` appears when `vc4` registers, but its group (`video`, mode 0660) and ACLs are applied by udev rules: before udev processes the event the node is `root:root 0600` [U]. So either run the app as root (first cut) or `ExecStartPre` waiting for `test -w /dev/dri/card0` after `After=systemd-udevd.service`. Input nodes (`/dev/input/event*`) need the same: use a hotplug-tolerant open loop, not a hard ordering. `dev-dri-card0.device` as a dependency is plausible but unverified [U].
- Needed ordering: `After=systemd-remount-fs.service` (root becomes rw, tens of ms), `systemd-tmpfiles-setup-dev.service` (static device nodes, group changes), `systemd-udevd.service` (only to shrink the permission race), `RequiresMountsFor=/usr /var/lib/zinc` (the root mount; costs nothing). Not needed: `local-fs.target`, `sysinit.target`, `network*`, `udev-settle`, `/boot/firmware`.
- CPU contention is the real cost: sysinit units (udev trigger, modules-load, tmpfiles, journald flush, zram, fsck) run in parallel with the app on 4 A53 cores. Trim them (section 2) and give the app `Nice=-10`.
- tty1: the unit takes it (`StandardInput=tty-force TTYPath=/dev/tty1 TTYReset=yes TTYVHangup=yes TTYVTDisallocate=yes`), and getty@tty1 is kept off by a drop-in condition (2026-10-23: a mask, with `Conflicts=`, broke Pi OS's user rename); `vt.global_cursor_default=0` hides the fbcon cursor.
- How soon: on the 2018 Pi 3B Stretch Lite the early service started at 0.836 s into userspace with 12 services disabled (S6 [V]); Trixie systemd 257 with more generators (`cloud-init-generator`, `rpi-swap-generator`, `dpkg-limit`, netplan) will be slower, [U] 1-1.5 s on Pi 3B+. Read the real number: `systemctl show -p UserspaceTimestampMonotonic -p GeneratorsStartTimestampMonotonic -p GeneratorsFinishTimestampMonotonic -p UnitsLoadFinishTimestampMonotonic -p ActiveEnterTimestampMonotonic zinc-shell.service`, and `systemd-analyze critical-chain zinc-shell.service`.
- Deferral: every unit that must wait gets `After=zinc-shell.service` in a drop-in; since both are in the same transaction (default target pulls them), systemd holds them until the app is READY or 20 s passed. `zinc-late.target` (Wants= the whole set, `After=zinc-shell.service`) is a convenience for the agent, not required. Failure of the app does not block the rest forever (timeout). Wi-Fi: `blacklist brcmfmac` in modprobe.d blocks the modalias autoload (modprobe.d(5)) while an explicit `modprobe brcmfmac` still works [V], so the NetworkManager drop-in does `ExecStartPre=-/sbin/modprobe brcmfmac` after the app is up. On Pi 3B+ the SDIO probe and firmware load are off the critical path from then on (Zero W measured 43.9 s to 14.4 s for Wi-Fi ready after changes, S2 [V]).
- PID 1 wrapper (`init=/usr/sbin/zinc-early`, fork the app, `exec /lib/systemd/systemd`): viable (this is how Plymouth survives into the real root: the daemon marks itself with a leading `@` in argv[0] so it is not killed at switch-root [U]), but: root is still `ro`, no `/run`, no cgroup, no udev, the app must be static or live on the root (it is: no initramfs), systemd then adopts it as an orphan in `init.scope` (no restart, no `READY`, no journald stdout), and shutdown kills it. Gain: the 0.3-1 s between kernel handover and the first unit start, [U]. Known bad idea? Not found in any source; it is simply unsupported by systemd. Defer until `systemd-analyze` shows PID1-to-app is the biggest remaining slice; the cleaner variant is a tiny initramfs `/init` doing the same, but that re-adds the initramfs read.

## 6. Filesystem, fsck, power loss

- Stock: root `ext4 defaults,noatime 0 1`, FAT `/boot/firmware vfat defaults 0 2`, cmdline `fsck.repair=yes` (pi-gen templates S17 [V]). The kernel mounts root read-only by default; `systemd-fsck-root` then `systemd-remount-fs`. Journal replay after unclean power off "can add several seconds" (S1 [V]); the FAT fsck cost 2.4 s on Zero W (S2 [V]).
- Fast options: `fsck.mode=skip` (systemd-fsck, [V man]) plus fstab pass 0/0; FAT `nofail,noatime,x-systemd.automount` (S2) so `/boot/firmware` is mounted lazily; ext4 `noatime` (already), optionally `commit=60`; S1 lists `data=writeback`, `commit=60`, `barrier=0` as faster but unsafe on power loss [V]; no `discard` on SD/eMMC, rely on `fstrim`/`86-rpi-trim.rules` [V]. `tune2fs -c 0 -i 0` disables periodic fsck (S1, "not recommended").
- Read-only root without an initramfs: raspi-config's overlay needs one (section 3). Without it: set root `ro` in fstab and cmdline (`ro` in cmdline; remember the kernel default is already ro, `rw` is what the stock cmdline lacks, so root goes rw only through `systemd-remount-fs`; with `ro` in fstab it stays ro), `tmpfs` on `/tmp`, `/var/log`, `/var/tmp`, `/var/lib/NetworkManager`, `/var/lib/systemd/timesync` (or bind to a data partition), `/etc/machine-id` and ssh host keys written at first boot before the lock, `systemd.volatile=state` (tmpfs `/var`, root untouched, [U] works without an initrd; `overlay` mode is [U] initrd-only). `apt`: a `zinc-rw` helper does `mount -o remount,rw /`, `apt`, back to `ro`. Data (settings, Wi-Fi, photos) on a third ext4 partition with `commit=60` or f2fs.
- What Pi OS gives for power-loss safety: ext4 journal, `fsck.repair=yes`, volatile journald (so no journal wear and no corruption of logs, [V S13]), and the raspi-config overlay; no A/B, no dm-verity, no `tryboot` use by default (tryboot exists in the Pi firmware: mentioned in 04 as open item). The hardware watchdog (`RuntimeWatchdogSec=1m` [V S13]) reboots a hung system but not a corrupt one.
- Journald: keep `Storage=volatile` (already). `Storage=none` and `ForwardToConsole=no` shave a little; keep volatile for support.

## 7. Splash

- `disable_splash=1` removes the firmware rainbow (S17-doc S18 [V]). Stock Pi OS Lite shows no Plymouth (no plymouth in the pi-gen lists [V absence]); the Desktop image has it. Do not add it: Plymouth plus simpledrm has a known flicker/handover issue (03 S17 [V via 03]) and adds a daemon.
- Cmdline: remove `console=serial0,115200 console=tty1`; add `quiet loglevel=3 logo.nologo vt.global_cursor_default=0 systemd.show_status=0 rd.systemd.show_status=0 consoleblank=0`. `quiet` sets level 4, "level 3 may be a good compromise" (S1 [V]); serial output "can be reduced significantly" by `quiet`; Qiita: `quiet` 6.0 to 5.4 s (S5 [V], old kernel). `CONFIG_LOGO=y` in the stock kernel [V S19]: `logo.nologo` hides Tux. Keep a `cmdline-debug.txt` with consoles for diagnostics; selecting it with `cmdline=` in config.txt is [U] (check the option exists in the doc).
- Handover: with `max_framebuffers` default the firmware creates a simple-framebuffer (`FB_SIMPLE=y`, S1/S19 [V]), `vc4` takes over when it probes, black frame at modeset. On the official 7" DSI, `dtoverlay=vc4-kms-dsi-7inch` includes the `edt-ft5406` touch and requires `vc4-kms-v3d` [V S16]; the app should open card0, read the current CRTC mode and paint its embedded splash as the very first frame (03 section 5). Do not set `max_framebuffers=0`: it disables the early framebuffer (S1 [V]).

## 8. The recipe as files

### 8.1 config.txt (Pi 3B+ / Zero 2 W / Pi 4 common part; Pi 5 differences marked)

```ini
# one overlay per need; every overlay is a file read + merge (~50-100 ms each in the S1 log)
auto_initramfs=0              # after first boot (section 3); gain ~0.75 s read + init work. Lost: overlay-fs/resize/LUKS
disable_splash=1              # no rainbow
camera_auto_detect=0          # S1: slow I2C probes; lost: auto camera overlay
display_auto_detect=0         # S1; so name the DSI overlay explicitly
force_eeprom_read=0           # S1 (HAT probe)
disable_poe_fan=1             # S1
dtparam=audio=off             # drops snd_bcm2835 load [U gain 0.1-0.3 s]
disable_fw_kms_setup=1        # already stock; kernel picks the mode
arm_boost=1
dtoverlay=vc4-kms-v3d,noaudio # add ,nohdmi on a DSI-only product [V param list]
dtoverlay=vc4-kms-dsi-7inch   # official 7" panel + touch (Pi 3B+ reference)
dtoverlay=disable-bt          # frees PL011, BT stack off the boot path [V]; lost: Bluetooth until re-enabled
#kernel=zinc-kernel8.img      # step 2 only
[pi5]
# kernel_2712.img default; 16K pages
```
No `initramfs` line, no `gpu_mem=16`/`start_cd.elf` until the cut-down firmware is tested with KMS (03 technique 10). Pi 4/5 EEPROM (provisioning step): `BOOT_ORDER=0xf1` (SD only), `BOOT_UART=0`, `NET_INSTALL_ENABLED=0`, `NET_INSTALL_AT_POWER_ON=0`, Pi 5 `PSU_MAX_CURRENT=5000` with a non-PD supply ("one of the larger single gains", S1 [V]).

### 8.2 cmdline.txt (single line)

```
root=PARTUUID=<id>-02 rootfstype=ext4 rootwait fsck.mode=skip quiet loglevel=3 logo.nologo vt.global_cursor_default=0 systemd.show_status=0 cfg80211.ieee80211_regdom=XX   # first boot: keep ds=nocloud;i=... and add " resize"; no console= entries
```
Gain 0.2-0.6 s (UART at 115200 plus fbcon scroll) [U magnitude]. The Imager-written `ds=nocloud;i=rpi-imager-<ts>` (seen in S1) stays on the first boot only; the final first-boot step rewrites cmdline.

### 8.3 Image-time and first-boot steps (one `zinc-firstboot-done` oneshot, `ConditionFirstBoot` not needed: guarded by a marker)

```sh
# cloud-init: let it run once (user, wifi, ssh key, locale from Imager), then stop forever
#   in user-data appended by the image: runcmd: [ touch /etc/cloud/cloud-init.disabled ]   (per-instance, runs in cloud-final) [U]
# Wi-Fi persistence: cloud-init stores netplan in /etc/netplan, NM only loads "netplan-" runtime profiles (S15). Convert to native keyfiles
#   in /etc/NetworkManager/system-connections/*.nmconnection (chmod 600), then `: > /etc/netplan/*.yaml` (S2 did the same)
sed -i 's/^auto_initramfs=.*/auto_initramfs=0/' /boot/firmware/config.txt
rm -f /boot/firmware/initramfs8 /boot/firmware/initramfs_2712
sed -i 's/^update_initramfs=.*/update_initramfs=no/' /etc/initramfs-tools/update-initramfs.conf
sed -i 's/ ds=nocloud[^ ]*//; s/ resize//' /boot/firmware/cmdline.txt
sed -i 's/ vfat defaults / vfat noatime,nofail,x-systemd.automount /; s/\(vfat .*\) 0 2/\1 0 0/' /etc/fstab
```

### 8.4 The app unit `/etc/systemd/system/zinc-shell.service`

```ini
[Unit]
Description=Zinc shell (first frame)
DefaultDependencies=no
After=systemd-remount-fs.service systemd-tmpfiles-setup-dev.service systemd-udevd.service
RequiresMountsFor=/usr /var/lib/zinc
Conflicts=getty@tty1.service shutdown.target
Before=shutdown.target

[Service]
Type=notify
NotifyAccess=main
User=root                        # first cut; then User=zinc SupplementaryGroups=video render input + ExecStartPre wait for /dev/dri/card0
ExecStartPre=/bin/sh -c 'i=0; while [ ! -w /dev/dri/card0 ] && [ $i -lt 100 ]; do sleep 0.02; i=$((i+1)); done'
ExecStart=/usr/bin/zinc shell --background-ready      # app sends READY=1 after the first frame is on screen
Nice=-10
Restart=on-failure
RestartSec=0.3
TimeoutStartSec=20
StandardInput=tty-force
TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```
Gain: starts at first-unit time instead of after `multi-user` (the 6-10 s the stock chain gives, S4/S6 [V]); lost: nothing until the app crashes loops (`Restart` keeps it alive; also a crash screen is the app's job).

### 8.5 Deferral drop-ins (generated for each name)

```ini
# /etc/systemd/system/<unit>.d/10-zinc-defer.conf  for: NetworkManager.service wpa_supplicant.service ssh.service
#   avahi-daemon.service systemd-timesyncd.service systemd-zram-setup@zram0.service zinc-agent.service (+ rpi-usb-gadget unit, [U] name)
[Unit]
After=zinc-shell.service
# NetworkManager.service additionally:
[Service]
ExecStartPre=-/sbin/modprobe brcmfmac
```
`/etc/modprobe.d/zinc-defer.conf`: `blacklist brcmfmac` (and `blacklist btbcm`, `blacklist hci_uart` if BT is deferred). `/etc/modules-load.d/zinc.conf` (stock kernel only): `vc4`, `edt-ft5x06`, `panel-simple` as needed [U module names for the 7" path: check `lsmod`].

### 8.6 Per-step gain / loss summary (estimates [U] unless noted)

| Step | Gain on Pi 3B+ | Lost |
|---|---|---|
| initramfs off after first boot | 0.75 s read [V] + 0.5-1.5 s | resize/overlay/LUKS |
| `Image` instead of `Image.gz` (test) | -1.5 to +1.0 s | bigger file (25 MB) |
| config.txt probes + overlays (3 to 2) | 0.2-0.6 s (Zero 2 W: 0.63 s for the probe group, S5 via 03) | auto camera/display |
| cmdline quiet/no console | 0.2-0.6 s | boot diagnostics (debug cmdline) |
| mask list + purge (section 2) | 3-8 s of userspace on Zero-class, 1-2 s on Pi 4/5 (S3, S4, S5) | man pages, udisks, auto-updates |
| cloud-init once | ~3 s (Pi 400) to 56 s (Zero W) per boot [V] | re-running Imager data on 2nd boot |
| early app unit + deferral | the biggest: app no longer after multi-user | none functionally |
| fsck skip, FAT lazy mount | ~0.3-2.4 s [V S2] | FAT not auto-checked |
| custom kernel (step 2) | 1.5-3 s | maintenance, apt hold |

## 9. Estimated time to first frame (power applied to the app's splash), ESTIMATES

Built from: S1 Pi 3B+ firmware log (6.79 s stock; initramfs read removed, config trimmed), S6/S7 userspace numbers, S2/S3 for stock penalties. Not measured on our images.

| Board | Stock kernel + recipe | Custom kernel + recipe | Basis / floor |
|---|---|---|---|
| Pi 3B+ (official 7" DSI) | 6.5-8.0 s (5.5-6.5 if `Image` test wins) | 4.5-5.5 s | firmware 4.0-5.3 s (1.4 s to config read + 0.7 s HDMI0/DSI init are fixed), kernel 1.8 s vs 0.9 s, userspace-to-frame 0.8-1.5 s |
| Zero 2 W | 7-9 s | 5-6 s | same SoC, 512 MB, slower SD habits; brcmfmac off the path |
| Pi 4 | 6-8 s | 5-6 s | EEPROM stage ~3 s [U] (HDMI delay, BOOT_ORDER), kernel 1.0 s, userspace 1.0-2.0 s (S7 gives 2.1 s tuned) |
| Pi 5 | 8-10 s default EEPROM; 6-8 s with `PSU_MAX_CURRENT` and `BOOT_ORDER=0xf1` | 6-7.5 s | CM5 ~7 s to OS with defaults (S1 [V]); floor is EEPROM/RP1, not the OS |

Compared with 03's Buildroot target (3-3.5 s on Pi 3B+): the Buildroot number needs a tiny kernel, no initramfs and a cut firmware set too; Pi OS with the recipe is ~1.5-2 s slower on the same hardware because of systemd generators/sysinit CPU contention and the larger rootfs, not because of firmware. If the product bar is 3 s on a Pi 3B+, only the Buildroot route or Pi OS plus `init=` wrapper plus custom kernel plus `start_cd.elf` can reach it; 5 s is realistic on Pi OS.

## 10. Measure first on the Pi 3B+ (in order; ~2 h)

1. Baseline, stock Trixie Lite, Imager image, second boot (first boot is the cloud-init boot): `systemd-analyze`, `systemd-analyze blame | head -25`, `systemd-analyze critical-chain`, `systemctl list-unit-files --state=enabled`, `dpkg -l | wc -l`, `vcgencmd bootloader_config` (n/a on Pi 3), `cat /boot/firmware/{config,cmdline}.txt`, UART `BOOT_UART` timestamps via `enable_uart` bootcode log or a GPIO toggle plus camera (S1 recommends a hardware trigger).
2. Firmware log (`vcdbg log msg` / `sudo vclog -m`) before/after `auto_initramfs=0`: confirm the ~0.75 s read and the kernel-stage gap.
3. A/B `Image` vs `Image.gz` as `kernel8.img` (stock kernel, `zcat` it): decide the 2.6 s gap question. Same for an LZO/zstd trimmed build later.
4. Add steps one at a time (mask list, cmdline, config.txt, app unit) with a dummy app that paints a solid colour through DRM and sends READY: record `systemctl show` timestamps listed in section 5 plus the camera time for the first colour. Check `/dev/dri/card0` permissions at that moment (root-only vs `video`) and whether `vc4` as a module (modules-load.d) or udev coldplug delays first light.
5. DSI handover: camera on the panel from power-on, three runs: black gap, flicker at vc4 modeset, with and without `disable-bt`, with `vc4-kms-v3d,nohdmi`.
6. Only then decide on the custom kernel and the PID 1 wrapper from the remaining slice sizes.

## Sources

- S1 Raspberry Pi Ltd, "Optimising boot time on Raspberry Pi SBCs", RP-010196, 1 Jun 2026; text extracted from the PDF by me; includes the Pi 3B+ log. https://pip-assets.raspberrypi.com/categories/685-app-notes-guides-whitepapers/documents/RP-010196-WP-1-Optimising%20boot%20time%20on%20Raspberry%20Pi%20single-board%20computers.pdf
- S2 Charles Hallard, "Speed up boot time on Pi Zero with Raspbian Trixie", 2026-08-16. https://hallard.me/speed-up-boot-time-on-pi-zero-with-raspbian-trixie/ (fetched as https://hallard.me/?p=4503)
- S3 Raspberry Pi forums, "Raspberry Pi OS Trixie 32bit lite - Boot time", 2025-12-06. https://forums.raspberrypi.com/viewtopic.php?t=394400
- S4 Raspberry Pi forums, "How do I make my rpi boot faster?", 2024-07-04..06. https://forums.raspberrypi.com/viewtopic.php?t=373247
- S5 Qiita, Raspberry Pi 3 Model B boot-time reduction, 2019-07-04. https://qiita.com/peace098beat/items/c95f0ba4d9edcf89b023
- S6 Himesh, "Fast boot with Raspberry Pi", 2018-08-01. http://himeshp.blogspot.com/2018/08/fast-boot-with-raspberry-pi.html
- S7 Raspberry Pi forums, "Booting up Raspberry Pi OS with Desktop in under 4 seconds", 2021-06-08. https://forums.raspberrypi.com/viewtopic.php?t=313463
- S8 RetroPie forum post 132298 (via 03). https://retropie.org.uk/forum/post/132298
- S9 Raspberry Pi forums, "slow boot PI5", 2024-12..2025-01. https://forums.raspberrypi.com/viewtopic.php?t=381016
- S10 DietPi forum, "Somebody benchmarked DietPi (against RPi OS)", 2026-08-22..24. https://dietpi.com/forum/t/somebody-benchmarked-dietpi-against-rpi-os/25442
- S11 Furkan Tokac, Pi 3 fastboot (via 03). https://www.furkantokac.com/rpi3-fast-boot-less-than-2-seconds/
- S12 RPi-Distro/pi-gen master (pushed 2026-10-06): stage0/02-firmware, stage1/00-boot-files, stage1/01-sys-tweaks, stage2/* package lists and run scripts. https://github.com/RPi-Distro/pi-gen
- S13 RPi-Distro/raspberrypi-sys-mods, branch `pios/trixie` (pushed 2026-09-28): `initramfs-tools/`, `debian/*.service`, `usr/lib/systemd/*.conf.d`. https://github.com/RPi-Distro/raspberrypi-sys-mods/tree/pios/trixie
- S14 cloud-init docs, "Disable cloud-init". https://docs.cloud-init.io/en/latest/howto/disable_cloud_init.html
- S15 Raspberry Pi, "cloud-init on Raspberry Pi OS" (Nov 2025 image; netplan/NM patches). https://www.raspberrypi.com/news/cloud-init-on-raspberry-pi-os/
- S16 raspberrypi/linux `rpi-6.12.y` overlays README (vc4-kms-dsi-7inch, vc4-kms-v3d params `noaudio`/`nohdmi`, disable-bt, disable-wifi). https://github.com/raspberrypi/linux/blob/rpi-6.12.y/arch/arm/boot/dts/overlays/README
- S17 pi-gen `stage1/00-boot-files/files/{config.txt,cmdline.txt}`, `stage1/01-sys-tweaks/files/fstab` (same repo as S12).
- S18 Raspberry Pi docs, config.txt (auto_initramfs, kernel names, os_prefix, arm_64bit). https://www.raspberrypi.com/documentation/computers/config_txt.html
- S19 raspberrypi/linux `arch/arm64/configs/bcm2711_defconfig` and `bcm2712_defconfig` on `rpi-6.12.y` and `rpi-6.18.y`. https://github.com/raspberrypi/linux
- S20 pi-gen `stage0/02-firmware/02-run.sh` (`update_initramfs=no`).
- S21 Raspberry Pi docs, "Linux kernel" (build, install, headers via apt, initramfs note). https://www.raspberrypi.com/documentation/computers/linux_kernel.html
- S22 forum.iobroker.net Bookworm-to-Trixie upgrade thread (z50-raspi-firmware error, raspi-firmware 1:1.20250915-1). https://forum.iobroker.net/topic/81187/upgrade-von-debian-12-bookworm-auf-debian-13-trixie/174
- Also read: raspberrypi/rpi-swap (modes, `/etc/rpi/swap.conf` `Mechanism=auto`, drop-ins) https://github.com/raspberrypi/rpi-swap ; RPi-Distro/raspi-config master (overlay implementation, possibly older than Trixie) https://github.com/RPi-Distro/raspi-config
