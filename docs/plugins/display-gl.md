# display-gl

A GPU screen: the program's frames are shown through OpenGL, and GPU plugins (`zinc:mapping`) draw their own layers
underneath the UI. Plugin: `plugins/display-gl/` (display driver `gl`).

```json
{ "name": "mapper", "display": "gl", "targets": { "rpi1": { "width": 1280, "height": 720 } } }
```

Options (`"display": { "driver": "gl", ... }` or `plugins.display-gl`):

| option | default | meaning |
|---|---|---|
| `key` | `0` | UI pixels of exactly this colour (`0xRRGGBB` as a decimal number) are transparent; `-1` makes the UI opaque |
| `fullscreen` | `false` | macOS: start fullscreen (F toggles it at run time). The Pi is always fullscreen |
| `mode` | `""` | Pi: display mode `"1920x1080"`; default is the connector's preferred mode |

## Support matrix

| target | status | backend | notes |
|---|---|---|---|
| macos | supported, verified (screenshots through `glReadPixels`) | SDL3 window, OpenGL 3.2 core | `brew install sdl3`; Retina drawable size is used for GPU layers |
| rpi1 build on Pi 3B+ / 4 / 5 (32-bit OS) | builds in docker (Alpine 3.20 armhf, Mesa 24); **not run on hardware** | KMS/DRM + GBM + EGL + GLES 2.0, no X/Wayland | Mesa `vc4` (Pi 3, `dtoverlay=vc4-kms-v3d`) or `v3d` (Pi 4/5); run from a console (the program must be DRM master), user in the `video` and `input` groups |
| rpi1 on Pi 1 / Zero | builds; not a target for GPU work | same (vc4) | same VideoCore IV as the Pi 3 but a 700 MHz/1 GHz ARMv6 CPU: the UI overlay upload and any runtime image upload dominate; fine for a static screen, not for mapping |
| linux, esp32, ps1, ps2, wasm, sim | not supported | | linux could reuse the KMS backend (not wired); the others have no GL (sim ignores display drivers) |

The rpi1 binary is linked against Alpine's musl and Mesa (like every rpi1 build): run it on Alpine (or a system with
Alpine's `mesa-dri-gallium`, `mesa-egl`, `mesa-gbm`, `libdrm`), deployed with `zinc export --target rpi1`.

## How it works

- `hal.h` `HalDisplay`: registered from a static constructor; the SDL HAL skips its own window when a display plugin
  is linked. Each frame, `present` rasterizes only the damaged rows of the software UI (shared rasterizer) and uploads
  them into an overlay texture, clears the screen, calls `zgl_layers(w, h)` (GPU plugins), then draws the overlay
  with the key colour transparent, and swaps (vsync; on the Pi a page flip paced by the vblank event).
- Shaders are written once in the GLSL ES 1.00 dialect; `zgl_program(defines, vs, fs)` (in `zgl.h`) prepends
  `#version 150` + `attribute/varying/texture2D/gl_FragColor` macros on desktop GL, or `#version 100` + precision on
  GLES. Attribute 0 is `a_pos`, 1 is `a_uv`. Textures from runtime images are B,G,R,0 bytes: sample `.bgr`.
- Input: SDL events on macOS (keyboard, mouse, trackpad pinch/wheel, touch); on the Pi every `/dev/input/event*`
  device: keys, relative mouse, absolute touchscreen (single pointer). Esc quits.
- `ZINC_FRAMES=n` stops after n frames and `ZINC_SHOT=out.bmp` saves the last frame from the GL back buffer, so
  screenshots contain the GPU layers too.

## Limits

- The overlay is keyed, not alpha-blended: anti-aliased UI edges fade to the key colour (a dark fringe on black).
- The whole overlay is drawn every frame (one textured quad), even when empty.
- Pi: one connector (the first connected one), no hotplug, no rotation (use `zinc:mapping` corners), no multitouch.
