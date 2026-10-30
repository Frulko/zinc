# Zinc shell and Pi hub: the design

Date 2026-10-30. Design only: nothing built, run or changed outside this file. Reads `01-pi-composition-research.md` (vc4 facts, cited
"01 §n") and `02-zinc-inventory.md` (the code, cited "02 §n"); line numbers are those of `develop` at `0abb61acb`.

The owner's goals: one system process owns the screen of every Pi (1 to 5), a top bar is always shown, the app is drawn below it; the
player becomes a hub with a store, like the reMarkable one (same server, same tools, only the target differs), for two kinds of apps:
(a) an export (`zinc export --target rpi`: a native binary with the engine), (b) a `.zapp` built on the Mac with its plugins cross-built
(`zinc pack --target rpi`, commit 0abb61acb) run by the engine of the device. Home in the bar quits the app by touch, and
`zinc device stop` stops an app the player started.

Measured on the Pi 3B+ (zinc-player, vc4-kms-v3d, DSI 800x480): 56 planes in debugfs, 2 in use (primary RG16 = the console, one overlay
AR24 = display-fbdev's frame); every plane offers XR24/AR24/RG16/NV12/YU12. The shell needs one more overlay: the app's.

## 1. The design in one paragraph

**The player is the shell.** It stays a Zinc app on `display-fbdev` (DRM master, evdev, its KMS plane path unchanged) and gains a native
plugin `zinc:shell` that listens on `/run/zinc/shell.sock`, starts apps, gives each one scan-out buffers and forwards its input. The
app runs unchanged with `ZINC_DISPLAY=shell`, a new display driver (`plugins/display-shell`, cut from `display-sidecar`) that draws into
the buffers and says which one is ready. The shell draws the app as a runtime image at (0, bar) whose picture is the app's buffer, so
the existing hardware-layer path (`place_layers`, runtime/gfx.cpp:1328; `fb_layers`, plugins/display-fbdev/fbdev.cpp:571) puts it on
an overlay plane under the shell's frame: the HVS composes, nobody copies. Where planes or dmabufs fail (legacy `/dev/fb0`, an old
kernel, the Mac test) the same buffers are plain shared memory and the shell's rasterizer draws the image: software composition, one
blit of the app's damage. GPU apps (`display-gl`) take the screen exclusively through today's lease, with the runtime's own bar.

## 2. The choices, scored (RULES.md §4)

Weights: fit x3, performance x3, size x2, maintainability x2, licence/supply x2, portability x1, effort x1 (max 70).

**2.1 Who composes**

| Option | Fit | Perf | Size | Maint | Lic | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **The player is the shell: Zinc app on display-fbdev + `zinc:shell` plugin, app as a layer** | 5 | 4 | 5 | 4 | 5 | 5 | 4 | **64** |
| Native `zinc compositor` (C++, pi-compositor-design.md (b)), player as a client | 4 | 5 | 4 | 3 | 5 | 4 | 2 | 57 |
| No shell: the runtime's dev bar made a system bar in every app (design (d)) | 2 | 5 | 5 | 4 | 5 | 5 | 5 | 59 |
| cage or labwc, apps as Wayland clients | 2 | 2 | 1 | 2 | 4 | 2 | 2 | 30 |

The native compositor is faster in principle (it commits the moment a frame arrives) but needs 1.5-2.5k new lines, moves the KMS code out
of fbdev and makes the bar a second surface of a client. The player-as-shell reuses every piece (02 §6) and keeps the system UI in Zinc;
its cost is the shell's frame loop between an app frame and the commit (risk R5, measured in P2). Design (d) is not "in the system": a
hung app, an app of an older engine or a GL app has no working Home. (d) survives only as the bar of GPU apps (2.4).

**2.2 How the app's pixels reach the screen**

