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
| `hostname`, `timezone`, `keyboard` | applied by cloud-init on the first boot |
| `user` (`name`, `password`, `sshKeys`), `ssh` | the login user; SSH on (`ssh` file on the boot partition) |
| `wifi` (`ssid`, `password`, `country`) | the first network; the country is required with it |
| `libraries`, `packages` | catalog groups (FFmpeg, gphoto2, GStreamer, libcamera, libuv, compilers) and more Debian packages |
| `app` | a Zinc project or `.zapp` started at boot (relative to the profile's directory); none: the player |
| `agent`, `bluetooth`, `debug` | the Zinc agent on, Bluetooth on, boot messages on screen |
| `base`, `zinc` | the Raspberry Pi OS image and the Zinc release (URL and SHA-256), pinned in `image/profile.json` |

## What runs on the Pi

- `zinc-shell.service` runs `zinc-session` as the `zinc` user on tty1, right after the root file system, `/dev` and udev. The
  session runs the app (`/var/lib/zinc/app`) and stays: a crash writes `/run/zinc/crash.txt` (exit status and last lines) and
  starts the player (`/usr/lib/zinc/player`), which shows it and can start the app again; with no app, the player shows.
- NetworkManager, wpa_supplicant, SSH, avahi, timesyncd and cron wait for the session (`10-zinc-defer.conf` drop-ins); Wi-Fi's
  driver loads when NetworkManager starts. userconfig, systemd-firstboot (it waits for the console, tty1 in a debug image),
  the wait for the network, apt's and man-db's timers are masked; getty on tty1 is kept off by a drop-in, since Pi OS's user
  rename starts it.
- The first boot is Raspberry Pi OS's: the initramfs grows the card and cloud-init applies the settings. `zinc-firstboot` then
  turns both off (no initramfs, cloud-init disabled) and deletes the settings, which held the Wi-Fi key and the password hash.
- A file named `zinc-agent` on the boot partition turns the agent on (it is consumed), like `ssh` turns SSH on. A program it
  starts (`zinc dev --device`, `zinc device run`) draws through `/dev/fb0` too: while one has the screen open, `zinc-session`
  closes the player, and shows it again 2 s after the last one ended.
- `"debug": true` puts a file named `zinc-report` on the boot partition: each boot then writes `zinc-report.txt` there (the
  session's log, the jobs the boot waits on, cloud-init, the screens, the network, the timing; 45 s, 2 and 5 min after the
  session started), and keeps the boot before as `zinc-report-previous.txt`.
- The player's settings change the system as `zinc`: the network through NetworkManager (`zinc:network`; a polkit rule,
  `50-zinc-network.rules`, lets `zinc` drive it), the rest through `/usr/lib/zinc/zinc-admin`, which `zinc` may run as root
  through sudo (`/etc/sudoers.d/zinc`) for its fixed verbs: Wi-Fi country, SSH, the agent and its pairing, hostname, reboot, poweroff.

## Layout

| Path | What it holds |
|---|---|
| `profile.json`, `catalog.json` | the defaults and the choices a profile names |
| `Dockerfile`, `build.sh`, `check.sh` | the build container, the build and the check (run in it by `tools/pi-image`) |
| `scripts/` | run in the image's chroot, in order: packages, system, boot configuration |
| `files/` | copied over the image: the units, `zinc-session`, `zinc-firstboot`, `zinc-admin`, the sudo and polkit rules, modprobe and modules-load files |
| `player/`, `builder/` | the two Zinc apps (their READMEs) |

Not proven yet (needs a Pi): the boot time, the vc4 handover to the session, the session's DRM access as `zinc`, Wi-Fi brought up by
NetworkManager after the deferral, the player's settings on the real system (sudo, polkit, nmcli). `tools/pi-image check` proves what can be proven without one, in the image's own userland.
