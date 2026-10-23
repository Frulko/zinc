# Pi OS image: what Zinc already has, and the gaps (2026-10-22)

Research only, from reading code, docs and backlog; nothing built, run or touched on the Pi. Paths are relative to the repository root.
Tags: **[V]** = seen in code, **[D]** = from a report/doc (measured by its author, not re-checked), **[?]** = could not verify.
Reference device: Pi 3B+ + official 7" DSI (800x480, FT5x06), `docs/reports/raspberry-pi.md:6-14`.

## 0. Verdict in six lines

1. A Zinc app can already own a bare Pi screen with no X/Wayland, two ways: `display-fbdev` (CPU, 4-thread band raster, KMS planes) and `display-gl` (KMS+GBM+EGL+GLES2). Both are proven on the Pi 3B+ only.
2. Touch and mouse work on both; a **physical keyboard types nothing** into a text field on either (no HalKey/text events, only gamepad-style key mapping). No hotplug, no xkb, no libinput.
3. The mouse cursor is a real KMS cursor plane in `display-gl` only; `display-fbdev` draws no cursor at all.
4. `zinc agent` / `zinc device` are a complete adb-like system (mDNS, 6-digit PAKE pairing, push/run/logs/OTA, systemd user unit) but discovery **cannot be toggled at run time** and **announces once**: started before the network is up, mDNS never starts.
5. System APIs for a settings app are thin on Linux: `network()` says online/offline only (no SSID, no scan, no connect), no backlight, no reboot/shutdown, no D-Bus. `zinc:process` + `nmcli`/`systemctl` is the only path today. The planned `zinc:wifi` (ZN-558) is Backlog.
6. The splash is skipped on display plugins, there is no boot-time measurement of anything on the Pi, and no OS image work exists anywhere in the repo (the only Pi-OS-level doc is the bare-metal study, which prefers Circle and treats Buildroot as the fallback).

## 1. Display without X/Wayland

| | `display-fbdev` | `display-gl` (KMS) |
|---|---|---|
| Files | `plugins/display-fbdev/fbdev.cpp` (741 l), `plugin.json` | `plugins/display-gl/src/kms.cpp` (273 l), `display_gl.cpp`, `plugin.json` |
| Stack | `/dev/fb0` mmap, 16/24/32 bpp conversion (`fbdev.cpp:57-83`); on a KMS screen with free overlay planes, two 32 bpp buffers + atomic commit per refresh (ZN-735, `fbdev.cpp:256-260`, comment `:205-216`) | DRM card scan (`kms.cpp:40`), GBM surface XRGB8888 (`:174`), EGL GBM platform (`:176-177`), `drmModePageFlip` paced on vblank (`:226-259`), saved CRTC restored at exit (`:264`) |
| Renderer | software, `render_bands.h` pool, bands of 16 rows, all cores (`docs/plugins/display-fbdev.md` "Rendering uses every core") | GL replay `runtime/gl_replay.cpp`, `renderer: auto` falls back to CPU when the context cannot run it (`display_gl.cpp:22`) |
| Libs needed | none beyond libc (DRM headers optional via `__has_include`, `fbdev.cpp:205`); KMS plane path uses raw ioctls, no libdrm | `egl glesv2 gbm libdrm` (`plugin.json` `pkg`), Mesa vc4 (Pi 3) / v3d (Pi 4/5) |
| Console | `KDSETMODE KD_GRAPHICS` on `/dev/tty0`, restored on exit (`fbdev.cpp:515-517,733`) | takes DRM master; fails with "is another program the DRM master?" (`kms.cpp:251`) |
| Size | surface = screen size unless zinc.json names one; else letterboxed nearest (`docs/plugins/display-fbdev.md`) | same from the connector's preferred mode; `ZINC_GL_MODE`, `mode` option (`docs/plugins/display-gl.md`) |
| Pacing caveat | `FBIO_WAITFORVSYNC` returns at once on the DSI panel (kernel emulation waits on the wrong CRTC); driver falls back to fps sleep, or the plane flip event paces it (`docs/plugins/display-fbdev.md`, `raspberry-pi.md:486`, `fbdev.cpp:666`) | pageflip event, real vblank |
| Headless/no device | `init` returns 0, null HAL keeps running (`fbdev.cpp:1-4`) | returns false with a stderr line (`kms.cpp:172`) |

Measured (all Pi 3B+, 1400 MHz, proper supply, hero 800x480; `raspberry-pi.md:262-283`, `pi-1080p.md`) **[D]**:

| screen | fbdev software 4 threads | display-gl GPU (now) |
|---|---|---|
| home (idle/simple) | 14.9 ms, vsync-bound | 14.8 ms |
| gallery | 14.1 ms | 22.8 ms (slower on GPU) |
| navigation (heavy driving) | 19.1 ms (raster 17.7) | 25.0 ms (was 181) |
| CPU per frame, navigation | 80 ms, 289% of a core | 21 ms, 56% |
| first frame (GL) | n/a | 277-295 ms (was 1.1 s) |

