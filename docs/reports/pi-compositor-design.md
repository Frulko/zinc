# A compositor for the Zinc Pi image: how it fits, and the design from the inside

Date: 2026-10-25. Scope: the Raspberry Pi image (Pi 1, Zero, Zero 2, 3, 4, 5). The owner asked for a lightweight, fast compositor that can be
switched off. A separate report surveys the external compositors (wlroots, Weston, cage, planes in general); this one reads the code as it is
and says where a compositor would plug in, what it would cost, and which design fits best. Nothing here was measured on a Pi; every number
taken from earlier reports names its source, and the numbers still to measure are listed at the end.

## 1. What is there today

### 1.1 One program owns the screen

- The session (`image/files/usr/lib/zinc/zinc-session`, a bash loop run by `zinc-shell.service` on tty1) runs one program at a time: the app
  in `/var/lib/zinc/app`, else the player (`/usr/lib/zinc/current/player.zapp`). The player starts an app by writing its folder to
  `/run/zinc/next-app` and exiting with status 10 (`image/player/src/state.ts` `startInstalledApp`, `EXIT_START_APP`); the session then
  starts that app, and when the app exits the session starts the player again, from cold.
- The agent (`src/agent/screen.cpp`) takes the screen for a program it starts (`zinc device run`, `zinc dev --device`): it kills the earlier
  remote programs, writes its child's pid to `/run/zinc/device-screen`, waits for the session to stop its own program and answer in
  `screen-ready`, and only then lets the child `exec` (`awaitScreen` on a pipe). `releaseScreen` removes the file; the session then shows the
  player again. This is an exclusive display lease built from two files and a pipe, proven by `tests/t0/agent_screen.sh`.
- The display is `display-fbdev` on every app of the image (`ZINC_DISPLAY=fbdev` in the session): the CPU rasterizes the damaged bands on
  four threads, converts them into one of two ARGB8888 dumb buffers, and one atomic KMS commit puts that buffer on an overlay plane above the
  console's `/dev/fb0` at the next refresh (D117). Video pictures (dmabufs from the V4L2 decoder) go on further overlay planes under it, with
  the rasterizer leaving holes (D114). The driver uses raw DRM ioctls, no libdrm, and never touches the mode or the primary plane: when the
  process dies the kernel removes its planes and the console is back. `display-gl` (KMS + GBM + EGL + GLES 2) exists but is not the default
  on the Pi (D111: the software bands are faster on VideoCore IV).
- Input is read by the display driver itself from evdev (`plugins/display-fbdev/fbdev.cpp`, `display-gl/src/kms.cpp`): keyboards, mice,
  touch screens. Gamepads reach `HalInput.pad` only through SDL (`targets/macos/hal_sdl.cpp`) and the scripted input; on fbdev they are not
  read as gamepads today.

### 1.2 What every program draws over itself

`runtime/gfx.cpp` composes overlays into each program's own frame, in its own process: the dev bar (`devbar::`, ZN-822, `ZINC_DEV_BAR=1`:
quit, the time, a menu with restart, performance panel and screenshot), the performance HUD (`hud::`), the taps (`ZINC_TOUCHES`), the
damage visualizer. Their rectangles join the frame's damage, so they cost only where they change. The dev bar's comment says why it lives
there: "a Pi has no compositor to give it a title bar".

### 1.3 Screenshots and the live screen

The agent cannot read the screen: it asks the program on the screen. `zinc device screen` writes `shot.request` and the program saves its
own frame as a PNG (`after_present` in `gfx.cpp`). `zinc device screen --live` names a Unix socket in `live.request`; the program on the
screen connects (`src/host/mirror.cpp`) and streams its damage with the display-remote protocol (`plugins/display-remote/remote_proto.h`:
HELLO, RECT with PackBits RLE, FRAME/ACK with two frames in flight), and the viewer's input comes back as INPUT messages (a serialized
`HalInput`) merged into what the driver reads. When another program takes the screen it connects too and replaces the first. So "the whole
screen" is today "the frame of whichever program owns it"; a video plane shows as the hole the rasterizer left.

### 1.4 What this model gives and lacks

It is as fast as the hardware allows (no extra copy, no extra process, no frame of latency), a crash restores the console by itself, and it
is small. It lacks:

