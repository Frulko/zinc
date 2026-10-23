# Pi OS research 04: system services driven by one app

Date: 2026-10-22. Scope: Pi 3B+ (reference, 7" DSI), Zero 2 W, Pi 4, Pi 5. Base undecided (Buildroot / Yocto / Raspberry Pi OS Lite).
Legend: [V] verified this session from the cited URL; [M] from memory of upstream docs, not re-checked; [?] unverified, test before relying.
Footprints are order-of-magnitude [M] unless stated; measure on the real image.

Design rule used throughout: the app is the only UI, so prefer services with a text/socket API the app can speak with a few hundred lines (no D-Bus client, no glib) and that start after the first frame.

## 1. Wi-Fi

| Option | RAM / size / deps | API for the app | Notes |
|---|---|---|---|
| wpa_supplicant | ~2-4 MB RSS, ~1.5 MB binary, libnl + openssl/mbedTLS (build option) [M] | `wpa_ctrl` unix datagram socket `/run/wpa_supplicant/wlan0` (text commands `SCAN`, `SCAN_RESULTS`, `ADD_NETWORK`, `SET_NETWORK`, `SELECT_NETWORK`, `SAVE_CONFIG`, `COUNTRY=`; `ATTACH` for async events). Optional D-Bus `fi.w1.wpa_supplicant1`. https://w1.fi/wpa_supplicant/devel/ctrl_iface_page.html | Hidden (`scan_ssid=1`), WPA2/WPA3-SAE, WPA2/3-Enterprise (EAP-PEAP/TLS...), AP mode (`mode=2` network block, built with CONFIG_AP), P2P. Most tested driver path on brcmfmac (the Pi OS default for years, and NM drives it too). Licence BSD-3. |
| iwd | ~2-3 MB RSS, ~1 MB, needs ELL + kernel AF_ALG/crypto options, and **a D-Bus daemon** [M] | D-Bus `net.connman.iwd`: `Station.Scan`, `GetOrderedNetworks`, `Network.Connect`, `ConnectHiddenNetwork`, `KnownNetwork.Forget`, `Agent` (passphrase callback), `AccessPoint.Start`. https://iwd.wiki.kernel.org/ , docs in https://git.kernel.org/pub/scm/network/wireless/iwd.git/tree/doc | Clean API, fast scan/connect, own DHCP client optional (`EnableNetworkConfiguration=true`), credentials in `/var/lib/iwd/<ssid>.psk`, enterprise via `.8021x` provisioning files. LGPL-2.1. **brcmfmac caveats [V]**: iwd reports "SAE unsupported: brcmfmac needs CMD_EXTERNAL_AUTH" and falls back to WPA2 (maintainer: external auth not implemented in iwd, 2022-23 threads; re-check current iwd) https://github.com/raspberrypi/linux/issues/4976 , https://yhbt.net/lore/iwd/083f4a69-a164-404b-b4fb-9ce024a38156@gmail.com/ ; AP mode on fmac drivers did not work with iwd because brcmfmac lacks `NL80211_CMD_REGISTER_FRAME` https://community.infineon.com/t5/Wi-Fi-Bluetooth-for-Linux/Anyone-working-on-IWD-AP-mode-for-fmac-driver/td-p/264565 . Pi firmware without the `sae` feature (non-Pi firmware packages) also breaks WPA3 [V, lore thread]. |
| NetworkManager | 15-25 MB RSS, glib + libndp + dbus + (polkit), ~5 MB; slow-ish start (seconds) [M] | D-Bus `org.freedesktop.NetworkManager`; `nmcli`; keyfiles in `/etc/NetworkManager/system-connections`. https://networkmanager.dev/docs/api/latest/ | Pi OS Bookworm/Trixie default [V: cloud-init post uses `renderer: NetworkManager`]. Everything built in (hotspot, enterprise, VPN) but heaviest. |
| ConnMan | ~3-5 MB RSS, glib + dbus [M] | D-Bus `net.connman` (Manager, Technology, Service, Agent). Docs: https://git.kernel.org/pub/scm/network/connman/connman.git/tree/doc | Built-in DHCP, DNS proxy, NTP client, tethering; backend wpa_supplicant or iwd. Used by webOS, Sailfish, Batocera [M]. Yocto-friendly. Stagnant maintenance, glib. |

Regulatory country: required for 5 GHz and for legal TX power. Set with `iw reg set XX`, `cfg80211.ieee80211_regdom=XX` on the kernel cmdline, or wpa_supplicant `country=XX`; brcmfmac takes the country from cfg80211 and pushes it to firmware [M]. Needs `wireless-regdb` (regulatory.db, ~10 KB) in the rootfs and kernel with CFG80211_REQUIRE_SIGNED_REGDB satisfied [M]. Raspberry Pi OS exposes it as `raspi-config nonint do_wifi_country XX` and `regulatory-domain` in network-config [V cloud-init post]. Until set, Pi OS keeps the radio soft-blocked (rfkill) [M]: the app must ask country first (default from locale/timezone guess, confirm on screen).

brcmfmac on Pi: firmware blobs from `linux-firmware`/RPi-Distro `firmware-nonfree` (`brcmfmac43455-sdio.*` for 3B+/4/Zero 2 W (43436)/5 is 43455 via SDIO [M]). Known workaround for SAE offload bugs: `brcmfmac.feature_disable=0x82000` [V, linux#4976]. AP+STA concurrency is limited on the chip (single channel) [M]. Power save causes latency: `iw dev wlan0 set power_save off` for responsiveness (cost: ~0.2 W) [M].

Saving credentials: wpa_supplicant `SAVE_CONFIG` writes `wpa_supplicant.conf` (needs `update_config=1`); point `ctrl_interface` and config to the writable data partition (`/data/net/`), mode 0600. PSKs can be stored as 256-bit `psk=` hex derived from passphrase (`wpa_passphrase`/PBKDF2) so the clear text is not kept; app does the PBKDF2 or sends `psk="..."` and then `SAVE_CONFIG` stores whatever was set [M].

**Recommendation: wpa_supplicant with the ctrl socket.** Reasons: no D-Bus daemon (saves a process, ~1-2 MB, ~100-300 ms boot), best brcmfmac coverage incl. WPA3 via firmware SAE and AP mode in the same binary (needed for section 3), text protocol easy from Zinc. Revisit iwd only if (a) iwd gains `CMD_EXTERNAL_AUTH` and fmac AP support, and (b) the app already ships a D-Bus client. NetworkManager only if the base is Raspberry Pi OS Lite and we accept ~20 MB.

## 2. IP configuration

| Option | Footprint | API | Notes |
|---|---|---|---|
| dhcpcd | ~1-2 MB RSS (ELF ~300 KB) [M] | control socket (`dhcpcd -U <if>` dumps lease, `-n` rebind, `-k` release), hooks in `/lib/dhcpcd/dhcpcd-hooks` | DHCPv4 + IPv4LL (169.254/16 fallback) + DHCPv6 + RA/SLAAC in one process, ethernet and wlan; carrier detection starts/stops on link; BSD-2. Pi OS used it through Bullseye [M]. |
| systemd-networkd | ~3 MB RSS, part of systemd | D-Bus `org.freedesktop.network1` + varlink; `.network` files (`LinkLocalAddressing`, `DHCP=yes`, `IPv6AcceptRA`) | Only on a systemd base. Excellent defaults, async, `RequiredForOnline=no`. Pairs with wpa_supplicant-wlan0 service. |
| busybox udhcpc | <100 KB, ~0.3 MB [M] | script callback (`/usr/share/udhcpc/default.script`) | DHCPv4 only; no IPv4LL (add busybox `zcip`), no DHCPv6 (kernel does SLAAC if `accept_ra=1`; add odhcp6c for DHCPv6). Smallest. |
| iwd built-in | in iwd | `EnableNetworkConfiguration` in main.conf | wlan only, IPv4 DHCP + static; ethernet unmanaged. Only if iwd chosen. |

Ethernet: carrier-triggered; the app only needs link state (`/sys/class/net/eth0/carrier`, netlink `RTM_NEWLINK`) and the lease/addresses (`getifaddrs`). IPv6: kernel SLAAC + RA is enough for clients; link-local fe80 is automatic. Directly connected laptop (no DHCP server): IPv4LL gives `169.254.x.x` and mDNS then makes `zinc.local` reachable, a good maker/classroom case (cable between Mac and Pi).

**Recommendation: dhcpcd** (one daemon for eth0+wlan0, IPv4LL fallback, IPv6, tiny) on Buildroot/Yocto non-systemd; **systemd-networkd** if the base is systemd (already resident); udhcpc only when every KB counts and IPv4LL is added. Started after the first frame, per-interface, `--background`/`-b`.

## 3. First-run Wi-Fi without screen or keyboard

Most targets have a screen (7" DSI touch) so the primary path is on-screen: scan list, tap SSID, on-screen keyboard. The headless path (HDMI-less Zero 2 W, Pi 5 in a robot, etc.) needs one of:

| Method | How | Cost on our stack | Fit |
|---|---|---|---|
| Boot-partition file (section 4) | User writes SSID/PSK in Imager or a text file | none (parser only) | Primary headless method: zero radio tricks |
| AP + captive portal | Device brings up AP `Zinc-XXXX`, DHCP + DNS wildcard, HTTP form; phone joins, picks SSID. comitup https://github.com/davesteele/comitup (Python, NM + Avahi + dnsmasq, heavy), balena wifi-connect https://github.com/balena-os/wifi-connect (Rust, needs NM + dnsmasq, ~ a few MB) | wpa_supplicant `mode=2` (or hostapd) + busybox `udhcpd` or dnsmasq + a ~100-line HTTP page served by `zinc agent` | Good fallback: only on "no known network and no screen". brcmfmac AP+STA is single-channel, so scan first, then drop STA to host the AP [M]. Needs WPA2 password printed on a sticker or open AP + portal (users in education expect the phone popup: needs DNS wildcard + 302 on `/generate_204`, `/hotspot-detect.html`, `/connecttest.txt`) [M] |
| BLE Improv Wi-Fi | Web Bluetooth page / phone app sends SSID+PSK over GATT (spec https://www.improv-wifi.com/ [M]); Rust Linux peripheral via BlueZ D-Bus: https://docs.rs/improv-wifi [V from search] | needs BlueZ (`bluetoothd`, glib+dbus, ~5-8 MB) + `hciattach`/btuart for the Pi's CYW43455 | Nicest UX with Chrome/Android (Web Bluetooth), no iOS Safari support [M]. Heavy for a first version. Defer. |
| QR code | Screen shows a QR to open `http://<ip>:port` or AP join `WIFI:T:WPA;S:..;P:..;;`; or camera scans a QR with credentials | trivial QR encoder (vendored `qrcodegen`, MIT) | QR on screen helps once on network (open the web UI/pairing from phone). Camera path is optional and later. |
| USB serial / Ethernet | `zinc device` over USB gadget Ethernet (Zero 2 W/Pi 4/5 `dtoverlay=dwc2`, `g_ether`) | kernel gadget + link-local | Great for makers: plug USB, `zinc device` over 169.254 / mDNS; no Wi-Fi needed to configure Wi-Fi. cloud-init `enable_usb_gadget: true` exists in Pi OS [V]. |

**Recommendation:** v1 = on-screen setup + boot-partition file + Ethernet/USB-gadget; v1.1 = AP + captive portal hosted by the agent (wpa_supplicant AP + udhcpd); Improv BLE only if BlueZ is on the image for other reasons.

## 4. Headless config via boot partition (Raspberry Pi OS today)

Verified facts:
- `ssh` (empty file on `bootfs`) enables SSH; `userconf.txt` single line `<user>:<hash>` from `openssl passwd -6` creates the first user (name `[a-z_][a-z0-9_-]*`, max 31) [V https://www.raspberrypi.com/documentation/computers/getting-started.html]. Both are the documented manual path when Imager is not used.
- `wpa_supplicant.conf` dropped on the boot partition: **not available from Bookworm onwards** [V same page]. Bookworm's Imager used `firstrun.sh` (script on boot partition, run through `systemd.run=/boot/firstrun.sh` in `cmdline.txt`) [V, imager schema + forum via search].
- Trixie-based Raspberry Pi OS ships **cloud-init**: FAT boot partition holds `user-data` (`#cloud-config` header required), `network-config` (netplan v2: `wifis:`, `renderer: NetworkManager`, `regulatory-domain`, `access-points`, `optional: true`), `meta-data`; Pi module `cc_raspberry_pi` with `enable_ssh: true`, `ssh_pwauth`, `rpi:` (`spi/i2c/serial/onewire`), `enable_usb_gadget: true`. Wi-Fi password is plain text there. firstrun.sh "still works", transition begun [V https://www.raspberrypi.com/news/cloud-init-on-raspberry-pi-os/]. Imager 2.0 writes these by default [V, secondary source].
- `custom.toml`: not found in any official source I could fetch; I recall it as an Imager 1.9 / Bookworm-era file read by `raspberrypi-sys-mods` [?]. Do not depend on it.

Imager side [V https://github.com/raspberrypi/rpi-imager/blob/main/doc/json-schema/os-list-schema.json]:
- `os_list[].init_format` enum: `""`/`"none"` (no customisation UI), `"systemd"` (writes `firstrun.sh` + edits `cmdline.txt`; only works if FAT is mounted at `/boot`), `"cloudinit"` (writes `user-data` to FAT), `"cloudinit-rpi"` (cloud-init with Pi `cc_raspberry_pi` module), `"rpi-preseed"` (writes `rpi-preseed.toml` to FAT, applied on first boot by the `rpi-preseed` package; **file schema not found [?]**).
- `capabilities` on the OS entry (`rpi_connect`, `secure_boot`, `passwordless_sudo`, `i2c`, `spi`, `onewire`, `serial`, `usb_otg`) switch on wizard pages; `devices` tags filter by Pi model; `architecture`.
- Third-party opt-in: host a repo JSON (`imager` + `os_list`), open with `rpi-imager --repo <url|file>` [V https://www.raspberrypi.com/news/how-to-add-your-own-images-to-imager/]; set `init_format`, `devices`, `capabilities`.
- Exactly which files `cloudinit` vs `cloudinit-rpi` write (is `network-config` only under `-rpi`?) [?]: flash a test image with each and diff the FAT partition before fixing the parser.

**Proposed format for Zinc Pi OS (accept all, in this priority):**
1. `init_format: "cloudinit-rpi"` in our os_list entry, so Imager 2.x shows hostname, user, Wi-Fi (+ country), locale/timezone/keyboard, SSH key. Our `zinc-firstboot` (tiny, one-shot, runs before networking, after the first frame is irrelevant: it only edits files) reads FAT `user-data`, `network-config`, `meta-data` and implements a **subset**: `hostname`/`preserve_hostname`, `users[0].name|plain_text_passwd|passwd|ssh_authorized_keys`, `ssh_pwauth`, `timezone`, `locale`, `keyboard.layout`, `rpi.*` (i2c/spi/serial/onewire/usb_gadget), `enable_ssh`; network-config v2 `wifis.*.access-points.<ssid>.{password,hidden}`, `regulatory-domain`, `dhcp4/6`. Unknown keys are ignored and logged. Parser: vendored libyaml (MIT) or rapidyaml (MIT), never hand-rolled (repo rule). Real cloud-init is not run (Python, 10+ s of boot, tens of MB) [M].
2. Legacy flag files, for docs and tutorials people already know: `ssh` (enable sshd), `userconf.txt`, and our own `zinc.toml` (same keys flat: `hostname`, `wifi.ssid`, `wifi.psk`, `wifi.country`, `wifi.hidden`, `ssh`, `agent.discovery`, `agent.pairing_key`, `timezone`) for hand edits on any OS (Notepad on Windows). Also a drop-in `wpa_supplicant.conf` (the old Pi OS habit; trivial to honour since we run wpa_supplicant) [decision: support it, it is cheap and many guides still use it].
3. A flag file `zinc-agent` (empty) = enable network discovery and the agent daemon at boot, like `ssh`; `zinc-agent.off` disables. The settings screen toggles by creating/removing the same file on the data partition (FAT is mounted read-only; keep state in `/data`, boot flag is imported once then renamed `*.done` or deleted, as Pi OS does with `ssh`).
After consuming: move secrets to `/data`, delete/blank the plaintext Wi-Fi password from FAT (Pi OS keeps it; flag as a privacy gain), and write `firstboot.log` to FAT for support.
The `cloudinit-rpi` choice keeps one Imager flow across Pi models and tracks Raspberry Pi's direction [V]; fallback to `"systemd"` is a no-go (needs a shell script with `/boot` mounted and Pi helper tools).

## 5. Discovery, SSH, time

mDNS/DNS-SD:
| Option | Footprint | API | Notes |
|---|---|---|---|
| avahi-daemon | ~1-2 MB RSS, ~300 KB + expat + libdaemon-free, **needs D-Bus** for the API [M] | static `/etc/avahi/services/*.service` XML (no D-Bus needed to publish), D-Bus for dynamic | LGPL; Pi OS default; also does `.local` hostname |
| systemd-resolved | resident on systemd base | `/etc/systemd/dnssd/*.dnssd`, per-link `MulticastDNS=yes` | hostname + services, no browse API without D-Bus; coarse |
| Apple mDNSResponder | ~1 MB, `dns_sd.h` client lib + daemon (Apache-2) | DNS-SD C API (`DNSServiceRegister/Browse`) | Same API as macOS Bonjour; bigger build; Buildroot has `mdnsresponder` [M] |
| troglobit/mdnsd | ~100 KB, BSD [M] https://github.com/troglobit/mdnsd | `/etc/mdns.d/*.service` files + SIGHUP | tiny standalone, no D-Bus |
| umdns (OpenWrt) | small | needs ubus | no |
| tinysvcmdns | tiny lib | C API | unmaintained |
| mjansson/mdns | one header, public domain https://github.com/mjansson/mdns [M] | C: responder + query + browse in-process | no extra process; we own probing/conflict rules [?] |

**Recommendation: embed an mDNS responder in `zinc agent`** (mjansson/mdns, or mdnsd as an external fallback): discovery toggle = open/close the 224.0.0.251:5353 socket, publishes `_zinc._tcp` with TXT (name, version, pairing state), A/AAAA for `<hostname>.local`, answers on all up interfaces and re-announces on address change (goodbye packet TTL 0 on disable). Avoids avahi+dbus (two daemons). On a Raspberry Pi OS base use avahi (already there) and just drop a `.service` file. The dev machine side: macOS Bonjour, Windows 10+ native `.local`, Linux needs nss-mdns [M]; so the `zinc` CLI should also browse itself.

SSH: dropbear (~110-200 KB, RSS <1 MB, `-R` generates host keys on first connection, scp via its own protocol, **no SFTP server** unless `sftp-server` is added [M]) vs OpenSSH (~1.5 MB + libcrypto, RSS 5 MB+, keygen cost at first boot, SFTP built in). Since `zinc agent` carries sync, SSH is a maker convenience: ship dropbear, start it only when the `ssh` flag exists/toggle is on, with socket activation (busybox `tcpsvd`/systemd socket) so no resident process. Root login disabled; key from `user-data` or password from `userconf.txt`.

Time without RTC (Pi 5 has an RTC header; others none): TLS validation needs `now >= build time`. Plan: (1) at boot set clock to `max(build timestamp baked in image, /data/clock timestamp saved every ~10-15 min and on clean shutdown)` (the fake-hwclock idea [M]; with plug pulls the periodic save matters); (2) once network is up, NTP; (3) fallback: take the time from the dev machine on `zinc agent` pairing and from the HTTP `Date` header of any HTTPS fetch (as `tlsdate` did [M]). NTP clients: busybox `ntpd -q -p pool.ntp.org` (~tiny, SNTP-grade, step once), systemd-timesyncd (~1 MB, saves `/var/lib/systemd/timesync/clock`, only on systemd), chrony (~2 MB RSS, accurate, `makestep`, handles drift, runs as daemon with `rtcsync`). **Recommendation:** timesyncd on systemd, busybox `ntpd` (step, then exit) otherwise; chrony is overkill. Use `pool.ntp.org` with the `<vendor>.pool.ntp.org` zone only if registered [M]; NTP over UDP 123 may be blocked on school networks, hence the Date-header fallback.

## 6. Input and seat on a bare KMS console

- Evdev raw: the kernel gives `/dev/input/event*` (keyboard, mouse, touch, `raspberrypi-ts` for the official display, multi-touch protocol B). Raw is simple but reimplements acceleration, tap/palm, scroll, calibration transforms, device quirks.
- libinput (MIT; ~1 MB + libevdev + mtdev; optional libwacom off): gestures, pointer accel, touch coordinate transform (`libinput_device_config_calibration_set_matrix`, or the udev property `LIBINPUT_CALIBRATION_MATRIX`), rotation matrix, tap-to-click, palm rejection. Needs quirk data files `/usr/share/libinput/*.quirks` [M]. Two backends: **udev** (needs libudev with real `ID_INPUT_*` properties from systemd-udevd or eudev rules; libudev-zero is not a drop-in [?]) and **path** (`libinput_path_add_device("/dev/input/eventN")`, no udev; we do hotplug ourselves by `inotify` on `/dev/input` plus devtmpfs/mdev) [M]. https://wayland.freedesktop.org/libinput/doc/latest/
- SDL3 is already vendored in Zinc (AGENTS.md third_party list): its KMSDRM video backend has its own evdev input path (keyboard, mouse, touch, hotplug via udev or inotify) and a DRM hardware cursor [M]; check what `src/host` already uses before adding libinput, since the app drives KMS anyway [?, repo check not done].
- Keyboard layouts: libxkbcommon (MIT) + `xkeyboard-config` data (~4 MB+ of text under `/usr/share/X11/xkb`, trimmable to ~15 layouts, or precompile keymaps to strings at build time) vs a small table of layouts (US, FR AZERTY, DE, UK, ES, IT... plus dead keys/compose). Education market (France included) needs AZERTY at minimum. Layout choice comes from `keyboard.layout` in `user-data` [V] / settings screen. Recommend libxkbcommon with a trimmed XKB tree (compiled-in keymap strings, no `xkbcomp` needed since libxkbcommon compiles itself) [M].
- Touch calibration/rotation: official 7" panel is 800x480 landscape native; Pi OS rotates via `display_lcd_rotate`/DRM `video=DSI-1:...,rotate=` and the `vc4-kms-dsi-7inch` overlay params (`invx`, `invy`, `swapxy`, `disable_touch`) [M, verify against overlays README]. App applies the same matrix to touch and shows a 4-point calibration screen; store matrix in `/data/input.json`. Multi-touch needed for gestures.
- Mouse cursor: use the KMS cursor plane (legacy `drmModeSetCursor`/`MoveCursor`, or atomic cursor plane; vc4 exposes a cursor plane, 64x64 ARGB guaranteed, larger sizes via `DRM_CAP_CURSOR_WIDTH` [M]): zero redraw cost, moves even when the app renders slowly. Fall back to a software sprite if no cursor plane (QEMU/virtual). Hide it when only touch is present.
- Non-root + seat: (a) **plain groups**: user `zinc` in `video` (`/dev/dri/card0`, `renderD128`), `input` (`/dev/input/*`), `audio`, `gpio/i2c/spi` as needed; `devtmpfs` + a udev/mdev rule sets modes. Simplest; one app per machine so no seat arbitration needed. DRM master is acquired by the first opener when nothing else holds it; fbcon does not hold master on current kernels [M], so no VT switching code is needed if the app owns tty and no getty runs. (b) seatd/libseat (MIT, https://git.sr.ht/~kennylevinsen/seatd, ~100 KB, needs `seatd-launch` or a daemon; useful if later multiple apps or Wayland) and (c) logind (systemd only, heavy). **Recommendation: (a)**; keep libseat as a future option. Disable getty on tty1 and fbcon cursor (`vt.global_cursor_default=0 quiet logo.nologo console=tty3`) [M].

## 7. Device controls

| Control | Mechanism | Permission / note |
|---|---|---|
| Backlight (official 7" DSI) | `/sys/class/backlight/<name>/brightness` + `max_brightness`, `bl_power`. Name differs by driver: legacy `rpi_backlight`, KMS-era panel overlay exposes a backlight bound to the Atmel MCU at I2C 0x45 [M, verify name on a 3B+ with current kernel] | `brightness` root-owned by default: udev/mdev rule `chgrp video; chmod g+w`, or a 20-line setuid-free helper owned by the agent. Pi 5 with the new Touch Display 2 uses a different path [?] |
| Blanking / DPMS | KMS atomic: set CRTC `ACTIVE=0` (or connector `DPMS=3`) after idle timeout in the app; also `bl_power=1`; wake on any input event | App-side timer; `ZINC` idle policy in settings |
| Audio | ALSA direct (alsa-lib `snd_mixer`, `amixer`): `vc4-hdmi` cards, `Headphones` (bcm2835), USB audio; add `/etc/asound.conf` with `dmix` so two programs can play and a default card pick. PipeWire (+WirePlumber) needs ~15-30 MB RSS and a session manager [M]: skip unless Bluetooth audio is a goal (BlueZ A2DP wants PipeWire or bluealsa) | Group `audio` |
| Reboot/poweroff without systemd | `sync(); umount/remount ro; reboot(LINUX_REBOOT_CMD_RESTART|POWER_OFF)`; busybox `reboot`/`poweroff` work as PID 1 signals (`SIGTERM/SIGUSR2`). `reboot(RESTART2, "0 tryboot")` for A/B trial boot [M https://www.raspberrypi.com/documentation/computers/config_txt.html#autoboot-txt]. Pi 3/Zero: "halt" leaves the board powered; true power-off only on Pi 4/5 with `POWER_OFF_ON_HALT` EEPROM setting or via GPIO [M] | Needs root or `CAP_SYS_BOOT`: agent runs a tiny privileged helper (socket, whitelist of verbs) instead of running the whole UI as root |
| Hostname | `sethostname(2)` + persist `/data/etc/hostname`; re-announce mDNS | privileged helper; validate RFC 1123 |
| Timezone / locale | `TZ` file or `/etc/localtime` symlink to trimmed `zoneinfo` (full tzdata ~1-2 MB, keep ~10 regions or all; musl reads zoneinfo [M]); locale: keep `C.UTF-8`, UI strings are app-internal (no glibc locales needed, ~100 MB saved) | app-level; also feeds NTP choice |
| Storage info | `statvfs("/data")`, `/sys/block/mmcblk0/device/{name,date,serial}`, `/proc/mounts`; SD wear is unobservable, show free space and "read-only root" state | none |
| System info | `/proc/device-tree/model`, `/proc/cpuinfo` (Serial/Revision), `/proc/meminfo`, `/sys/class/thermal/thermal_zone0/temp`, `/sys/class/hwmon/*/in0_lcrit_alarm` (`raspberrypi-hwmon` under-voltage flag), `/sys/class/net/*/address`, `vcgencmd` equivalents via `/dev/vcio` mailbox (avoid `vcgencmd` dependency) [M] | world-readable |
| Updates / rescue | see section 8 | |
`raspi-config nonint` (Raspberry Pi's own non-interactive verbs: `do_ssh 0`, `do_wifi_country`, `do_wifi_ssid_passphrase`, `do_hostname`, `do_change_timezone`, `do_blanking`, `do_i2c`...) is a useful list of what settings users expect [M], but is a shell script tied to Pi OS files; do not ship it.

## 8. Updates and robustness

- **Read-only root + writable data**: root as squashfs (or erofs) or ext4 mounted `ro`, `/data` ext4 (journalled; `commit=30`, `noatime`), `/tmp` `/run` `/var/log` as tmpfs (logs ring buffer in RAM, dumped to `/data` on crash). Boot FAT mounted `ro`, remounted `rw` only for the flag-file import and updates. Pull-the-plug rules: all app writes via temp file + `fsync` + `rename` + dir `fsync`; no databases on the SD unless WAL + `synchronous=FULL` (sqlite plugin exists in repo); `fsck.ext4 -p` on the data partition at boot (fast with journal); format `/data` automatically if it is corrupt (and say so on screen). First boot resize of the data partition to fill the card (`sfdisk` + `resize2fs`, ~2-5 s) [M].
- **A/B via Raspberry Pi tryboot** [M, https://www.raspberrypi.com/documentation/computers/config_txt.html#autoboot-txt]: `autoboot.txt` in the first FAT partition with `[all] tryboot_a_b=1 boot_partition=2` and `[tryboot] boot_partition=3`; update writes the inactive set (boot FAT + rootfs), `reboot "0 tryboot"` boots it once; if the app reports healthy (first frame + agent up) it rewrites `autoboot.txt` to commit; a power cut or crash falls back to the old set automatically because tryboot is one-shot. Support: documented for Pi 4/5 with the EEPROM bootloader; **Pi 3B+ (SD-card `bootcode.bin`/`start.elf`) support [?]: test on the reference board before choosing A/B; fallback is a single-slot update with a recovery partition**. Zero 2 W same question [?].
- Update tools:
  | Tool | Footprint | Pi support | Verdict |
  |---|---|---|---|
  | RAUC | ~1 MB + glib + openssl + D-Bus service [M] https://rauc.readthedocs.io | Buildroot package, meta-rauc-community raspberrypi; Pi tryboot via `custom` bootloader backend [?] | proven, but pulls glib+dbus we otherwise avoid |
  | SWUpdate | ~0.5-1 MB, libconfig/zlib/openssl optional, own web UI/mongoose, Lua handlers [M] https://sbabic.github.io/swupdate/ | Buildroot + Yocto (meta-swupdate), `bootloader: none/custom` hooks | lighter, flexible `sw-description`, no D-Bus; good candidate |
  | Mender | Go client ~10 MB binary, 20-30 MB RSS [M] | official Pi images via meta-mender / mender-convert (U-Boot, not tryboot) | server-centric, too heavy and cloud-oriented |
  | DIY in agent | few hundred lines | native tryboot | Download `<ver>.img.zst` or squashfs + `sha256` + Monocypher (vendored in repo) signature, write inactive slot, set tryboot, commit on health. Fits "one app", offline update from USB stick or `zinc device` push. Violates "proven libraries" only for the flow, not crypto/codec |
  **Recommendation:** DIY thin logic in `zinc agent` over tryboot with Monocypher signatures for v1 (update source = dev machine push and USB stick; no cloud), keep SWUpdate as the drop-in if streaming, delta or multi-component updates are required. Decision is flagged because RAUC/SWUpdate are the proven choices and the repo prefers proven libs.

## Reference products worth copying from
- Home Assistant OS: NetworkManager, config USB stick labelled `CONFIG` with `network/my-network` keyfile, UI/CLI `ha network` [M https://www.home-assistant.io/common-tasks/os/#configuring-a-wi-fi-connection]. Idea: a removable-media/boot-partition config drop that is consumed once.
- balenaOS: NetworkManager keyfiles dropped in `system-connections/` of the boot partition, `config.json`, wifi-connect AP portal; read-only root + data partition [M https://docs.balena.io/reference/OS/network/2.x/network-setup/].
- Batocera: ConnMan behind an EmulationStation Wi-Fi menu with on-screen keyboard, settings in `batocera.conf` (`wifi.ssid`, `wifi.key`) [M]. Closest in spirit (controller/touch-driven settings, boot-partition config).
- KlipperScreen (touch UI for printers on Pi): network panel talks to wpa_supplicant/NetworkManager with an on-screen keyboard https://github.com/KlipperScreen/KlipperScreen [M]. Good UX reference for a kiosk Wi-Fi screen.
- webOS: ConnMan service behind a single UI (precedent for one shell app owning networking) [M]. Kano OS: Kano Wi-Fi GUI (project dormant) [M].
- Raspberry Pi: `raspi-config nonint`, Imager customisation, cloud-init move [V].

## Recommended stack

| Area | Choice | Why | API the app uses |
|---|---|---|---|
| Wi-Fi | wpa_supplicant (+ `iw`, wireless-regdb) | brcmfmac-proven, WPA3 + AP in one binary, no D-Bus | `wpa_ctrl` socket text commands + `ATTACH` events |
| IP | dhcpcd (systemd base: networkd) | eth+wlan, IPv4LL, IPv6, ~1 MB | `dhcpcd -U`, netlink/`getifaddrs`, `/sys/class/net` |
| Headless Wi-Fi | boot-file import, USB gadget/Ethernet; later AP+portal in agent | no extra daemons | files on FAT; wpa_supplicant `mode=2` + udhcpd later |
| Boot config | Imager `init_format: cloudinit-rpi` subset parser, plus `ssh`, `userconf.txt`, `zinc.toml`, `wpa_supplicant.conf`, `zinc-agent` flag | Imager works out of the box, legacy habits too | one-shot `zinc-firstboot` reading FAT, libyaml |
| mDNS | responder embedded in `zinc agent` (avahi on Pi OS base) | no extra daemon, toggle = socket | in-process |
| SSH | dropbear on demand | <1 MB, no resident | flag file; spawned by `tcpsvd`/socket unit |
| Time | saved-timestamp floor + NTP (timesyncd or busybox ntpd) + Date-header and pairing fallback | TLS without RTC | `clock_settime` via privileged helper |
| Input | SDL3 evdev path if host already uses it, else libinput path backend; libxkbcommon trimmed | no udev needed, calibration API | evdev/libinput events, inotify hotplug |
| Cursor | KMS cursor plane | free, smooth | DRM ioctls |
| Seat | plain groups `video input audio`, no seatd | one app | file permissions |
| Backlight/DPMS | sysfs + KMS atomic ACTIVE | no daemon | `/sys/class/backlight`, DRM |
| Audio | ALSA direct + dmix | no PipeWire | alsa-lib |
| Power/hostname/time setters | privileged helper over unix socket, verb whitelist | UI never runs as root | socket JSON |
| Updates | tryboot A/B, signed images (Monocypher), RO root + `/data` | power-loss safe (Pi 3B+ tryboot to verify) | agent update flow, `reboot "0 tryboot"` |

## Daemons at boot, in order relative to the first frame

Before the first frame (budget: kernel + init + app, nothing else resident):
1. Kernel + devtmpfs, `init` (BusyBox or tiny systemd), mount RO root, `/data` (fsck), tmpfs, set clock floor, run `zinc-firstboot` (file import, ~ms; no network).
2. Privileged helper (small, socket-activated or started here; verbs: set clock, hostname, reboot, backlight, rfkill, wifi country).
3. `zinc` app (as user `zinc`): opens DRM + input, draws first frame, then signals readiness (file/socket).
After the first frame (started by init on the readiness signal, or by the app via the helper):
4. `wpa_supplicant -B -i wlan0 -c /data/net/wpa.conf -u?` (country applied before scan; rfkill unblocked).
5. `dhcpcd -b` (eth0 immediately, wlan0 on association; IPv4LL fallback).
6. `zinc agent` (discovery/mDNS responder, pairing, sync) only if enabled by flag/setting; opens sockets on up interfaces.
7. NTP step (`ntpd -q` / timesyncd) once an address exists, then updates the clock floor file.
8. `dropbear` on demand (only if `ssh` flag), via socket activation: not resident.
Not present on the image: NetworkManager, avahi, dbus-daemon, polkit, logind, PipeWire, BlueZ (unless Improv/BT audio is later required), cloud-init, getty.

Open items to test on hardware: tryboot on Pi 3B+/Zero 2 W; backlight node name and touch overlay parameters on a current kernel; exact files Imager writes for `cloudinit` vs `cloudinit-rpi`; `rpi-preseed.toml` schema; whether current iwd supports SAE on brcmfmac; SDL3-vs-libinput in `src/host`.
