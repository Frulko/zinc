# Zinc shell on Raspberry Pi: what the repository already has (inventory, 2026-10-30)

Goal: one Zinc process (the shell) owns the screen on a Pi (Pi 1 to Pi 5, `display-fbdev` today), draws a permanent top bar (time,
network, Home that quits the app) and shows one app, a second Zinc process, below it; the app's frames and input pass through the shell.
Idea under evaluation: a display driver `display-shell` in the app, modelled on `display-sidecar`, over a local Unix socket with shared
memory instead of zstd, the shell composing with KMS planes.

Read only, nothing built or run. Line numbers are those of `develop` at `dc6e752d3`.

Prior work to read with this one: `docs/reports/pi-compositor-design.md` (2026-10-25: design (b) "Zinc-native compositor" is close
to this shell; it proposes (d) first, then (b) in phases), `docs/reports/pi-orchestrator-design.md` §4.3 and §5 (the session daemon,
"with a compositor or without"), and `docs/reports/zinc-shell/01-pi-composition-research.md` (vc4 planes per board).

## 1. `plugins/display-fbdev/fbdev.cpp` (1123 lines): the shell's own screen

| What | Where | Reuse |
|---|---|---|
| Framebuffer open, format, letterbox scale (nearest) | `fb_init` 629-716, `conv_row` 74, `put_row` 93 | as is (the shell is an ordinary app on fbdev) |
| Native size of the screen, asked before init when the app names none | `fb_native` 615-627, wired as `HalDisplay.native_size` 1122 | as is: the shell gets the whole screen |
| Rasterize + convert in 16-row bands on a thread pool | `band` 730, `pool.run` 966/997 (`render_bands.h`) | as is |
| KMS: CRTC of the console's primary plane, 2 free overlay planes "under" + 1 ARGB8888 plane "top" (needs `zpos`) | `kms::find_planes` 365-397 | as is; needs 3 overlay planes on the CRTC (vc4 has a pool of 16, see 01) |
| Two dumb ARGB buffers for the frame, mapped | `kms::open_file` 399-422 | as is |
| One atomic commit: pictures on the under planes (zpos 1..2), the frame above (zpos 3); `TEST_ONLY` before | `kms::commit` 440-453, test at 707 and 600 | as is: this is already "a plane under the frame with a hole" |
| dmabuf to KMS framebuffer, no pixel read (`PRIME_FD_TO_HANDLE` + `ADDFB2`, modifiers) | `kms::adopt` 455-475 | as is for any dmabuf of format XRGB8888/ARGB8888 |
| Refresh wait, retired framebuffers removed after their refresh | `kms::wait_refresh` 477-494 | as is |
| `HalDisplay.layers`: takes up to 2 pictures of the frame, reuses a framebuffer by `serial`, tests a new place | `fb_layers` 571-607 | as is (see risk R4: a new serial each frame means ADDFB2/RMFB each frame) |
| Frame to the back buffer, holes punched where a layer shows, cursor over holes, page flip | `planes_present` 758-807, `punch` 299 | as is |
| Fallbacks: plane refused (EACCES/EPERM: another DRM master) back to /dev/fb0 | 601, 709, 803, 961 | as is |
| evdev: hotplug scan once a second (only when /dev/input changes), multitouch slots, latches for quick taps, mouse, wheel | `open_inputs` 133-183, `read_dev` 206-253, `fb_poll` 1003-1037 | as is; the shell reads input, then forwards it |
| Keyboard text and layouts (libxkbcommon) | `keyboard.h`, used at 220, 678, 1009 | as is |
| `EVIOCGRAB` of keyboards (nothing reaches the console) | 178 | as is: the app sees no evdev |
| Escape quits unless the app takes it | 221 (`!app_escape` sets `quit_key`) | the shell must call `escapeByApp(true)` (runtime/gfx.cpp:2245) and forward Escape |
| `device()` queries: `display.escapeByApp`, `display.escape`, `stream.listen`, `stream.state` | `fb_device` 1092-1121 | as is; a `shell.*` query could be added the same way |
| A Mac's screen received into the surface (sidecar-screen): stream.h `Target` on `surf`, flip from the stream thread | 810-829, 931-945, 1095-1114 | not for the shell: while a stream is active the app's own frames are not drawn (945), so the bar would vanish |
| ZINC_SHOT at shutdown, stats, CRC | 1052-1090 | as is |
| Mac-side simulation: `ZINC_FBDEV_SIM` (framebuffer file) and `ZINC_FBDEV_SIM_INPUT` (evdev records) | 127-136, 631-644 | the shell's T1 test on the Mac (no KMS there: `ZP_FBDEV_KMS` needs `<drm/drm.h>`, 309-315) |

