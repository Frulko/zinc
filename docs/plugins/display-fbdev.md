# display-fbdev

Linux framebuffer display driver with evdev input: how `linux` and `rpi1` programs get a real screen without X or
Wayland (console boot, kiosk, video looper). Plugin: `plugins/display-fbdev/`.

```json
{ "targets": { "rpi1": { "width": 1280, "height": 720, "display": "fbdev" } } }
```

or with options: `"display": { "driver": "fbdev", "device": "/dev/fb1", "grab": false }`.

## Output

- Opens `device` (default `/dev/fb0`), reads the mode (`FBIOGET_VSCREENINFO`) and maps it. 16 bpp (RGB565 or any
  bitfield layout), 24 bpp and 32 bpp are converted from the runtime's `0x00RRGGBB` using the reported channel
  offsets/lengths (alpha bits set when the mode has them).
- Only the damaged rows of each frame are rendered and written (damaged columns too at 1:1).
- **Rendering uses every core.** The damaged rows are cut into bands of 16 rows; the caller and a pool of worker
  threads pull bands from an atomic counter (uneven bands balance themselves) and each band rasterizes its rows from
  the frame's retained command list. `present` returns only when every band is done (a frame barrier), so bands never
  run ahead of or behind the frame and the pixels are identical to a single-threaded render (checked, see below).
  Then, after the vblank wait, the bands are converted to the framebuffer format the same way (branch-free loops for
  RGB565 and XRGB8888, a generic path for other layouts). Shared code: `runtime/include/render_bands.h`.
- The program surface (zinc.json `width` x `height`) is copied 1:1 when it matches the framebuffer, else scaled with
  nearest-neighbour, aspect kept, centered on black. Match the sizes on slow boards (Pi 1): scaling touches every
  pixel of the output.
- Pacing: waits for vblank with `FBIO_WAITFORVSYNC` when the driver supports it, otherwise sleeps to `fps`
  (default 60). No page flipping: tearing is possible on fast motion.
- The console is switched to graphics mode (`KDSETMODE KD_GRAPHICS` on `/dev/tty0`) so the text cursor and kernel
  messages do not draw over the picture; text mode is restored on exit (Esc, SIGINT, SIGTERM, or `gfx.quit()`).
- No framebuffer (headless, docker/QEMU, no permission): `init` returns 0 and the target HAL keeps the screen.

Raspberry Pi 3/4 with the KMS driver (`dtoverlay=vc4-kms-v3d`) expose `/dev/fb0` through DRM fbdev emulation; it
works the same way. Pick the HDMI mode with `video=HDMI-A-1:1280x720@60` in `cmdline.txt` (KMS) or
`hdmi_group/hdmi_mode` in `config.txt` (legacy firmware), and set the same size in zinc.json.

## Input

All `/dev/input/event*` devices are opened (option `input`, default true):

| device | maps to |
|---|---|
| keyboard | arrows/WASD → Up/Down/Left/Right, Space/Z → A, X → B, C → X, V → Y, Q → L, E → R, Enter → Start, Tab → Select, Esc → quit (same as the SDL HAL) |
| mouse | relative motion → pointer (clamped to the surface), left button → `pointerDown`, wheel → `gfx.wheel()` |
| touchscreen (multitouch protocol B) | slots → `gfx.touchCount/touchX/touchY/touchId`; the first touch also drives the pointer |
| touchscreen / tablet (single touch) | `ABS_X/Y` + `BTN_TOUCH` → pointer |

Touch coordinates are mapped from the device range to the framebuffer, then through the letterbox to the surface.
Keyboards are grabbed (`EVIOCGRAB`, option `grab`) so keystrokes do not reach the shell on the console behind.

The null HAL (docker builds use it under the display driver) quits after 60 frames for headless tests; the driver
cancels that unless `ZINC_FRAMES` is set, so a program runs until Esc or a signal.

Permissions: the user needs the `video` group (`/dev/fb0`) and the `input` group (`/dev/input/event*`); `tty` for
the graphics mode switch (else it is skipped).

## Options

| option | default | meaning |
|---|---|---|
| `device` | `/dev/fb0` | framebuffer device (e.g. `/dev/fb1` for an SPI panel with `fbtft`) |
| `input` | true | read evdev devices |
| `grab` | true | grab keyboards exclusively |
| `fps` | 60 | frame rate when the driver has no vblank wait |

Environment variables (read at start, not zinc.json options):

