# display-fbdev doc audit

## What it is
The screen driver for a Linux console with no X or Wayland: it draws into `/dev/fb0` (flipping KMS planes when it can) and reads keyboard, mouse and touch from evdev. It is how a Raspberry Pi kiosk, video looper or Pi image shows a Zinc app.

## Targets and status
- plugin.json: `linux`, `rpi1` (options `device`, `input`, `grab`, `fps`).
- Verified on a Pi 3B+ (arm64, KMS vc4, 7" DSI 16 bpp): threads, page flips, hardware video layers. Not verified: rpi1 ARMv6, 24/32 bpp, scaled path with threads, touch on other screens (doc "Not verified").
- Desktop stand-in: `ZINC_FBDEV_SIM` (test `tests/t0/fbdev_desktop.sh`).

## What the docs have
- [x] Overview, config snippet (`docs/plugins/display-fbdev.md`, 181 lines)
- [~] Install/requirements: groups `video`, `input`, `tty` are named; no "set up a Pi from scratch" steps
- [ ] Quick start: only a JSON snippet, no "run it on the Pi" sequence
- [x] Options table (4 options) and env table (7 vars)
- [~] API reference: no JS API (driver), but `escapeByApp(true)` and `gfx.touch*` are only mentioned in passing
- [x] Example: `examples/flipctl`, `examples/video/looper` (README 80 lines)
- [ ] Screenshot/GIF: none for the driver (only `docs/img/video-looper.png` from the looper)
- [ ] Step-by-step tutorial
- [~] Commands: `zinc device run ... --env ZINC_SIZE`, `tools/device shot` appear; no `zinc export --target rpi1` + `deploy` recipe
- [~] Troubleshooting: black screen when `/dev/fb0` is under a plane; no list of symptoms (no keyboard, no screen, tearing)
- [x] Tests: `fbdev_desktop` (t0), `chip_models`, `video_layers` (affected.json)

## What is missing (priority order)
1. A 6-step tutorial "A Zinc app on a Raspberry Pi console": flash Pi OS Lite, enable `vc4-kms-v3d`, add the user to `video,input`, `zinc export --target linux`, `zinc deploy`, run. (hardware)
2. A screenshot of the Pi screen running `examples/video/looper` or `examples/flipctl`: `tools/device shot out.png` (hardware).
3. A "Troubleshooting" table: no screen, black screen, keys reach the shell, mouse missing, tearing, `ZINC_FBDEV_FLIP=0`.
4. Document `ZINC_FBDEV_SIM_FORMAT` and `ZINC_FBDEV_SIM_INPUT` (in the code, absent from the env table) and how to try the driver on a Mac.
5. Split the page: reference (options, env, input) vs "Measured" (13 lines of benchmark tables) so the reference stays short.
6. State what the keyboard does today: backlog/later.md says the Pi image's player does not type text from a physical keyboard and draws no mouse cursor on HDMI, while the doc says keys give UTF-8 text and a visible cursor. Reconcile.
7. Note limits already in later.md: the KMS plane is not taken back when the previous program leaves; `showSplash` skips display plugins (ZN-446).

## Wrong or stale
- Possible contradiction on keyboard text and cursor (see 6); check against the code before the next release.
- Not found stale otherwise (names, options match plugin.json).

## Suggested pages
- API/reference: display-fbdev options and environment
- Guide: Zinc on a Raspberry Pi console (kiosk)
- Steps: Wire up input (keyboard, mouse, touch) and permissions
- Explanation: Page flips and hardware video layers
- Notes: Performance measurements (Pi 3B+), Troubleshooting
- Examples: video looper, flipctl
