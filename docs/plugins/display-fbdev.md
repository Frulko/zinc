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
  (default 60). A wait that returns at once is no pacing: on a Raspberry Pi's DSI screen the kernel's emulation waits for
  its first CRTC and the panel is on another one, so the call returns in microseconds without an error; less than a
  period after the last frame, the driver then sleeps to `fps` as well. No page flipping on `/dev/fb0`: tearing is
  possible on fast motion.
- **Hardware layers** (KMS screens, surface shown 1:1): a picture that lies in device memory, the dmabuf of a video
  decoder, is shown by a plane of the display and never read by the CPU. See "Hardware layers" below.
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
| `ZINC_FBDEV_STATS=1` | at exit: frames, wall time, effective fps, and per frame p50 / p99 / mean / max of `raster` (wall time of the parallel rasterization), `vsync`, `convert`, `present`, plus `cpu-render` / `cpu-convert` (thread time summed over the threads); with hardware layers, the time it took to take the planes and `fbdev planes: N pictures shown from their dmabuf, M frames committed` |
| `ZINC_FBDEV_PLANES=0` | no hardware layer: a decoder gives pixels and every picture is drawn by the rasterizer (to compare, or a display whose planes misbehave). `refuse`: the layers are offered and every one is refused, which is the software path of a picture that came as a dmabuf (what a turned or blended film takes) |
| `ZINC_FBDEV_SKIP_S=s` | leave the first `s` seconds out of the stats |
| `ZINC_FBDEV_CRC=1` | at exit: CRC-32 of the surface, to compare runs bit for bit (with `ZINC_DETERMINISTIC=1`) |
| `ZINC_FBDEV_FUSE=1` | each band also converts its rows right after rasterizing them, then the vblank wait (default: rasterize all, wait, convert all, so the write follows the vblank). Measured no faster, worse p99 |

## Hardware layers

A film drawn by the rasterizer costs a copy out of the decoder's buffer, a colour conversion and the raster of its
rectangle for each picture: 37 ms of CPU on a Pi 3B+ for a 854x480 clip. With a KMS display the driver shows the
decoder's buffer itself (ZN-731; the contract is `HalDisplay.layers` in `runtime/include/hal.h`):

- At start the driver looks for the screen in `/dev/dri/card*`: the CRTC of the primary plane that shows the console,
  with the framebuffer's size, and three free overlay planes on it (two for pictures, one that takes ARGB8888 for the
  frame). It then closes the file again. Without them (no KMS, a scaled surface, `ZINC_FBDEV_SIM`) the driver has no
  layers and `zinc:video` decodes to pixels as before.
- When a frame draws such a picture upright, whole and opaque, the runtime offers it (`gfx.cpp`, "hardware layers").
  The driver opens the DRM file (2 to 7 ms), makes two ARGB8888 buffers for the frame, imports the picture's dmabufs as
  a framebuffer (`PRIME_FD_TO_HANDLE`, `ADDFB2`: 0.07 ms, no pixel read) and tries the placement with a test commit;
  what the compositor refuses (a size it cannot scale to, no memory) is drawn in software instead.
- The rasterizer writes a hole (`HAL_LAYER_HOLE`) where the picture lies. The driver converts the damaged rows into the
  buffer that is not on the screen with alpha 255, and alpha 0 in the holes. Rows where something is drawn over the
  picture are rendered a second time over white holes: where the two renders differ, the pixel was blended over the
  picture, and its alpha is 255 minus the difference (`hal_layer_pixel`). A subtitle, a translucent timeline, the
  antialiased corners of a rounded clip are composed over the film by the display as the rasterizer would have.
- One atomic commit per frame shows the frame's buffer on the plane above and the pictures on the planes under it, at
  the next refresh; its page-flip event paces the loop (a true vertical blank, no tearing). The plane scales the picture
  to its rectangle and converts its colours (BT.601 or BT.709, the range the stream names).
- A picture's framebuffer is removed once the commit that replaced it has reached the screen; the player keeps the
  decoder's frame for two more pictures.
- Two seconds after the last picture the driver writes the whole surface to `/dev/fb0` again and closes the DRM file.
- **The console's plane and the mode are never touched.** The planes, the framebuffers and the buffers belong to the
  DRM file: when it is closed, by the driver or by the kernel after a crash, they are gone and `/dev/fb0` shows.
  Another program that owns the display (a compositor, a DRM master) makes the test commit fail: the driver says so
  once and pictures are drawn in software.

Limits: two pictures at once (`HAL_MAX_LAYERS`); a picture turned, blended, with rounded corners of its own or drawn in
part is the rasterizer's; a blend mode other than the normal one over a picture is composed as a normal one; a
screenshot of the surface (`ZINC_SHOT`) shows the hole, not the picture. Measured on a Pi 3B+: 3.4 to 4.8 ms of CPU a
picture for the whole program against 35 to 38 (`docs/reports/raspberry-pi.md`).

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
  here, so nothing was quantized to 60 Hz when these numbers were taken. Since ZN-731 the driver holds `fps` by the
  clock in that case (see Output); tearing on `/dev/fb0` is still possible.
- Runs at 3-4 threads showed `throttled=0x80008` afterwards (soft temperature limit, 60 C, no heat sink): they are, if
  anything, pessimistic. No under-voltage bit was set during any run.
- Preview-phase numbers (the route overview before the car starts) are lighter and not representative: 20 fps at one
  thread, 41 at two.

## Not verified

Not run on hardware: `rpi1` (ARMv6, 32 bit) and 24/32 bpp framebuffers (the generic and XRGB8888 converters are
compiled but the Pi screen is 16 bpp), the scaled path (`xmap`, surface size different from the framebuffer) with
several threads, and touch mapping / grabbing on other screens. The SDL HAL (`targets/macos/hal_sdl.cpp`) has its own
copy of a band renderer and could adopt `render_bands.h`. Not implemented: rotation (`fbcon=rotate` / touch axis swap),
double buffering via panning, the frame on a KMS plane when no picture is shown (page flips without tearing for every
program: the code is there, only used while a hardware layer is), overlapping the program's `paint` with the
rasterization of the previous frame. Hardware layers were run on a Pi 3B+ only (vc4, `YU12` from bcm2835-codec).
