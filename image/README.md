# The Zinc image for Raspberry Pi

Raspberry Pi OS Lite (Debian 13, 64-bit) changed to boot straight into a Zinc app: the session starts among the first units, the
network, SSH, avahi and the clock start after its first frame, and when the app crashes the screen shows why. `apt` works as on
any Raspberry Pi OS. The research behind each choice: `docs/reports/pi-os/` (start with `00-synthesis.md`).

## Build an image

```sh
tools/pi-image build                      # the defaults of image/profile.json: no user, no Wi-Fi, the player alone
tools/pi-image build my-profile.json      # a profile laid over the defaults
tools/pi-image check dist/zinc-pios.img.xz
tools/pi-image player                     # the player on this computer, on a pretend Pi
zinc run image/builder                    # the same from a window (Zinc Pi Image)
```

It needs Docker (Docker Desktop or OrbStack). A build takes about 3 minutes on an Apple silicon Mac, where the arm64 chroot runs
natively (elsewhere through the host's qemu binfmt), and about 6 GB of disk while it runs; downloads are kept in
`~/.zinc/cache/pi-image`. It writes `dist/<name>.img.xz`, `dist/<name>.json` (an entry of a Raspberry Pi Imager repository:
`rpi-imager --repo dist/<name>.json`) and `dist/<name>.packages.txt`. Flash the `.img.xz` with Raspberry Pi Imager ("Use custom");
its customisation (user, Wi-Fi, SSH) still applies and replaces the profile's.

A profile (`tools/pi-image profile p.json` prints the merged result, secrets hidden; `tools/pi-image catalog` the choices):

| Key | What it sets |
|---|---|
| `name` | the file names in `dist/` |
| `board`, `display` | an entry of `image/catalog.json`: the Imager devices, the `config.txt` lines (the 7" panel's overlay...) |
| `hostname` | empty (default): a unique `xxxx-xxxxxx-xxxxx` name at first boot; otherwise your explicit network name |
| `timezone`, `keyboard` | applied by cloud-init on the first boot |
| `user` (`name`, `password`, `sshKeys`), `ssh` | the login user; SSH on (`ssh` file on the boot partition) |
| `wifi` (`ssid`, `password`, `country`) | the first network; the country is required with it |
| `libraries`, `packages` | catalog groups (FFmpeg, gphoto2, GStreamer, libcamera, libuv, compilers) and more Debian packages |
| `app` | a Zinc project or `.zapp` started at boot (relative to the profile's directory); none: the player |
| `agent`, `bluetooth`, `debug` | the Zinc agent on, Bluetooth on, boot messages on screen |
| `base`, `zinc` | the Raspberry Pi OS image and the Zinc release (URL and SHA-256), pinned in `image/profile.json` |

## Downloadable CI images

The dedicated **Pi image** workflow (`.github/workflows/pi-image.yml`) builds on a native ARM64 Linux runner, independently of the engine's release/test pipeline. It runs only when dispatched, has read-only repository permissions and uploads an Actions artifact for 14 days; it does not publish a release or website.

Choose an exact published stable engine with a signed `zinc-linux-aarch64.manifest` and the Pi display-handoff payload. The workflow verifies its Ed25519 signature using the repository key and host OpenSSL before executing any downloaded engine. It also checks the version, archive name and SHA-256, then records the image checkout commit separately from the engine version. Missing/unsigned assets and old packages such as 0.6.2 are rejected rather than silently producing an outdated image.

After the workflow is present on the repository's default branch (the next release brings it there), dispatch it with your published version:

```sh
gh workflow run pi-image.yml --ref develop -f engine_version=X.Y.Z
```

Download `zinc-pi-image-X.Y.Z` from the successful run and extract the artifact ZIP. Flash its `.img.xz` using Etcher or Raspberry Pi Imager. The artifact includes the Imager JSON, package list, SHA256SUMS, profile, provenance and offline player capture. The image is built and checked before the download artifact is uploaded. `image/DOWNLOAD.md` is included as its README.

Use Imager's customization for login/Wi-Fi/SSH. For Etcher, keep the card on your computer after flashing and apply the image builder's saved profile before its first boot:

```sh
tools/pi-image configure /Volumes/bootfs ~/.zinc/pi-image/profile.json
```

Adjust the mounted path. This reuses the build's first-boot writer and never rebuilds the image. It refuses a boot partition whose first-boot input has already been consumed; it is not a recovery command for the currently running Pi. Eject the card and start the Pi. Public artifacts deliberately contain no shared administrator password or personal network configuration.

Checks include the first-boot regression, cloud-config schema, filesystem/unit/library checks and an offline headless player inside the image. This is not a hardware boot test: Pi 3 B+ first boot, SSH login, Wi-Fi, display/input handoff and power-loss recovery still need board verification. Future system firmware updates are scoped in `docs/reports/zinc-next-pi-image-pipeline.md`.

## What runs on the Pi

- Before starting the screen, `zinc-admin identity` generates a random name when the boot partition carries `zinc-auto-name`. It stores it in root-owned `/etc/zinc/device-name`, sets the hostname and hosts entry, and consumes the marker. A normal reboot keeps it; a fresh flash has no saved name and generates another. Explicit profile or Imager hostnames take precedence. The agent advertises the current hostname while keeping its internal id and paired computers. Updating an already provisioned card does not generate a new identity.
- `zinc-shell.service` runs `zinc-session` as the `zinc` user on tty1, right after the root file system, `/dev` and udev. The
  session runs the app (`/var/lib/zinc/app`) and stays: a crash writes `/run/zinc/crash.txt` (exit status and last lines) and
  starts the player (`/usr/lib/zinc/player`), which shows it and can start the app again; with no app, the player shows.
- NetworkManager, wpa_supplicant, SSH, avahi, timesyncd and cron wait for the session (`10-zinc-defer.conf` drop-ins); Wi-Fi's
  driver loads when NetworkManager starts. userconfig, systemd-firstboot (it waits for the console, tty1 in a debug image),
  the wait for the network, apt's and man-db's timers are masked; getty on tty1 is kept off by a drop-in, since Pi OS's user
  rename starts it.
- The first boot is Raspberry Pi OS's: the initramfs grows the card and cloud-init applies the settings. `zinc-firstboot` then
  turns both off (no initramfs, cloud-init disabled) and deletes the settings, which held the Wi-Fi key and the password hash, only after cloud-init reports success. A failed or degraded setup preserves them for diagnosis and retry.
- A file named `zinc-agent` on the boot partition turns the agent on (it is consumed), like `ssh` turns SSH on. A program it
  starts (`zinc dev --device`, `zinc device run`) gets an exclusive display lease: the session stops its player or boot app
  and acknowledges that the display is free before the remote process may execute. A new app replaces the previous remote app;
  the player returns after exit. The agent unit opts into this policy with `ZINC_AGENT_SCREEN=/run/zinc`.
- `"debug": true` puts a file named `zinc-report` on the boot partition: each boot then writes `zinc-report.txt` there (the
  session's log, the jobs the boot waits on, cloud-init, the screens, the network, the timing; 45 s, 2 and 5 min after the
  session started), and keeps the boot before as `zinc-report-previous.txt`.
- The player's settings change the system as `zinc`: the network through NetworkManager (`zinc:network`; a polkit rule,
  `50-zinc-network.rules`, lets `zinc` drive it), the rest through `/usr/lib/zinc/zinc-admin`, which `zinc` may run as root
  through sudo (`/etc/sudoers.d/zinc`) for its fixed verbs: Wi-Fi country, SSH, the agent and its pairing, hostname, reboot, poweroff.

## Engine updates on the Pi

The player runs as `/usr/lib/zinc/current/player.zapp`. New signed engine packages include their matching
`share/zinc/image/player-source.tar.gz`: changing Zinc rebuilds that version of the player on the Pi. Older releases without this
payload use the factory's root-owned `/usr/lib/zinc/player-source.tar.gz`. The installed app stays separate. The Updates page checks published stable releases for the installed Debian architecture (`dpkg`,
so a 32-bit system under a 64-bit kernel selects `armhf`). A download icon opens it when a newer version exists. Checking is automatic
once a day while connected, retried after five minutes on failure, or manual with **Check again**. The list covers the latest 100
published releases that provide both the engine archive and its manifest for this architecture.

Select a newer or older version, press **Install**, then confirm. A root systemd job verifies the manifest with the image's
`/etc/zinc/update.pub` using Zinc's existing Ed25519 verifier, checks the archive's SHA-256/version/architecture, and extracts it
without accepting archive links or special files. Unsigned releases are refused. At least 2 GB of free storage is required.
The candidate engine packs its player sources and draws a test frame as the `zinc` user against a virtual framebuffer file, leaving the active display/input alone. Downloads or builds that fail
leave the active version untouched; an old engine unable to compile this player cannot be installed.

Only then does the job restart the session and remote apps, activate the prepared engine/player pair through one atomic `current`
link, and wait up to 30 seconds for the player's first frame. If startup fails, it restores the old pair. A flushed journal also
restores an interrupted switch at the next boot, before the session starts. **Restore** selects the
previous local pair without downloading or rebuilding it. Config, applications and agent pairing stay outside these generations;
an older engine may refuse applications made for a newer one. Detailed service errors are in `journalctl -u 'zinc-update@*'`.
The update helper and its trusted key belong to the image; this menu updates the engine, player and listed Zinc system files, not Raspberry Pi OS/kernel firmware or Debian packages.

**Restart network** in Wi-Fi resets failed NetworkManager/wpa_supplicant units and restarts them, then scans again. It asks for a
second press because remote connections can drop. This is recovery from a service failure, not proof that the known first-boot
problem is fixed. The real Pi 3 B+ first boot and vc4 display handover remain listed in `backlog/later.md`.

## Layout

| Path | What it holds |
|---|---|
| `profile.json`, `catalog.json` | the defaults and the choices a profile names |
| `Dockerfile`, `build.sh`, `check.sh` | the build container, the build and the check (run in it by `tools/pi-image`) |
| `scripts/` | run in the image's chroot, in order: packages, system, boot configuration |
| `files/` | copied over the image: the units, `zinc-session`, `zinc-firstboot`, `zinc-admin`, the sudo and polkit rules, modprobe and modules-load files |
| `player/`, `builder/` | the two Zinc apps (their READMEs) |

Not proven yet (needs a Pi): the boot time, the vc4 handover to the session, the session's DRM access as `zinc`, Wi-Fi brought up by
NetworkManager after the deferral, the player's settings and update/recovery on the real system (sudo, polkit, nmcli, systemd,
first-frame readiness). `tools/pi-image check` proves what can be proven without one, in the image's own userland.

