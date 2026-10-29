# Sidecar

A Mac's screen on the reMarkable Paper Pro, over the USB cable: a second display at the tablet's ratio, or a mirror of one of the Mac's
displays, drawn in the pen's black-and-white waveform, the fastest the panel has.

- **The tablet** (`src/`): a Zinc app. Its driver (`plugins/display-rmpp/stream.h`) listens on TCP 7710 and writes what the Mac sends
  straight into AppLoad's framebuffer from its own thread, without the app's frame loop; the app only shows how to connect.
  Without xochitl: the session tile (`zinc-tile sidecar.zapp --session --max 7200` on the tablet) runs it under the display lease,
  xochitl stopped (`ZINC_RMPP_INK=session`): the stream goes straight into the vendor engine's buffer, every rectangle swapped in its
  Pen mode, the whole panel without the header, touch and Marker from evdev. A 2 s press on the power button, three fingers held 2 s,
  or the end of the session's time brings xochitl back.
- **The Mac** (`mac/`): `mac/build.sh`, then `mac/build/sidecar`. It makes a virtual display (CoreGraphics' `CGVirtualDisplay`, as DeskPad),
  captures it with ScreenCaptureKit (only the areas macOS says changed), dithers its luma to 1 bit and sends only the 32x16 tiles that
  changed, one frame in flight. The luma goes through an e-ink shader first: a tone curve (near white to white, near black to black) and an
  edge pass that pushes a pixel darker than its neighbours towards black, so hairlines of light grey (window borders, separators) stay.
  Each tile drawn fast is cleaned once it has rested a second (a blinking caret never rests that long): the pixels drawn fast go black,
  then the tile goes out in true greys in xochitl's page waveform (a partial update drives only the pixels that change, so a trail on white
  needs the black; only the strokes flash, not the tile). A third of the screen at once, or four screens of cleaning, is a full refresh.
  On e-ink a moving pointer leaves a trail whatever is done after, so while it moves it is a small dot (little ink, little trail) and the
  arrow comes back sharp 120 ms after it stops (`--pointer-moving arrow|dot|none`).
  A settings window sets everything live while the tablet shows the result: the shader (black and white points, gamma, edges, dither),
  the pointer (sizes, look while moving, moves per second, trail delay) and the refresh (fast waveform, clean delays, full refresh);
  `--no-ui` runs without it.
  The pointer is drawn here, not captured: a white arrow with a black outline (little black, little ghosting). It turns with the picture. Its trail is
  cleaned in the fast waveform 1.5 s after it passes (once its pixels rest), a tail that follows it, and the tiles around it are never cleaned in the slow one,
  so a move never waits.
  The tablet tells the room it has (below xochitl's header or not), and again when that changes: the virtual display is made again to it.
  The tablet's finger and Marker come back as the mouse (the Marker with its pressure).
  The tablet says which way up it is held (its accelerometer): the virtual display turns to portrait or landscape to match.
  A session starts and ends with a full refresh, and a two-finger tap on the tablet asks for one at any time. Two fingers that move
  scroll the Mac, following the fingers in the way the screen is turned (neither reaches the Mac as the mouse).
  While you type (a key less than the typing pause ago, 800 ms) nothing is cleaned; when you stop, the lines you typed are cleaned there
  only. A blinking caret stays shown instead of flipping (each flip ghosts). The screen's frames per second can be capped.
  macOS asks once for the Screen Recording permission, and Accessibility for the touches. The keyboard is only watched for when a key goes down, never which.

**The menu bar app**: `mac/build.sh` also makes `mac/build/Sidecar.app` (open it; it lives in the menu bar). Start and stop, the way the
tablet is used (a second screen, a mirror of a display, or a pen tablet: a mirror where the Marker is a graphics tablet's pen with
pressure, tilt and hover, for drawing apps), four presets (Text, Speed, Video, Reading), a full refresh and a clean, and a settings window
where every knob says what it does on paper, plus the tablet's gestures. Settings are kept between runs. It shows whether a reMarkable
is on the USB cable (and can start Sidecar as soon as one is plugged in), waits for the tablet's app as long as it takes, sets the tablet's
frontlight and ends the tablet's app. It drives the engine inside it (`sidecar-engine --no-ui --control --wait`: a JSON tune, `full`,
`clean`, `quit`, `quit-tablet` or `light <permille>` per line on stdin). Greys are dithered with blue noise by default
(or an 8x8 grid, or none); the clean goes through two grey checker passes instead of a black flash (Gentle clean).
On the tablet, a three-finger tap opens the quick panel over the picture: clean, full refresh, next preset, contrast, lock the turn.