`pi-1080p.md:9-25`: at 1920x1080 on display-gl every app scene is 60 fps (lists, scroll, animations, text); only two stress scenes stay under (translucent full-screen layers 30, big gradients 15). At 720p everything is 60. For a settings shell (lists, switches, text) either path is far inside budget at 800x480.
GPU research: `docs/reports/hardware/vc4-gles2-performance.md:3-4` (Pi 3B+ only; Pi 4/5 appear in `raspberry-pi-threejs-and-sdk.md:107-108` as hardware tables, not measurements).

Support status per board **[D]**: `display-gl.md` matrix says Pi 3B+ with 64-bit Debian "verified"; the 32-bit/Pi 4/Pi 5 row is "builds in docker, not run on hardware". Nothing in the repo measures Pi 4/5 (ZN-585, Backlog, "Raspberry Pi 4/5 and Pi 3 numbers for the four JS game demos"). Pi 5 / DSI Touch Display 2: no evidence of a run **[?]**.
Other display plugins not for this device: display-st7789/ssd1306/scrollphat (SPI/I2C panels), display-rmpp, display-webos, display-remote.
Also relevant: DRM planes already used for video (zero-copy, ZN-731, `raspberry-pi.md:421-457`: 3.5-4.8 ms CPU for a 24 fps film). Idea not done: scan out 720p scaled by the HVS to 1080p (`pi-1080p.md:63`).

## 2. Input on a bare console

Both drivers read **raw evdev**: no libinput, no libudev, no xkb (grep of `src plugins runtime targets lib` finds evdev only in these two drivers and in vendored LVGL).

| Capability | `display-fbdev` | `display-gl` (KMS) |
|---|---|---|
| Device discovery | opens `/dev/input/event0..31` once at init, max 16 (`fbdev.cpp:114-141`, call `:519`) | same loop (`kms.cpp:107-119`) |
| Hotplug | none (no inotify/udev): a keyboard plugged after start is never seen **[V]** | none **[V]** |
| Touch | multitouch protocol B slots -> `HalInput.touch[]`, first touch drives pointer; tap latch so a fast press/release is not lost (`fbdev.cpp:95-104,189-196,685-697`); coordinates mapped through letterbox (`:165`) | **single pointer only**; `ntouch = 0` with a `ponytail:` comment (`kms.cpp:164`), ABS_MT_POSITION_X used as plain X (`:150-153`) |
| Mouse | REL_X/Y, wheel, left button (`fbdev.cpp:181-186`) | same (`kms.cpp:143-149`); only left button |
| Keyboard | keys mapped to **gamepad buttons** (arrows/WASD, Space, Z/X/C/V, Q/E, Enter, Tab; `fbdev.cpp:146-160`); Esc quits (`:178`); keyboards `EVIOCGRAB`bed (`:139-140`) | same table (`kms.cpp:121-137`), Esc quits |
| Text / layouts | **no `HalKey`/`HAL_KEY_TEXT` events at all**: `grep nkeys\|HAL_KEY` hits only `runtime/zrt.cpp, gfx.cpp, raster.cpp, hal_dispatch.cpp, webos.cpp` plus the SDL HAL, not fbdev/kms. `hal.h:30-36` defines the keys/text path that only window HALs fill. No xkb, no layout, no compose, no key repeat **[V]** | same **[V]** |
| Cursor | **none drawn** (the grep for "cursor" in fbdev.cpp only hits the console cursor switch, `:515`) | hardware cursor plane: 64x64 ARGB arrow built with GBM `GBM_BO_USE_CURSOR`, `drmModeSetCursor/MoveCursor`, shown from the first REL event so a touch screen shows none (`kms.cpp:84-104,163`) |
| Input option | `input`/`grab` options in `plugin.json`; `ZINC_FBDEV_SIM_INPUT` plays raw `input_event` files (tests, `fbdev.cpp:110-117`) | none |

Consequence: on the bare-console path an on-screen keyboard works (`Keyboard` types through `ui.insertText/sendKey`, `lib/std/kit/keyboard.tsx:9-10`) but a USB keyboard cannot type into the UI, and Wi-Fi passwords would have to be typed on screen. The SDL HAL (window, text input, clipboard, cursors, `hal_dispatch.cpp:24-33`) is not what a no-X Pi uses: SDL3 in the engine only offers X11, KMS/DRM, offscreen (`docs/targets/linux.md:19`), and SDL's KMSDRM input path was not tried on a Pi **[?]**; exported apps on a Pi use the plugin drivers (`raspberry-pi.md:155-158`).
Planned: ZN-552 "evdev input hub and SDL3 gamepads" (Backlog, size-M): one evdev reader shared by both drivers, keys, mice, MT, gamepads, **inotify hotplug**, uinput tests. It does not mention text/xkb. Design: `docs/reports/hardware/raspberry-pi-threejs-and-sdk.md:483`.
`pointerIsCoarse()` (`lib/std/ui.ts:2007`) decides whether the keyboard shows in `mode: 'touch'`; ZN-227 (Done) made it per input device.

