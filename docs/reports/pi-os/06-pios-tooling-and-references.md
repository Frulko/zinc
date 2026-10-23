# Zinc Pi OS: image tooling on top of Raspberry Pi OS Lite, and light reference systems (research, 2026-10-22)

Context: the owner chose Raspberry Pi OS Lite (Debian 13 trixie, arm64, apt kept) as the base, customised for fast boot (see 02-base-system.md for pi-gen/rpi-image-gen basics and Imager `init_format`; not repeated).
Legend: [V] verified today in a fetched page, in repo files read through `gh api`, or in repo metadata; [S] search snippet or second-hand; [U] unverified, general knowledge, check before relying on it.
Dates of "pushed"/"release" come from `gh api repos/<r>` on 2026-10-22.

## Part 1. Tooling to produce the customised image

### 1.1 Facts per tool

**pi-gen** (https://github.com/RPi-Distro/pi-gen)
- Branches: `master` = 32-bit, `arm64` = 64-bit, plus `bookworm`, `bookworm-arm64`, older. Both default `RELEASE=trixie`; `IMG_NAME` default `raspios-trixie-arm64` on the arm64 branch. Last push 2026-10-06 (`master` merged into `arm64` the same day); no GitHub releases, tags like `2026-04-13-raspios-trixie-arm64` exist [S: Chromium mirror]. [V]
- It is the tool that makes the official images: stages 0-2 = Lite, 3-5 = desktop; `STAGE_LIST="stage0 stage1 stage2 mystage"` (paths may be outside the repo), `SKIP`/`SKIP_IMAGES` marker files, `CONTINUE=1`, `CLEAN=1`, `PRESERVE_CONTAINER=1`, `PIGEN_DOCKER_OPTS`. `DEPLOY_COMPRESSION=none|zip|gz|xz`, `COMPRESSION_LEVEL`. `ENABLE_CLOUD_INIT=1` default (installs cloud-init + netplan, reads boot-partition files on first boot). `ENABLE_SSH`, `FIRST_USER_NAME/PASS`, `TARGET_HOSTNAME`, `WPA_COUNTRY`, `DISABLE_FIRST_BOOT_USER_RENAME`. [V README]
- Docker: `build-docker.sh`, `--privileged`. On the arm64 branch the Docker base is plain `docker.io/debian:trixie` with no `--platform` (so an amd64 container on this Mac; only the arm64 chroot runs under qemu-user); on `master` an x86_64/aarch64 host gets a 32-bit `i386/debian:trixie` base. The README says that with Docker the container registers `qemu-arm` itself if the host's binfmt is missing; native (non-qemu) builds are "not supported". [V build-docker.sh, README]
- Cost: `WORK_DIR` keeps a full copy of the target per stage, "tens of gigabytes" [V]. No build time published. [U] Estimate for Lite only (stages 0-2) under qemu on a 6-core x86: 1 to 2 hours; native arm64 about 20 to 40 minutes.
- Purging/masking/config: you write stage scripts (`00-packages`, `01-run.sh` with `on_chroot`), so unwanted packages are never installed (edit the stage2 package lists in a fork or in `STAGE_LIST` copies) and `config.txt`/`cmdline.txt` are written by a stage script. Kernel: Pi kernel packages come from the stage package lists; hold/replace by script. [U for details, mechanism V from README]
- Maintenance when Pi OS moves: we track upstream (merge `arm64`); our stage dir sits outside the tree, so the diff is only our stage plus a list tweak. A fork of stage2 lists means conflicts at each upstream change.

**rpi-image-gen** (https://github.com/raspberrypi/rpi-image-gen)
- State: v2.8.0 released 2026-08-13, pushed today (2026-10-22), 953 stars, `master`. Docs at https://raspberrypi.github.io/rpi-image-gen/ (config, layer, trait, execution, provisioning). [V gh api]
- Host: supported = arm64 Debian/Pi OS; `getting_started.adoc` has an explicit section "Building on Ubuntu or Debian amd64: while not officially supported, cross building works well" (install `binfmt-support qemu-user-static debian-archive-keyring`, `sudo ./install_deps.sh`). Needs `CAP_SYS_ADMIN` (mmdebstrap mounts). Containers "not formally supported", need `--privileged` or unconfined. [V]
- Its own CI (`.github/workflows/build.yml`) has two jobs: `ubuntu-24.04-arm` (native, 120 min timeout) building `trixie-minbase`, `trixie-minbase-ab`, a `slim` CI config and the examples `slim`, `webkiosk`, `ota`; and `ubuntu-24.04` x86 with qemu-user-static + binfmt building `trixie-minbase`. So x86+qemu is exercised upstream, native arm64 is the main path. [V]
- Model: YAML config + layers (`layer/`, `device/pi3|pi4|pi5|zero2w|cm4|cm5`, `image/gpt|mbr`), `-S <srcdir>` for our own layers, hooks `customize*`, `packages:` list, `env:` block, `include:`. Examples in tree: `webkiosk` (Cage + Chromium on Wayland, systemd service, A/B), `splash-screen`, `custom_kernel`, `reproducible_debfs` (Debian snapshot URLs via a generator; rootfs reproducible), `ota`, `signed_ota`, `multi-user-kiosk`, `debstore`, `nested_image`. Layers `rpi-splash-screen`, `rpi-microboot-base`, `image-rota`, `rpi-ab-slot-mapper`. SBOM + CVE reports; `SOURCE_DATE_EPOCH` is set in CI. Output `.img` (genimage), no xz step and **no Imager JSON** in what I read (`bin/image2json` is the IDP provisioning description, not the Imager list). [V trees, examples, workflow]
- Not Pi OS Lite: it builds Debian trixie `minbase` plus the Raspberry Pi archive (`layer/rpi/debian/trixie/apt.yaml`) plus a chosen kernel; result is a much smaller userland than Lite, but a different image, so first-boot files, `raspi-config`, userconf, rpi-first-boot-wizard differ [U: check]. The owner's decision (Lite) is not what it builds.
- Docker: no ready-made container recipe found; a privileged amd64 Debian container with qemu binfmt would follow the "amd64" doc path [U].

**CustomPiOS** (https://github.com/guysoft/CustomPiOS)
- Opens an official image, enlarges, runs module scripts (`start_chroot_script`, `filesystem/` overlay, `config`) in a qemu chroot, shrinks (`BASE_IMAGE_ENLARGEROOT`, `BASE_IMAGE_RESIZEROOT`), zips. Release 2.0.0 2026-07-14, pushed 2026-09-08, branch `devel`. Base list `src/images.yml`: Raspberry Pi OS lite/full armhf and arm64 (+ Armbian via http). [V]
- Docker: `build_docker`, `docker-compose.yml` in `src/`; Vagrant fallback. Trixie not mentioned in README; `network` module comments say "Enable Network Manager boot folder support (bookworm)" and keep `NETWORK_WPA_SUPPLICANT=no` for "pre rpios bookworm". [V]
- Imager: `src/custompios_core/make_rpi-imager-snipplet.py` builds `rpi-imager-snipplet.json` from `RPI_IMAGER_NAME/DESCRIPTION/ICON/WEBSITE` and the produced `.zip` (name, description, url, icon, release_date, extract_sha256...). It writes no `init_format`/`devices`; we would add them. [V file read]
- Users: OctoPi (1.2.0 config read), FullPageOS (0.14.0, 2025-07-14, armhf lite, X11 Chromium), MainsailOS, Zynthian, FluiddPi, ~20 more. [V]

**CustoPiZer** (https://github.com/OctoPrint/CustoPiZer, release 1.5.0 2026-06-18, pushed 2026-10-13) [V]
- The stripped-down descendant of CustomPiOS for end users: put `input.img` and `scripts/` (numbered shell scripts, `scripts/files/` mounted at `/files`) in a workspace, run `docker run --rm --privileged -v ws:/CustoPiZer/workspace ghcr.io/octoprint/custopizer:latest`, get `output.img`. Image is mounted by loopback inside a qemu chroot, never booted (no unique keys baked in). `EDITBASE_IMAGE_ENLARGEROOT` / `EDITBASE_IMAGE_RESIZEROOT` via `config.local`. `--dns 8.8.8.8` if the chroot has no network. OctoPi's current image build uses it with a Taskfile (`task build`). [V]
- No xz, no Imager JSON, no purge helper: those are our scripts (which is all we need).

**sdm** (https://github.com/gitbls/sdm, V16.1 2026-10-10, pushed 2026-10-10) [V]
- Bash tool for customising Pi OS images and burning cards, trixie recommended. Plugins seen: `apps` (install and `remove`), `disables` (Bluetooth, Wi-Fi, cloud-init, piwiz, triggerhappy), `bootconfig` (config.txt), `cmdline` (cmdline.txt), `copyfile`/`copydir`, `network` (NM or dhcpcd), `hotspot` (NM Wi-Fi/USB hotspot), `btwifiset` (Wi-Fi setup over Bluetooth), `cloudinit`, `chrony`, `defer-plugin` (runs after first boot), `graphics` (X11/labwc/wayfire), `L10n`, `parted` (resize), `extractfs`, encryption, plus custom plugins and phase scripts. Plugin list truncated in my fetch. No kernel plugin seen. [V partial]
- Host: Debian-like Linux, x86_64 supported since V7.2 with `binfmt-support qemu-user-static systemd-container parted gdisk rsync uuid...`; qemu is used in phase 1/post-install on x86; also WSL. No Docker support found (it relies on `systemd-nspawn`, awkward in a container) [S, U for Docker]. So on this Mac it needs a Linux VM, not a Docker one-liner.
- Pro: the richest ready-made vocabulary for exactly our edits. Con: Mac+Docker friction, bash with its own conventions, image output is a file we compress ourselves.

**Packer + packer-builder-arm** (https://github.com/mkaczanowski/packer-builder-arm, v1.1.7 2026-09-24, pushed 2026-10-22) [V]
- Modes `new`, `reuse` (existing image), `resize`; boards `raspberry-pi/raspbian.json` (Pi OS Lite arm64 template) etc.; `QEMU_CPU`; loop+kpartx+qemu chroot; HCL/JSON provisioners (shell, file). Docker image multi-arch, cosign-signed, "intended mainly for macOS users", `docker run --rm --privileged -v ${PWD}:/build <image> build boards/raspberry-pi/raspbian.json`. Known limits: broken `/etc/resolv.conf` in chroot, no running systemd in chroot (so `systemctl enable` works, `start`, `nmcli` do not), resize only grows. [V README]
- Adds Packer as a dependency for the same chroot we get from CustoPiZer, with no shrink, no xz, no Imager JSON.

**Plain script** (loop-mount, qemu chroot, apt, copy, shrink, xz)
- ~150 lines of bash that CustoPiZer already is. In Docker on the Mac the pieces are: `docker run --privileged` Debian container with `qemu-user-static` (binfmt must be on the Docker VM kernel, not only in the container [S]), `losetup -P`, mount `p2` then `p1` at `/boot/firmware`, bind `/dev /proc /sys`, `chroot ... qemu-aarch64-static`. Risk is identical to CustoPiZer, but we own every line [V pattern from CustoPiZer/packer docs].

### 1.2 GitHub Actions and the Mac

- GitHub arm64 Linux runners (`ubuntu-24.04-arm`, 4 vCPU, 16 GB RAM, 14 GB SSD) are free for **public** repositories, GA since 2025-08-07; private repos need paid larger runners. https://github.blog/changelog/2025-08-07-arm64-hosted-runners-for-public-repositories-are-now-generally-available/ , https://docs.github.com/en/actions/reference/runners/github-hosted-runners [V via search]. Native arm64 means no qemu at all in CI: chroot commands run at full speed, apt and `zerofree` take seconds. The 14 GB disk is tight for pi-gen (tens of GB) and fine for customise-in-place (a 2-3 GB .img plus the .xz).
- Mac (Intel, Docker Desktop/OrbStack): amd64 container + binfmt arm64 emulation. Slow but workable for a customise-in-place build (apt installs under qemu, a few minutes); a from-scratch pi-gen/debootstrap run is the heavy case. Heat-limited machine: develop the scripts against a cached `output.img`, do real image builds in CI. [U for timings: measure once and write into `docs/reports/zinc-next-perf.md`.]
- Loop devices in a privileged container work on Docker Desktop's Linux VM (CustoPiZer, packer-builder-arm both rely on it, the latter advertised for macOS) [V docs, U on OrbStack specifics].

### 1.3 Comparison

| Criterion | pi-gen (arm64) | rpi-image-gen | CustomPiOS | CustoPiZer | sdm | Packer arm | Own script |
|---|---|---|---|---|---|---|---|
| Starts from | scratch (debootstrap, same as official) | scratch (minbase + RPi apt) | official .img | official .img | official .img | official .img | official .img |
| Pin base | none (apt floats), tag the branch | snapshot example exists, apt of RPi floats | image url+sha | image url+sha | image url+sha | image url+sha | image url+sha |
| Time on x86 Mac | long, hours [U] | long, unsupported [U] | minutes (chroot) [U] | minutes | needs Linux VM | minutes | minutes |
| Docker one-liner | yes (official) | no, DIY privileged | yes (`build_docker`) | yes (official image) | no | yes (official image) | DIY |
| GH arm64 runner | works (disk tight) | official CI does it | works | works | works | works | works |
| Purge/mask | by not installing | layers | scripts | scripts | `apps remove`, `disables` | shell | shell |
| config.txt/cmdline | stage scripts | layers/traits | scripts | scripts | `bootconfig`, `cmdline` | shell | shell |
| Kernel hold/replace | package lists | layers, custom kernel example | scripts | scripts | scripts | shell | shell |
| Output | .img/.zip/.xz | .img | .zip + shrink | .img | .img | .img | any |
| Imager JSON | no | no | snippet (zip, no init_format) | no | no | no | ours |
| Pi OS release maintenance | merge upstream | bump | bump `images.yml` | bump base URL | bump | bump | bump base URL |

### 1.4 Recommendation

**Customise-in-place with CustoPiZer's container, wrapped by our own thin driver** (`tools/pi-image`), not pi-gen and not rpi-image-gen for stage 1.
- Why: the owner wants Pi OS Lite as shipped, with apt, trimmed. Starting from the official `.img` makes "which Pi OS" a two-line pin (URL + sha256), keeps the upgrade path (a new Pi OS release is a one-line bump and a rebuild), builds in minutes on the Mac, and in CI on a free native arm64 runner. pi-gen rebuilds the world for the same result (hours, tens of GB, our edits fight upstream package lists). rpi-image-gen is the right tool if we later drop Lite for a smaller Debian (it already ships splash, kiosk, A/B and reproducible-rootfs examples and runs on arm64 CI): keep it as the stage-2 option, not now. sdm has the best vocabulary but wants a Debian-like Linux host; its idea list (`disables`, `defer-plugin`, `btwifiset`) is worth copying as scripts. Packer adds a tool with no benefit.
- Reproducibility caveat: apt in the chroot floats (Raspberry Pi archive offers no snapshot [U]); mitigate by recording `dpkg -l` and the kernel version in the release, pinning our own `.deb`/zinc binaries by hash, and `apt-mark hold` on the kernel packages if we want a fixed one (package names for trixie `linux-image-rpi-v8`, `linux-image-rpi-2712` [U: check `apt-cache policy` in the chroot]).
- Not byte-identical builds: ext4 timestamps and UUIDs differ; accept it (`SOURCE_DATE_EPOCH` and `tune2fs -U` can narrow it later [U]).

Build sketch (files in the repo, one command):
```
image/
  base.lock                 # RPI_OS_URL=https://downloads.raspberrypi.com/raspios_lite_arm64/images/<dated dir>/<file>.img.xz ; SHA256=...
  scripts/                  # run in the qemu chroot, in order
    01-purge.sh             # apt purge cloud-init rpi-cloud-init-mods (+ avahi, triggerhappy, modemmanager, bluez, man-db...), apt autoremove
    02-units.sh             # systemctl mask/disable (wait-online, apt-daily*, e2scrub, fstrim?, getty@tty1) ; enable zinc.service
    03-zinc.sh              # dpkg -i /files/zinc_*.arm64.deb or untar; create user, tty/drm/input groups
    04-boot.sh              # edit /boot/firmware/config.txt (disable_splash, boot_delay=0, dtoverlay=disable-bt...), cmdline.txt (quiet, fullscreen_logo, root delay)
    99-clean.sh             # apt clean, journal reset, ssh host keys removed, machine-id emptied, zerofree-ready
  files/                    # overlay: etc/systemd/system/zinc.service, usr/lib/zinc/firstboot, boot/firmware/zinc.txt (template)
  imager/entry.json.in      # name, description, icon, devices, init_format, url placeholders
tools/pi-image              # download+verify base, docker run custopizer, xz -T0 -9, sha256, extract_size, fill entry JSON
Makefile target:            make pi-image      # = tools/pi-image build   (CI: same command, ubuntu-24.04-arm, no qemu)
output: dist/zinc-pios-<ver>-arm64.img.xz  dist/os_list_zinc.json
```
Imager entry (fields from `rpi-imager/doc/schema-notes.md` [V]): `name, description, icon, url, extract_size (bytes of the .img), extract_sha256, image_download_size, image_download_sha256, release_date, init_format, devices, capabilities`. `devices` values: the schema example uses `["pi4","pi5"]` [V]; the official list uses tags such as `pi3-64bit`, `pi5-64bit` [U: copy from https://downloads.raspberrypi.com/os_list_imagingutility_v4.json]. `init_format` choice for Zinc: see open item 1 below.

Open items to settle with a first build (cheap, each one command):
1. **First-boot format.** Purging cloud-init saved about 25 s on the critical path and 31 s of cloud-final on a Pi Zero W trixie Lite (https://hallard.me/?p=4503, total 2 min 33.9 s -> 34.8 s with more changes) [V]. Without cloud-init Imager's `cloudinit*` customisation is dead; `init_format: "systemd"` (legacy `firstrun.sh` run through `systemd.run=` on the kernel command line) should still work with no cloud-init because the mechanism is systemd's [U: test on a real card]. Plan: `init_format: "systemd"` for Imager's Wi-Fi/hostname/user fields, plus our own `zinc.txt` for Zinc keys; fallback `none` plus in-app Wi-Fi.
2. Is NetworkManager kept? hallard replaced it with systemd-networkd + wpa_supplicant (about 15 s less) [V]; but in-app Wi-Fi (KlipperScreen pattern, section 2.4) and the boot-partition `*.nmconnection` pattern (FullPageOS) both want NM. Measure NM with `wait-online` masked before dropping it.
3. Loop mounts in this Mac's Docker VM (`--privileged`): try once with `ghcr.io/octoprint/custopizer`.
4. The Pi 5 / Pi 3 kernel names and `initramfs` presence on Lite (needed by the kernel-logo splash, 2.7).

## Part 2. Light reference systems

Boot times: almost nobody publishes one. Where a number exists it is an anecdote; dated and sourced below. Floors: GPU firmware ~1.25 s on Pi 3 (02-base-system.md).

### 2.1 DietPi (https://dietpi.com, Debian trixie images) 
- Build/base: its own scripts produce SBC images from Debian (trixie file names in docs [V]); "Raspberry Pi and other SBCs", min media 4 GiB; images `.img.xz`, Imager-flashable. [V https://dietpi.com/docs/install/]
- Boot-partition config (the best example in this survey): `dietpi.txt`, plain `KEY=value`, read on the first boot only ("on subsequent boots most options are not evaluated"), secrets removed after use. Keys [V raw file]: `AUTO_SETUP_NET_ETHERNET_ENABLED`, `AUTO_SETUP_NET_WIFI_ENABLED`, `AUTO_SETUP_NET_WIFI_COUNTRY_CODE`, `AUTO_SETUP_NET_USESTATIC` + `_STATIC_IP/_GATEWAY/_DNS`, `AUTO_SETUP_NET_HOSTNAME`, `AUTO_SETUP_BOOT_WAIT_FOR_NETWORK=1`, `AUTO_SETUP_LOCALE/KEYBOARD_LAYOUT/TIMEZONE`, `AUTO_SETUP_GLOBAL_PASSWORD`, `AUTO_SETUP_SSH_SERVER_INDEX` (-1 Dropbear, -2 OpenSSH), `AUTO_SETUP_AUTOSTART_TARGET_INDEX`, `AUTO_SETUP_AUTOMATED=1` (fully unattended), `AUTO_SETUP_INSTALL_SOFTWARE_ID`, `AUTO_SETUP_APT_INSTALLS`, `AUTO_SETUP_CUSTOM_SCRIPT_EXEC` (runs `/boot/Automation_Custom_Script.sh` or a URL), `CONFIG_SERIAL_CONSOLE_ENABLE`, `CONFIG_CHECK_DIETPI_UPDATES`, `SURVEY_OPTED_IN`.
- Wi-Fi: `dietpi-wifi.txt` with `aWIFI_SSID[0]` / `aWIFI_KEY[0]` (array syntax, several networks), enabled by `AUTO_SETUP_NET_WIFI_ENABLED=1` (2020-era guides [S]; my fetch of the raw file URL returned 404, so the exact keys beyond these two are [U]).
- First boot: resizes root and sets up (couple of minutes), then `apt` upgrade, survey prompt; unattended mode may take "more than an hour" with software installs; log `/var/tmp/dietpi/logs/dietpi-firstrun-setup.log`. [V docs]
- Settings UI: `dietpi-config`, `dietpi-launcher`, `dietpi-software` (TUI, ncurses). Updates: `dietpi-update` (daily check option). Read-only root: not core (RAM log option `dietpi-ramlog` [U]).
- Boot time: no official number. Forum anecdotes: `dietpi-boot.service` 41.4 s on a Pi 3B (2020), 33 s of 51 s userspace on a Pi Zero W, dominated by network/NTP wait; Pi 4 with desktop 25.8 s total; a developer note that `systemd-timesyncd` should be disabled on fresh images. https://dietpi.com/forum/t/dietpi-boot-service-taking-40-seconds-on-rpi3b-and-pinea64/3772 , https://dietpi.com/forum/t/boot-times-on-pi-zero-w/5619 [S]. Lesson: DietPi's lightness is footprint (few packages, no cloud-init, dropbear) more than measured boot speed; a "wait for network" setting is the single biggest knob.

### 2.2 FullPageOS (https://github.com/guysoft/FullPageOS, 0.14.0 2025-07-14, CustomPiOS)
- Base Pi OS Lite armhf; Chromium full screen on X11, default app FullPageDashboard; build `build_dist` (Docker or Vagrant). No trixie mention. [V]
- Config on the boot partition (`/boot/firmware`): `fullpageos.txt` holds the URL, supports `{serial}` substitution; Wi-Fi via `wifi.nmconnection` (a NetworkManager keyfile, README says edit it on the first partition); older README/forks mention `fullpageos-wpa-supplicant.txt` / `fullpageos-network.txt` (pre-bookworm). [V README fetch, S for old names]
- Splash: `splash.png` replaces the kernel messages; Imager snippet metadata in `src/config` (`RPI_IMAGER_NAME` ...); SSH + x11vnc preinstalled (default VNC password "raspberry", a warning sign). [V]
- Idea to copy: NM keyfile as the Wi-Fi boot-file format (it is what NetworkManager reads natively, no parser).

### 2.3 OctoPi and MainsailOS (CustomPiOS; CustoPiZer)
- OctoPi 1.2.0 config: modules `base(raspicam, network, disable-services(octopi), password-for-sudo)`, `ENLARGEROOT=2000`, `RESIZEROOT=200`; published in Imager's list. https://github.com/OctoPrint/OctoPi-UpToDate , https://github.com/guysoft/OctoPi [V]
- Network config: the CustomPiOS `network` module installs NM boot-folder support (bookworm) or the old `wpa_supplicant` boot-folder support, selectable by variable; also disables Wi-Fi power save by udev rule (`NETWORK_DISABLE_PWRSAVE=yes`, type `udev`). [V]
- MainsailOS "only adds the required software on top of the existing base image" and ships **Sonar**, a Wi-Fi keepalive daemon. https://docs.mainsail.xyz/mainsailos/ [V]. Wi-Fi power save and flaky links are an appliance problem; both ship a fix.

### 2.4 KlipperScreen (https://github.com/KlipperScreen/KlipperScreen, pushed 2026-10-19)
- Touch UI (Python/GTK) for printers on Pi OS Lite; backends: X11 default ("nearing end-of-life" in its own docs), or Wayland compositors Cage/Weston, chosen at install; install script targets Pi OS Lite and other Debian derivatives. https://klipperscreen.readthedocs.io/en/latest/Installation/ , `docs/Backends.md` [V]
- Wi-Fi: a **panel inside the app** (`panels/network.py`) talking to NetworkManager over D-Bus (`sdbus_block.networkmanager`); the panel prints "needs NetworkManager installed" otherwise. [V]
- It does not do DRM/KMS direct (needs a compositor); not a boot-time reference. Copy: in-app Wi-Fi panel on NM D-Bus (scan, enter key with on-screen keyboard, connect).

### 2.5 RetroPie (https://github.com/RetroPie/RetroPie-Setup; docs site blocked my fetch)
- EmulationStation on Pi OS Lite: autologin via a `getty@tty1.service.d/autologin.conf` override (or `raspi-config`), then `autostart.sh` runs "if tty is /dev/tty1 and no DISPLAY and user is the RetroPie user"; so the app starts from the login shell profile, not a unit. [V scriptmodules/supplementary/autostart.sh]
- Splash: `asplashscreen.service` (systemd, plays a video/image from `/etc/splashscreen.list`, VLC on newer Pi OS) plus a `/etc/profile.d/05-splash.sh`; Plymouth splash is toggled with `plymouth.enable=0` in `cmdline.txt`. [V splashscreen.sh]
- Lesson: the login-shell route costs getty + PAM + profile; a systemd service owning tty1 is shorter (what Zinc plans). Splash as a unit starts late (after sysinit), Plymouth or the kernel logo is earlier.

### 2.6 Anthias (ex Screenly OSE, https://github.com/Screenly/Anthias, v2026.10.0 2026-10-16)
- Docker-based signage stack, installed with a script on Pi OS Lite (64-bit) or as balenaOS images; also Debian-based Armbian (bookworm/trixie) for non-Pi boards; a Qt WebView viewer (`src/anthias_webview`). Plymouth splash "wired up", works on Pi and x86, not on U-Boot boards (no early DRM device), where the kernel log scrolls until the first asset. https://github.com/Screenly/Anthias README [V]
- Network onboarding / updates: not in the README [U; believed hotspot + web UI, docker image pulls]. Heavy for our purpose, relevant for "appliance app drawn by a viewer process over DRM".

### 2.7 Raspberry Pi's own kiosk guidance
- https://www.raspberrypi.com/tutorials/how-to-use-a-raspberry-pi-in-kiosk-mode/ [V]: Pi OS 64-bit, Pi 3 or newer with 1 GB+, set hostname/user/Wi-Fi/SSH in Imager, `apt full-upgrade`, `~/.config/labwc/autostart` launching `chromium --kiosk --noerrdialogs --disable-infobars --no-first-run ...`, `wtype` to cycle tabs. Hardening: SSH keys only; read-only root with `raspi-config` -> Performance -> Overlay File System, then write-protect the boot partition. Nothing on Lite, fast boot or splash.
- rpi-image-gen's own `webkiosk` example is the nearer reference (Cage + Chromium, A/B, `rpi-splash-screen`), see 1.1.
- Splash the Pi way, early: `rpi-splash-screen` layer = kernel `fullscreen_logo=1 fullscreen_logo_name=logo.tga vt.global_cursor_default=0` on the command line, a 24-bit uncompressed TGA (max 1920x1080, max 224 colours) in `/lib/firmware/logo.tga`, loaded by an initramfs hook; installs `rpi-splash-screen-support`. https://github.com/raspberrypi/rpi-image-gen `layer/rpi/device/splash-screen/splash-screen.adoc` [V]. No Plymouth, no userspace.

### 2.8 moOde audio and Volumio
- moOde (r1036, 2026-10-10): Pi OS Lite + Debian packages hosted on Cloudsmith, image built with pi-gen (`moode-player/imgbuild`), web UI, config kept on the boot media. [V README]
  Boot-partition auto-config: `moodecfg.ini` (copy from `moodecfg.ini.default`), applied on a never-booted image, "reboots twice"; `[network]` with SSID/security/password and AP settings, `[names]` hostname; **AP mode** starts if there is no Ethernet and no SSID defined, or the SSID was defined but no IP was obtained. Key names changed between releases (my fetch of the default file 404'd; autocfg code is `www/inc/autocfg.php`). [S forum + repo paths V]
- Volumio (4.x, Debian bookworm [S]): its own `build.sh` (multistrap, `-b armv8 -d pi`), custom initrd + squashfs root (so not "Pi OS plus a package"), and its docs say to flash with no Imager customisation or it breaks. [S] Lesson: an appliance with its own first-boot flow must say what Imager's customisation does to it (for Zinc: `init_format` decision).

### 2.9 piCorePlayer (https://docs.picoreplayer.org, Tiny Core based)
- Runs from RAM ("speedy bootup" in docs), no published boot time; one forum anecdote: init looks for the network for 22 s then finishes (old version). Wi-Fi: GUI preferred (web UI on Ethernet or after boot), else edit `wpa_supplicant.conf` on the boot partition; a `# Maintained by piCorePlayer` header means the GUI owns the file, remove that line to keep a hand-written file. https://docs.picoreplayer.org/how-to/setup_wifi/ , `.../setup_wifi_on_pcp_without_ethernet/` [S]
- Copy: the "who owns this file" header marker; and the RAM-loaded read-only root model (conclusion already in 02-base-system.md: not on a Pi OS base).

### 2.10 comitup and balena wifi-connect (AP portals)
- comitup (https://github.com/davesteele/comitup, pushed 2026-08-18, Debian package): when no known network joins, starts a hotspot `comitup-<nnn>` (persistent number), serves a web page to pick an SSID and enter the key, captive portal on supported phones, at `comitup-<nnn>.local` or `10.41.0.1`; needs NetworkManager + systemd; remembers several networks; two-radio mode; "Locate" blinks the Pi's LED. Config `/etc/comitup.conf` (man `comitup-conf.5`). [V README]
- wifi-connect (https://github.com/balena-os/wifi-connect, v4.11.91 2026-10-22, Rust): needs NetworkManager; opens an AP (default SSID "WiFi Connect", open or `--portal-passphrase`), captive portal, user picks SSID+passphrase, AP drops while connecting, comes back on failure, NM stores the result; works with the Pi 3 onboard Wi-Fi and some USB dongles (others fail). [V]
- Both rely on NM and are heavy relative to what the app can do itself. For a device that *has a screen*, they are the fallback for **headless** use (no touch, no keyboard): AP started by `zinc agent`, page served by the agent. Both prove the sequence: try saved networks, else AP, else return to AP on failure.

### 2.11 Others touched
- sdm `btwifiset`: Wi-Fi provisioning over Bluetooth from a phone (a third path with no AP, no keyboard). [V plugin list; mechanism U]
- Hallard's trixie-lite-on-Zero-W tune (https://hallard.me/?p=4503, 2026) [V]: cloud-init purged (about -25 s critical path), NetworkManager masked (replaced by systemd-networkd + wpa_supplicant, about -15 s), initramfs/boot-partition/Wi-Fi driver changes; Bluetooth services off; `systemd-rfkill` must stay (masking it left Wi-Fi blocked after reboot); kernel 13.4 -> 3.98 s. Total 153.9 s -> 34.8 s. Use `systemd-analyze critical-chain`, not `blame`. Closest existing measurement to "Pi OS Lite, trimmed, apt kept".

## Part 3. Ideas to copy

| Idea | Who does it | Copy for Zinc? | Why |
|---|---|---|---|
| One plain `KEY=value` file on the FAT partition, read once, secrets scrubbed after use | DietPi `dietpi.txt` (also `fullpageos.txt`) | yes | Trivial to parse in C++ (no YAML/cloud-init), editable on any OS, first-boot-only avoids drift. `zinc.txt` with `wifi.ssid`, `wifi.psk`, `hostname`, `ssh`, `agent.*`, `mode=dev|kiosk` |
| Wi-Fi boot file in the OS's native format (NM keyfile `wifi.nmconnection`) | FullPageOS, CustomPiOS network module | yes (if NM kept) | No parser: copy to `/etc/NetworkManager/system-connections` with mode 600; also accept `zinc.txt` keys and generate the keyfile |
| Array syntax for several networks (`aWIFI_SSID[0]`) | DietPi | later | Nice for classrooms; saved-network list lives in NM anyway |
| Honour Imager's own customisation (`init_format: systemd`/`cloudinit`) | Pi OS, OctoPi (Imager entry) | yes, test | Users already know the Imager screen; purging cloud-init saves ~25 s, so `systemd`/firstrun.sh first (open item 1) |
| First boot does the minimum, rest deferred to after the first frame | DietPi (long first run, the anti-pattern), sdm `defer-plugin` | yes | Expand root + keys + hostname before the app, anything else (apt, SBOM, update check) after the shell is on screen |
| Purge cloud-init, mask `wait-online`, drop `triggerhappy`, BT, avahi, modem manager | hallard, sdm `disables` | yes | Biggest measured wins on Pi OS Lite; verify with `critical-chain`; keep `systemd-rfkill` |
| Don't wait for the network at boot; app starts first, network joins async | DietPi `AUTO_SETUP_BOOT_WAIT_FOR_NETWORK`, piCorePlayer 22 s wait | yes | Every report shows the network wait as the dominant userspace delay |
| Wi-Fi onboarding on the device screen (scan, on-screen keyboard, connect) over NM D-Bus | KlipperScreen network panel | yes | The product is the screen; the first-run path for touch devices; `zinc agent` or the app calls NM D-Bus (or `nmcli` first) |
| AP + captive portal fallback for headless units (no touch, no keyboard) | comitup, wifi-connect, moOde (AP if no Ethernet/SSID or no IP) | later | Needed only for headless boards; agent-served page; start only when no saved network works, return to AP on failure |
| Wi-Fi setup over Bluetooth from a phone | sdm `btwifiset` | no (later) | Third path; Pi Bluetooth is off in the trim list anyway |
| Early splash by the kernel: `fullscreen_logo=1` + TGA in initramfs, no Plymouth | rpi-image-gen `rpi-splash-screen` | yes, measure | Earliest possible pixel, no userspace; limits: TGA 224 colours, initramfs needed (check Lite has it); then hand over to the app on the same KMS framebuffer without a flash |
| Plymouth with `plymouth.enable=0` toggle | RetroPie, Anthias | no | Extra userspace stack; kernel logo is lighter; keep the toggle idea for a dev mode |
| Own unit owns tty1 (no login shell, no getty autologin) | rpi-image-gen webkiosk (systemd service), contrast RetroPie (autologin + profile) | yes | Fewer steps than getty + PAM + `.profile`; `Conflicts=getty@tty1`, `PAMName=login`, `TTYPath=/dev/tty1` [U details] |
| Wi-Fi power-save off + keepalive daemon | CustomPiOS `NETWORK_DISABLE_PWRSAVE` (udev), MainsailOS Sonar | yes | Fixes the "device drops off Wi-Fi" support case for always-on appliances; one udev rule first, daemon only if needed |
| "Who owns this file" header marker so the UI and the hand-edited file coexist | piCorePlayer | yes | `# Maintained by Zinc` in generated Wi-Fi/config files; remove the line to take over by hand |
| Shell/hook escape hatch on the boot partition: `Automation_Custom_Script.sh` | DietPi | yes (dev mode only) | Developers and schools can automate without rebuilding; disabled in locked kiosk mode; documented risk (runs as root) |
| Config kept on the FAT partition, applied only to a never-booted image | moOde `moodecfg.ini` | yes | Same rule as DietPi; also tells support "re-flash to change" |
| Read-only root via overlay FS, boot partition write-protected | Pi kiosk tutorial (`raspi-config`), Pi OS overlay | later | Good for classroom kiosks and power-cut safety; needs a writable data partition for the agent and Zinc apps; do after A/B |
| A/B slots + tryboot | rpi-image-gen `image-rota`, HAOS (RAUC) | later | Our update channel is app sync first; system image is rare. Product risk: Bootlin notes (02-base-system.md) |
| Update channel = apt for the OS, `zinc agent` for apps | moOde (Cloudsmith apt repo), Pi OS, DietPi (`dietpi-update`) | yes | Ship `zinc` as a signed apt repo / `.deb` on the Pi archive-like pattern for the OS side; agent pushes apps; avoids owning an image updater in stage 1 |
| Publish an Imager repository entry per release | OctoPi, FullPageOS (CustomPiOS snippet), moOde | yes | We need `os_list_zinc.json` with `init_format`, `devices`, `.img.xz` checksums; adapt the CustomPiOS snippet generator (zip -> xz) |
| Dev vs kiosk mode flag | DietPi `AUTO_SETUP_AUTOSTART_TARGET_INDEX` (console/kiosk/...), Pi kiosk "overlay on" step | yes | `mode=dev` keeps ssh + agent open + writable root, `mode=kiosk` disables login, ssh by key only, read-only later |
| Safe-by-default credentials | FullPageOS default VNC password (counter-example), pi-gen locked account without password | yes | No default password, ssh off unless asked in Imager/`zinc.txt`, agent pairing by code shown on screen |
| Ship a Docker-based stack | Anthias | no | Too heavy for Pi 3B+/Zero 2 W and against the single-app goal |
| RAM-loaded root (Tiny Core model) | piCorePlayer | no | Awkward extension model; not compatible with apt, already rejected in 02 |
| Own `build.sh` multistrap root + custom initrd | Volumio | no | Maintenance burden of owning a Debian build; contradicts the "Pi OS Lite base" decision |

## Gaps and what to measure next
- No sourced boot time for any listed system on current hardware except Furkan Tokac's Buildroot Pi 3 (02) and hallard's Zero W trixie tune; Zinc must produce its own numbers: Pi OS Lite stock vs trimmed on Pi 3B+, 4, 5, power to first Zinc frame, camera or UART timestamps (log in `docs/reports/zinc-next-perf.md`).
- Not opened (snippets only): RetroPie docs site (blocked), Volumio docs, piCorePlayer how-to pages, DietPi `dietpi-wifi.txt` (raw URL 404), comitup installation page, Anthias docs site.
- Tool timings on this Mac (CustoPiZer under qemu; pi-gen under qemu) are estimates; first run should write them down.
