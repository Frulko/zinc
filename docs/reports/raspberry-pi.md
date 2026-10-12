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