## 3. Splash and startup

- `src/host/splash.cpp` (199 l): ZN-446. The first frame of the window, composed from a `.splash` entry (ZSP1: background colour, image, fit, minMs, fadeMs) of `boot.zpk` or `ZINC_SPLASH`, drawn through the HAL's own present before the program is compiled, fonts baked or plugins loaded (`splash.cpp:1-4`, format in `docs/reports/zinc-next-assets.md` "The engine splash"). `zinc.json` `splash` key; `minMs` holds it (`:103`).
- **It does nothing on a display plugin**: `if (p && n && zn_hal_wants_window() && !hal_display) shown = present(...)` (`splash.cpp:187`); `backlog/later.md:688` records it ("showSplash skips runs with a display plugin today"). So fbdev/KMS apps get no splash from the engine.
- Measured exec-to-splash exists only on macOS: 406.8 ms `zinc run`, 425 ms built executable, half of it SDL video init (`backlog/tasks/zn-446*:49,63`). AC #1 for Linux and Pi 3 is open in Review (`later.md:687`, tool `tools/splash-time`).
- Measured time to first real frame on the Pi: **only** display-gl, 277-295 ms of render setup after the context exists (`raspberry-pi.md:271,291`); no exec-to-first-frame number for fbdev or for a whole AOT binary start on a Pi **[?]**. Process start cost on a Pi 3 (58 MB unstripped binary, page-in from SD) is unmeasured.
- Early boot splash: nothing in the repo. Candidates not present: initramfs/psplash/Plymouth, `splash.img` via the firmware (`disable_splash`, `config.txt`), the bare-metal study's "boot ~1 s to first pixel [UNVERIFIED]" with Circle (`docs/reports/zinc-next-baremetal-pi.md:25,54,89`). A tuned Linux Zero 2 W boot is quoted there as 3.5 s (no source named) **[D]**.
- Pi power matters more than any engine number: under-voltage dropped the clock to 600 MHz and x2.3 on every figure (`raspberry-pi.md:55-72,188`).

## 4. `zinc agent` / `zinc device`

Doc: `docs/reports/zinc-next-agent.md` (364 l, D116). Code: `src/agent/{server,client,wire,dev,ota,inspect,mdns}.cpp` (3.2 kl with `src/net/dnssd.cpp`). Tests `tests/t0/agent.sh`, `tests/t1/agent_*.sh` (loopback only).

| Aspect | What exists |
|---|---|
| Transport | TCP 7733, one request per connection, plain `ZNA1 pair|sess` line then TLS; frames `J I O E X W C` (`agent.md` "Protocol") |
| Pairing | `zinc agent` prints a 6-digit code when no workstation is paired; `zinc agent pair` makes a new one (5 min, 3 tries, one workstation). TLS 1.2 EC J-PAKE with the code as password, then per-workstation key; sessions TLS 1.3 PSK+ECDHE (`agent.md` "Security"). Code in `<home>/pairing.json` so the CLI and the daemon need no channel (`server.cpp:105-148`) |
| Discovery | mDNS/DNS-SD `_zinc._tcp`, TXT `id v os kind pair` (`server.cpp:789`, `src/agent/mdns.cpp`, `src/net/dnssd.cpp`); IPv4 only; avahi on the Pi holds 5353 and the coexistence is untested (`agent.md` "Not proven yet", `:~330`) |
| Ops | `info shell push pull install run stop uninstall apps logs dev connect listen accepted top unpair update` (`agent.md` op table). `zinc device deploy` builds for what `info` reports: `rpi` export for an aarch64 Pi, `rpi2`/`rpi1` for 32-bit; sets `ZINC_DISPLAY=fbdev` when the project names no display (`agent.md` "What deploy builds") |
| Apps | `~/.zinc/agent/apps/<name>/` (`app.zapp` or export dir with `run.sh`), log `logs/<name>.log` (4 MiB cap), pid `run/<name>.pid`; apps start in their own session, outlive the agent (`agent.md` "Files of the agent", `server.cpp:1-3`) |
| Dev loop | `zinc dev --device` sends changed members, runs `zinc run program.zbc` there, 77-85 ms save-to-start on loopback; **needs the engine on the device** (`agent.md` "zinc dev --device") |
| OTA | signed `.zapp`, rollback with a 5 s trial; engine update only downloads and verifies, does not install (`agent.md` "service and signed updates", `later.md:159,730`) |
| Auth store | `~/.zinc/agent/clients.json` (device), `~/.zinc/devices.json` (workstation), 0600 (`server.cpp:87-96`) |
| Service | `zinc agent install` writes `~/.config/systemd/user/zinc-agent.service` (`Restart=always`, `KillMode=process`) + `loginctl enable-linger`; refuses root (`server.cpp:742-745`); **never run on a Pi** (`later.md:643`) |
| Linux/Pi run | engine built in Docker (`tools/linux-build`), `zinc` 18 MB, package 42.7 MB packed/146 MB on the Pi; `zinc agent pair` and `zinc run` verified on the Pi 3B+, agent serving a paired workstation **not** proven (`agent.md:~335-340`) |
| Stats on Linux | `info` reads `/proc/meminfo`, `/sys/class/thermal/thermal_zone0/temp`, `statvfs` (`server.cpp:257-265`), model from `/proc/device-tree/model` (`:195-201`) |

