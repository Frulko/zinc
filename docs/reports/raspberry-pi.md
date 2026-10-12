# Zinc on a Raspberry Pi 3B+: setup, findings and performance log

Date 2026-09-29. First real-hardware session: the STATUS report said "nothing validated on real hardware yet";
this document records what was run on a Pi, what broke, what was measured, and how to redo it.

## Test rig

| | |
| --- | --- |
| Board | Raspberry Pi 3 Model B Plus Rev 1.3 (4 x Cortex-A53, 1.4 GHz max, 1 GB) |
| Screen | official 7" DSI touchscreen v1, 800x480, FT5x06 touch controller (`event2`, also exposed as `mouse0`) |
| OS | Raspberry Pi OS / Debian 13 (trixie), **aarch64** kernel and userland |
| Display stack | `dtoverlay=vc4-kms-v3d`; `/dev/fb0` is the KMS fbdev emulation (`vc4drmfb`, 16 bpp) |
| Program | `examples/hero` (tabs: Home, Gallery, Playground, Tasks, Settings, Kit, Forms, Video, Navigation) |
| Session | dev machine on macOS arm64, SSH key auth as `pi`, Docker for the cross builds |

## Which target to use on a 64-bit Pi OS

| target | result |
| --- | --- |
| `rpi1` (ARMv6 hard-float, Alpine/musl in Docker) | The export is a **static 32-bit** executable and does run on the 64-bit kernel (the Cortex-A53 runs AArch32 user space), with no armhf libraries installed. But it targets ARMv6 without NEON, and anything using shared libraries (`zinc:video` links FFmpeg dynamically) would need musl-built libraries, which Debian does not have. |
| `linux` (arm64, Debian trixie in Docker `zinc/sdk-linux`) | **Recommended for a 64-bit Pi OS.** The dev machine is arm64, so Docker builds natively (about 1 min for hero, no emulation). Same libc and ABI as the Pi: `ldd` finds every library; FFmpeg comes from Debian packages already present on the Pi (`libavcodec61`, `libavformat61`, `libswscale8`). Binary size ~5-6 MB for hero. |

`examples/hero/zinc.json` therefore has `linux` = 800x480 with `"display": "fbdev"` (it was a 1100x700 window). Without a
`display` entry the runtime silently uses the null HAL: the program starts, renders 60 frames to nowhere and exits
with code 0. That was the first symptom seen on the Pi.

## Deploy and run

```sh
node compiler/bin/zinc.mjs export examples/hero --target linux        # examples/hero/dist/hero-linux/
scp examples/hero/dist/hero-linux/hero pi@<ip>:~/hero
scp examples/hero/media/bbb.mp4 pi@<ip>:~/media/                      # the Video tab reads media/bbb.mp4 at runtime
ssh pi@<ip> 'cd ~ && (setsid nohup ./hero >/tmp/hero.log 2>&1 </dev/null &)'
```

- Run from the directory that holds `media/` (paths are relative to the working directory).
- The video is an asset next to the program, not embedded in the executable (Big Buck Bunny 640x360 H.264, 23 MB,
  re-encoded without audio; `examples/hero/README.md` has the command to produce it).