## Updating an existing card

Reflashing is not required. The updated `zinc-player-update` installs the matching player sources, display session, agent service, `zinc-admin` and `zinc-shell.service` from the **signed engine archive**, together with the engine/player generation. It snapshots the previous system files, reloads systemd while both services are stopped, and restores those files on a failed start, rollback or interrupted activation. Applications, preferences and pairing are retained. Old releases without a system payload use the initial session snapshot (kept separately from pruned engine versions); older two-file payloads retain the missing optional files from that snapshot.

An image containing the earlier updater needs a one-time helper upgrade with a sudo-capable Pi account. Copy this checkout's helper to that account, then install it as root:

```sh
scp image/files/usr/lib/zinc/zinc-player-update ADMIN@192.168.2.31:/tmp/zinc-player-update
ssh -t ADMIN@192.168.2.31 'sudo install -o root -g root -m 755 /tmp/zinc-player-update /usr/lib/zinc/zinc-player-update'
```

`ADMIN` is the administration account created by Raspberry Pi Imager; the restricted `zinc` agent account cannot install arbitrary root helpers. Once a signed release containing these fixes is published, select it in the player's Updates menu. Upgrading only the workstation does not change the running Pi. No new image or signed release was built/published during the native fixture checks.

The player now omits a fixed Linux width/height, so the framebuffer's mode becomes its rendering resolution: 800×480 on the official display, 1920×1080 on a framebuffer running in Full HD. This does not force a new HDMI mode or change the kernel's display selection. USB keyboard text/layouts use `libxkbcommon0` and `xkb-data`, already dependencies of the image; mouse movement shows an outlined cursor, touch hides it, and new event devices are discovered once a second. Physical display/input and update recovery checks remain necessary before release approval (see `docs/reports/zinc-next-pi-070.md`).


## Login setup failures

The login password is written as cloud-init's `hashed_passwd`, which applies to an existing account too: Raspberry Pi OS may rename its initial account before the users module runs. The older `passwd` field could be ignored in that case. The password and Wi-Fi credentials are never included in public image profiles or download artifacts.

`After=cloud-final.service` is ordering, not a success condition. `zinc-firstboot` checks `cloud-init status --wait` before removing the initramfs, disabling cloud-init or deleting its inputs. Failed/degraded setup leaves these in place. This prevents an error from being recorded as a completed first boot; it does not automatically repair the underlying failure.

These fixes affect newly built images. They cannot reset an already provisioned card whose old cleanup deleted the settings. The paired `zinc` agent is not an administrator and has no password-reset command. Such a card needs owner-controlled console/offline recovery, or a fresh flash with corrected setup. A `userconf.txt` file alone does not recover it because Zinc masks `userconfig.service`.
