# Sidecar

A Mac's screen on the reMarkable Paper Pro, over the USB cable: a second display at the tablet's ratio, or a mirror of one of the Mac's
displays, drawn in the pen's black-and-white waveform, the fastest the panel has.

- **The tablet** (`src/`): a Zinc app. Its driver (`plugins/display-rmpp/stream.h`) listens on TCP 7710 and writes what the Mac sends
  straight into AppLoad's framebuffer from its own thread, without the app's frame loop; the app only shows how to connect.
- **The Mac** (`mac/`): `mac/build.sh`, then `mac/build/sidecar`. It makes a virtual display (CoreGraphics' `CGVirtualDisplay`, as DeskPad),
  captures it with ScreenCaptureKit (only the areas macOS says changed), dithers its luma to 1 bit and sends only the 32x16 tiles that
  changed, one frame in flight. The luma goes through an e-ink shader first: a tone curve (near white to white, near black to black) and an
  edge pass that pushes a pixel darker than its neighbours towards black, so hairlines of light grey (window borders, separators) stay.
  Each tile drawn fast is cleaned once it has rested a second (a blinking caret never rests that long): the pixels drawn fast go black,
  then the tile goes out in true greys in xochitl's page waveform (a partial update drives only the pixels that change, so a trail on white
  needs the black; only the strokes flash, not the tile). A third of the screen at once, or four screens of cleaning, is a full refresh.
  macOS draws the pointer into the capture; its trail is cleaned 300 ms after it stops (`--cursor` draws our own instead).
  The tablet's finger and Marker come back as the mouse (the Marker with its pressure).
  A session starts and ends with a full refresh, and two fingers on the tablet ask for one at any time (they do not reach the Mac).
  macOS asks once for the Screen Recording permission, and Accessibility for the touches.

```sh
mac/build/sidecar                  # Retina: half the tablet's pixels in points, sharp
mac/build/sidecar --native         # one point per pixel: twice the room, everything half as big
mac/build/sidecar --points 1080x1360   # any size, drawn at twice that and scaled to the panel
mac/build/sidecar --mirror 0       # mirror the Mac's first display (white bands keep its shape)
mac/build/sidecar --threshold      # a plain threshold instead of the ordered dither: sharper text, no greys
mac/build/sidecar --idle 1000      # ms without change before the clean pass (0: never)
mac/build/sidecar --levels 90,185 --gamma 1.6   # the e-ink tone curve: luma under 90 black, over 185 white, the middle darkened
mac/build/sidecar --edges 10       # the edge pass's strength (0: off)
mac/build/sidecar --cursor 32      # draw our own pointer, this many tablet pixels tall, instead of macOS's
mac/build/sidecar --clean-mode 3   # the clean pass's waveform: 3 xochitl's page one, 4 UI
```

Measured on a Paper Pro over USB (2026-10-28): the round trip of a small update is under 3 ms; xochitl repaints a small rectangle up to
120 times a second, 20 times for 1620x800 and 8 for the whole panel. The research is in `docs/reports/rmpp-sidecar-research.md`.
Test: `tests/run --only sidecar_stream` (the tablet's half against the AppLoad simulator).
