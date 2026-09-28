# Remote display and viewer (display-remote, zinc:remote)

Run a Zinc app without a local screen and watch/drive it from another Zinc app: a studio previewing an app running on
a Raspberry Pi, a kiosk supervised from a laptop, a headless test rig.

- `plugins/display-remote` (display `remote`, macos / linux / rpi1): the app renders into memory and serves its frames
  over TCP; input from the viewer is injected into the app's `HalInput` (pointer, wheel, buttons).
- `plugins/remote-view` (module `zinc:remote`, macos / linux / rpi1): connect to such an app, get its screen as a
  runtime image, send input, discover the apps announced on the network.

## Running an app with the remote display

```sh
zinc run examples/breakout --display remote         # or ZINC_DISPLAY=remote zinc run ...
zinc run examples/remote/viewer                      # another terminal: lists the app, click it
```

`--display <driver>` (or `ZINC_DISPLAY`) overrides `zinc.json` `display` for one build (its build directory gets a
`-remote` suffix, so the normal build is kept). To make it permanent, per target:

```json
{ "targets": { "rpi1": { "display": { "driver": "remote", "bind": "0.0.0.0", "port": 7700 } } } }
```

| option | default | |
|---|---|---|
| `port` | 7700 | TCP port (env `ZINC_REMOTE_PORT` overrides at run time) |
| `bind` | `127.0.0.1` | listen address (env `ZINC_REMOTE_BIND`); `0.0.0.0` to accept viewers from the network |
| `fps` | 60 | frame rate of the app's loop (there is no vsync without a screen) |
| `inflight` | 2 | frames sent without an acknowledgement before the server waits (pacing) |
| `beacon` | true | announce the app on UDP multicast every second |
| `token` | `""` | shared secret a viewer must send before anything else (env `ZINC_REMOTE_TOKEN`, preferred: not in the binary) |

`ZINC_REMOTE_LOG=1` prints one line per second: frames sent, loop rate, bytes per second, raw size and compression
ratio. `ZINC_FRAMES=n` stops the app after n frames, as with the SDL HAL.

The app has no local window while the remote display is active (the SDL HAL steps aside when a display plugin is
linked). A `mirror` mode that also keeps the SDL window is not implemented.

## zinc:remote

```ts
import * as remote from 'zinc:remote';

const s = await remote.connect('192.168.1.20', 7700);   // resolves on the app's first message, rejects if unreachable
// remote.connect(host, port, token): the app's token (default: the ZINC_REMOTE_TOKEN environment variable)
s.image        // runtime image id: gfx.drawImage(s.image, ...), updated as frames arrive
s.width; s.height; s.name; s.connected
s.fps; s.latency; s.kbps; s.frames                       // frames/s received, ping round trip (ms), KiB/s received
s.sendPointer(x, y, down, button)                        // remote logical pixels
s.sendWheel(dy)
s.sendKey('ArrowLeft', true)                             // DOM or Btn names -> zinc:gfx buttons on the remote side
s.sendButtons(mask)                                      // bit i = Btn i
s.reconnect = false                                      // default true: retry every second after a drop
s.onOpen(() => {}); s.onClose(() => {})                  // open fires again after each reconnect
s.close()

// zinc:ui: draws fitted in the node and forwards pointer, wheel and keys while the mouse is over it
<canvas class="grow" onDraw={(x, y, w, h) => s.view(x, y, w, h)}/>

remote.discover((apps: remote.App[]) => { /* name, target, host, port, pid, width, height, seen */ });
remote.stopDiscovery();
```

Keys: the remote side only sees `zinc:gfx` buttons for now (arrows/WASD, Space = A, Enter = Start, Tab = Select...);
text input will follow the HAL's keyboard events. Only one viewer is served at a time: a new connection replaces the
previous one.

## Protocol

`plugins/display-remote/remote_proto.h` (shared by both plugins). TCP, little-endian, `[u8 type][u32 length][payload]`.

1. On connect the server sends `HELLO` (width, height, title), then the whole frame.
2. Each later frame is the bounding rectangle of the damage reported by the runtime (`HalFrame` x0..y1, rendered
   with `render_damage` into a persistent buffer), sent as `RECT` + `FRAME seq`. Pixels are PackBits RLE over
   24-bit pixels (`rle_check.cpp` is the codec's self-check).
3. The viewer answers `ACK seq` once a frame is decoded; with `inflight` frames unacknowledged the server stops
   sending and lets the damage accumulate, so a slow link gets fewer, larger updates instead of a growing queue.
4. Viewer to app: `POINTER`, `WHEEL`, `BUTTONS`, `PING` (echoed as `PONG` behind the queued frames).

Discovery: `ZINC1\tname\ttarget\tport\tpid\tw\th` on UDP multicast `239.255.90.1:7701` once a second. An app bound to
loopback announces on `lo0` with TTL 0 (never leaves the machine); otherwise TTL 1 on the default interface (the
LAN segment). The viewer joins the group on both.

## Measurements

macOS 15 (M-series), app and viewer on the same machine, release builds:

| app | frames/s received | round trip | bandwidth | compression |
|---|---|---|---|---|
| `examples/breakout` 320x240, demo mode (ball, paddle, bricks) | 60 | 16.5–17 ms | 20–30 KiB/s | x46–55 vs raw XRGB |
| `examples/pocket-hero` 480x272, idle (spinner only) | 9–10 (damage-driven) | 16–22 ms | 7–8 KiB/s | x8.5 |
| first full frame, pocket-hero 480x272 | | | 48 KiB (510 KiB raw) | x12 |

The round trip is bounded by the two frame loops: the viewer reads its sockets once per displayed frame (16.7 ms at
60 Hz) and the app once per loop iteration, so input-to-screen is typically two to three frames (33–50 ms) on a
local machine; network latency adds to it. With only a PackBits RLE, photos and video compress poorly (close to
3 bytes per pixel): a 1280x720 video at 30 fps would need ~80 MB/s, far beyond a Pi 1's Ethernet; UI and games are
the intended content. Not measured yet: a real Raspberry Pi over Wi-Fi/Ethernet (the rpi1 builds are checked in
docker only).

## Security

There is no encryption. The default `bind` is `127.0.0.1`: only programs on the same machine can connect, and the
beacon stays on the machine. Binding to `0.0.0.0` (or a LAN address) exposes the app to the network segment; then set a
token (`ZINC_REMOTE_TOKEN=...` in the service environment, or the `token` option): a viewer must send it in an `AUTH`
message first (`remote.connect(host, port, token)`), before it gets the screen or its input is read, and a connection
that has not authenticated within 3 s is closed without disturbing the current viewer. Without a token on a non-loopback
bind the app prints a warning at start. The token crosses the network in clear: on an untrusted network tunnel the port
over ssh (`ssh -L 7700:127.0.0.1:7700 pi@device`) and keep the loopback bind. The beacon reveals the app title, target,
port and pid to the LAN when not bound to loopback, and anyone can send beacons: a listed app is not an authenticated one.

Both ends bound what they accept (docs/reports/security-audit.md): viewer messages are at most 64 bytes, PONG replies
stop when the viewer does not read, and the viewer refuses a message longer than a whole-screen RECT and an image size
the runtime refuses (0 or more than 16384 per side). `tests/fuzz/remote.cpp` fuzzes the viewer's decoder.

## Follow-ups

- HiDPI frames (the remote surface is rendered at 1 logical = 1 physical pixel), several viewers, a `mirror` mode
  with the local SDL window, text/keyboard events once the HAL has them, resize requests, an LZ4-style or
  palette codec for richer content.