- a return to the player without a cold start (the player is a `.zapp` run again: parse, plugins, fonts, first frame);
- anything the system shows over an app: the time, a notification, the progress of an engine update (the update job restarts the session
  and waits for the player's first frame, so nothing is on screen while it works), a "low battery" or "network lost" banner;
- two programs on screen at once (a video call beside a page, a clock widget, a picture-in-picture);
- a screenshot or live view that does not depend on the app cooperating (a hung app answers nothing; an app built with an older engine
  answers nothing: the refusal text in `server.cpp` says "the player and apps answer from zinc 0.7.5");
- the dev bar for an app that is not in a dev session: it is a property of the app's environment, not of the device.

## 2. What a compositor would give, and what it costs

Gives:

1. **Instant switch back to the player**: the player stays alive under the app; quitting the app shows its last frame at the next refresh.
2. **System UI owned by the system**: one bar, notifications and the update progress drawn once, over any app, whatever engine version
   built the app. The update can keep showing progress while it restarts the app.
3. **Whole-screen capture and live view** from one place, including a hung app and the video planes (if the compositor reads them).
4. **Crash isolation of the system UI**: an app's crash cannot take the bar or the launcher with it; a crash in the compositor, though,
   takes everything (see risks).
5. **Several apps visible**: a split, a floating window, a widget.
6. **Global input**: one Home gesture or key that works in every app, routed by the system, not reimplemented by each.

Costs, in principle (to be measured, section 7):

- **Latency**: one hop of IPC per frame, and up to one refresh when the compositor commits on its own clock instead of when a client frame
  arrives. With planes and "commit as soon as a frame is ready" the added latency is the IPC (tens to a few hundred microseconds), not a
  frame. A compositor that redraws a composed buffer (GLES or CPU) adds its own render time, and usually a frame.
- **CPU and GPU per frame**: zero extra when each client buffer is a KMS plane (the HVS composes at scan-out). A copy of the damage when
  the client's pixels are in memory the display cannot scan out (shm). A full GPU pass when the compositor composes with GLES.
- **Memory**: the compositor process (a few MB of code and heap if it is ours, 15-30 MB with a general Wayland compositor and its
  libraries, per the other report), plus the buffers of every client kept alive: two ARGB8888 buffers are 3.0 MB at 800x480 and 16.6 MB at
  1920x1080 per client, plus the resident player's heap. On a Pi 1 or Zero with 256-512 MB this decides how many clients stay resident.
- **Code and risk**: a new long-lived process between every app and the screen; a bug there is a black screen for everything.

The important finding for Zinc: **the per-frame copy is already paid**. `display-fbdev` rasterizes into a private surface and converts the
damage into a KMS dumb buffer (D117: 1.44 to 2.07 ms on hero's navigation at 1400 MHz). If that dumb buffer belongs to a compositor and is
shared with the app, the app does exactly the same work as today and the compositor only flips planes. The Pi 1 and Zero pay nothing more
per frame than today, as long as the shared buffer can be mapped by the app (section 4.2).

## 3. The four designs

### (a) An external Wayland compositor, Zinc programs as Wayland clients

What Zinc would need:

- A Wayland path for the Pi. `third_party/SDL3` is vendored without `wayland-protocols` (zinc-next-agent.md: "with `libwayland-dev`
  installed its configure turns on a backend that cannot be built"), so SDL's Wayland video driver must be vendored and enabled in the
  Linux build, or a small `display-wayland` plugin written over libwayland-client and xdg-shell.
- A present path that is not GL 3.2: the session notes that the SDL window asks for GL 3.2, which vc4 and v3d do not offer, and its fallback
  draws nothing. A software client would present through `wl_shm` (the rasterizer writes a shm buffer, the compositor copies or uploads
  it), a GL client through EGL on Wayland with GLES 2.
- The hardware layers of D114 through `linux-dmabuf` and subsurfaces, or they are lost and video goes back to a CPU copy (38.3 ms instead
  of 3.45 ms a picture on the Pi 3B+, D114).
- The dev bar, HUD and taps stay in the app (Wayland has no standard for a system overlay over a fullscreen kiosk client except a
  `wlr-layer-shell` surface, which only wlroots compositors offer); the system bar becomes a layer-shell client.
- `seatd` or logind for DRM master and input (pi-os/04 and 07: cage and Weston go through libseat and need `PAMName`), where the image now
  runs with plain groups and no seat.
- Input from the compositor (libinput, with udev), which the image avoids at boot today (pi-os/03: udev coldplug is a hidden boot cost).

Latency: a frame on most compositors (compose on the next refresh), less with direct scan-out of a fullscreen dmabuf client. CPU/GPU on a
Pi Zero: a shm client is composited by pixman (Weston) or GLES on VideoCore IV; either reads and writes the damage once more per frame, on a
single 1 GHz core. On a Pi 4: GLES composition is cheap, a few ms of GPU per full frame. Memory: the compositor and its libraries, plus
libwayland, libinput, libudev, libseat. Code in Zinc: a HAL or display plugin (~500-1000 lines), the build work, the image units. Effort:
medium for one app on screen, high to keep video zero-copy. Risk: high on the Pi 1 and Zero (one core, VideoCore IV GL), low on a Pi 4/5.
Switch off: a boot file chooses between `cage`/`weston` and today's session. What it uniquely gives: non-Zinc graphical programs (a
browser). pi-os/00-synthesis already ruled that out as not planned.

### (b) A Zinc-native compositor

One process, `zinc compositor` (a command of the `zinc` binary, so no new package), owns DRM master, the mode, the planes and evdev. Each
program connects to its Unix socket, receives buffers to draw into, says which rectangle changed, and receives its input. The compositor
puts each visible client buffer on an HVS plane, in z order, with one atomic commit per refresh in which something changed. Most of it
already exists:

- the KMS plane code: `kms::find_planes`, `open_file`, `commit`, `adopt`, `wait_refresh` in `display-fbdev`, which already composes N
  video planes under one ARGB frame plane with `zpos` in one atomic commit, tests it with `DRM_MODE_ATOMIC_TEST_ONLY`, and retires
  framebuffers after their refresh;
- the evdev reader with hotplug, latches and multitouch slots (`display-fbdev` input section, `keyboard.h`);
- a wire protocol for frames and input over a Unix socket with back-pressure: `remote_proto.h` and the INPUT message of `mirror.cpp`;
- the client side is one more `HalDisplay` (`runtime/include/hal.h`): `init` connects, `present` writes the damage into the shared buffer
  and sends it, `poll` reads input, `layers` forwards the dmabufs of video pictures, `native_size` and `surface_size` answer from the
  compositor. The runtime, the programs and their `zinc.json` do not change.

Two ways to move pixels, chosen per client at connection:

1. **Shared scan-out buffers (the default)**: the compositor creates two dumb buffers per client, exports them as dmabuf fds
   (`DRM_IOCTL_PRIME_HANDLE_TO_FD`) and passes them with `SCM_RIGHTS`; the client maps them and converts its damage into the one the
   compositor last released, exactly what `display-fbdev` does into its own buffers today (including the `behind` area, the damage the
   other buffer still lacks). Per frame: no extra copy, one message each way. The compositor flips the plane.
2. **The display-remote stream (fallback and network)**: RECT messages with RLE pixels into a compositor-owned buffer. One decode and
   write of the damage per frame in the compositor. Used where a dmabuf cannot be mapped, by a program on another machine (the same protocol
   as `display-remote`), and by a test on the Mac.

Planes run out (their number, and the HVS's bandwidth and memory for scaled planes, vary by board). The compositor tests every new layout
with `TEST_ONLY` (as `fb_layers` does); what does not fit is composed by the CPU into one plane (damage only, with the runtime's own
`raster` blend code), and on a Pi 4/5 optionally by GLES (the `display-gl` replay is not needed: a textured quad per client).

The system UI: the compositor draws nothing itself beyond what must survive everything (a crash notice, the update progress while no
client is up). The bar, notifications and the launcher are the **player**, a privileged client with a full-screen surface at the bottom and
a strip surface at the top (the multi-window HAL of ZN-663, `hal_win_open`, maps onto compositor surfaces). This keeps the compositor small
and lets the system UI be written in Zinc, with the kits, like the rest of the player.

Latency: the IPC hop plus a commit at the next refresh; the compositor commits as soon as a frame arrives (no own redraw clock), so a
frame that today would make a refresh still makes it unless it lands within the commit's own time of the vblank. CPU/GPU on a Pi Zero:
today's cost plus two small messages and one atomic ioctl per frame; with the fallback stream, one write of the damage. On a Pi 4: the
same, the GPU stays idle. Memory: the compositor's own few MB (no VM, no fonts, no GL unless the GLES fallback is used), plus the buffers
that `display-fbdev` allocates today anyway, plus the resident player. Code: an estimated 1,500-2,500 lines of C++ in a new `src/compositor`
module (much of it moved from `display-fbdev`) and a client driver of ~400 lines. Effort: high, in phases (section 5). Risk: medium; the
plane limits per board and the dmabuf mapping are the unknowns. Switch off: the session starts programs directly, as today (section 6).

### (c) No compositor, a system overlay on a second KMS plane owned by another process

This does not work with KMS as it is. Only the DRM master may commit, and one process is master of a device at a time; a DRM lease gives
a second process its own CRTC, connector and planes, exclusively, not a plane on a CRTC the lessor keeps. Two processes can share a CRTC only
if one of them commits for both, which is design (b). The one arrangement that fits today's code is the reverse of what is wanted: the app
draws into `/dev/fb0` (`ZINC_FBDEV_FLIP=0`, which tears, D117) and the system process, as master, owns the overlay planes; but then the
system process makes every commit, decides the timing and must receive the app's video dmabufs: it is (b) without the shared buffers.

What survives of the idea is an overlay **drawn in the app's process but owned by the system**: the runtime already composes the dev bar,
the HUD and the taps into every frame; it can as well draw a system bar and banners whose content comes from the system (a status file or
socket in `/run/zinc` that the session, the agent and the update job write). That is (d).

### (d) Today's model, improved

1. **A resident player**: the player does not exit to start an app. It releases the screen (closes its KMS file, so its planes vanish, and
   its evdev grabs), writes `next-app`, tells the session, and waits with its heap intact; when the app ends the session signals it, it
   reopens the display, presents a whole frame and is back in one refresh plus the KMS open. The cost is the player's resident memory while
   the app runs. This needs a release/reacquire in `display-fbdev` (a `HalDisplay` entry such as `suspend(int on)`, null on every other
   driver) and a change of the session's loop (the player stays its child; a signal or a file replaces the exit status 10).
2. **A system bar drawn by every program from system state**: the dev bar becomes the system bar (time, Wi-Fi, battery, the update's
   progress, a notification line, the quit X), shown when the image says so, not only in dev sessions; its data is one small file in
   `/run/zinc/status` (or a socket) read twice a second, as `mirror.cpp` already reads `live.request`. The update job writes its progress
   there before it restarts anything.
3. **A fallback for the screenshot**: when no program answers, the agent reads the framebuffer it can still reach (`/dev/fb0`), which is
   only right with `ZINC_FBDEV_FLIP=0` or a writeback connector; most of the time this stays the app's answer.

Latency and CPU: as today, plus a small rectangle of bar when it changes. Memory: the resident player. Code: a few hundred lines. Effort:
low. Risk: low. Switch off: each part is a setting. What it cannot give: several apps visible, an overlay over an app built with an older
engine, capture of a hung app, isolation of the system UI from a misbehaving app (the app could cover or skip the bar: it is in its
process).

### 3.5 Side by side

| | (a) Wayland | (b) Zinc compositor | (c) overlay plane | (d) improved today |
|---|---|---|---|---|
| Added latency | ~1 frame (less with direct scan-out) | IPC hop; a frame only when late | not possible as such | none |
| Extra CPU per frame, Pi Zero | a copy or GL pass of the damage | none with shared buffers; one write of the damage with the stream | n/a | none |
| Extra CPU/GPU per frame, Pi 4 | a GL pass | none | n/a | none |
| Memory | compositor + libs 15-30 MB, buffers | a few MB + buffers already allocated today | n/a | resident player |
| Code in Zinc | Wayland HAL/plugin, SDL build, units | ~2-3k lines, half moved from fbdev | n/a | a few hundred lines |
| Video zero-copy (D114) | needs dmabuf + subsurfaces | kept: forwarded dmabufs on planes | n/a | kept |
| Several apps visible | yes | yes | no | no |
| System UI over any app | layer-shell (wlroots) | yes, the player as client | no | Zinc apps of new engines only |
| Crash isolation | yes | yes (compositor is a single point) | no | no |
| Non-Zinc graphical apps | yes | no (later through a bridge) | no | no |
| Effort / risk | medium-high / high on Pi 1/Zero | high, phased / medium | — | low / low |

## 4. The details that decide (b)

### 4.1 Where the code goes

- `src/compositor/` (a new module, one public header, a T0 test, per ARCHITECTURE.md): the KMS output (planes, commits, retired buffers),
  the evdev input, the client table, the socket protocol, the CPU fallback composition. It depends on nothing of the engine except the
  runtime's raster blend for the fallback and `runtime/include/hal.h` for the input and picture structs. `zinc compositor` in
  `src/cli_core.cpp`'s table starts it.
- `plugins/display-fbdev`'s `kms` namespace and its evdev reader move into a shared place both use (the plugin keeps working alone: the
  "compositor off" path is today's driver unchanged).
- `plugins/display-compositor/` (or a mode of `display-fbdev`, chosen with `ZINC_DISPLAY=compositor` or by the presence of the socket in
  `ZINC_COMPOSITOR_SOCKET`): the client `HalDisplay`.
- `plugins/display-remote/remote_proto.h`: new message types for the local case (buffer fds, release, input, surface size, focus, layer
  dmabufs), kept in the same header so the stream fallback and `zinc:remote` share one protocol.
- `src/host/mirror.cpp` and `src/agent/live.cpp`: under a compositor the live view and the screenshot come from the compositor (it holds
  every buffer: it encodes the composed damage with the same RLE); the per-program path stays for "compositor off".
- `runtime/gfx.cpp`: the dev bar, taps and HUD stay in the runtime (they belong to the program: the HUD measures that program). Under a
  compositor the dev bar's X can ask the compositor to switch to the player instead of quitting, and the system bar moves out of the
  runtime into the player.
- `image/files/usr/lib/zinc/zinc-session`: starts the compositor, then the player as its first client; apps are started as clients; the
  agent's lease (`device-screen` / `screen-ready`) becomes "start this client and give it focus" instead of "stop everything".
- `image/player/src`: the launcher switches focus instead of exiting with 10; the bar and the notifications become a second surface.
- `src/agent/screen.cpp`, `server.cpp`, `dev.cpp`: `handoffScreen` asks the compositor for focus when it runs, keeps today's kill-and-wait
  otherwise.

### 4.2 Shared buffers on each Pi

The default path maps a dumb buffer created by the compositor in the client. Dumb buffers on vc4 (Pi 0-3) and on the vc4 display of Pi 4/5
are CMA memory mapped write-combined, which is what `display-fbdev` writes into today, so the client's conversion costs the same. What must
be checked on each board: that the dmabuf exported by the display driver can be `mmap`ed by another process (the exporter must implement
dma-buf mmap; DRM's GEM DMA helpers do), and `DMA_BUF_IOCTL_SYNC` around the writes. If it cannot, the compositor maps the buffers and the
client sends the damage over the stream (one extra write of the damage, the cost of (a)'s shm path but without a GPU).

A GLES client (`display-gl`, WebGL, zinc:3d) renders into GBM buffers it allocates itself; under a compositor it passes their dmabufs and
the compositor makes framebuffers of them (`adopt`, as for video). On a Pi 4/5 the v3d render node and the vc4 display are two devices, so
the modifiers must be ones the display scans out (linear or the Broadcom UIF/SAND tiling it accepts); on Pi 0-3 vc4 is one device. Until
that is proven, a GL client takes the screen exclusively, as today: the compositor hands over DRM master for that client (it drops master,
the client becomes master, the compositor takes it back after; `drmDropMaster`/`drmSetMaster` need the compositor to keep its file open and
`CAP_SYS_ADMIN` or the kernel's "first opener" rule, which is a point to verify) or simply stops composing and lets today's lease run.

### 4.3 Input routing

The compositor reads evdev (the reader moved from `display-fbdev`, with `EVIOCGRAB` so nothing reaches the console), turns events into
`HalInput` (the struct of `hal.h`, already serialized by `mirror.cpp`'s INPUT message for the live view) and sends the focused client its
input in the client's own coordinates (offset and scale of its surface). Touch goes to the surface under the first finger until all fingers
lift, the same rule the dev bar uses for its own strip. Keys go to the focused surface. Gamepads, which `display-fbdev` does not read today,
are read once in the compositor (evdev joystick devices with SDL's gamepad mapping database, or SDL3's gamepad subsystem without video) and
sent in `HalInput.pad`: the image gains gamepads for every app at once. Global gestures are taken before routing: the Home key (or the
gamepad's guide button, or a swipe from the top edge) switches to the player; Ctrl+Alt+Backspace kills the focused client. The text-input
rectangle (`hal_text_input`) goes to the compositor so an on-screen keyboard (a player surface) can be shown over the app.

### 4.4 The dev bar and the performance HUD

The performance HUD stays in the program: it measures the program's phases and its own cost (`hud_cost_us`); the compositor adds a line
of its own (commits a second, late commits, the planes used) that the HUD can show through `hud_info`. The taps stay in the program too
(they show what the program received). The dev bar keeps its place in dev sessions; its X, under a compositor, returns to the player at once
(the app keeps running only if the user asks for that: closing stays the default so a dev session's restart is clean). The system bar of the
device (time, network, update, notifications) is the player's top surface; when it is on, apps are told a smaller surface (`surface_size`)
or, as the dev bar does now, are drawn under it.

### 4.5 Screenshots, live, crash

- `zinc device screen` asks the compositor, which composes the visible buffers into a PNG (the video planes are read from their dmabufs,
  or from a writeback connector where the board has one; to check per board), and answers for a hung app or an app built by an old engine.
- `--live`: the compositor streams the composed damage with the display-remote protocol to the agent's socket, exactly as `mirror.cpp`
  does for one program; input from the viewer enters the same routing as local input.
- A client that crashes leaves its last buffer; the compositor replaces it with the player and a crash notice (today's `crash.txt`, which
  the session still writes). A compositor that crashes: the kernel removes its planes (the console is back, as with today's driver), systemd
  restarts the session, and after two failures in a minute the session falls back to the direct mode for that boot and says so in
  `zinc-report.txt`.

## 5. Recommendation and phases

Recommendation: **(d) now, then (b) in phases, sharing the code with `display-fbdev`; not (a), and not (c)**. (a) brings a general compositor
and its seat and input stack for clients that are all Zinc programs, costs a copy or a GL pass per frame on the boards where Zinc is most
needed (Pi 1 and Zero), and loses the zero-copy video unless much more is done; it is the right answer only if a browser or another non-Zinc
GUI must run, which the image does not plan. (c) is not possible with KMS. (b) costs per frame what the display costs today, because the
copy into a scan-out buffer is already paid; it keeps D114's video planes; and it can be switched off by starting today's session.

Phase 1, (d), the smallest useful step (no compositor):

- The resident player: a `suspend` entry in `HalDisplay` implemented by `display-fbdev` (close the KMS file and the input devices, keep the
  surface), a `zinc:sys` call or signal for the player, the session loop keeping the player as a child. Files: `runtime/include/hal.h`,
  `plugins/display-fbdev/fbdev.cpp`, `image/files/usr/lib/zinc/zinc-session`, `image/player/src/state.ts`.
- A system status file `/run/zinc/status` (time is local; Wi-Fi, update progress, a notification) written by the update job and the agent,
  and the dev bar turned into a system bar read from it, on when the image setting says so. Files: `runtime/gfx.cpp` (`devbar::`),
  `image/files/usr/lib/zinc/zinc-player-update`, `src/agent/server.cpp`.
- The update job writes its progress before restarting the session, and the player shows it during the switch.

Phase 2, (b) with one visible client plus the system surfaces:

- `src/compositor` with the plane code and the evdev reader moved out of `display-fbdev` (the plugin calls the same code: no behaviour
  change when the compositor is off), the client driver with shared dumb buffers and the stream fallback, the player as the bottom client and
  the bar as its top surface, focus switching, the Home gesture, gamepads read once.
- The session starts `zinc compositor`, then clients; the agent asks for focus instead of the lease when the compositor runs; GL clients
  still take the exclusive lease.
- Whole-screen screenshot and live from the compositor.

Phase 3, more than one app and GL clients:

- Several visible clients (split, floating, picture-in-picture), the CPU or GLES fallback composition when planes run out, GL clients by
  dmabuf, the on-screen keyboard as a player surface, a client kept suspended in the background with its memory released on pressure (the
  Pi 1 and Zero keep one app resident at most).

Later, only if asked: a Wayland bridge for a non-Zinc program (a nested `cage` as one client of ours, or the reverse), decided with the
other report's findings.

## 6. Switching it off

- Image setting: `"compositor": true|false` in the profile (`image/profile.json`, default to be decided after the Pi measurements), written
  to `/etc/zinc/session.conf` as `ZINC_COMPOSITOR=1|0`; the player's settings page can change it (through `zinc-admin`, like SSH).
- Boot option, for recovery without a working screen: a file `zinc-compositor-off` on the boot partition, read by the session like
  `zinc-agent` and `zinc-report` are read today (not consumed, so it stays off until removed), or `zinc.compositor=0` on `cmdline.txt`.
- Environment: `ZINC_COMPOSITOR=0` for one run of the session; `ZINC_DISPLAY=fbdev` in an app's own `run.sh` makes that app ask for the
  exclusive screen even under the compositor.
- Automatic: the compositor not up within a few seconds, or crashing twice in a minute, starts the direct session for that boot.

Off means exactly today's path: the session starts the program, `display-fbdev` owns KMS and evdev, the lease protocol hands the screen to
the agent's programs. That path keeps its tests.

## 7. Tests on the Mac, and what must be measured on real Pis

Headless tests (T0/T1, on the Mac, no Pi):

- `display-fbdev`'s simulated framebuffer (`ZINC_FBDEV_SIM`, `tests/native/fbdev_desktop.cpp`, `tests/t1/fbdev_desktop.sh`) proves that
  moving the KMS and evdev code out changes no pixel and no input of the direct path.
- A compositor test with a fake output: the compositor's output is a file (as `ZINC_FBDEV_SIM`) or the stream fallback to a socket; two
  headless `zinc run` clients (the player and `examples/hello`) connect; scripted input (`ZINC_FBDEV_SIM_INPUT` records) must reach the
  focused one only; the composed frame hash is checked after a focus switch, after an app's `exit`, and after a `kill -9` of the app (the
  player is back in one frame, no restart: its pid unchanged).
- The protocol: malformed messages, a client that never releases a buffer, a client that floods frames (back-pressure as in
  `remote_proto.h`), fd passing with `SCM_RIGHTS` on macOS sockets.
- The session: `tests/t0/agent_screen.sh` extended with the compositor on and off (focus asked instead of the lease; the lease still works
  with `ZINC_COMPOSITOR=0`), and the automatic fallback when the compositor binary exits at once.
- Phase 1: the resident player (the player's pid kept across an app run, its first frame after the app's exit measured in frames, not
  seconds), the system bar from `/run/zinc/status` (a golden of the bar, as `tests/t1/dev_bar.sh` does for the dev bar).

On real Pis (each of Pi 1 or Zero, Zero 2, 3, 4, 5, with `zinc agent` and `tools/zbench` as `docs/reports/render-bench-design.md` says):

- Planes: how many overlay planes each board's KMS offers on the display's CRTC, with ARGB8888 and `zpos`, and how many full-screen
  ARGB planes the HVS composes at 60 Hz at 800x480 and 1920x1080 before a commit is refused or the scan-out underruns.
- The shared buffer: that a dumb buffer exported by the compositor can be mapped and written by a client on each kernel, and the cost of
  the client's conversion into it compared with today's (D117: 1.44 to 2.07 ms on the Pi 3B+).
- Latency: from an evdev touch to the flip that shows its effect, direct versus compositor (a photodiode or a camera at 240 fps, or the
  kernel's flip timestamps against the event's), and the share of frames that miss a refresh because of the hop.
- CPU per frame on hero's navigation and pocket-hero, direct versus compositor, on the Pi Zero and the Pi 4 (one core of the Zero is the
  worst case), and the compositor's own RSS and CPU at rest.
- The switch back to the player: today's cold start versus the resident player versus the compositor's focus switch, and the resident
  player's RSS (does it fit beside a large app on a 512 MB Zero and a 256 MB Pi 1?).
- Video: museum-table's film still off the CPU (D114: 3.45 ms a picture) when the decoder's dmabufs are forwarded to the compositor.
- GL clients on Pi 4/5: whether a v3d-rendered buffer can be scanned out by the vc4 display without a copy, and with which modifier.
- Screenshot of a video plane: whether a writeback connector exists and works on each board.
- The fallback: power-cut and crash of the compositor, the console restored, the direct session started.

## 8. Open points left to the measurements

- The default (on or off) for the image is decided after the Pi Zero numbers: if the compositor costs nothing measurable per frame and the
  resident player fits, on by default for boards with 1 GB or more, and a profile choice for the others.
- D114 says to revisit the hardware layers "when a compositor is the display": phase 2 is that revisit, with the plane code moved, not
  rewritten.
- Whether the compositor should hand DRM master to a GL client or always compose it depends on the dmabuf scan-out result on Pi 4/5.
