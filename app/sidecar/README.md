# Sidecar

A Mac's screen on the reMarkable Paper Pro, over the USB cable: a second display at the tablet's ratio, or a mirror of one of the Mac's
displays, drawn in the pen's black-and-white waveform, the fastest the panel has.

- **The tablet** (`src/`): a Zinc app. Its driver (`plugins/display-rmpp/stream.h`) listens on TCP 7710 and writes what the Mac sends
  straight into AppLoad's framebuffer from its own thread, without the app's frame loop; the app only shows how to connect.
- **The Mac** (`mac/`): `mac/build.sh`, then `mac/build/sidecar`. It makes a virtual display (CoreGraphics' `CGVirtualDisplay`, as DeskPad),
  captures it with ScreenCaptureKit, dithers its luma to 1 bit and sends only the 32x16 tiles that changed, one frame in flight. Once nothing has changed for 400 ms, what changed goes out again in true greys in the
  UI waveform: the fast waveform's trails (the pointer's) go away and text gets its anti-aliasing back; every four screens of that, a full refresh.
  macOS asks once for the Screen Recording permission.

```sh
mac/build/sidecar                  # Retina: half the tablet's pixels in points, sharp
mac/build/sidecar --native         # one point per pixel: twice the room, everything half as big
mac/build/sidecar --points 1080x1360   # any size, drawn at twice that and scaled to the panel
mac/build/sidecar --mirror 0       # mirror the Mac's first display (white bands keep its shape)
mac/build/sidecar --threshold      # a plain threshold instead of the ordered dither: sharper text, no greys
mac/build/sidecar --idle 400       # ms without change before the clean pass (0: never)
```

Measured on a Paper Pro over USB (2026-10-28): the round trip of a small update is under 3 ms; xochitl repaints a small rectangle up to
120 times a second, 20 times for 1620x800 and 8 for the whole panel. The research is in `docs/reports/rmpp-sidecar-research.md`.
Test: `tests/run --only sidecar_stream` (the tablet's half against the AppLoad simulator).