| Option | Fit | Perf | Size | Maint | Lic | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **Shell creates dumb buffers, exports dmabuf fds (SCM_RIGHTS), app mmaps them (01 §2.2 A)** | 5 | 5 | 5 | 4 | 5 | 3 | 4 | **65** |
| Shared memory (`shm_open`), shell blits the damage (01 §2.2 C) | 4 | 2 | 5 | 5 | 5 | 5 | 5 | 58 |
| App opens the card and allocates (01 §2.2 B) | 3 | 5 | 5 | 3 | 5 | 3 | 3 | 56 |

Both of the first two, behind one message: the shell sends fds; they are dmabufs when the shell could make them, shm otherwise. The app
code is the same (`mmap(fd)`). udmabuf and DRM leases do not work for this (01 §2.2 D, §2.3).

**2.3 The wire**

| Option | Fit | Perf | Size | Maint | Lic | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **`remote_proto.h` framing with local types, mirror.cpp's INPUT** | 5 | 5 | 5 | 5 | 5 | 5 | 4 | **69** |
| `display-rmpp/stream.h` wire | 3 | 4 | 4 | 3 | 5 | 5 | 3 | 53 |
| Wayland protocol (libwayland) | 2 | 4 | 3 | 3 | 5 | 3 | 2 | 45 |

stream.h has no keys and its payloads are codecs that shm removes (02 §2.2).

**2.4 GPU apps**

| Option | Fit | Perf | Size | Maint | Lic | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **Exclusive lease: the shell suspends its display, the app's runtime draws the dev bar (Home = its X)** | 4 | 5 | 5 | 5 | 5 | 5 | 5 | **67** |
| Compose the GL app's dmabufs as a plane | 5 | 4 | 4 | 3 | 5 | 2 | 2 | 55 |

On Pi 0-3 software bands beat VideoCore IV GL (D111), so GL apps are rare; on Pi 4/5 v3d-to-vc4 scan-out modifiers are unproven
(pi-compositor-design.md §4.2). Composing them is a `backlog/later.md` line, not this design.

**2.5 The store**

| Option | Fit | Perf | Size | Maint | Lic | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **`app/hub-server` + the hub's code (the reMarkable store), with a target per package** | 5 | 4 | 5 | 5 | 5 | 5 | 4 | **66** |
| A TUF repository of `tools/index-repo` | 3 | 4 | 4 | 3 | 5 | 5 | 2 | 52 |

The reMarkable store is not the TUF index: it is `app/hub-server` (pairing, a catalog signed by the hub key, manifests signed by each
app's own Ed25519 key through `zinc publish`, channels, rollback, retract) and `app/hub` (verification in `services/server.ts`, shared
`app/hub-server/src/protocol.ts`). The owner asked for the same servers and tools, so that is the one. The TUF index stays what it is:
plugins, templates and engine packs (D41). Decision records: the five tables above go in `zinc-next-decisions.md` as one D number when
P1 starts (the coordinator allocates it).

## 3. Processes

| Process | Owns | Started by | Ends |
|---|---|---|---|
| `zinc-session` (bash, `zinc-shell.service`) | nothing | systemd | with the unit |
| **shell** = `player.zapp` with `ZINC_SHELL_SOCKET=/run/zinc/shell.sock` | DRM master and the planes (display-fbdev), evdev (`EVIOCGRAB`), the socket, the bar, the hub | the session | crash: systemd restarts the session (`Restart=always`) |
| app (kind a or b) | its buffers (mapped), its process group | the shell (a tile, the boot app) or the agent (`zinc device run`, `zinc dev --device`) | Home, its own quit, `zinc device stop`, the socket closing |
| `zinc agent` | the network side | systemd | unchanged |

- **The session shrinks to a supervisor.** With `ZINC_SHELL=1` (P3; the image default after P5) it runs the player in shell mode and
  nothing else: the launch loop, `next-app`, exit status 10, `crash.txt` and `yield_screen` move into the shell (`zinc:shell`). If the
  shell exits non-zero twice within 60 s the session falls back, for that boot, to today's loop unchanged (image/files/usr/lib/zinc/zinc-session:72-114),
  and writes why in `zinc-report.txt`. `ZINC_SHELL=0` in `/etc/zinc/session.conf` is today's behaviour; the old path keeps its tests.