The tablet draws the pointer itself: the Mac sends its shape once and then only where it is (16 bytes, one small update there), so the
pointer no longer waits for a capture. Large rectangles go as lz4 blocks (Apple's Compression on the Mac, the vendored lz4 on the tablet),
and the rectangles of one picture are marked as such, so the tablet updates the panel once per picture with its rectangles merged. After
a scroll the Mac finds how far the page moved (rows, or columns when the tablet is sideways, matched by hash) and tells the tablet to move
what it already shows: only the new band is sent. A large change (a scroll, a new window, a turn) is shaded and dithered by the GPU (one
Metal pass straight from the capture's surface), identical to the CPU's (`build/sidecar --selftest` compares them on made-up frames,
and checks the scroll detection). The virtual display runs at 120 Hz when macOS accepts it, so the capture sees a change sooner.
The menu bar app holds macOS's text caret steady while it runs ("Steady caret on the Mac"), and puts the setting back after.

```sh
mac/build/sidecar                  # Retina: half the tablet's pixels in points, sharp
mac/build/sidecar --native         # one point per pixel: twice the room, everything half as big
mac/build/sidecar --points 1080x1360   # any size, drawn at twice that and scaled to the panel
mac/build/sidecar --mirror 0       # mirror the Mac's first display (white bands keep its shape)
mac/build/sidecar --threshold      # a plain threshold instead of the ordered dither: sharper text, no greys
mac/build/sidecar --idle 1500      # ms without change before the clean pass (0: never)
mac/build/sidecar --trail-ms 1500  # ms after the pointer passed before its trail is cleaned (its pixels are driven ~1.4 s)
mac/build/sidecar --min-clean 33000   # pixels drawn fast and at rest before that pass (default 1% of the panel: a clock or a caret never flashes)
mac/build/sidecar --levels 90,185 --gamma 1.6   # the e-ink tone curve: luma under 90 black, over 185 white, the middle darkened
mac/build/sidecar --edges 10       # the edge pass's strength (0: off)
mac/build/sidecar --rotate 90      # start turned (90 the tablet's top on the left, 180, 270), until the tablet says otherwise
mac/build/sidecar --cursor 28      # the pointer's height in tablet pixels; 0: macOS's own, captured
mac/build/sidecar --fast-mode 0    # the waveform of what moves: 0 UFAST, 1 FAST (DU), 2 ANIMATE (A2)
mac/build/sidecar --pointer-hz 30  # pointer moves sent per second at most (the newest): overlapping updates queue on the panel
mac/build/sidecar --clean-mode 0   # 0: cleaning stays in the fast waveform (no switch); 3 or 4: true greys, at the cost of two waveform switches
```

Measured on a Paper Pro over USB (2026-10-28): the round trip of a small update is under 3 ms; xochitl repaints a small rectangle up to
120 times a second, 20 times for 1620x800 and 8 for the whole panel. The research is in `docs/reports/rmpp-sidecar-research.md`.
Test: `tests/run --only sidecar_stream` (the tablet's half against the AppLoad simulator).

**Any screen with a network** (`app/sidecar-screen`): the same stream in colour. Run the app on the screen's machine (a Raspberry Pi on
HDMI: `zinc device <pi> deploy app/sidecar-screen --target rpi`); its page shows its address. On the Mac, `mac/build/sidecar-screen --host
<address>` makes a virtual display of the screen's size (`--mirror <n>` mirrors display n, `--hidpi` draws it at twice its points, `--scale f` at f pixels per point: 1.33 or 1.6 is macOS's "more space", a backing drawn larger and scaled down to the screen). The
tiles that changed are joined in runs, filtered (PNG's Sub) and compressed with zstd on every core; at most two pictures wait for the
screen's answers, so a slow link drops pictures instead of lagging. A picture where a sixth of the screen or more changed, or one that
comes while the link is busy, goes rough (colours cut to 5-6-5 bits: half the bytes) and each of its tiles goes again exact once it has
rested 300 ms (`--exact`: never rough). Every 2 s it prints the frames, the wire rate, the ratio and the round
trip. `mac/codecbench.swift` measures the codecs on the Mac's own screen.

**Another Mac** (`mac/build/sidecar-receiver`, an iMac 5K for instance): it shows the stream full screen at its display's native pixels
(Esc quits); `sidecar-screen --host <that Mac>.local`. A direct cable (Ethernet, or a Thunderbolt bridge) is used before Wi-Fi when both
reach it: the sender tries the 169.254 addresses first.

**An iPad or an iPhone on the USB cable** (`ipad/`): the same receiver as an iPadOS app (iPadOS 15 and later; an iPad Pro 12.9" of 2015
runs it on 16.7). `ipad/build.sh` builds it signed with the Apple Development team (xcodegen, Xcode), `ipad/install.sh` puts it on the
device on the cable (ios-deploy); tap Sidecar on it, then `sidecar-screen --host usb` (or the tray's "iPad or iPhone on the USB cable"). The
stream and the sound go through macOS's usbmuxd (`mac/usbmux.swift`), on the cable that charges the device: no network, no Wi-Fi.