The device-screen lease is not in the driver: it is `src/agent/screen.cpp` and `zinc-session` (section 4).

## 2. The sidecar driver and its wire

### 2.1 `plugins/display-sidecar/sidecar.cpp` (350 lines), the model of `display-shell`

| Piece | Where | Keep for display-shell? |
|---|---|---|
| Connect: `ZINC_SIDECAR` = adb / usbmux / TCP, then the hello line `RMPP <w> <h> ... +rgb +zstd` | `connectScreen` 125-146, `adb` 79, `usbmux` 98 | replace by `connect(AF_UNIX, $ZINC_SHELL_SOCKET)` and a binary HELLO |
| Surface size = the screen's pixels / `K` (scale) | 141-144; `s_size` 303 is both `native_size` and `surface_size` (348) | keep the shape: `native_size` and `surface_size` answer what the shell said |
| `fb`: the frame as the app drew it, kept by `render_damage` | `s_present` 314-320 | keep (with shm, `fb` is the shared buffer) |
| Damage accumulated until the screen has room, at most `inflight` frames unacknowledged | `damage` 234, `handOver` 204-229, `frameEnds`/`rectsAcked` 53-54, 276 | keep (back-pressure without a queue) |
| Per 64-row band, columns that really changed found by `memcmp` against a copy (`snap`) | `handOver` 208-225 | drop: the engine's damage is enough locally; it existed because one box covers far apart changes |
| Encoder: Sub filter + zstd per band on all cores, sender thread | `encode` 151, `sendJob` 167, `sender` 194 | drop (the whole reason for shm) |
| Answers 16 bytes `[kind][type][id][a][b][c]`: ACK, INPUT (press/release/move/hover/right button, pen with pressure and tilt), SCROLL, PINCH | `readAnswers` 267-301 | keep the reader shape; input format: see 2.3 |
| Web views kept off screen and laid into the frame (`hal_overlays`) | `layWebViews` 240-264 | keep as is: an app with zinc:webview has no window under the shell either |
| Pacing by deadlines (no vsync) | 333-336 | replace by the shell's ACK (the shell flips at the refresh) |
| `quit` when the screen leaves or `ZINC_FRAMES` runs out | `s_poll` 344 | keep, plus a QUIT message (Home) |
| Registration on demand | `hal_display_register(&sidecar_display, "sidecar")` 349 | same, name `"shell"` |

What it lacks for the shell: keys and text (it forwards pointer, pen and wheel only, 338-345), multitouch (one finger, 341), a size that
changes after init (`s_size` reconnects, no resize message), Escape and Home handling.

### 2.2 `plugins/display-rmpp/stream.h` (627 lines), the screen side of that wire

- Wire (header comment 5-59): `[u8 type][u8 depth][u16 x][u16 y][u16 w][u16 h][u8 codec][u8 more][u32 len][payload]`; types 1 RECT,
  2 MODE, 3 FULL, 4 CURSOR, 5 POINTER, 6 COPY (scroll), 7 SET, 8 QUIT, 9 SINK, 10 VIDEO (H.264 on a plane). Screen to app: 16 bytes, kinds
  1 ACK, 2 INPUT, 3 TURN, 4 ROOM, 5 FULL, 6 SCROLL, 7 MENU, 8 PROFILE, 9 LIGHT, 10 HOST, 11 ECHO, 12 SHOWN, 13 PINCH.
- Surface size: the hello carries `t.w` and `H = t.h - top` (`serve` 402-404); `Target.top` (281) is "the first row the stream may use (the
  dock's)": on the reMarkable a header above the stream already exists, the same idea as the shell's bar. `room()` 214-219 sends kind 4
  ROOM when it changes; touches are shifted by `client_top` (`input` 184-185). **This is the only "app below a bar" mechanism in the
  repository.**
- `Target` (279-297), `Decoders` (319-362, zstd/lz4 decode on every core), `merge` of rectangles (306-317), `picture_mu` against torn
  pictures (299-302).
- Reuse for the shell: the ROOM/top idea and the ACK/back-pressure semantics; not the codecs, not the reMarkable specifics (waveforms, pen
  lane, accelerometer). Its INPUT kind carries no keyboard either.