- **One app on screen.** A new client (`CONNECT`) replaces the one shown: the shell sends it `QUIT` and ends its group as below.
- **The shell starts apps like the agent does**, so the agent knows them: `setsid`, its output appended to `~/.zinc/agent/logs/<name>.log`,
  its pid in `~/.zinc/agent/run/<name>.pid` (pid, then inspector port 0), `[exited n]` at its end (src/agent/server.cpp:350-410 is the
  model). Both run as `zinc`, so `zinc device apps|stop|logs` see it (`runningPid`, server.cpp:207; `stopApp`, server.cpp:343) and
  `stop` ends its group: its socket closes, the shell shows the hub. This is the fix for "`zinc device stop` does not know the player's
  app", and P0 gives it to today's session first.
- **Apps the agent starts** stay the agent's children (its logs, inspector port and OTA rollback keep working). Under the shell the agent
  sets `ZINC_DISPLAY=shell` and skips the file lease (the app's `CONNECT` replaces whatever was shown); it still ends the earlier remote
  programs (src/agent/screen.cpp:44-52). A GL app (its `app.json` says `"display": "gl"`) keeps today's file lease, which the shell
  answers instead of the session (`device-screen` / `screen-ready`, the protocol of `tests/t0/agent_screen.sh`).
- **Kind (a) and (b) differ only in the command**: `run.sh` of the export, or `zinc run app.zapp` (`startApp`, server.cpp:356-362). Both
  get `ZINC_DISPLAY=shell` and `ZINC_SHELL_SOCKET`.
- **An app that does not connect** within 3 s of its start (an export or engine older than display-shell, a program on another driver)
  is given the screen: the shell suspends its display (§7.3) until the app ends. It then shows itself with today's direct path; no app is
  ever left invisible behind the shell's planes.

## 4. The wire

Unix stream socket `/run/zinc/shell.sock` (mode 0600, user `zinc`), framing of `plugins/display-remote/remote_proto.h`:
`[u8 type][u32 len][payload]`, little endian; fds ride with `SCM_RIGHTS` on the message that names them. New types from 32, beside the
existing ones (PING 20 / PONG 4 reused).

| Dir | Type | Payload | Meaning |
|---|---|---|---|
| app → shell | `CONNECT` 32 | u16 version (1), u32 pid, name (utf-8) | first message; the name is the bar's title |
| shell → app | `BUFFERS` 40 | u16 w, u16 h, u32 stride, u32 fourcc (XR24, later RG16), u8 kind (0 dmabuf, 1 shm), u8 n (3) + n fds | the surface and its buffers; sent after CONNECT and again on any resize (rotation, a new HDMI mode): the old ones are dropped, the app redraws whole |
| app → shell | `FRAME` 33 | u8 buffer, u8 n, n x (u16 x, y, w, h), n <= 8 | buffer complete; its damage (n = 0: all of it) |
| shell → app | `RELEASE` 41 | u8 buffer | the buffer left the screen (after the flip that replaced it): the app may draw into it |
| shell → app | `INPUT` 22 | mirror.cpp's INPUT (src/host/mirror.cpp:99-121), coordinates in the app's surface, plus touch slots appended (u8 n, n x (u8 id, f32 x, f32 y)) | everything the app reads: pointer, buttons, keys with text, wheel, mods, touches |
| shell → app | `QUIT` 42 | u8 reason (0 Home, 1 replaced, 2 shutdown) | the runtime's `quit_requested`, as the dev bar's X |
| shell → app | `PING` 20 / app → shell `PONG` 4 | u32 serial | every 2 s; no PONG in 6 s = "not responding" in the bar |

- **Buffers**: three, so the app keeps 60 fps while one is scanned out and one waits for the flip (01 §5). The app writes into a released
  buffer the damage of this frame plus what that buffer missed since it was last written (fbdev's `behind` rule, fbdev.cpp:760-763,
  per buffer). No free buffer: `present` waits on the socket (back-pressure, the pacing of the app: no clock needed, a static app sends
  nothing and costs nothing).
- **Damage**: P1 sends the union box (`HalFrame.x0..y1`); the rectangle list waits for a measurement that asks for it (§7.1 item 1).
- **Resize**: only by BUFFERS; the driver's `surface_size` (hal.h:244) answers the new size and the runtime redraws whole (02 §3.1).
- **Quit**: QUIT; after 2 s SIGTERM to the group, after 1 s more SIGKILL (the agent's `endGroup`, server.cpp:337). The shell shows the
  hub at the Home tap, before the app is gone. The app quits by itself on EOF: a shell crash leaves no orphan.
- **Input**: the shell's fbdev reads evdev; a hook after the runtime's input merge (runtime/zrt.cpp:933) gives `zinc:shell` the frame's
  `HalInput` before the shell's program sees it. A press that starts below the bar goes to the app until release, shifted by `-bar`, and
  is removed from the shell's own input; one that starts on the bar stays the shell's (the dev bar's rule, runtime/gfx.cpp:1416-1431).
  Keys go to the app while one is shown, except the shell's: KEY_HOMEPAGE = Home, Ctrl+Alt+Backspace = kill the app's group now. The
  shell calls `escapeByApp(true)` (gfx.cpp:2245) so its fbdev never quits on Escape (fbdev.cpp:221); Escape reaches the app, whose
  `display.escape` (display-shell) quits the app, not the shell.

## 5. The bar

- **Height**: `round(H / 15)` clamped to 32..56 px (800x480: 32, 720p: 48, 1080p: 56); `ZINC_SHELL_BAR=<px>` overrides; 0 is refused.
  The app's surface is W x (H - bar).
- **Contents**, the player's `components/top-bar.ts` grown: on the left **Home** (a house, a touch zone 2 x bar wide, shown while an app
  runs), the app's name and a DEV badge for a dev session (the agent then does not set `ZINC_DEV_BAR`, src/agent/dev.cpp:99, so there
  is one bar); in the middle the time (HH:MM, redrawn once a minute: one small commit); on the right the network icon (`zinc:network`),
  the update icon, "Not responding" when PING fails. Battery and notifications: later.md lines.
- The bar is opaque, so the app's plane never needs blending (no `needs_bg_fill`, 01 §1.2). With no app, the hub's pages lay out below it.
- A GPU app under the lease has the runtime's dev bar (`ZINC_DEV_BAR=1`: time and X = quit, runtime/gfx.cpp:1374-1469), no engine change.

## 6. The hub and the store

The player grows the hub's pages; the server and the checks are the reMarkable ones.

- **Server**: `app/hub-server` unchanged except one field: each published package names its `target` (`any` for a `.zapp` without native
  code, else `linux-aarch64`, `linux-armv7`, `linux-armv6`; an export names its export target and `kind=export`). It is a line of the
  signed manifest (`target=`, `kind=`), so it is covered by the app's signature; the catalog lists it per channel entry
  (app/hub-server/src/main.ts:193-216), and the server keeps one package per (channel, target). The reMarkable hub filters on
  `linux-aarch64`/`any` as before; nothing changes for it.
- **Publishing**: `zinc publish --target rpi` passes `--target` to its pack (src/main.cpp:3386) and writes `target=` (3388); with
  `--export` it runs `zinc export --target rpi` and publishes the export directory as a ustar written like a `.zapp` (deterministic, the
  same writer), `kind=export`. One command per app and target from the Mac, as for the reMarkable.
- **The device side**: the player imports the hub's code by relative path, as `app/hub` already imports `app/hub-server`
  (`services/server.ts` pairing, catalog and manifest checks; `protocol.ts`): no copy. Its own install step writes the agent's layout,
  `~/.zinc/agent/apps/<name>/app.zapp` or the unpacked export with `run.sh`, plus `app.json` (src/agent/server.cpp:331), so an app from
  the store, from `zinc device deploy` and from `zinc dev --device` are the same thing on disk, listed by the same tiles and by
  `zinc device apps`. AppLoad tiles and ink sessions stay reMarkable-only (`installs.ts`), behind the target.
- **Checks**, all existing: catalog signature by the pinned hub key, manifest by the app's key, SHA-256 of the package, no downgrade,
  `needs` (`zbc`, `rt`) against `ZINC_ENGINE_ZBC`/`RT` for kind (b) (docs/zapp.md), the permission consent screen. Kind (a) carries its
  engine, so `needs` does not apply; its target must match the Pi's `dpkg` architecture. A `.zapp`'s native plugins are run only when
  it was cross-built for this target (docs/zapp.md: `zinc run` otherwise builds them, and a Pi has no compiler).
- **Display hint**: at install the agent and the hub record zinc.json's `display` in `app.json` (the agent already reads the `.zapp`'s
  zinc.json member, server.cpp:643): `gl` means the lease (§3).