| variable | meaning |
|---|---|
| `ZINC_RENDER_THREADS=n` | rasterizer threads, the calling thread included; default the online cores, at most 8; `1` is the old single-thread path (no thread is created) |
| `ZINC_FBDEV_STATS=1` | at exit: frames, wall time, effective fps, and per frame p50 / p99 / mean of `raster` (wall time of the parallel rasterization), `vsync`, `convert`, `present`, plus `cpu-render` / `cpu-convert` (thread time summed over the threads) |
| `ZINC_FBDEV_SKIP_S=s` | leave the first `s` seconds out of the stats |
| `ZINC_FBDEV_CRC=1` | at exit: CRC-32 of the surface, to compare runs bit for bit (with `ZINC_DETERMINISTIC=1`) |
| `ZINC_FBDEV_FUSE=1` | each band also converts its rows right after rasterizing them, then the vblank wait (default: rasterize all, wait, convert all, so the write follows the vblank). Measured no faster, worse p99 |

## Measured

Raspberry Pi 3B+ (Raspberry Pi OS trixie arm64, `linux` target, KMS `vc4`, official 7" DSI screen 800x480 at 16 bpp,
1.4 GHz), `hero` navigation tab **driving** (heading-up map, `ZINC_DEMO=navdrive ZINC_NAVAT=<metres>`), 740-780 frames
per run after 2 s of warm-up, `ZINC_FBDEV_STATS=1`, milliseconds unless stated:

| route point | threads | effective fps | raster p50 / p99 | convert p50 | present p50 |
|---|---|---|---|---|---|
| Concorde (1700 m) | 1 | 13.2 | 74.7 / 78.8 | 2.6 | 77.3 |
| | 2 | 22.4 | 40.9 / 44.1 | 1.5 | 42.5 |
| | 3 | 27.4 | 28.9 / 35.3 | 1.4 | 30.2 |
| | 4 | 30.4 | 25.8 / 37.1 | 1.4 | 27.2 |
| Champs-Élysées (2400 m) | 1 / 2 / 3 / 4 | 12.3 / 19.6 / 24.1 / 28.0 | 67.1 / 39.5 / 29.8 / 23.9 | 2.6 / 1.5 / 1.4 / 1.4 | 69.8 / 41.0 / 31.3 / 25.2 |
| Arc de Triomphe (3900 m) | 1 / 2 / 3 / 4 | 11.9 / 18.6 / 23.5 / 28.6 | 74.2 / 43.8 / 32.5 / 24.9 | 2.6 / 1.5 / 1.4 / 1.4 | 76.9 / 44.6 / 33.8 / 26.1 |
| quays (600 m), jam (4500 m) | 1 / 4 | 12.2 / 28.6 and 12.5 / 29.8 | 71.8 / 25.8 and 70.7 / 24.8 | | |

- Four threads: about 2.4x the frames per second (12 to 29), 2.9x on the rasterization itself. The CPU time summed
  over the threads grows by about 30 % (memory bandwidth and cache sharing), so the speed-up flattens after 3 threads.
- The surface is bit-identical for 1, 2, 3 and 4 threads: same CRC-32 after 200 deterministic frames
  (`ZINC_DETERMINISTIC=1 ZINC_FBDEV_CRC=1`, 4 runs).
- The gain is not specific to the map: on the hero gallery the rasterization goes from 11.8 to 5.2 ms (66 to 120 fps).
- What is left in a frame at 4 threads (about 34 ms): 25 ms of rasterization, 6-9 ms of `paint` on the logic thread
  (the program's `onDraw` emitting the map's draw commands, one thread), 1.4 ms of conversion.
- The `FBIO_WAITFORVSYNC` ioctl returned in 0.01 ms every time on the KMS fbdev emulation: it does not pace the frames
  here, so nothing is quantized to 60 Hz and tearing is possible. Not investigated further.
- Runs at 3-4 threads showed `throttled=0x80008` afterwards (soft temperature limit, 60 C, no heat sink): they are, if
  anything, pessimistic. No under-voltage bit was set during any run.
- Preview-phase numbers (the route overview before the car starts) are lighter and not representative: 20 fps at one
  thread, 41 at two.

## Not verified

Not run on hardware: `rpi1` (ARMv6, 32 bit) and 24/32 bpp framebuffers (the generic and XRGB8888 converters are
compiled but the Pi screen is 16 bpp), the scaled path (`xmap`, surface size different from the framebuffer) with
several threads, and touch mapping / grabbing on other screens. The SDL HAL (`targets/macos/hal_sdl.cpp`) has its own
copy of a band renderer and could adopt `render_bands.h`. Not implemented: rotation (`fbcon=rotate` / touch axis swap),
double buffering via panning, KMS/DRM output (a `display-drm` plugin would give page flips and planes), overlapping the
program's `paint` with the rasterization of the previous frame.