### 2.3 The better-fitting wire: `display-remote` and the live mirror

- `plugins/display-remote/remote_proto.h` 1-72: `[u8 type][u32 len][payload]`; HELLO (w, h, name), RECT (x, y, w, h, RLE), FRAME seq,
  ACK seq, POINTER, WHEEL, BUTTONS, PING/PONG, AUTH. `pi-compositor-design.md` §4.1 already proposes adding the local message types here.
- `src/host/mirror.cpp` (241 lines) streams **any** program's frames to a Unix socket named in `live.request` (69-97), HELLO on size change
  (152-160), the damage box RLE-encoded with at most two frames unacknowledged (161-179). Its INPUT message (99-121) is the full `HalInput`
  a shell must forward: pointer (0..1 of the screen), buttons, mods, gamepad bits, wheel x/y, **keys with text**, button events; `merge`
  (182-200) adds it to what the HAL read. Hooked through `zrt::mirror_present` / `zrt::mirror_input` (235-236, runtime/gfx.cpp:30-33,
  runtime/zrt.cpp:933). Reuse: the INPUT encoding and `merge` as they are, for the shell-to-app direction.
- `plugins/remote-view/native/remote.host.cpp` (261 lines): the viewer side: HELLO creates or resizes a runtime image (`dyn_create` /
  `dyn_resize` 156-166), RECT decodes into `dyn_pixels` (174-177), FRAME calls `dyn_update` and ACKs (178-182). Its TS API
  (`plugins/remote-view/index.ts` 46-80) exposes `image`, `width`, `height`, `sendPointer`, `sendWheel`, `sendButtons`. **This is a
  working "show another Zinc process as an image in my frame" today**, over TCP and RLE, built for `rpi1` too (`remote.rpi1.cpp`).

## 3. The display driver interface and how a driver is chosen

- `runtime/include/hal.h` 223-245 `HalDisplay`: `init`, `present(HalFrame*)`, `poll(HalInput*)`, `shutdown`, `owns_input`, `host_window`,
  `pixel_scale`, `layers` (hardware layers, 234), `native_size` (237, asked before init when no size is named), `device` (query/answer,
  241), `surface_size` (244, the size now; the runtime redraws whole at a new size).
- `hal_display_register` 249-258: with `ZN_DISPLAY_ON_DEMAND` the driver takes the screen only when `ZINC_DISPLAY` names it (`shell` or
  `display-shell`).
- `HalOverlays` 261-268: off-screen web view pictures and their pointer routing; used by sidecar only.
- `HalFrame` 131-147: `w, h`, the damage **box** `x0..y1`, `render` (whole rows), `render_damage` (only the damaged rectangles, rest
  untouched), `frames` (command lists for GPU drivers), `render_holes`, `render_box`, `move` (a scroll: `HalMove`, 129-130, carries a rect list).
- `HalPicture` / `HalLayer` 192-218 and `HAL_LAYER_HOLE`: a dmabuf shown by the display under the frame.
- Choice of the driver: `zn::frontend::selectDisplay` (`src/frontend/plugin_manifest.cpp` 342-372: `ZINC_DISPLAY` first, then the board's
  and the project's `display`), `onDemandDisplays` 374-382 (zinc.json `"displays"`), `pluginDefines` 389-394 (adds `ZN_DISPLAY_ON_DEMAND`
  for those). `src/main.cpp` `installDisplayDrivers` 380-400 and `installDisplayDriver` 401-440: builds or loads the prebuilt plugin
  (`deviceTarget` 420-433: a Pi has no compiler, the image ships prebuilt drivers), not in headless runs unless `ZINC_DISPLAY` is set (410).
- Start: `startSurface` (`src/host/gfx_host.cpp` 200-215): `ZINC_SIZE`, else `hal_display->native_size`, then `zrt::start`, which calls
  `hal_display->init` (`runtime/zrt.cpp` 913-918). Per frame `loop_once` (925-963): `hal_poll_input`, then `hal_display->poll` (932), the
  mirror's input (933), `sync_surface` (945), the frame, `present` (runtime/gfx.cpp:30).

### 3.1 How an app learns its size and resizes