- **Engine updates** keep the image's signed path (image/README.md "Engine updates on the Pi"); the hub server's engine bundle is the
  reMarkable's and is not offered to a Pi.

## 7. Engine changes

### 7.1 Runtime and HAL

1. `runtime/include/hal.h:131-147` `HalFrame`: `int32_t ndamage; const HalRect* damage;` filled from `dmg[]` at runtime/gfx.cpp:1567
   (and 0 on the kept frame, gfx.cpp:1495). Only if P2's Pi 1 numbers ask for it (union box first).
2. `runtime/raster.cpp:672` and `runtime/zrt_raster.h:65`: `dyn_update_rect(id, x, y, w, h)` so the software path damages only the app's
   rectangle of the shell's frame, not the whole image (02 §3.2).
3. `runtime/include/hal.h:223-245` `HalDisplay`: `void (*suspend)(int on)` appended after `surface_size` (additive, null elsewhere).
   fbdev implements it (fbdev.cpp: close the KMS file of `open_file`, 399, and the evdev grabs of `open_inputs`, 133-183; on resume
   reopen and present a whole frame). Used by the lease and by the "no CONNECT" rule.
4. `runtime/zrt.cpp:859` and `:933`: a second input hook beside `mirror_input`, called after it, that may take events out of the frame's
   `HalInput` (`zinc:shell` forwards them to the app).