Gaps against the wish list, **[V]**:
- **Toggle discovery at run time: not possible.** Flags `--no-mdns`, `--no-shell`, `--bind`, `--port` are read once at start (`server.cpp:731-745`); the announcer thread only stops on `gStop` (`:791`); `dnssd::announce` returns for good if `Responder::open` fails (no multicast yet) and never retries (`src/net/dnssd.cpp:291-298`). The TCP listener is always on `0.0.0.0` (`server.cpp:767-776`), so "discovery off" would still leave the port open to anyone holding the key; a pairing code is the only gate. No `/boot` flag file, no signal, no control socket, no `zinc agent` subcommand to flip it.
- Network-up-later works for TCP (the listener is bound to 0.0.0.0 before any interface exists) but not for mDNS (above). Backlog `later.md:637` flags it as untested.
- `zinc agent pair` code is only printed to a terminal/log; "the pairing code on the device's screen... and as a QR code" is a later.md idea (`later.md:195`). `zinc:link` (`plugins/link/index.ts:212-308`: `init advertise browse openPairing closePairing onPairing onPaired pair connect onConnection peers forget`) is the same protocol exposed to apps, so an on-screen pairing UI inside a Zinc app could be built on it, but the agent daemon itself is a separate C++ process.
- `zinc device unpair` is not implemented client-side (`agent.md` Atelier notes "Not there: forgetting a device").
- Agent hands its own env to apps (`later.md:173`); the app's display driver is chosen by the exporter, not by the agent.

## 5. APIs for a settings/system app

