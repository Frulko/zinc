# Zinc Pi OS: synthesis of the research (2026-10-22)

Owner request (2026-10-22): a light, very fast booting OS for Raspberry Pi whose boot ends in a Zinc app: boot splash,
network started later so boot never waits, a control screen for the `zinc agent` daemon (discovery toggled on screen or by
a file on the boot partition like Raspberry Pi OS's `ssh` file, app sync), Wi-Fi setup in the app, preferences, system
info, network management, virtual keyboard on touch screens, mouse cursor, keyboard and mouse. Base undecided.
Research only: nothing built, nothing changed on a device. Sources: `01-zinc-inventory.md` (what Zinc has),
`02-base-system.md` (Buildroot/Yocto/Pi OS), `03-fast-boot.md` (budget), `04-system-services.md` (Wi-Fi, config, updates).

**Owner decision (2026-10-22): start from Raspberry Pi OS Lite** (trixie, 64-bit), customized for fast boot, keeping
apt (packages such as gphoto2) and Imager's first-boot customisation; Batocera and Home Assistant OS are good examples
but too heavy. The research below still holds as the reference for a later move to Buildroot; the Pi OS recipe and
the image tooling are in `05-pios-fast-boot.md` and `06-pios-tooling-and-references.md`.

## 0. Stage 1 on Raspberry Pi OS Lite: the plan

**Target, honestly:** about 5 s from power to the splash on a Pi 3B+ (05 §9: 6.5-8 s with the stock kernel, 4.5-5.5 s
with a trimmed kernel; estimates, nothing measured). Buildroot's 3-3.5 s stays out of reach on Pi OS because of
systemd's generators and sysinit work running beside the app, not because of the firmware.

**Build:** customise the official Pi OS Lite arm64 `.img` in place (pinned by URL + sha256) in a container on
CustoPiZer's model (loop mount + chroot + numbered scripts; our own container, 0.1), driven by one script `tools/pi-image` that
also writes the `.img.xz` and the Imager repository entry. Minutes on the Mac in Docker; in CI on GitHub's free arm64
runners if the repository is public (06 §1.4). pi-gen (hours, tens of GB) and rpi-image-gen (not Pi OS) are not needed.

**Recipe** (05 §8):
- First boot is Pi OS's own: initramfs (partition grow, new disk ID) and cloud-init (Imager's user, Wi-Fi, SSH key)
  run once. A last first-boot step disables cloud-init (`/etc/cloud/cloud-init.disabled`), converts the Wi-Fi to
  NetworkManager keyfiles, turns the initramfs off (`auto_initramfs=0`, `update_initramfs=no`) and drops `ds=nocloud`
  and `resize` from `cmdline.txt`. Imager entry: `init_format` of Pi OS (cloud-init), so its screen works unchanged.
- Every later boot: `config.txt` without probes (camera/display auto-detect off, DSI overlay named, `disable-bt`,
  `disable_splash=1`), `cmdline.txt` quiet with no console and `fsck.mode=skip`, the boot partition mounted lazily.
- Masked: wait-online, Bluetooth, keyboard/console setup, apt/man-db/logrotate/e2scrub timers, rpi-eeprom-update,
  getty@tty1. Purged: modemmanager, triggerhappy, man-db, udisks2, rpi-connect-lite.
- The app: `zinc-shell.service`, `DefaultDependencies=no`, `Type=notify`, owns tty1, sends `READY=1` after its first
  frame. NetworkManager (with `modprobe brcmfmac`), ssh, avahi, timesyncd, zram and `zinc agent` carry
  `After=zinc-shell.service`, so they start only once the splash is on screen.