### 7.2 Display drivers

5. New `plugins/display-shell/shell.cpp` (~250 lines, from `display-sidecar/sidecar.cpp`: connect 125-146, `native_size`/`surface_size`
   303/348, inflight back-pressure 204-229, `hal_overlays` 240-264, registration 349 as `"shell"`), with the input decoder of
   `src/host/mirror.cpp:99-200`. `present` writes `render_damage` into the free mapped buffer and sends FRAME.
6. `plugins/display-fbdev/fbdev.cpp:587`: keep the framebuffers of the last three picture serials instead of the last frame's only, so
   three app buffers cycling cost no `ADDFB2`/`RMFB` per frame (02 R4).
7. The Pi image's prebuilt drivers and `zinc export --target rpi*` carry display-shell beside display-fbdev (`installDisplayDrivers`,
   `deviceTarget`, src/main.cpp:380-440).

### 7.3 The shell plugin

8. New `plugins/shell/` (`zinc:shell`, ~350 lines, from `plugins/remote-view/native/remote.host.cpp:156-182` for the image side):
   listen; spawn with pid and log files (§3); per client three buffers, dumb + `PRIME_HANDLE_TO_FD` on its own non-master open of the
   card, else `shm_open`+unlink; `dyn_wrap` each mapping as one runtime image, and on dmabufs a `raster::Picture` per buffer
   (`dyn_set_picture`, as plugins/video/native/player.h:296 does) with a `fill` for the software frames (screenshots, refused layers);
   on FRAME the shown picture changes and the retained-frame path re-offers it (`layers_again`, gfx.cpp:1358); RELEASE after the next
   present's refresh; input hook; QUIT and the group kill; PING; the file lease answer (`device-screen`/`screen-ready`, the session's
   `yield_screen` moved); `crash.txt` from the log's tail. TS: `start(dir, name)`, `home()`, `current()`, `image()`, `barHeight()`,
   `responding()`, `onExit(cb)`.