| Need | What exists | Gap |
|---|---|---|
| CPU model, memory, uptime, load, interfaces (IP, mask, MAC) | `zinc:os`-style host ops: `/proc/cpuinfo`, `HostOsTotalmem/Freemem/Uptime/Load/NetStart` (`src/host/sys_host.cpp:1070-1310`, `include/zn/runtime.h:167-169`) | **No CPU temperature, no throttle flag, no storage size/free (statvfs only in the agent), no SD/card info** in the app API |
| Model of the machine | `device('device')`: `/sys/firmware/devicetree/base/model` and `compatible` (`sys_host.cpp:426-427`), `lib/std/device-info.ts` | OK |
| Network state | `device('network')` on Linux: any non-loopback IPv4 UP+RUNNING interface gives `{online, type:"unknown"}` (`sys_host.cpp:531-541`); `zinc:hardware.network()` (`lib/std/hardware.ts:53-60`) carries a `ssid` field that Linux never fills | **No SSID, signal, scan, connect, disconnect, forget, hotspot, ethernet/Wi-Fi distinction.** "wifi" in `sys_host.cpp:222-226` is the simulator's fake answer (`network.ssid`, `10.0.0.2`), not a real Wi-Fi API |
| Wi-Fi | planned `zinc:wifi` (ZN-558, Backlog, L): NetworkManager over D-Bus (sd-bus dlopen'ed) with `nmcli` fallback, `has()=false` without radio; ZN-520 (CHIP): status/join through nmcli via `zinc:process` or wpa_supplicant | all of it. Design in `raspberry-pi-threejs-and-sdk.md:489` |
| Run commands | `zinc:process` (`plugins/process/index.ts`): `spawn` with args/cwd/env, streamed stdout/stderr lines, stdin, kill, exit code; `run()` collects; no shell | usable for `nmcli`, `systemctl`, `raspi-config`, `vcgencmd`; works on linux/rpi1 targets only (`plugin.json`), not packaged for a 2-5 MB OS with no `nmcli` |
| Sockets | `zinc:socket` TCP/Unix/UDP/DNS/WebSocket (`plugins/socket`); Unix sockets could reach a daemon | no D-Bus client |
| Brightness/backlight | `zinc:device.setBacklight()` is LEDC PWM on ESP32; on macOS/linux the plugin keeps a number and `hasBacklight()` is false (`plugins/device/index.ts:8-25`, `native/device.host.cpp:1`); `webos` has `setBacklight` | **no `/sys/class/backlight` driver** (the official 7" panel exposes `rpi_backlight` there **[?] not checked on the rig**) |
| Reboot / shutdown / sleep | `zinc:system/power` = battery, idle seconds, dark mode, sleep lock (`plugins/system/power.ts`); `grep reboot|shutdown|poweroff` in `plugins/system` finds none | only `process.run('systemctl'...)`/`poweroff` (needs polkit or root) |
| Autostart | `zinc:system/autostart`: XDG `.desktop` on Linux (`plugins/system/autostart.ts:1`); the system plugin's Linux backend is a recording stub (`plugin.json` `"linux": {}`, live code only for macos/ios/android) **[V for plugin.json; behaviour [?]]** | no systemd unit for an app (an image would own this) |
| Power/throttle | planned `zinc:power` (sysfs thermal/cpufreq/hwmon, `GET_THROTTLED` via `/dev/vcio`): only in the SDK plan (`raspberry-pi-threejs-and-sdk.md:490`); `tools/device status` reads it over ssh | no app API |
| Hardware I/O | `zinc:gpio/i2c/spi` planned (`raspberry-pi-threejs-and-sdk.md:~480-484`); `zinc:serial` exists | n/a for the shell |
| D-Bus | none anywhere (ZN-558 would add sd-bus) | needed for NetworkManager/logind/BlueZ if the base OS has them |
| Files / preferences | `zinc:fs`, `zinc:storage`, `async-storage` plugin (JSON KV) **[not read: names only]** | where prefs live on a read-only root is an image decision |
| Bluetooth, audio | `zinc:ble` (plugin, SimpleBLE-free plan ZN-558); `plugins/audio` = miniaudio with runtime-linked ALSA | not needed for v1 |

`lib/std/hardware.ts` and `device-info.ts` are the only "what is this machine" APIs; neither is a settings API.

## 6. UI building blocks

- Kits: `lib/std/kit` (button, card, form, list, switch, slider, tabs, progress, alert, badge, avatar, stat, overlays, menubar, separator, theme, typography, kbd), `lib/std/nuxt` (controls, navigation, overlays, variants: Nuxt UI 4 port), JSX with `className` and capitalised components (AGENTS.md rule). `zinc:ui` has text fields, scrolling, flings, focus, undo, selection (`lib/std/ui.ts`).
- **On-screen keyboard exists and is mature**: `lib/std/kit/keyboard.tsx` (271 l) + `keyboard-layouts.ts` (106 l, data layouts, `registerLayout`): shows when a text field has focus (`mode` auto/touch/always/never), types through `ui.insertText/sendKey`, numeric/decimal/tel/email/url layouts from the field's `inputMode`, key bubble, long-press accents, backspace repeat, shift lock, a language key, retract control; header names "kiosks, Pi touch screens, reMarkable, ESP32 panels" (`keyboard.tsx:3`). Demo `examples/ui/keyboard`; ZN-227 (Done) fixed clipping and device-based auto mode; hero has a Forms tab. Layouts shipped: not counted **[?]** (`registerLayout`, French cited as `fr` in the header).
- Wi-Fi password entry: `<TextInput>` with a secure option is **[?]** not checked; RN `TextInput` exists (ZN-367.02 Done).
- Launcher/settings-like demos: `examples/webos-shell` (a launcher grid for HP webOS: `id\ttitle\ticon` list in `apps.txt`, starts programs through `zinc:webos`; sample list on desktop), `examples/hero` (Settings tab, 800x480 Pi layout), `examples/iot-panel` (device panel), `examples/system/desktop`, `examples/nuxt-ui`, `examples/rn-showcase`, `examples/zinc-go`, `examples/flipctl`. Atelier's Devices panel (`app/atelier`, `tests/t1/atelier_devices.sh`, `agent.md:~296-320`) drives `zinc device` from a UI: closest reference for an agent-control screen. **No on-device launcher or settings shell exists**; no "start another app and come back" helper for Linux (webOS has one via the system's app manager).
- `examples/music-tree`: the AS3-style display tree on `zinc:gfx` used on TouchPad/Nexus 7 (owner rule in AGENTS.md "Demos"), faster than `zinc:ui` on old devices. Not needed on a Pi 3B+: `zinc:ui` runs at 60 fps there (hero Settings/Tasks 15 ms idle, `raspberry-pi.md:278`).
- Responsive layout: `hero` takes its desktop layout at 1920 wide and a compact one at 800; ZN-272 Done (pointer-coarse, safe-area, keyboard inset media queries).

## 7. The exported Linux binary (`zinc export --target rpi`)

- Targets: `rpi` = `aarch64-linux-gnu.2.28`, `-mcpu=cortex_a53` (`src/tc/tc.cpp:191`, `src/cli_core.cpp:725`); `rpi2`=`armv7`, `rpi1`=`armhf` ARMv6 (`tc.cpp:193-195`). **glibc floor 2.28** ("Debian 10, Ubuntu 20.04, RHEL 8", `tc.cpp:189`, `docs/targets/linux.md:20`). A musl/static build exists in a former Alpine route (`rpi1` old Docker path, `raspberry-pi.md:21`) and for CHIP (`ntc-chip.md:111` says "one binary for jessie, trixie, OpenWrt, Buildroot": musl-linked) **[D]**.
- Output `dist/<name>-<target>/`: executable, `run.sh` (`cd dir; exec ./name`, `cli_core.cpp:1796`), `README.txt`, `assets/`, optional `<name>.res` with `--no-embed`, optional `.deb` (`--deb`) (`cli_core.cpp:116,1796-1798`). Hero: **58 MB, not stripped** (`raspberry-pi.md:155`); `later.md:176` wants strip + diff-only sends. Older prototype figure 5-6 MB was a different build (`raspberry-pi.md:22`).
- Dynamic dependencies of an exported app: libc only for fbdev + software; `display-gl` adds `libEGL libGLESv2 libgbm libdrm` at link time (`display-gl/plugin.json` `pkg`), `zinc:video` adds FFmpeg (`libavcodec61` etc.), `audio` is miniaudio with runtime-loaded ALSA **[D]**. Plugin native code is cross-built by `zinc plugin-build --target aarch64-linux` (25 of 32 plugins, `docs/targets/linux.md`).
- **Sysroot issue** (ZN-334, Backlog; ZN-546 Backlog): zig supplies libc, not Mesa/libdrm. A cross build asks pkg-config about `~/.zinc/sysroots/aarch64-linux`, **filled by hand** from a Pi with `tools/device <pi> sysroot libegl-dev libgles-dev libgbm-dev libdrm-dev libgl-dev` (`raspberry-pi.md:166-170,199-201`; `tools/linux-sysroot`, `tools/linux-sysroot.lock` exist for `zinc` itself). The link uses `--allow-shlib-undefined` because the Pi's libs name a newer glibc than zig's target (`src/tc/plugin_build.cpp:434`). For a custom image this means the image's Mesa/libdrm build must supply the sysroot, or display-gl is skipped and fbdev used (no sysroot needed).
- The engine itself (`zinc` CLI, needed only for `zinc dev --device`/.zapp, not for exports): built in Docker, 18 MB, loads X11/KMS/EGL via SDL3 statically (`docs/reports/zinc-next-agent.md:~315-320`); an archive also ships plugin **sources** and compiles them on first use with a 50 MB zig download (`docs/targets/linux.md` "Build zinc for Linux", `later.md:609`): unusable on a minimal image, so an OS image would run exported apps only.
- Does the exported app run standalone as `./run.sh` on a fresh image? Yes by design **[D]**, proven on 64-bit Raspberry Pi OS Debian trixie only (`raspberry-pi.md:150-158`).
- A Zinc-built shell app would be exported with `ZINC_DISPLAY=fbdev|gl` or `zinc.json` `"display"` per target (`docs/plugins/display-fbdev.md` first lines); no default driver is picked (`later.md:659` ZN-334 note).

## 8. Prior work in the repo

`docs/reports/zinc-next-baremetal-pi.md` (ZN-169, 2026-10-07, research only, nothing run):
1. Verdict: a MicroPython-like experience (flash once, then upload) is feasible on Pi 1-5 on **Circle** (C++ bare metal; USB HID, FB, SD, TCP/IP, QEMU).
2. Circle is GPL-3.0-or-later with no exception: a firmware image containing it is GPLv3 as a whole (decision S0 open); Wi-Fi/Bluetooth: "do not attempt".
3. The VideoCore blobs (`bootcode.bin`, `start*.elf`) remain; sub-1 s to first pixel is plausible with `start_cd.elf` **[UNVERIFIED]**; no Linux, so no threads, GL, ffmpeg, sqlite or sockets as shipped.
4. It scored Buildroot Linux about equal (108 vs 107, "boot speed, heavy") and recommends keeping the Linux Pi target for apps needing those (`:104-115`); roadmap tasks ZN-207..222 all Backlog.
5. Reuses the device protocol `include/zn/devproto.h` + `src/dev/core.cpp` (the ESP32 pattern), not the agent's TLS protocol. Not an OS-image plan.

Tasks and lines, grep of `backlog/tasks` and `backlog/later.md` (status as in the file front matter):

| ID | Title | Status |
|---|---|---|
| ZN-169 | Research bare-metal Raspberry Pi core | Done |
| ZN-207..222 | RPI-BM0..BM15 Circle core (UART, FB, SD, USB HID, flash tool, repl) | Backlog |
| ZN-133 | Pi and Linux ARM runner, pinned qemu-user, CI image without Docker | Backlog |
| ZN-227 | UI virtual keyboard shown by input device | Done |
| ZN-334 | Pinned Linux sysroots for EGL/GLES/GBM/DRM cross builds | Backlog |
| ZN-546 | armhf/aarch64 graphics hosts against a Pi OS sysroot | Backlog |
| ZN-552 | evdev input hub and SDL3 gamepads (inotify hotplug) | Backlog |
| ZN-558 | zinc:wifi and zinc:ble over D-Bus (NetworkManager, BlueZ) | Backlog |
| ZN-520 | Wi-Fi status/provisioning, BLE on CHIP | Backlog |
| ZN-560 | Linux kernel simulation CI image and QEMU raspi boot tests | Backlog |
| ZN-562.04 / 563.02 / 590.03 | GLES2 vc4 tiers for gl, 3d, GPU strokes | Backlog |
| ZN-446 | Engine splash from the first frame | Review |
| ZN-660 / 662 / 665 | Linux touch table kiosk start, showcase demos on the Pi, kiosk relaunch after crash | Backlog |
| ZN-729 (.01 .04 .07 .08) | Agent daemon; service + OTA (.04 Review); on Linux/Pi (.07 Done); deploy to target (.08 Done) | parent Backlog |
| ZN-731 / 735 | Zero-copy video planes; fbdev page flips | Review / (done in code) |
| ZN-373.06 | Inspector on Linux and a Pi target over ssh | Backlog |
| ZN-350 | Proof: GPU UI app for Pi built on a clean Mac | Backlog |
| ZN-320.03 / 393 | AppImage; Linux installers in a container | Backlog |

`later.md` lines worth reading before design: 99-105 (splash), 158-159,173-176,195-199 (agent), 603-609 (Linux cross-build pass), 632-637,643 (fbdev vsync, agent service on Linux), 659 (default Linux driver), 687-689 (splash on Linux/Pi, on display plugins). No task or line mentions Buildroot, Yocto, an image, read-only root, boot time target, or a `/boot` flag file (grep `buildroot|yocto|overlayfs|plymouth|psplash|systemd-analyze` over `docs backlog tools` matches only the bare-metal study and unrelated reports).

## 9. Gaps to build the shell app and the image

Sizes: S under a day, M a few days, L a week or more (guesses). Decision item = needs an owner call, not code.

| # | Gap | Where | Size |
|---|---|---|---|
| 1 | Decide the base (Buildroot / Yocto / trimmed Pi OS) and the userland: glibc (matches the 2.28 floor and Debian sysroot) vs musl (CHIP route exists but display-gl needs Mesa; verify) | decision | M |
| 2 | Text input from a physical keyboard on fbdev/KMS: add `HalKey` and `HAL_KEY_TEXT` events (needs a keymap: xkbcommon or a small table; layouts fr/en/de like the on-screen one), repeat, modifiers, IME-free | `fbdev.cpp`, `kms.cpp`, `hal.h:30-36` | L |
| 3 | evdev hub with inotify hotplug shared by both drivers (ZN-552), including keyboard, mouse, touch; drop the single-pointer limit in `kms.cpp` and give it MT | ZN-552 | M |
| 4 | Software mouse cursor for `display-fbdev` (the KMS plane cursor exists only in display-gl); or pick display-gl as the shell's driver | `fbdev.cpp` | S-M |
| 5 | Pick one display driver for the shell and prove it on Pi 3B+ at boot (fbdev needs no Mesa so the image can skip it; GL gives 22-25 ms navigation vs 19 on CPU, so fbdev is enough for a settings UI). Pi 4/5 and the DSI Touch Display 2 unproven | measurement | M |
| 6 | Early boot splash before Linux userland: firmware `splash`/`disable_splash` + kernel `quiet`, or an initramfs framebuffer splash, then the Zinc app starts under 1-2 s from kernel; and the engine's own splash on display plugins (`splash.cpp:187` skips them, ZN-446 AC#1 open) | image + `splash.cpp` | M |
| 7 | Boot-time budget: nothing measured. Needs exec-to-first-frame of a 58 MB (strip it) exported app on SD (page-in, `mmap`), and a kernel+init timeline | measurement | M |
| 8 | Runtime toggle of agent discovery and listening: control socket or signal or watched file in `<home>/agent`, a `/boot/zinc-agent` flag file honoured at boot and polled, `zinc agent discovery on|off` subcommand; stop **both** mDNS and the listener when off | `server.cpp`, `dnssd.cpp` | M |
| 9 | mDNS must (re)start when the network comes up later: retry `Responder::open`, rebind on interface change; verify against avahi/NetworkManager/systemd-resolved holding 5353 (or ship without them) | `src/net/dnssd.cpp:291-298` | S-M |
| 10 | Agent as a system service under the image's init (not a user systemd unit + linger): start as a dedicated non-root user, start apps on the screen, restart; `zinc agent install` never run on a Pi | `ota.cpp`, image | M |
| 11 | On-screen pairing: show the code (and QR) in the shell; today it is printed to a log. Either the daemon exposes the code to the app (read `pairing.json`) or the app embeds `zinc:link`. Plus unpair/forget UI (`zinc agent clients/forget` exist on CLI) | `server.cpp:105-148`, `plugins/link` | S-M |
| 12 | Wi-Fi API (ZN-558): scan/join/status/forget/AP-fallback through NetworkManager D-Bus or `nmcli`/`wpa_supplicant` (+`dhcpcd`/`systemd-networkd`, the choice drives image size); the image must carry the closed Broadcom Wi-Fi firmware (`brcmfmac43455`) | ZN-558 | L |
| 13 | System-info API: CPU temperature, throttle/under-voltage (`/dev/vcio` GET_THROTTLED), storage free, kernel/OS version, hostname, IP+SSID; a thin `zinc:power`/`zinc:sysinfo` or extend `zinc:system` | `sys_host.cpp`, new module | M |
| 14 | Reboot/shutdown, hostname set, timezone, locale/keyboard layout write, date/time: a privileged helper (`zinc-ctl` suid or polkit rule or a root helper service reached over a Unix socket) since the app must not run as root | image + small helper | M |
| 15 | Backlight control: sysfs `/sys/class/backlight/*` driver in `zinc:device` (setBacklight/hasBacklight); screen blank timeout; touch calibration/rotation (`display_rotate`/`lcd_rotate` in config.txt) | `plugins/device/native` | S-M |
| 16 | Preferences store + read-only-root strategy: where the shell and agent persist (`~/.zinc/agent`, `devices.json`, prefs); a writable data partition with a read-only root or overlayfs | image | M |
| 17 | The shell app itself: launcher of installed apps (start, stop, return to shell, relaunch on crash ZN-665), a Settings app (Wi-Fi, agent, display, system, about), status bar. Reuse kit+nuxt+Keyboard; nothing like it exists beyond `examples/webos-shell` | `app/` new | L |
| 18 | App switching on a single-screen bare console: one process owns DRM master/fb0; the shell must stop or suspend itself while an app runs and be back on exit, or run apps as children with DRM master hand-off (`zinc device run` today assumes nothing else holds the screen, `agent.md` dev limits) | design + `kms.cpp/fbdev.cpp` | M-L |
| 19 | Sysroot for display-gl in the image build (ZN-334/546): pin Mesa/libdrm/gbm/EGL from the base OS so the exported shell cross-builds from the Mac with no hand step; or use fbdev | ZN-334 | M |
| 20 | Size diet: strip the executable (58 MB unstripped), drop unused plugins from the shell build, measure RSS on a 1 GB Pi 3B+ (`tools/resmon`, `window-memory`) | export | S-M |
| 21 | Build/flash tooling: `zinc image` or a script that produces the SD image (boot partition with `config.txt`, `cmdline.txt`, dtoverlays `vc4-kms-v3d`, DSI), a `zinc flash`-like step (bare-metal plan has `zinc flash --target rpi3 --sd`, ZN-213, for Circle not Linux), CI (ZN-560 QEMU raspi boot tests) | new `tools/` | L |
| 22 | Persisting engine update of the OS/app on the image (A/B or at least rollback): app OTA with trial/rollback exists, OS/engine update does not install (`later.md:730`) | agent, image | L |
| 23 | Per-board validation: Pi 4/5 (v3d, `vc4-kms-v3d` + RP1 for Pi 5, hardware timers) are unproven for display, touch and agent; Pi Zero 2 W (512 MB) memory | hardware pass | M |
| 24 | Accessibility/locale of the shell: keyboard layouts for fr/en/de exist on screen only; system-wide layout choice requires #2 | #2 | S |

Quick wins already in hand: `Keyboard` component, touch (MT) on fbdev, KMS cursor (display-gl), fbdev page flips and DRM planes, agent protocol with PAKE, `zinc:link` for on-screen pairing, `zinc:process` for `nmcli`/`systemctl` as a stopgap, `ZN-446` splash format, `tools/device`, `tools/zbench`.

## 10. Unverified / not read

- Pi 4/5 behaviour of any piece; DSI Touch Display 2; `rpi_backlight` sysfs node on the rig.
- Whether the system plugin's Linux backend does anything beyond recording (`plugins/system/plugin.json` `"linux": {}`), and `autostart` on Linux.
- The list of shipped keyboard layouts; `TextInput` secure mode.
- `zinc:fs`/`storage`/`async-storage` APIs were only listed, not read.
- SDL KMSDRM input on a Pi (the engine's SDL3 path), as opposed to the plugin drivers.
- Actual RSS/CPU of an idle exported shell on a Pi 3B+; process start time; kernel boot time of any image.