- Size at start: `ZINC_SIZE` or `native_size` (gfx_host.cpp 210-212). `width()`/`height()` (gfx_host.cpp 105, 281).
- Change: `sync_surface` (runtime/gfx.cpp 64-75) asks `hal_display->surface_size` every frame (also from the frame step,
  gfx_host.cpp 304); a new size or scale resets the surface and draws a whole first frame. A driver without `surface_size` never resizes (65).
- `onResize(cb)`: the typed engines in `src/frontend/modules.cpp` 118-123 (compares `width()/height()` before each frame and calls the
  callbacks; also `hal_set_resize`, gfx_host.cpp 377), QuickJS in `src/qjs/qjs.cpp` 180-200. The C++ runtime's `gfx::onResize`
  (runtime/gfx.cpp 1675) is an empty stub, not on the path. `lib/std/ui.ts` 6332 registers one, so every zinc:ui app re-lays out.
- So `display-shell` needs only `native_size` (the shell's HELLO) and `surface_size` (the last SIZE message): no engine change.

### 3.2 How damage is produced per frame

- `runtime/gfx.cpp` `end_frame` 1480-1567: a kept frame presents nothing new (1489-1501); otherwise `diff_move` (scroll, 1508-1515),
  bulk union when most commands changed (1518-1525), else `diff_rects` of the two command lists into `dmg[]`, at most `ZRT_DAMAGE_RECTS`
  = 8 disjoint rectangles (314-319, 1528); overlays (dev bar, HUD) add theirs. The `HalFrame` sent has the union box `damage_box()` (870,
  1561-1567) and `render_damage` (330-335), which writes only the `dmg[]` rectangles.
- Gap: the rectangle list itself is not in `HalFrame` (only inside `HalMove.damage` for scrolls). A driver that wants several small rects
  must either send the union box or diff pixels (sidecar's `memcmp`, 208-225). An additive `int32_t ndamage; const HalRect* damage;`
  in `HalFrame` (hal.h 131-147, filled at gfx.cpp 1567) closes it.
- Gap on the shell side: `raster::dyn_update` (runtime/raster.cpp 672-674) bumps the image's version, so a frame that draws the app's image
  damages the whole image box. A shell drawing the app as an image repaints all of it every app frame unless a
  `dyn_update_rect(id, rect)` marks only the app's damage (the diff then takes that rect instead of the whole command).

## 4. The Pi image, the session and the screen handover

- `image/files/usr/lib/zinc/zinc-session` (114 lines, bash): sets `ZINC_DISPLAY=fbdev` (15), `ZINC_SHOT_REQUEST` (11), notifies ready
  after 2 s (18), runs one program at a time in its own process group (`setsid`, 88-94), the app or the player; exit 10 from the player
  starts the app (110); a crash writes `crash.txt` (106-108). `stop_foreground` 22-32 kills the group (TERM, then KILL after 1 s).
- The agent lease: `src/agent/screen.cpp` 39-67 `handoffScreen` kills the previous remote programs, writes its pid to
  `$ZINC_AGENT_SCREEN/device-screen` and waits up to 5 s for `screen-ready` with that pid; `zinc-session` `yield_screen` 54-70 sees the
  file, stops its foreground program and acknowledges; `releaseScreen` 34-37 removes it. `src/agent/dev.cpp` 207-212 ends a dev session
  replaced by another. `zinc-agent.service` sets `ZINC_DISPLAY=fbdev ZINC_AGENT_SCREEN=/run/zinc` (line 12). Test: `tests/agent_screen.py`.
- The player (`image/player`, README 1-71): a `zinc:gfx` display tree app (music-tree style), fullscreen on Linux (`zinc.json` targets.linux
  `resize: fill`), permissions `fs`, `process`. It already has the bar the shell needs: `src/components/top-bar.ts` (67 lines: host name,
  clock, connection icon from `appState.network`, settings and update buttons), the network state (`src/state.ts`, plugin
  `image/player/plugins/network` = `zinc:network`), the launcher (`services/apps.ts`, writes `$ZINC_RUN/next-app`), the crash page.
- The runtime's dev bar (`runtime/gfx.cpp` `devbar::` 1374-1469, `ZINC_DEV_BAR=1`): a strip drawn by the app's own runtime over its frame,
  time, a menu, and an X that sets `quit_requested` (1420); presses on it never reach the program (1429-1431). It is option (d) of the
  compositor report: a bar without a shell, but inside the app's process.
- `docs/reports/pi-os/00-synthesis.md` §1 (166-181): no X, no Wayland; "app switching on a single screen, and the shell app itself" listed
  as missing; §3: the shell's display is `display-fbdev` on its KMS plane path. `07-kiosk-session-practices.md` §3 (102-111): the first
  opener of a card with no master becomes DRM master, groups `video,render,input,tty` suffice, no logind; only one master at a time.

## 5. Multi-window and compositor code

- No compositor exists. `pi-compositor-design.md` (b) designs one (`src/compositor`, a client driver, shared dumb buffers by dmabuf with
  `SCM_RIGHTS`, the remote stream as fallback, ~1.5-2.5k lines + ~400 for the client).
- Multi-window inside one process: `hal_win_*` (hal.h 105-120), weak defaults in runtime/gfx.cpp 38-46, used by the SDL HAL; display
  drivers have none. `plugins/system/window.ts` is the desktop window state (move, size, restore), not composition.
- Hardware layers from a runtime image: `raster::Picture` / `dyn_set_picture` (`runtime/zrt_raster.h` 84-92); the runtime offers them to
  the driver (`runtime/gfx.cpp` 1324-1372, refused when turned or blended, 1341) and the driver puts them on a plane. The video plugin is
  the one user (`plugins/video/native/player.h` 86, 296-306). **This is the shell's plane path already written**: an image whose picture is
  the app's dmabuf, drawn at (0, bar) by the shell, goes to an under plane through `fb_layers` with no new KMS code.

## 6. Proposed minimal architecture

Two processes, no new engine module: the **shell** is a Zinc app on `display-fbdev` (the player grown a mode, or a small app beside it)
with a native plugin `zinc:shell`; the **app** runs unchanged with `ZINC_DISPLAY=shell`. The shell is DRM master and reads evdev; the app
opens neither.

Wire: `remote_proto.h` framing (`[u8 type][u32 len]`) with new types, over `$ZINC_SHELL_SOCKET` (`/run/zinc/shell.sock`), fds by `SCM_RIGHTS`:
shell to app HELLO (w, h, scale, 2 buffer fds), SIZE (w, h: the bar moved, rotation), INPUT (mirror.cpp's format), ACK (buffer i is free),
QUIT (Home); app to shell FRAME (buffer i, damage rects). Not the stream.h wire: it has no keys, and its zstd/RECT payloads are what shm removes.

Pieces, smallest first:

1. **`HalFrame` damage list** (hal.h + one line at gfx.cpp 1567): `ndamage`/`damage` from `dmg[]`. Additive; every driver ignores it. ~10 lines.
2. **`plugins/display-shell/shell.cpp`** (~250 lines, cut from sidecar.cpp): connect, HELLO, two `mmap`ed buffers; `present` writes
   `render_damage` into the free buffer plus what the other one lacks (fbdev's `behind` rule, 760-763), sends FRAME with the rects, waits
   for the ACK only when both are taken (inflight 1-2); `poll` merges INPUT (copy `mirror.cpp` `input`/`merge` 99-200) and sets `quit` on
   QUIT or a closed socket; `native_size`/`surface_size` from HELLO/SIZE; `device("display.escape")` sends nothing and lets the shell decide;
   `hal_overlays` kept from sidecar (240-264). Buffers first as `memfd`/`shm_open` (works on the Mac for the test).
3. **`zinc:shell` plugin in the shell** (~300 lines, cut from `remote-view/native/remote.host.cpp`): listen on the socket, `posix_spawn`
   the app in its own process group with `ZINC_DISPLAY=shell` (or let `zinc-session` do it), `dyn_wrap` each shared buffer as a runtime
   image (no copy), on FRAME `dyn_update` the shown buffer and ACK the other after the shell's next present; forward the shell's
   `HalInput` each frame with the pointer and touches shifted by the bar (stream.h's `client_top` rule, 184) and only while they started
   below the bar; Home = QUIT, then TERM/KILL of the group after a timeout (zinc-session `stop_foreground` 22-32). TS API: `start(path)`,
   `image`, `running`, `home()`, `onExit`. The shell's TS draws the bar (reuse `image/player/src/components/top-bar.ts`) and
   `drawImage(shell.image, 0, BAR)`.
4. **`dyn_update_rect`** in the runtime raster (raster.cpp 672) so that the shell's frame damage is the app's damage, not the whole app
   image. Without it every app frame repaints the full app area in the shell (fine on a Pi 4, too much on a Pi 1 at 1080p).
   Steps 1-4 give a working shell in software composition, CPU cost per app frame = one blit of the app's damage in the shell.
5. **Plane path** (the "composing with KMS planes" of the idea, no new KMS code): the app's two buffers become dmabufs (dumb buffers the
   shell, as master, creates and exports with `PRIME_HANDLE_TO_FD`, or `/dev/dma_heap/linux,cma` from the app); the shell's plugin sets a
   `raster::Picture` (format XRGB8888, one plane) on each image (`dyn_set_picture`, as `plugins/video/native/player.h` 296 does) with a
   `fill` that copies the pixels for the software fallback; `fb_layers` (fbdev.cpp 571) puts it on an under plane and punches the hole in
   the shell's frame. The shell then writes only its bar; a frame of the app costs one atomic commit in the shell.
6. **Session**: `zinc-session` starts the shell instead of the player (the shell starts apps), and `yield_screen` stays for the agent: a
   remote program still takes the whole screen (today's lease, `screen.cpp` 39-67) until the agent learns to start it as a shell client
   (`ZINC_DISPLAY=shell` instead of `fbdev` in `zinc-agent.service` 12, and "focus" instead of "kill"; orchestrator report §5).

Test on the Mac: shell on `ZINC_FBDEV_SIM` with `ZINC_FBDEV_SIM_INPUT`, app `examples/hello` on `display-shell` over memfd/shm: the
frame CRC of the composed screen (`ZINC_FBDEV_CRC`, fbdev.cpp 1069), a tap below the bar reaching the app shifted by the bar, a tap on Home
ending it, a resize after SIZE. The plane path (step 5) needs a Pi.

## 7. Risks

- **R1 DRM master is exclusive** (07 §3): the app must never open the card or `/dev/fb0`; `display-shell` must be the app's only driver,
  and any app that asks for `display-gl` (GPU) cannot run under the shell without a master handover (compositor report §4.2). Today's lease
  stays the fallback.
- **R2 dmabuf export and mapping** (step 5): `PRIME_HANDLE_TO_FD` from the master's fd, mmap of the exported buffer in another process, and
  `DMA_BUF_IOCTL_SYNC`, or `dma_heap` permissions for the `zinc` user: unproven on each kernel (01 and compositor report §4.2). The shm
  path of steps 2-4 does not depend on it.
- **R3 Planes per board**: `find_planes` wants 3 free overlay planes with `zpos` on the CRTC (fbdev.cpp 386-396); vc4 shares 16 among all
  CRTCs (01 §1.1). The app's own video can no longer use a plane: `HAL_MAX_LAYERS` = 2 (hal.h 199) and the app is not master, so its video
  is drawn in software inside the app (D114's zero-copy video is lost under the shell until the app's video dmabufs are forwarded).
- **R4 Framebuffer churn**: `fb_layers` keys framebuffers by `HalPicture.serial` (587); two buffers alternating with a new serial each
  frame cost an `ADDFB2` and an `RMFB` per frame. Give each buffer a stable serial and change only its content (the picture stays, the
  plane shows the new pixels): needs a "content changed" path, since a same-serial picture is not re-committed. To measure.
- **R5 Software cost on Pi 1/Zero**: one core; the blit of the app's damage in the shell plus the app's own conversion. Without step 4 a
  1080p app frame repaints ~8 MB in the shell. Prefer the plane path there, or 800x480.
- **R6 Screenshots and live view**: `ZINC_SHOT_REQUEST` (runtime/gfx.cpp 1199) and `live.request` (mirror.cpp) are answered by the program
  that presents: under the shell that is the shell, which holds the app's pixels as an image (software path: right; plane path: the
  picture's `fill` must run for the capture).
- **R7 Input semantics**: the bar must own presses that start on it until release (the dev bar's rule, gfx.cpp 1416-1431); multitouch,
  keys and text go to the app (mirror's INPUT has no multitouch: add `touch[]`); Escape: the shell sets `escapeByApp(true)` so its fbdev
  does not quit on it (fbdev.cpp 221) and forwards it; the app's `escapeDefault` reaches `display.escape` in display-shell, which must
  quit the app, not the shell.
- **R8 Lifecycle**: the app is the shell's child: a shell crash takes the app with it (the session restarts the shell); a hung app must be
  killed by group. `zinc-session`, the agent lease and the player's `next-app`/exit-10 protocol all assume one program on the screen; the
  orchestrator report plans to replace that loop.