9. `plugins/display-remote/remote_proto.h:22`: the local types of §4.

### 7.4 Agent, CLI, image, apps

10. `src/agent/server.cpp:350-410` `startApp`: under a live `shell.sock`, `ZINC_DISPLAY=shell` and no file lease unless `app.json` says
    `gl`; `server.cpp:331`/`643`: `display` in `app.json`. `src/agent/dev.cpp:99`: no `ZINC_DEV_BAR` under the shell.
11. `src/main.cpp:3354-3410` `zinc publish`: `--target`, `--export`, the `target=`/`kind=` lines; `src/cli_core.cpp:115` its help.
12. `app/hub-server/src/main.ts`: the target per package (publish handler, store layout, catalog 193-216); `protocol.ts` unchanged.
13. `image/files/usr/lib/zinc/zinc-session`: P0 pid/log files; P3 the shell mode and the fallback. `zinc-agent.service:12`: unchanged
    (the agent picks `shell` itself).
14. `image/player/src`: shell mode (bar on every page, the app's image, Home), the hub pages from `app/hub`, launch through `zinc:shell`
    instead of `next-app` + exit 10 (state.ts:287, 298).

Changelog lines with each phase: "Home in the Pi's top bar quits the app", "`zinc device stop` stops an app started on the Pi",
"`zinc publish --target rpi`", "the Pi's player installs apps from a Zinc hub".

## 8. Phases and their proofs

Each phase: one test on the Mac (`ZINC_FBDEV_SIM` framebuffer file, `ZINC_FBDEV_SIM_INPUT` evdev records, `ZINC_FBDEV_CRC`), then one
check on the Pi 3B+ (the other boards in P5).

| Phase | What | Mac proof | Pi check |
|---|---|---|---|
| **P0** | `zinc-session` writes `run/<name>.pid` and `logs/<name>.log` for an app it starts from `agent/apps/<name>`, removes the pid at its end, and does not write `crash.txt` for exit 143 (stopped) | `tests/t1/player_launcher.sh` + `tests/t0/agent_screen.sh`: a tile's app is listed running by the agent's `apps`, `stop` ends it, the player returns, no crash page | tap a tile, `zinc device <pi> stop <name>` from the Mac |
| **P1** | display-shell, `zinc:shell` on shm, software composition, `dyn_update_rect`, `suspend`, the input hook; the player in shell mode with the bar and Home | new `tests/t1/shell_compose.sh`: the player on the sim framebuffer, `examples/hello` under it; the CRC of the composed screen; a tap below the bar reaches the app shifted by the bar; a tap on Home ends it (pid gone within 3 s, the hub's frame); a resize sends BUFFERS and the app redraws; `kill -9` of the app shows the crash page; a program on `fbdev` that never connects gets `suspend` | the player in shell mode with planes off: hero under the bar, Home |
| **P2** | dumb buffers + dmabuf + pictures; the fb cache by serial | the dmabuf branch falls back to shm when `/dev/dri` is absent (the same test, one line of stderr checked) | debugfs `state`: 3 planes in use (RG16 console, XR24 app at y = bar, AR24 shell); `ZINC_FBDEV_STATS` says the app is on a layer; the numbers of §9 |
| **P3** | the session's shell mode and fallback; the agent under the shell; the GL lease answered by the shell | `agent_screen.sh` with the shell on and off: `zinc device run` replaces the shown app without the lease; a `gl` app gets the lease; the shell killed twice in 60 s starts the old loop | `zinc device run examples/hero`, `stop`, then a three example (GL) whole-screen and back |
| **P4** | hub pages in the player; target per package; `zinc publish --target rpi [--export]` | `tests/t1/hub_server.sh` with two targets of one app (the right one listed and downloaded, a wrong signature refused); a player script (`ZINC_PLAYER_*` test mode) installs from a local hub into a temporary agent home and launches it | publish a kind (a) and a kind (b) app from the Mac, install both on the Pi from the hub over Wi-Fi, launch, Home |
| **P5** | default `ZINC_SHELL=1` in the image | `tools/pi-image check` sees the shell mode in the session | Pi Zero/1, Pi 4, Pi 5: the P2 check and §9 on each; switch the default only if §9 holds |

## 9. Numbers to measure (log them in `docs/reports/zinc-next-perf.md`)

| Number | How | Pass |
|---|---|---|
| App frame CPU, hero navigation, direct vs shell (planes) vs shell (soft) | `ZINC_FBDEV_STATS`, app and shell | planes: within 0.2 ms of direct (D117: 1.44-2.07 ms) |
| Touch to flip latency, direct vs shell | evdev timestamp vs the flip event's time | at most one refresh more |
| Shell idle CPU and RSS, with and without an app | `tools/resmon` | idle < 2% of a core on a Pi 3; RSS fits a 512 MB Zero beside hero |
| Home to the hub's first frame | the shell's log | < 100 ms (today: a cold start of the player) |
| `ADDFB2`/`RMFB` per app frame | fbdev stats | 0 after P2's cache |
| HVS load: 3 planes at 1080p on a Pi 1/Zero | debugfs underruns, a `TEST_ONLY` commit | no underrun, no `-ENOSPC` |
| CMA free with three 1080p app buffers (~25 MB) | `/proc/meminfo CmaFree` | positive margin on 512 MB boards |
| Writes into the exported dumb buffer vs fbdev's own | the app's conversion time | equal |
| Hung app killed by Home | log times | < 3.5 s |

## 10. Risks and how each is retired

| Risk | Retired by |
|---|---|
| R1 a dmabuf exported by the shell cannot be mapped by the app on some kernel (01 §7) | the shm path is the same message; the P2 Pi check, then each board in P5 |
| R2 the shell is a single point: its crash blanks the screen | apps quit on EOF (no orphan), systemd restarts the session, two crashes in 60 s start the old loop; P3 test |
| R3 three full-size planes exceed the HVS budget at 1080p on Pi 1/Zero (console RG16 + app XR24 + shell AR24 = ~1.2 GB/s of 1.5, 01 §1.2) | measured in P5; then fbdev crops the shell's plane to the bar when the rest is a hole, or RG16 app buffers |
| R4 framebuffer churn per app frame | the serial cache (7.2 item 6), counted in P2 |
| R5 an app frame waits for the shell's next loop (up to one refresh) | measured in P2; if it costs a refresh, fbdev's wait also wakes on the shell socket |
| R6 the app's own video loses its hardware layer under the shell (HAL_MAX_LAYERS = 2, the app is not master): museum-table would fall back to 38 ms a picture (D114) | until forwarded, a video app declares `"display": "fbdev"` and gets the lease like a GL app; forwarding its dmabufs as a second layer is a later.md line |
| R7 screenshots and live view | the shell presents, so it answers `shot.request` and `live.request`; on the plane path the picture's `fill` runs for the capture; covered by the P1 test (`zinc device screen` on the sim) |
| R8 apps of older engines or exports without display-shell | the 3 s "no CONNECT" rule gives them the screen; P1 test |
| R9 memory of the resident shell on 256-512 MB boards | measured in P5; below the bar, the shell exits while an app runs (today's behaviour, a setting) |
| R10 input edge cases (a press crossing the bar, keys during Home, the on-screen keyboard) | the dev bar's rule and the shell's key list, the P1 test's scripted taps and keys |

## 11. Lines for `backlog/later.md` (not tasks)

- The app's video dmabufs forwarded as a layer under the shell (R6), and GL apps composed by dmabuf on Pi 4/5.
- The shell's plane cropped to the bar (R3), if the 1080p Pi 1 measurement asks for it.
- Gamepads read once in the shell (`HalInput.pad`) for every app; the guide button as Home.
- Notifications and battery (UPS HATs) in the bar; a kiosk profile that hides the bar.
