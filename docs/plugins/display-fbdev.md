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

## Not verified

No Raspberry Pi or Linux console was available: the driver is compiled for rpi1 (docker, Alpine armhf) and checked
to decline cleanly under QEMU without a framebuffer. Output formats, vsync, touch mapping and grabbing are
unverified on hardware. Not implemented: rotation (`fbcon=rotate` / touch axis swap), double buffering via panning,
KMS/DRM output (a `display-drm` plugin would give page flips and planes).
