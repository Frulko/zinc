# display-remote doc audit

## What it is
A headless screen: the app renders in memory and streams frames over TCP (damage rectangles, RLE) to a viewer built with `zinc:remote`, which also sends input back. Use it to watch a kiosk or Pi, or to run tests with no window.

## Targets and status
- plugin.json: `macos`, `linux`, `rpi1`; options `port 7700`, `bind 127.0.0.1`, `fps`, `inflight`, `beacon`, `token`.
- Verified on macOS (loopback). Real Pi over Wi-Fi/Ethernet: not measured. No encryption (documented).

## What the docs have
- [x] Overview (`docs/plugins/remote.md`, covers both display-remote and zinc:remote)
- [x] Requirements/run: `zinc run X --display remote` and the zinc.json form
- [x] Options table (all six match plugin.json) + env overrides
- [x] API reference for `zinc:remote` (connect, session fields, send*, view, discover)
- [x] Example code; runnable `examples/remote/viewer` (no README)
- [ ] Screenshot of the viewer showing a remote app (docs/img/camera-remote.png is another feature)
- [ ] Tutorial
- [~] Commands: two-terminal recipe present; `zinc device <d> screen --live` pointer present
- [x] Security section, protocol, measurements, discovery
- [x] Tests: `display_drivers` (t1, loopback pair), `templates_remote` (t0), `tests/fuzz/remote.cpp`

## What is missing (priority order)
1. A screenshot: run `zinc run examples/breakout --display remote` and `ZINC_SHOT=viewer.png zinc run examples/remote/viewer` (the viewer needs a window: `ZINC_BACKGROUND=1`).
2. A 5-step tutorial "Watch a Pi from your laptop": deploy with `bind: 0.0.0.0` and a token, set `ZINC_REMOTE_TOKEN`, run the viewer, ssh tunnel alternative. (hardware for the Pi part)
3. `examples/remote/viewer/README.md`: what it does, the keys, how to point it at another host.
4. Troubleshooting: viewer lists nothing (multicast blocked, loopback bind announces only on lo0), "token refused", one viewer at a time.
5. Add `display_drivers` to tests/affected.json for `plugins/display-remote/` (not mapped, `tests/run --changed` will miss it).
6. Real-Pi numbers (Wi-Fi vs Ethernet, fps, kbps). (hardware)
7. List the display in `docs/plugins/displays.md` matrix (absent) and in guide 05's "worked drivers".

## Wrong or stale
- "Keys: the remote side only sees zinc:gfx buttons for now ... text input will follow" vs Protocol: `INPUT` (22) carries keys with text for `zinc device screen --live`. Clarify which path has text.
- Follow-ups mention "text/keyboard events once the HAL has them": check against the HAL.

## Suggested pages
- API/reference: display-remote options; zinc:remote
- Guide: Run an app with no screen and watch it remotely
- Steps: Watch a Raspberry Pi from your laptop (token, tunnel)
- Explanation: The frame protocol (damage, RLE, ACK pacing)
- Notes: Security, Measurements, Troubleshooting
- Examples: remote viewer
