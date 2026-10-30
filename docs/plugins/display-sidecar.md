# A Sidecar screen as the app's display (display-sidecar)

A Zinc app shows itself on a Sidecar screen (`app/sidecar`: the iPad, iPhone, Android, Mac and Pi apps) with its own frames: no screen
capture, no virtual display, no Screen Recording permission. The engine knows what each frame changed, so only that goes, at the
screen's own pixels; the screen's touches, Apple Pencil and two-finger scrolls come back as the app's pointer, pen and wheel.

```sh
ZINC_DISPLAY=sidecar ZINC_SIDECAR=adb zinc run examples/breakout      # Android on the USB cable (its Sidecar app open)
ZINC_DISPLAY=sidecar ZINC_SIDECAR=usb zinc run examples/breakout      # an iPad or iPhone on the cable
ZINC_DISPLAY=sidecar ZINC_SIDECAR=192.168.2.154 zinc run examples/breakout   # a screen on the network
```

The app takes the screen's size in points: its pixels divided by `scale` (2 by default: an iPad's Retina, a Nexus 7's 1280 x 800 as
640 x 400). The frame's damaged box is cut in bands of 64 rows; each band is compared with what was sent, and only its changed columns go,
as 24-bit rows with PNG's Sub filter and zstd level 1, compressed on every core by a thread of their own while the app draws on. At most
`inflight` frames are on the way; the damage of the frames drawn meanwhile is merged into the next.

| option | default | |
|---|---|---|
| `host` | `adb` | `adb[:serial]`, `usb` (usbmuxd) or an address (env `ZINC_SIDECAR`) |
| `scale` | 2 | the screen's pixels a point (env `ZINC_SIDECAR_SCALE`) |
| `fps` | 60 | the app's loop rate (no vsync here) |
| `inflight` | 2 | frames sent before an acknowledgement is waited for |

`ZINC_SIDECAR_LOG=1` prints a line a second: frames sent and drawn, the bit rate, the encode time.

Measured (2026-10-30, Nexus 7 over adb, `examples/breakout`): 50 to 59 frames a second sent of 60 drawn, about 1 Mbit/s, 1 to 2 ms to encode
a frame, on a Mac then loaded by other builds.

Not yet: H.264 for a frame where most of the screen moves (the screens decode it: `+h264`), a second screen beside the app's window, the
display list sent instead of pixels, UDP on the network.