- Step 2, after measuring: a trimmed kernel installed as `zinc-kernel8.img` (`kernel=` in `config.txt`, kernel
  packages held), and `Image` against `Image.gz` (the 2.6 s gap after the kernel read in Raspberry Pi's log).

**Settled between the reports:**
- Splash: the kernel's own (`fullscreen_logo=1` + `logo.tga`) needs an initramfs, which the recipe removes. Test first
  a separate tiny initramfs holding only the TGA (`initramfs zinc-splash.cpio.gz followkernel`): with no `/init`
  inside, the kernel mounts the real root as usual, and the read costs milliseconds [U: whether the logo code finds the
  file in time]. Otherwise the logo goes into the trimmed kernel (step 2), and until then the app's splash is the first
  image.
- cloud-init: run once then disabled (05), not purged with Imager's legacy `firstrun.sh` (06): the Pi OS path is the
  proven one, and only the first boot pays for it.
- Network: NetworkManager kept (deferred): Imager's Wi-Fi, a NetworkManager keyfile dropped on the boot partition
  (FullPageOS), the in-app Wi-Fi panel over its D-Bus API (KlipperScreen) and ZN-558's plan all use it.
  `wpa_supplicant` alone returns only with a Buildroot stage.
- Discovery: avahi kept (users expect `<hostname>.local`); on Pi OS the agent publishes `_zinc._tcp` through an avahi
  service file rather than its own responder on the same port, and the toggle writes or removes that file [U: avahi
  reloads the directory on change, else `avahi-daemon --reload`].
- Boot-partition files: `ssh` (Pi OS already), `zinc-agent` (consumed at boot like `ssh`), `zinc.txt` (`key=value`,
  DietPi model, secrets scrubbed after use, `mode=player|kiosk|dev`), a NetworkManager keyfile. Generated files carry
  a `# Maintained by Zinc` header (piCorePlayer) so hand edits and the shell coexist.
- Packages (gphoto2 and the rest): apt, as on any Pi OS; the image ships the libraries of the plugins (Mesa/EGL/GBM,
  libgphoto2, libturbojpeg, FFmpeg, libffi).

**What does not need a Pi** (the Pi is unavailable for now): the image tooling and recipe; the engine pieces (READY
after the first frame, the splash on display plugins, the evdev hub with hotplug, text from a keyboard with
libxkbcommon, the cursor in `display-fbdev`); the shell app itself, developed in a window on the Mac against simulated
backends; a boot of the image in QEMU `raspi3b` to check the unit ordering (no timing, no DSI). The measurements of
05 §10 wait for a board, ideally with a spare SD card.

### 0.1 Built (2026-10-22): `tools/pi-image`, the session, the player, the builder (`image/README.md`)

Owner requests of the day: build the image; the player runs all the time and shows the running app's crash and errors;
a tool written in Zinc that drives the whole pipeline (Docker, options like Raspberry Pi Imager's, presets per board,
libraries to pick) so that a build does not go through Claude; the Zinc apps follow `examples/GUIDELINES.md`.

- **Our own container, not CustoPiZer's.** `ghcr.io/octoprint/custopizer` refused an anonymous pull ("denied"), its
  Dockerfile installs `qemu-system` (about 1 GB) that a customise-in-place build never uses, and the development Mac is
  an Apple M1 Pro (arm64; `AGENTS.md` still says Intel), so the Pi OS chroot runs natively in a plain `debian:trixie`
  container. `image/build.sh` is about 150 lines: loop devices by offset (no partition nodes in a container), grow
  `p2` with `sfdisk`, chroot scripts, `fstrim`, `xz -T0`. Elsewhere the host's qemu binfmt runs the same chroot
  [U on an x86 host]. A build of Pi OS Lite 2026-10-06 + Mesa + FFmpeg + gphoto2 + the warmed player: 3 min 22 s, 789 MB `.img.xz`
  (4.69 GB extracted), measured once on the M1 Pro. The script directory is copied per build: bash reads a script as it
  runs it, and an edit of `image/` during a build derailed the first one.
- **Settings at build time go through Pi OS's own first boot**: the build writes `user-data`, `network-config` and
  `meta-data` (JSON, which is YAML) on the boot partition, as Imager does with `init_format: cloudinit-rpi`; Imager's
  customisation at flash time replaces them. `zinc-firstboot` deletes them after cloud-init applied them. Masked as
  well: `userconfig.service` (it switches the screen to tty8 to ask for a user).
- **The session supervises** (the owner's "always running player"): `zinc-session`, a bash loop under
  `zinc-shell.service`, runs the app and keeps running; a non-zero exit writes `/run/zinc/crash.txt` (status, time,
  last 80 lines) and starts the player, which shows it and exits 10 to restart the app. Only one process holds the DRM
  device at a time, so the player takes the screen back when the app ends instead of drawing over it. Gaps: the agent's
  `zinc device run` starts apps beside the session (the agent should hand them to it), and `Type=exec` with a 2 s
  `ExecStartPost` stands for `READY=1` until the engine sends it after its first frame.
- **First boot without compiling, and without network**: the image runs the player (and the app) once at build time as
  `zinc`, so its ZBC cache (`/var/lib/zinc/.zinc/cache/zbc/`, keyed by the entry's path) is ready at the first boot.
  It also compiles their native plugins: the Linux release ships none, and the first run of the player downloaded the
  pinned zig (367 MB) to build `svg` (its icons). On a Pi that would happen at the first boot, with the network
  deferred: the player would not start. The build deletes the toolchain afterwards (zinc downloads it again for a later
  plugin), and `tools/pi-image check` runs the player with `--network none`. A Linux release with prebuilt plugins per
  architecture would remove the need (to raise with the packaging work).
- **`tools/pi-image check`** opens a built image and checks it from the inside (32 checks): boot files, units
  (`systemd-analyze verify`), masks, deferral, the zinc user's groups, Mesa, and Zinc 0.6.2's arm64 binary running in the
  image's userland: `zinc --version`, `ldd` clean, the player compiled and drawn headless as `zinc`.
- **The builder** (`image/builder`, `zinc:ui`, desktop): the profile form, "Build the image", progress from the
  `::step n/total`, `::error`, `::done` lines `tools/pi-image` prints, the log, "Show in Finder", Raspberry Pi Imager.
  Profile at `~/.zinc/pi-image/profile.json`, mode 600, unknown keys kept. Libraries come from Pi OS's apt (arm64
  binaries): nothing to cross-compile for FFmpeg, GStreamer, libuv or gphoto2 on this base. Cross-compiling stays for
  Zinc plugins that link them (`zinc plugin-build --target`); a sysroot taken from the built image would give those
  builds the image's exact libraries (next step).
- **The player, second version** (owner: "a simple app, coloured background, welcoming, a message that invites to try
  it, a settings button"; "a nice slow animation, p5-like"; "network management is a separate plugin"; "Inter is fine"):
  rewritten on the display tree of `zinc:gfx` (music-tree's `core/`, copied: the image pins the 0.6.2 release, which cannot
  load a new std module; promoted to a shared module once a release carries it). Home with a 30 fps ambient animation and
  the next step (Wi-Fi, remote access, pairing code, `zinc dev --device`), crash page, settings (Wi-Fi with the on-screen
  keyboard, remote access, preferences, system), touch, mouse with a cursor and keyboard focus. Network status and Wi-Fi are
  the new plugin `zinc:network` (`plugins/network`, nmcli, `docs/plugins/network.md`); system changes go through
  `zinc-admin` (sudo for fixed verbs), the network through NetworkManager (a polkit rule for `zinc`). `tools/pi-image
  player` runs it on the Mac against a pretend Pi (`image/player/dev`).
- **The grid**: both apps follow its layout (`state`, `services`, `components`, `pages`, `constants`, README, complete
  `zinc.json`, T1 tests `pi_image_builder` and `pi_image_player` with goldens). The player now meets the two rules the
  first version missed: the display tree on `zinc:gfx`, and the idle check (`ZINC_PLAYER_TRACE_FRAMES=1`: the settings page
  draws at most 2 of 300 idle frames, the home page 30 of 60 for its animation; both in `pi_image_player`).
- **First boot on real Pis (owner, 2026-10-22: black screen on the official panel and on HDMI)**, reproduced on QEMU's virt
  machine (HVF, virtio GPU, the image's root file system with a Debian kernel) and fixed:
  - `zinc-shell.service` had `ExecStartPost=/bin/sleep 2` beside `StandardInput=tty-force` and `TTYVHangup=yes`: every
    command of a unit takes the TTY and hangs it up, so the post command SIGHUPed the session (restart loop every 3 s).
    Now `Type=notify`, `zinc-session` sends READY with `systemd-notify` 2 s after it starts.
  - `zinc-firstboot.service` was wanted by `multi-user.target` and ordered after `cloud-final.service`, itself after
    `multi-user.target`: systemd dropped it (cycle), so the first boot never ended. Now wanted by `cloud-final.service`.
  - The 0.6.2 engine's SDL window on Linux asks for OpenGL 3.2 core (the Pi's GPUs: vc4 2.1, v3d 3.1); the fallback then
    panics (`Parameter 'props' is invalid`, `hal_sdl.cpp:573`), and with `ZINC_RENDERER=cpu` SDL's KMSDRM draws but never
    takes the screen from fbcon (QEMU). The session now asks for `display-fbdev` (`ZINC_DISPLAY=fbdev`), the driver hero was
    measured with, compiled into the image at build time.
  - Compiling a plugin on the image after the build fails (`error: CacheCheckFailed` from zig, after the build deleted its
    toolchain): the first boot must find every native plugin compiled.
  - `zinc-report` (a file named `zinc-report` on the boot partition, put there by `"debug": true`) writes the boot's log,
    screens and timing to `zinc-report.txt` on the boot partition, which any computer reads. `docs/reports/pi-os/07-kiosk-session-practices.md`:
    how other kiosks run their app from systemd (sources).
- **Second boot on the Pi 3 B+ with the DSI panel (owner, 2026-10-23: the screen and the player show, Wi-Fi says
  NetworkManager is missing)**, read from `zinc-report.txt`:
  - `systemd-firstboot.service` waited to own `/dev/console`, which is tty1 when cmdline.txt names `console=tty1` last (the
    debug image keeps it; the default image moves it to tty3): the session holds tty1, so the boot stopped before
    `sysinit.target`, D-Bus and NetworkManager never started. Masked: the image has its locale, keymap, time zone and root.
  - cloud-init's local stage failed on the Pi and on QEMU: Pi OS's user rename (`userconf-pi`, then `cancel-rename`)
    enables and starts `getty@tty1`, masked by the image, so the profile's user got no SSH key. getty@tty1 is now kept off
    by a drop-in condition, and the session lost its `Conflicts=getty@tty1` (that start would have stopped it).
  - Proven on QEMU with the Pi's console layout (`console=tty1` last, root read-only first): one boot reaches multi-user (5 s of
    userspace), cloud-init without error, SSH as the profile's user with its key.
- **Third flash (owner, 2026-10-23)**: the first boot stopped before `multi-user.target` again (cloud-final and
  `zinc-firstboot` ran only on the second boot), cause unknown: the journal is volatile on Pi OS and the second boot's report
  replaced the first's. The second boot was clean (running, Wi-Fi joined, multi-user after 25 s of userspace). Now the report
  of the boot before stays as `zinc-report-previous.txt`, and the player's bottom line shows the job systemd runs while the boot
  starts, so the next first boot says where it stops. The differences with QEMU's first boot, which passes: the initramfs that
  grows the card, `rpi-resize`, `rpi-resize-swap-file` and the Wi-Fi chip.
- **`zinc dev --device` on the Pi**: the agent's programs had no screen driver (`panic: No available video device`, the SDL
  HAL) and the player held the screen. The agent unit now passes `ZINC_DISPLAY=fbdev` to them, and `zinc-session` closes the
  player while a process of the agent's cgroup has `/dev/fb0` or a DRM card open. The workstation accepts a device of the same
  series (0.6.x) and `--force` for another (`docs/reports/zinc-next-agent.md`). `examples/music-tree` needs `zinc:stage`, newer
  than 0.6.2: the image follows the next release.
- **Engine work this asks for**: the Linux SDL window should try GLES 2 when OpenGL 3.2 fails (the GLES 2 path of Android
  and webOS), its fallback must not panic, and SDL's KMSDRM present must take the screen; display-fbdev lacks text from a
  physical keyboard and a drawn mouse cursor, which the player's keyboard focus and the HDMI case need.
- **Not proven without a Pi**: the player's settings on the real system (sudo, polkit, nmcli as `zinc`, `iw reg get`),
  display-fbdev under the session on vc4 (proven by hand on spark, not from this unit).
- **Next**: a boot screen when the boot is not verbose (owner: "a boot screen like Windows XP's, as a build option"): a
  profile key (`bootScreen`), drawn by the engine's splash (`src/host/splash.cpp`) from the first frame of `zinc-session`
  with an animated bar, kept off by default so the fast boot stays the default.

## 1. The answer

- **Base: Buildroot** (`BR2_EXTERNAL` tree, built in a Linux container on the Mac, CI for release images). 65/70 against
  Yocto 57 and a modified Pi OS 40 (02 §5). The best published Pi boots are Buildroot images (Pi 3: 2.82 s to a Qt app;
  Zero 2 W: under 3.5 s); a trimmed Pi OS stays around 8-10 s on a Pi 3 because of systemd, the generic kernel and
  the 11.7 MB initramfs the firmware reads at about 6 MiB/s (03 §1, §7). The appliance products that own the screen
  (Home Assistant OS, Batocera, Recalbox, LibreELEC) made the same choice (02 §3).
- **No X, no Wayland**: the app draws through DRM/KMS; both Zinc drivers already run on the Pi 3B+ (01 §1). A Wayland
  kiosk compositor (`cage`) is only needed if non-Zinc graphical apps (a browser) must run: not planned.
- **Target: about 3-3.5 s from power to the splash on a Pi 3B+, about 4 s to an interactive screen** (03 §1, estimate
  from published stage times; nothing measured on our board yet). The 1.25 s of GPU firmware is a floor no base removes.
- **Zinc already has** the two display drivers, multitouch, a mature on-screen keyboard (`lib/std/kit/keyboard.tsx`), an
  adb-like agent with mDNS, PAKE pairing, push/run/logs and app OTA with rollback, `zinc:link` for on-screen pairing.
- **Zinc lacks** text input from a physical keyboard, input hotplug, a cursor in `display-fbdev`, the engine splash on
  display plugins, a Wi-Fi API, system controls (reboot, hostname, backlight, temperature), a runtime discovery toggle,
  mDNS that starts when the network comes up later, app switching on a single screen, and the shell app itself (01 §9).

## 2. Target architecture

SD card (layout fixed from the first public image, because repartitioning devices in the field is not possible):

| Partition | Content |
|---|---|
| p1 FAT `boot` (~64 MB) | `bootcode.bin`, `start.elf`/`fixup.dat`, `config.txt`, `cmdline.txt`, one DTB, one DSI overlay, `kernel8.img` (no initramfs); user files: `ssh`, `zinc-agent`, `zinc.txt`, `wpa_supplicant.conf` |
| p2 root, read-only erofs or squashfs | BusyBox, the shell app (exported Zinc binary), `zinc agent`, `zinc-helper`, wpa_supplicant, dhcpcd, dropbear, brcmfmac firmware and wireless-regdb, Mesa only if GPU apps are wanted |
| p3 `/data` ext4 (created and grown on first boot) | preferences, Wi-Fi credentials, agent keys, installed apps, logs, saved clock |
| (reserved for later) p2'/p3' | the B slots of the A/B updates (phase 3) |

Processes, in start order:

```
firmware ─ kernel (vc4, panel, ft5x06, mmc, erofs built in; quiet; no console)
  └─ PID 1 BusyBox init
       ├─ rcS: mount /data and tmpfs, clock floor, import the boot-partition files (ms, no network)
       ├─ respawn zinc-helper (root): unix socket, whitelisted verbs: reboot, poweroff, hostname, clock,
       │                              Wi-Fi country/rfkill, backlight
       ├─ respawn zinc-session (user zinc): shell app ⇄ launched apps; draws the splash first; touches /run/zinc/ready
       └─ once late.sh: waits for /run/zinc/ready, then modprobe brcmfmac, wpa_supplicant, dhcpcd,
                         zinc agent (if enabled), ntpd -q (clock), dropbear only if the ssh flag is set
```

Not on the image: systemd, udev, D-Bus, NetworkManager, avahi, polkit, PipeWire, BlueZ, cloud-init, getty, a package
manager. "Installing software" means a Zinc app pushed by `zinc agent`.

## 3. Proposed decisions

| Question | Choice | Why (report) | Revisit if |
|---|---|---|---|
| Base | Buildroot LTS, external tree in this repository | boot time, size, pinned sources, legal-info; one person can maintain it (02) | a board needs a vendor BSP only Yocto has |
| Init | BusyBox init: `respawn` relaunches the shell after a crash (ZN-665 for free), reaps processes, shuts down cleanly | 120 ms measured on an old Pi 3 kernel (03 §4); app as PID 1 saves it but makes us own reaping and shutdown | init measured above 50 ms |
| Display of the shell | `display-fbdev` on its KMS-plane path first: no Mesa in the boot path, no sysroot (ZN-334); add the KMS cursor plane to it | settings UI is well inside budget on CPU (15-19 ms at 800x480, 01 §1); `display-gl` stays for GPU apps | first-frame or CPU measurement favours GL |
| Input | keep the raw evdev readers, do the evdev hub with inotify hotplug (ZN-552), add libxkbcommon with compiled-in keymaps for text and layouts | no udev at boot (03 tech. 11); libxkbcommon is the proven layout library (04 §6) | touchpads with gestures are needed (then libinput, path backend) |
| Wi-Fi | wpa_supplicant over its `wpa_ctrl` socket | best tested on brcmfmac; iwd loses WPA3 and AP mode there; no D-Bus (04 §1) | iwd fixes brcmfmac external auth |
| IP | dhcpcd | eth + wlan, IPv4 link-local (cable Mac-Pi without DHCP), IPv6, ~1 MB (04 §2) | |
| Discovery | keep the agent's own responder (`src/net/dnssd.cpp`): add retry when an interface comes up, a runtime toggle that closes mDNS **and** the listener | already there; no avahi + dbus (04 §5) | |
| Boot-partition config | phase 1: `ssh`, `zinc-agent`, `zinc.txt` (`key=value` like `config.txt`), a dropped `wpa_supplicant.conf`; phase 3: Imager `init_format: cloudinit-rpi` with a subset parser of `user-data`/`network-config` | the habits Pi users know; Imager support once its files are captured from a real run (02 §2.8, 04 §4) | |
| SSH | dropbear, started only when the `ssh` flag or setting is on | under 1 MB, not resident (04 §5) | |
| Time | saved clock floor, then `ntpd -q` after the network, pairing and HTTP `Date` fallbacks | no RTC on Pi 3/4; TLS needs a sane clock (04 §5) | |
| Privileges | the UI runs as user `zinc` (groups video, input, audio); a small root helper with a verb whitelist | the UI never runs as root (04 §7) | |
| Updates | phase 1-2: reflash + app OTA (exists); phase 3: A/B with Pi `tryboot`, tool chosen then (SWUpdate or RAUC per the proven-libraries rule, or a thin flow in the agent) | tryboot on Pi 3B+ and Zero 2 W is unverified (04 §8); Bootlin and HAOS use RAUC (02 §2.6) | |

## 3b. Installing software without apt

Buildroot builds no binary packages and has no package manager on the target (Buildroot manual, FAQ "Why doesn't
Buildroot generate binary packages"). Answered by layers, each one only when someone needs it:

| Need | Answer | Cost at boot |
|---|---|---|
| An app (education, makers: the common case) | a Zinc app, pushed by `zinc agent` or installed from the shell | none |
| A system library a plugin needs | in the image, taken from the `pkg` lists of `plugins/*/plugin.json`: on Linux only four plugins need one, all in Buildroot (checked 2026-10-22 on buildroot master): `gphoto2` (libgphoto2 2.5.34, which pulls libusb, libxml2, libtool; jpeg-turbo 3.2.0 with TurboJPEG), `video` (ffmpeg), `display-gl` (mesa3d, libdrm), `ffi` (libffi). Buildroot's staging directory is then the sysroot the Mac cross-builds plugins against (ends the hand-filled sysroot of ZN-334). Camera access without udev: a BusyBox mdev rule giving user `zinc` the USB device nodes. The `gphoto2` command-line tool is not a Buildroot package: a small external package, or apt in developer mode | none (read when used) |
| A driver or bus (I2C, SPI, 1-wire, USB serial, common USB Wi-Fi/Ethernet dongles) | kernel modules and the whole overlay set shipped; enabled in `config.txt` as on Pi OS. `apt` could not install these anyway: the kernel is ours | none |
| Linux tools (python3, gpiozero, git, node, i2c-tools) | "developer mode" (shell toggle or boot flag): a Debian arm64 rootfs unpacked in `/data`, entered by `chroot` with `/dev`, `/proc`, `/sys` bound, `apt` inside, through ssh or `zinc device shell`. No daemon. Proven pattern: Home Assistant OS (Buildroot) runs its add-ons in containers, Batocera (Buildroot) adds flatpak, Chromebooks run Linux in a container | none: mounted on demand, it lives in `/data` |
| A whole Debian with the shell on top | a second flavour: Raspberry Pi OS Lite + the shell as a `.deb` (`zinc export --deb` exists) + a systemd unit. Slower boot (8-10 s), full apt. Its Wi-Fi goes through NetworkManager, so `zinc:wifi` then needs the NM backend ZN-558 planned | Pi OS boot |

A system package feed (opkg/deb built from our own tree) is the one thing Yocto would give natively: not needed while the
layers above hold. Developer mode and the Pi OS flavour are phase 3 work, built only on request.

## 3c. One image, three modes (not a "player" image and a "dev" image)

Two distributed images would double the CI, the tests and the support ("which one do I flash?"), and moving from one to
the other would mean reflashing. The dev tools cost nothing at boot (files on a read-only root, started only when
enabled), so one image carries everything and a mode decides what runs, as Android does with its developer options and
its kiosk (lock task) mode. Mode set in the shell or on the boot partition (`zinc-dev` flag file, `mode=`/`app=` in
`zinc.txt`).

| | Player (default) | Kiosk (Player option) | Dev (switch) |
|---|---|---|---|
| At boot | the shell: launcher + settings | one chosen app, shell hidden; leave it with a PIN or a gesture | the shell |
| `zinc agent` | per setting: receives apps and updates from a paired machine, no remote shell (`--no-shell`) | updates only, or off | discovery on, remote shell, `zinc dev --device` hot reload, logs, inspector |
| SSH | off | off | dropbear on |
| Linux tools | none | none | Debian chroot, downloaded into `/data` the first time it is turned on |
| Boot | quiet | quiet | quiet; verbose serial console as an option (costs boot time) |

A dedicated image remains right for one case: an installation or a product that must not carry the dev tools at all.
That is not a second distributed image but a build: a future `zinc image <project>` (same Buildroot tree, a fragment
without the shell, SSH and remote shell) that writes an SD image holding only that app, the hardware counterpart of
`zinc fuse`.

## 4. Boot budget, Pi 3B+

| Stage | Stock Pi OS (June 2026 firmware log + typical) | Our target | Main lever |
|---|---|---|---|
| ROM + bootcode | ~1.4 s | ~1.0 s | cut-down firmware if KMS and DSI still work (to test) |
| Firmware reads config, DT, kernel | ~5.4 s | 1.0-1.5 s | no initramfs (2-3 s), kernel trimmed to 4-5 MB (1-2 s), one overlay, no probes |
| Kernel to PID 1 | 2-4 s | 0.4-0.8 s | display and root drivers built in, Wi-Fi as a module loaded later, quiet |
| Init to first frame | 6-10 s | ~0.2 s | BusyBox init, splash drawn first by the app from data embedded in the binary |
| **Total to splash** | **~15-20 s** | **~3-3.5 s** | |

Splash (03 §5): `disable_splash=1` (no rainbow), optional custom kernel logo with the same artwork, then the app paints
the splash as its first act, re-using the mode the firmware set so the DSI panel does not blink. Plymouth and psplash
are rejected (a process more, and Plymouth's simpledrm flicker bug).

## 5. Work, by phase

Sizes from 01 §9 (S under a day, M a few days, L a week or more).

**Phase 0: measure (before writing the image).**
1. Baseline of the stock Pi 3B+ (`systemd-analyze`, the command is in 03 §6; the board did not answer today).
2. Time from exec to first frame of a stripped exported app on the Pi, `display-fbdev` and `display-gl`.
3. `raspberrypi3_64_defconfig` built in a container, boots; then no initramfs, trimmed kernel, the Zinc app started by
   init: first power-to-frame number (camera or GPIO), logged in `docs/reports/zinc-next-perf.md`.
4. Does `vc4` blank the DSI panel at handover? Does `start_cd.elf` keep KMS and DSI working?

**Phase 1: boot to Zinc.** External Buildroot tree (defconfig, kernel fragment, `config.txt`, `cmdline.txt`, erofs root,
`/data` first-boot creation, inittab, `zinc-session`), engine splash on display plugins (`splash.cpp:187`, M), evdev hub
with hotplug (ZN-552, M), text from a physical keyboard with libxkbcommon (L), cursor plane in `display-fbdev` (S-M),
exported binary stripped (S).

**Phase 2: the shell.** Launcher + settings app in `app/` (L): Wi-Fi (scan, join with the on-screen keyboard, forget,
country), network status, system info, display (brightness, blanking, rotation), agent screen (discovery on/off,
pairing code and QR, paired machines, unpair), about. Behind it: a Wi-Fi API on `wpa_ctrl` (L, amends ZN-558, which
planned NetworkManager over D-Bus; the NM backend stays for desktop Linux), system info additions (temperature,
throttling, storage: M), `zinc-helper` (M), backlight through sysfs (S-M), the agent as a system service with the
toggle and the mDNS retry (M), boot-partition files (S-M), dropbear and ntpd wiring (S), app switching (M-L: v1 is the
lazy one, the shell exits and `zinc-session` starts the chosen app, then the shell again; needs a "home" gesture or key
handled by the engine, since today only Esc quits).

**Phase 3: distribution.** Raspberry Pi Imager repository entry and the `cloudinit-rpi` subset parser, A/B updates,
image builds in CI, Zero 2 W, Pi 4 and Pi 5 configurations with their own measurements (the Pi 4/5 EEPROM settings need a
one-time provisioning step: 03 tech. 8).

## 6. Divergences between the reports, and how they were settled

| Point | Reports | Settled |
|---|---|---|
| PID 1 | 03: the app as `/sbin/init`; 02/04: BusyBox or tiny init | BusyBox init (crash relaunch, reaping, shutdown); measure it |
| Input library | 04: SDL3 KMSDRM input or libinput; 01: Zinc reads raw evdev, SDL is not used on the Pi | keep evdev, add libxkbcommon; no udev |
| mDNS | 04: embed mjansson/mdns | the agent already embeds `src/net/dnssd.cpp`: fix it, add nothing |
| Imager format | 02: `none` first; 04: `cloudinit-rpi` | `none` until phase 3, then `cloudinit-rpi` once the files are captured from a real Imager run |
| Hand-edited config | 04: `zinc.toml` | `zinc.txt` in `config.txt` style: no TOML library to vendor, familiar to Pi users |
| Update tool | 04: own flow in the agent; 02: RAUC | phase 3, after tryboot is verified on the Pi 3B+ |

## 7. Unknowns, to measure first

Pi 3B+ firmware stage without initramfs; `start_cd.elf` with KMS and DSI; `vc4` handover blanking; exec-to-first-frame
of a Zinc app on the Pi (never measured); brcmfmac load cost; tryboot on Pi 3B+ and Zero 2 W; the backlight sysfs name
of the official 7" panel on a current kernel; the files Imager 2.x writes for `cloudinit-rpi`; Buildroot first-build
time in a container on this Mac (03 §8, 04 open items, 02 §6).