- **SSH hygiene**: never leave an ssh attached to the running program (it hangs when the program keeps the
  session's descriptors); start it detached as above, then read the log with a separate short `ssh`. Use
  `ssh -o ConnectTimeout=8 ... </dev/null`.
- The user needs the `video` and `input` groups (present by default). `tty` is also needed for the graphics-mode
  switch of the console (`KD_GRAPHICS`); without it the console keeps drawing over the program (cursor,
  kernel messages such as the under-voltage warning). `sudo usermod -aG tty pi` and log in again.

## The desktop must not own the display

With `lightdm` running, the program opens `/dev/fb0` and renders, but the desktop compositor holds the KMS display, so
the screen shows the desktop and nothing of the program. The program's log looks healthy, which makes this easy to
misread. Stop it (`sudo systemctl stop lightdm`) or, better, boot to a console:
`sudo systemctl set-default multi-user.target` (`raspi-config`: System Options, Boot, Console). With the default
`graphical.target` the desktop comes back after every reboot.

## Power: the first performance factor

`vcgencmd get_throttled` (bits: 0 under-voltage now, 1 frequency capped now, 2 throttled now, 3 soft temperature limit
now; 16-19 the same, "has occurred since boot"):

| state | `get_throttled` | ARM clock | navigation while driving |
| --- | --- | --- | --- |
| weak supply (display powered from the Pi) | `0x50005` | **600 MHz** (of 1400) | ~10 fps |
| proper 5 V supply | `0x0` | 1400 MHz | ~12 fps, one core at 100 % |

The official display draws its power through the Pi, so a marginal supply throttles the CPU by more than half and
prints "Undervoltage detected" in `dmesg` (and on the console when the `tty` group is missing). Always check
`get_throttled` before and after a measurement and discard runs where bits 0-2 or 16-18 are set.

Thermal: with four busy threads and no heatsink the runs ended with `0x80008` (soft limit at 60 C reached), so the
numbers below are if anything pessimistic. A heatsink is the real fix; `temp_soft_limit=70` in `config.txt` raises the
limit.

## Where the time goes (navigation, before the parallel raster)

`ZINC_PROFILE=1`, 300 frames, proper supply, ms (see `docs/dev-mode.md`):

| phase | p50 | p99 |
| --- | --- | --- |
| `paint` (the program's `onDraw`: projects the city, emits draw commands; logic thread) | 11.2 | 14.3 |
| `diff` | 0.8 | 0.9 |
| `present` (fbdev: rasterization + conversion + vsync wait, all serial) | 15.7 | **85.6** |

Heavy frames spent 70-85 ms in `present`: the shared software rasterizer ran on a single core, then a per-pixel
32 to 16 bpp conversion, then a blocking vsync wait. The macOS SDL HAL already rendered in parallel bands; the fbdev
driver did not.

A trap for benchmarks: `ZINC_DEMO=navigation` only opens the tab, and the navigation starts in its **route preview**
(static overview, automatic departure after 8 s). Numbers taken in the preview (~20 fps at 1 thread, ~41 fps at 2)
are not representative of driving. Use `ZINC_DEMO=navdrive` (starts driving; `ZINC_NAVAT=<metres>` picks the place
along the route) and discard the first seconds (camera fly-down: `ZINC_FBDEV_SKIP_S`).

## Parallel band rasterization (fbdev)

`runtime/include/render_bands.h`: the rows are cut into bands of 16, pulled by the worker threads and the caller
through an atomic counter (as Blend2D does), every band renders the same frozen command list clipped to its rows
(rasterizer scratch is thread-local), and the frame is presented only after a barrier that waits for every band.
`plugins/display-fbdev` runs rasterization and the RGB565 / XRGB8888 conversion of each band in the pool.
`ZINC_RENDER_THREADS` sets the count (default: online cores, capped at 8; `1` is the old path and creates no thread).

Driving, Pi 3B+ at 1.4 GHz, at least 740 frames per run; fps and raster p50 (ms) for 1 / 2 / 3 / 4 threads:

| point of the route | fps | raster p50 |
| --- | --- | --- |
| Place de la Concorde | 13.2 / 22.4 / 27.4 / **30.4** | 74.7 / 40.9 / 28.9 / 25.8 |
| Champs-Elysees | 12.3 / 19.6 / 24.1 / **28.0** | 67.1 / 39.5 / 29.8 / 23.9 |
| Arc de Triomphe | 11.9 / 18.6 / 23.5 / **28.6** | 74.2 / 43.8 / 32.5 / 24.9 |
| quays, traffic jam (1 / 4 threads) | 12.2 to 28.6, 12.5 to 29.8 | |

About x2.4 in fps and x2.9 on rasterization; the gain flattens after 3 threads (total CPU time +30 %). The gallery
screen goes from 11.8 to 5.2 ms of raster. The frame checksum (`ZINC_FBDEV_CRC=1`) is identical for 1, 2, 3 and 4
threads over 200 deterministic frames, so bands cannot drift apart. `ZINC_FBDEV_FUSE` (render and convert in one job)
was not faster and had a worse p99; it stays off.

Remaining budget at 4 threads (~34 ms per frame): ~25 ms raster, 6-9 ms `paint` on the logic thread, 1.4 ms
conversion.

## Findings not yet fixed

- `FBIO_WAITFORVSYNC` returns in 0.01 ms on the KMS fbdev emulation, so nothing paces to 60 Hz and tearing is possible.
- Touch on the FT5x06 is detected by the kernel; its behaviour inside the programs was not verified during the
  measurement runs (which were scripted).
- Not verified: `rpi1` on hardware, 24/32-bit framebuffers, the scaled (`xmap`) present path with several threads,
  the SDL HAL adopting the shared band header.
- The rasterizer is the ceiling on this class of board; see [render-perf-options.md](render-perf-options.md) for the
  options and [gpu-renderer-design.md](gpu-renderer-design.md) for the GPU renderer that follows from it.

## Suggested Pi configuration

| setting | why |
| --- | --- |
| proper 5 V supply (3 A, short thick cable) | removes the 600 MHz throttling |
| `multi-user.target` (no desktop) | the desktop owns the display; frees RAM and CPU |
| CPU governor `performance` | no ramp-up latency (`ondemand` is the default) |
| heatsink, optionally `temp_soft_limit=70` | 4 busy threads reach the 60 C soft limit |
| leave `gpu_mem` (76 MB) and CMA (256 MB) | video decode uses CMA; the software renderer does not use the GPU |
| do not overclock | the 3B+ is already at 1.4 GHz; more voltage causes under-voltage |

## Reproducing the measurements

```sh
# on the Pi, from ~, program stopped first (pkill hero)
ZINC_DEMO=navdrive ZINC_NAVAT=2500 ZINC_RENDER_THREADS=4 \
ZINC_PROFILE=1 ZINC_FBDEV_STATS=1 ZINC_FBDEV_SKIP_S=3 ZINC_FRAMES=900 ./hero
vcgencmd get_throttled; vcgencmd measure_clock arm      # before and after
```

`ZINC_FBDEV_STATS` prints per-frame p50 / p99 / mean of render, convert, vsync and present, and the effective fps;
options are listed in `docs/plugins/display-fbdev.md`.

## Zinc Next, cross built from the Mac (2026-10-12)

`hero` and `museum-table` are exported on the Mac with the pinned zig (no Docker) and run on the same Pi 3B+:

```sh
cd next
build/zinc export ../examples/hero --target rpi                              # ../examples/hero/dist/hero-rpi/ (aarch64, 58 MB, not stripped)
rsync -aL ../examples/hero/dist/hero-rpi/ pi@spark.local:zn/hero/            # ~/hero on the Pi is the prototype's binary: another directory
ssh pi@spark.local 'cd ~/zn/hero && ln -sfn ~/media media && (setsid nohup ./hero >/tmp/zn-hero.log 2>&1 </dev/null &)'
ZINC_DISPLAY=fbdev build/zinc export ../examples/museum-table --target rpi   # its zinc.json has no Linux target: the driver from the environment
```

What was missing, and what the session changed:

- **No display driver in a cross build.** The program ran on the null HAL and left after 60 frames. `zinc build --target` now builds and links the driver
  zinc.json names for Linux (`display-fbdev`), and the host measures time and runs without a frame budget while a driver holds the screen
  (`ZINC_FRAMES` and headless runs keep the fixed step).
- **No sysroot for plugins that need system libraries** (`zinc:video`: FFmpeg). A cross build now asks pkg-config about
  `$ZINC_HOME/sysroots/<target>` (`~/.zinc/sysroots/aarch64-linux`), filled by hand until ZN-334 pins one: on the Pi, without sudo,
  `apt-get download libavformat-dev libavcodec-dev libavutil-dev libswscale-dev libswresample-dev`, `dpkg -x` each into a directory, copy the
  installed `lib{avformat,avcodec,avutil,swscale,swresample}.so.*` beside them, point each `lib*.so` link at its soname, delete the `.a` files, and
  bring `usr/` back (20 MB). The device's libraries name a newer glibc than the one zig targets: the link passes `--allow-shlib-undefined`.
- **A stale cross build directory** failed once with "No rule to make target" after CMakeLists.txt gained a target: the build is tried twice.

Seen on the screen (`ZINC_PERF_HUD=1`, supply still weak: `get_throttled` 0x50005, ARM clock 600 MHz): the home screen at 52.7 fps (frame 19 ms),
the Navigation tab at 11 fps; touch works (ft5x06, `event6`). These are observations under throttling, not measurements. The console cursor shows in
the bottom left corner: `pi` is not in the `tty` group (see above).

### Navigation at 11 to 15 fps: the supply, then the rasterizer (2026-10-12)

Measured off the screen on the same Pi (museum-table stopped during the run), hero driving from the start of the route, the framebuffer a file:
`ZINC_FBDEV_SIM=/tmp/fb.sim ZINC_FBDEV_SIM_FORMAT=800x480x16 ZINC_FBDEV_STATS=1 ZINC_FBDEV_SKIP_S=4 ZINC_PROFILE=1 ZINC_DEMO=navdrive ZINC_FRAMES=260 ./hero`.
ARM clock 600 MHz for the whole run (`get_throttled` 0x50005: under-voltage), p50 in ms:

| `ZINC_RENDER_THREADS` | fps | paint (logic thread) | raster (wall) | raster (CPU, all threads) | convert | diff |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | 17.8 | 12.7 | 41.2 | 158.0 | 1.8 | 0.5 |
| 1 | 6.8 | 12.7 | 137.9 | 137.8 | 2.3 | 0.5 |

- The clock is the first factor: 600 MHz instead of 1400 (x2.3). The prototype's numbers above were taken at 1.4 GHz (25 ms of raster and 6 to 9 ms
  of paint at 4 threads, 28 to 30 fps); scaled by the clock they give 58 and 14 to 21 ms, so Zinc Next is not slower than the prototype here.
- A frame is paint then present, one after the other: 12.7 + 43.1 = 56 ms. The rasterizer is 73% of it and already uses the four cores (x3.3 for
  +15% of CPU time); paint, the program's own drawing of the city, is 22% and runs on one core.
- The whole map changes at every frame while driving, so damage tracking saves nothing; the GPU (VideoCore IV) is not used: display-gl is not
  cross-built yet (its EGL, GLES, GBM and DRM packages are the sysroot of ZN-334).
- Not measured: the same run with a proper supply (the clock ratio alone would give about 40 fps; the prototype reached 28 to 30 at 1.4 GHz), other points of the route, the real
  `/dev/fb0` (the on-screen HUD showed 11 fps on the quays, with the HUD's own cost).

### The GPU on the same run: display-gl on VideoCore IV (2026-10-12)

hero exported with `ZINC_DISPLAY=gl` (`display-gl: 800x480@60, VC4 V3D 2.1`; its EGL, GLES, GBM and DRM come from the sysroot, taken from the
Pi with `tools/device <pi> sysroot libegl-dev libgles-dev libgbm-dev libdrm-dev libgl-dev`), same driving run, 260 frames, clock 600 to 700 MHz,
p50 in ms:

| display, renderer | present | paint | what draws |
| --- | --- | --- | --- |
| fbdev, 4 threads | 43.3 | 12.7 | software bands on four cores |
| gl, `renderer: "cpu"` (the driver's default) | 142.6 | 13.1 | the software rasterizer on one core, uploaded as a texture |
| gl, `ZINC_RENDERER=gl`, before the fix below | 186.4 | 11.2 | 23 draw calls, 987 quads, 5.5 LINE/POLY tiles filled on the CPU a frame; 115 ms of CPU to submit |
| gl, `ZINC_RENDERER=gl`, with a stencil buffer | 183.9 | 11.0 | 64 draw calls, 6313 quads, no CPU tile; 29 ms of CPU to submit |

- **A bug**: `plugins/display-gl/src/kms.cpp` chose its EGL config without naming a stencil size, and eglChooseConfig lists the smallest stencil
  first: the context had none, so every LINE and POLY of the map was filled in a CPU tile on one core and uploaded (`glr::draw_poly`, 5 of 16
  sampled stacks). The config now asks for 8 stencil bits first. CPU time to submit a frame: 115 to 29 ms.
- **The GPU is then the limit**: the frame still takes 184 ms while the process uses 11% of one core (9% user, 2% kernel, over 10 s): it waits
  for the GPU. The renderer's fills (stencil then cover, distance fringes computed by the fragment shader) were written and measured on desktop
  GL; VideoCore IV does not keep up with them. On this board the software bands are four times faster for the map.
- Not measured: the UI screens (rectangles, text, images) on the GL renderer, where the fragment work is much lighter; the split between the
  GPU's passes (no timer query on this driver).
- The firmware's memory split (`gpu_mem`, 76 MB here) is not involved: with `vc4-kms-v3d` the GPU's buffers come from the kernel's CMA
  (256 MB, 115 MB free during the run).

The tools of this session are kept in `next/tools/device` (status, sysroot, push, run, shot, profile, stacks) for the next boards.

### Why the GL renderer is slow on VideoCore IV, measured (2026-10-12)

Same Pi, same clock (600 MHz, under-voltage), hero exported with `ZINC_DISPLAY=gl`, run with `ZINC_RENDERER=gl`, 120 to 200 frames each
(`tools/device <pi> profile hero-gl ZINC_RENDERER=gl ZINC_DEMO=<screen> ...`), present p50 in ms:

| screen | software bands (fbdev, 4 threads) | GL renderer | GL, `ZINC_GL_FRINGE=0` | GL, `ZINC_GL_ONLY=5` | GL, both |
| --- | --- | --- | --- | --- | --- |
| navigation, driving | 43.3 | 217.4 | 93.8 | 34.8 | 24.0 |
| home | 8.7 | 30.2 | | 30.6 (13.2 with `ZINC_GL_ONLY=2`) | |
| gallery | 16.0 | 41.3 | | 64.0 | |
| tasks, settings (half the frames idle) | 0.04, 0.9 | 14.7, 14.4 | | | |

The two switches are experiments kept in `runtime/gl_replay.cpp`: `ZINC_GL_FRINGE=0` draws POLY without its antialiased edges, and
`ZINC_GL_ONLY=<mode>` compiles the replay's fragment shader for one mode alone (5 = SOLID: every quad a flat colour, so the pixels are wrong
and only the time means something).

- **The fragment shader is the first cost.** One program draws every mode (rounded box and gradients, border, text, image, shadow, stroke,
  convex, edge, and the gradient paint with its loops over eight stops) behind a ladder of `if`. A GPU without branches runs all of it for
  every pixel. With one mode compiled in, the driving frame goes from 217 to 35 ms, below the software bands, and the first frame from 2.5 s
  to 0.3 s (the compile).
- **The fringes of POLY are the second.** Each edge gets a quad the size of its bounding box: 434 576 pixels a frame in each pass, more than
  the screen (384 000), several passes, with three segment distances and `discard` per pixel: 124 of the 217 ms.
- **The driver stalls in the middle of a frame**: `VC4_DEBUG=perf` prints "Blocking on resource BO for bo map" (23 times in 60 frames) and
  "Blocking on seqno ... for job throttling" at every frame. Not attributed yet (texture uploads into a texture the frame already uses, the
  rounded clip's `glCopyTexSubImage2D`, a clear after the first draw are the candidates of `docs/reports/hardware/vc4-gles2-performance.md`).
- **Blended fill is slow by itself**: home (stacked translucent glows) and gallery do not get faster with the flat shader. Not explained:
  gallery is slower with it (64 against 41 ms).
- Driver facts: OpenGL ES 2.0 Mesa 25.0.7, highp floats in fragment shaders (23 bits), 4x MSAA configs for an XRGB8888 window (3), no
  `EXT_multisampled_render_to_texture`, no `OES_standard_derivatives`, `max_vertex_attribs` 8.

Research: [hardware/vc4-gles2-performance.md](hardware/vc4-gles2-performance.md) (the driver) and
[gles2-2d-rendering-techniques.md](gles2-2d-rendering-techniques.md) (how NanoVG, Mapbox GL, Impeller and Skia draw on this class of GPU: fringes
as thin strips with the coverage in a vertex attribute, or 4x MSAA with plain triangles; no distance maths per pixel).

### The GLES 2 fast path of the GL renderer, measured (ZN-725, 2026-10-12)

What was measured, and how. The same Pi 3B+, hero exported with `ZINC_DISPLAY=gl`, `ZINC_RENDERER=gl`, 200 frames a run, `present` p50
in ms. A new supply was fitted at 13:50: the numbers below are at **1400 MHz**, with nothing else running on the board, the board under
55 C before each run and the throttling word read after it (`tools/device <pi> profile`; `capture` reads a frame back; `status` lists
what runs). The numbers of the section above were taken at 600 MHz, and the GL ones of the afternoon under the load of a museum-table
program that `tools/device` did not stop (fixed): they stay as history and are not compared with these.

| screen | software bands (fbdev, 4 threads, off screen) | display-gl, `renderer: "cpu"` (one core, uploaded) | GL renderer before | GL renderer now |
| --- | --- | --- | --- | --- |
| navigation, driving | 19.1 (raster 17.7) | 62.2 | 181.1 | 25.0 |
| home | 14.9 (raster 2.0, then the vsync) | 14.9 | 31.0 | 14.8 |
| gallery | 14.1 (raster 3.9, then the vsync) | 13.8 | 32.8 | 22.8 |
| tasks, settings (70% of the frames idle) | 15.0, 14.7 | | 15.6, 15.4 | 15.6, 15.0 |
| first frame | | | 1081 to 1126 | 277 to 295 |
| draw calls a frame (navigation, home, gallery) | | | 63.5, 11.6, 86.1 | 103.1, 73.4, 107.6 |

CPU time of the whole program per frame (user + system, every thread, 300 frames from the start), and the board's temperature over the run:

| screen | software bands | display-gl `cpu` | GL renderer now |
| --- | --- | --- | --- |
| navigation | 80.2 ms, 289% of a core, 51 to 58.5 C | 72.8 ms, 99% | 21.3 ms, 56%, 53 to 54.2 C |
| home | 12.5 ms | 11.5 ms | 11.5 ms |
| gallery | 23.8 ms, 128% | 20.8 ms, 93% | 14.7 ms, 46% |

What the numbers say:

- **Navigation went from 181 to 25 ms on the GPU, and the software bands still lead it** (19.1 ms): the GL frame holds 22 ms of GPU work
  (`ZINC_GL_TIME=1`: 33.6 ms with a `glFinish`, 11.6 of them the CPU's), so it misses one vblank in two and runs at 30 frames a second
  where the bands give about 40. It does so with a fifth of the CPU time (0.56 of a core against 2.9) and without heating the board:
  the bands take a bare 3B+ from 51 to 58.5 C in eight seconds, and the firmware's limit at 60 C then cuts the clock to 1200 MHz
  (`throttled` bit 3, seen after a few minutes of the software navigation).
- **Home is at the vsync with every renderer; gallery is slower on the GPU** (22.8 against 14.1 ms): its two rounded clips each copy
  their corners from the framebuffer, and each copy ends the driver's job (below).
- **The first frame is under 0.3 s** (1.1 s before): 8 programs of one mode each, built from their own block of the source, instead
  of one program of every mode.

What changed in `runtime/gl_replay.cpp` (GLES 2 only; desktop GL keeps its single program, its draw calls and its pixels), with what
each step gave on navigation:

1. **One program per mode** (181 to 65 ms). VideoCore IV has no branches: it ran every mode of the single fragment shader for each
   pixel. A batch is still one vertex upload; its consecutive quads of one mode are a run, drawn by that mode's program, built at first
   use from that mode's block of the source alone (30 to 66 ms a program at 600 MHz, against 100 for any slice of the whole ladder).
   Program classes were measured against it (`ZINC_GL_GROUPS`, at 600 MHz under the load, present p50 home / gallery / navigation):
   one program per mode 23.2 / 35.0 / 81.6; a UI core and a vector program 29.3 / 34.7 / 120.4; SOLID apart 22.7 / 35.3 / 100.5. The
   split measured slower on 2026-09-29 ended the batch at each switch; a run costs a draw call, not an upload.
2. **Edges as strips** (65 to 29.7 ms). The antialiased edges of POLY and STROKE were boxes with three segment distances and a
   `discard` per pixel. They are now thin quads whose vertices carry the coverage (mode RAMP: `w - |t|`): a quad per stroke segment
   with shared corners, discs at sharp joins and ends; a convex polygon shrunk by half a pixel plus a quad per edge, without stencil;
   two half-pixel quads per edge in the stencil path. 4x MSAA with plain triangles, the other candidate, takes 35.5 ms without any
   fringe pass (`ZINC_GL_MSAA=4 ZINC_GL_FRINGE=0`; 19.2 ms for the same geometry without MSAA) and would only reach the frames drawn
   straight into the window: not kept. A translucent stroke keeps the capsules, which blend each pixel once.
3. **Five draw calls for a batch of polygons, not seven** (29.7 to 25.0 ms): a drawn pixel loses its winding with the write that marks
   it and the cover zeroes what it does not draw, so the two stencil-only passes over the boxes are gone.
4. **Glyphs uploaded once a frame** (fewer stalls, below; the p50 does not move). Each new glyph was a `glTexSubImage2D` into the
   atlas after draws of the same frame: the driver submitted the frame so far and waited for the GPU (1.9 to 3.7 ms a glyph at 600 MHz
   under load, 300 ms of that first frame; about 10 ms of the first frame at 1400 MHz). A glyph now goes into a copy of the atlas in
   memory and the changed rows are uploaded before the frame's first draw.

The driver's stalls (`VC4_DEBUG=perf` with `ZINC_GL_TRACE=1`, which prints the replay's uploads, copies and clears in between; 60
frames, "Blocking on resource BO for bo map"): navigation 22, home 26, gallery 45 before; 10, 18 and 39 after change 4. Every one left
follows a call the trace names: the atlas upload at the start of a frame that brings new glyphs (the previous frame still samples the
texture, so the call waits for that frame's GPU work: 11 ms on navigation, time the swap would wait for otherwise), and on gallery 26
follow `glCopyTexSubImage2D`, the corners of a rounded CLIP saved from the framebuffer: the frame is then three driver jobs, each
loading and storing its tiles. Not removed: it needs a rounded clip that does not read the framebuffer. No clear comes after a draw on
these screens.

Pixels, frame 60 against the software frame of the same build (`ZINC_RENDERER=cpu`, `tools/glcompare`, pixels more than 24 away /
mean error): navigation 0.217% / 0.360 (0.226% / 0.387 before), home 0.063% / 0.098 (0.070% / 0.101), gallery 0.048% / 0.153
(0.055% / 0.158). The single program left stray pixels of a neighbouring quad on this GPU, most on the 64-pixel tile boundaries; the
per-mode programs do not. Seen before and after, not investigated: single background-coloured pixels inside some POLY fills of the map.

Which renderer on this GPU:

- **A program that does not need the GPU: the fbdev driver and its bands**, as hero's `rpi` target says. It is the fastest on every
  screen at the full clock. Its price is the four cores and the heat.
- **display-gl keeps `renderer: "cpu"` as its default** on GLES 2. `"gl"` is now 2.5 times faster than it on the map (25.0 against
  62.2 ms) and uses half the CPU everywhere, but it is slower on gallery (22.8 against 13.8 ms) and has not had the long run on
  partially changing screens that the hang of 2026-09-29 asks for (no GPU reset in any run of this task). A program with a map or
  another vector-heavy screen should ask for it: `"display": { "driver": "gl", "renderer": "gl" }` or `ZINC_RENDERER=gl`.
- Not measured: the bands on the real `/dev/fb0` at this clock (the reference is off screen), a board with a heatsink, a run of more
  than a few seconds for either renderer's heat, Kit and Forms on the GL renderer, any other GLES 2 GPU.

Switches added in `runtime/gl_replay.cpp` and `kms.cpp`: `ZINC_GL_STRIPS=0` (the boxes and capsules again; `1` draws the strips on
desktop GL, which `tests/t1/gl_strips.sh` compares with the software frame), `ZINC_GL_GROUPS="0,1,7;2"` (modes sharing a program),
`ZINC_GL_MSAA=4`, `ZINC_GL_TRACE=1`; `ZINC_GL_ONLY=<mode>` and `ZINC_GL_FRINGE=0` still work. `ZINC_GL_STATS=1` also prints the build
time of each program and where the first frame's time goes.

### hero at 1920x1080 on the Pi 3B+, software bands (2026-10-12)

Off screen (the fbdev driver's file framebuffer at 1920x1080x16, the other programs paused), 4 threads, the board at its soft temperature limit
(1200 MHz, `get_throttled` 0xd0008: about 15% under the full clock), p50 in ms. hero takes its desktop layout at this width.

| screen | paint | raster | convert | frames a second |
| --- | --- | --- | --- | --- |
| navigation, driving | 16.9 | 98.1 | 7.3 | 8.1 |
| home | 1.4 | 8.6 | 0.9 | 60 (paced) |
| gallery | 2.5 | 12.2 | 3.5 | 53 |

The screens of an interface hold at 1080p (their damage is partial); a full-screen vector map does not: 5.4 times the pixels of 800x480 cost
5.8 times the raster. Not measured: museum-table at 1080p, the real `/dev/fb0` on a 1080p screen, the same at 1400 MHz with a heatsink.

### The film of museum-table at 11 pictures a second: the matrix, then the decoder's buffer (ZN-730, 2026-10-12)

The owner's complaint at the Pi 3B+ (800x480): the film of `examples/museum-table` (sequence `wave`: one card, an 854x480 H.264 clip at
24 pictures a second, drawn 500x281) "is at 20 fps and stutters". Two causes, measured apart and together. How: the program run off the
screen for 16 s in real time (`ZINC_FBDEV_SIM`, 800x480x16, four raster threads, `ZINC_FBDEV_STATS=2`, `ZINC_VIDEO_LOG=1`, the first 3 s
left out), the owner's program on the screen paused meanwhile, the board under 55 C before each run and `get_throttled` 0xd0000 during
it unless said. A frame "with a new picture" is one that repaints 200 rows or more (279 here); the others repaint nothing.

| build | raster of a frame with a new picture, p50 / p90 / max | CPU of the raster threads, p50 | conversion in the decode thread, p50 | pictures shown a second | frames a second |
| --- | --- | --- | --- | --- | --- |
| before | 27.2 / 28.8 / 36.2 ms | 100.4 ms | 85.4 ms | 11.6 | 51.9 |
| plain commands under a scaling matrix | 6.0 / 8.2 / 10.3 ms | 18.7 ms | 85.4 ms | 11.6 | 59.8 |
| a copy of the decoder's frame before swscale (soft limit reached during the run: 60.1 C) | 27.6 / 31.7 / 36.0 ms | 99.7 ms | 17.5 ms | 24.0 | 43.1 |
| both | 6.2 / 8.4 / 11.2 ms | 18.2 ms | 10.0 ms | 24.0 | 59.7 |
| both, the build left on the Pi as `museum-wip`, two more runs | 6.2 / 8.2 / 12.3 and 6.1 / 7.8 / 12.0 ms | 18.3 and 18.4 ms | 10.0 and 10.1 ms | 24.0 | 59.7 |

No picture was dropped in any run: before, the decode thread simply delivered 11.6 a second and the player's clock waited for it.

**The matrix.** Since ZN-726 every card of the museum is drawn through one `gfx.setTransform` (its angle and its zoom), and every box
command under a matrix was an XFORM, drawn pixel by pixel through the inverse matrix (D71). A matrix that only scales and moves now
leaves no trace: the command is recorded at its place and size on the screen and takes the plain paths (`runtime/gfx.cpp` `xf_plain`;
a text and a gradient paint keep the matrix). The picture alone (`next/tests/data/xform_plain -- film-direct | film-matrix |
film-turned`, the same 854x480 runtime image drawn 500x281 at each frame; raster p50 wall / CPU of the four threads):

| | Mac (one thread, ms a picture) | Pi 3B+ before, at 1200 MHz beside a program at 146% | Pi 3B+ after, cooled, the others paused |
| --- | --- | --- | --- |
| drawn directly | 1.17 | 5.49 / 16.5 ms | 3.83 / 13.5 ms |
| under a matrix that scales and moves | 3.88 before, 1.17 after | 23.0 / 82.0 ms | 3.83 / 13.5 ms |
| under the same matrix turned by 2 degrees | 3.94 | 23.7 / 84.0 ms | 14.3 / 51.1 ms (the run ended at 60.1 C) |

A card with an angle still pays the XFORM price (a film in a tilted card: 51 ms of CPU a picture). The direct path is itself a float
bilinear loop, 135 cycles a pixel on the Cortex-A53: a film decoded at the size it is drawn would be a row copy.

**The decoder's buffer.** zinc:video takes `h264_v4l2m2m` on this Pi (`/dev/video10`, bcm2835-codec; the wrapper is in the Pi's FFmpeg
7.1.3 and `pi` is in the `video` group). Its frames are the driver's capture buffers, mapped without a cache, and swscale read them
sample by sample. FFmpeg alone on the clip (`ffmpeg -benchmark ... -f null -`, 240 pictures, CPU a picture, 1400 MHz, 55 to 58 C):

| decode, then | CPU a picture |
| --- | --- |
| software, 4 threads / 1 thread, nothing | 13.5 / 10.0 ms |
| `h264_v4l2m2m`, nothing | 0.6 ms |
| software, 1 thread, bgr0 by swscale (854x480; bgra the same; 500x281 11.2) | 18.7 ms (8.7 of conversion) |
| `h264_v4l2m2m`, bgr0 by swscale straight from the buffer, 1 thread | 82 ms: 12 pictures a second |
| `h264_v4l2m2m`, a copy of the buffer (0.6 MB), then bgr0 by swscale | 13.7 ms (copy 5.1, conversion 8.0) |
| `h264_v4l2m2m` asked for bgr0 itself (`-pixel_format bgr0`), copied (1.64 MB) | 12.9 ms |

The plugin now copies a V4L2 decoder's frame into ordinary memory before converting it (one buffer kept from picture to picture):
85 to 10 ms a picture in its thread, and 24 pictures a second. BGRX from the decoder is no gain (the larger copy costs what the
conversion saved) and its colours are wrong for this clip: the decoder calls every frame limited range, the clip is full range
(yuvj420p), mean difference 11 levels of 255 against the software decode. For the same reason the conversion now takes the range the
stream names: the decoder's samples read as full range are the software decode's (mean difference 0.000, at most 1 level, one
picture of the clip converted by FFmpeg both ways), so the film gets on the Pi the colours it has elsewhere (it was more contrasted;
not checked on the program's own frame). Not measured: the ISP node (`/dev/video12`) handing the picture at the drawn size. FFmpeg's
`scale_v4l2m2m` filter refused the three graphs tried from the command line, it wants DRM_PRIME frames, and the plugin does not link
libavfilter: it belongs with the zero-copy route to a KMS plane (ZN-731, `docs/reports/video-zero-copy.md`).

Not proven: the same run on the real `/dev/fb0` (the owner's program held the screen; `tools/device <pi> run museum-wip`, then the
sequence of the film with `ZINC_PERF_HUD=1`), and a fixed clock: the governor is `ondemand` and there is no sudo, so the light runs
started at 600 MHz (7 of the 8 samples taken every 2 s during a run read 1400 MHz) and their times are not better than a fixed
1400 MHz would give. The numbers of the task before this work (raster p99 29.9 ms, mean 6.25) are met again by the build of main
left as `museum-wip-before` (29.1 and 6.16).
