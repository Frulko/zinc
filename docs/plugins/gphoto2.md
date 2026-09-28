# gphoto2 plugin (`zinc:gphoto2`)

Remote control of USB cameras through [libgphoto2](http://www.gphoto.org/) (PTP/MTP, 2500+ models): detection,
the full config tree with get/set, capture (on the camera and/or downloaded), trigger, file-added events and a
live view decoded with TurboJPEG off the main thread. Sources: `plugins/gphoto2/`. Example apps:
`examples/camera/remote` (UI), `examples/camera/cli` (headless session), `examples/camera/bench` (live view throughput).

```ts
import * as camera from 'zinc:gphoto2';

const cams = await camera.detect();                  // CameraInfo[] { model, port }
await camera.open(cams[0].model, cams[0].port);      // '' '' = first detected camera
for (const w of await camera.config()) console.log(w.path, w.value, w.choices);
await camera.set('iso', '800');
const file = await camera.capture('captures');       // downloads, resolves with the local path
camera.setViewSize(736, 532);                        // frames arrive scaled to fit this box
camera.startLiveView();
// in a frame / onDraw callback:
const img = camera.liveImage();                      // runtime image, draw with gfx.drawImage (-1 before the first frame)
```

| API | |
|---|---|
| `detect(): Promise<CameraInfo[]>` | auto-detected cameras (`model`, `port`, e.g. `usb:001,004`) |
| `open(model, port): Promise<string>` / `close()` | open a camera (one at a time); resolves with the model name |
| `summary(): Promise<string>` | the driver's summary text |
| `config(): Promise<Widget[]>` | every leaf of the config tree: `path` (`/main/imgsettings/iso`), `name`, `label`, `type` (`text` `range` `toggle` `radio` `menu` `date` `button`), `readonly`, `value`, `choices`, `min`/`max`/`step` |
| `get(name)` / `set(name, value)` | one widget by name or path; values are strings (range: number, toggle `0`/`1`, date: unix seconds) |
| `capture(dir): Promise<string>` | capture; with `dir` the file is downloaded there (local path), else the camera path is returned |
| `trigger()` | fire the shutter without waiting; the file comes as an `onFileAdded` event |
| `download(cameraPath, dir)` | fetch a file from the camera |
| `thumbnail(path, w, h): Promise<i32>` | decode a local JPEG into a runtime image fitting w x h (DCT scaled: a 24 MP file costs a 1/8 decode) |
| `onFileAdded(cb)` / `onError(cb)` | files added on the camera (body shutter, trigger); live view stopped after repeated errors |
| `startLiveView()` / `stopLiveView()` / `setViewSize(w, h)` / `liveImage()` | live view |
| `cameraFps()` / `shownFps()` / `decodeMs()` | frames decoded/s, frames handed to the screen/s, mean decode + scale time |

Settings are named by the camera driver: Canon uses `iso`, `aperture`, `shutterspeed`, `whitebalance`, `focusmode`,
`exposurecompensation`, `imageformat`; Nikon has `f-number`, `shutterspeed2`, `imagequality`... `config()` lists them.

## Support

| target | status |
|---|---|
| macos | yes: libgphoto2 + jpeg-turbo from Homebrew (`brew install libgphoto2 jpeg-turbo`) |
| linux | yes: `libgphoto2-dev`, `libturbojpeg0-dev` (Debian/Ubuntu; installed into the SDK image by `plugin.json`) |
| rpi1 | yes: USB, `libgphoto2-dev`, `libjpeg-turbo-dev` (Alpine armhf SDK image; Raspberry Pi OS: the Debian packages) |
| sim | fake camera (`native/gphoto2.sim.ts`): same widgets and answers, blank live view image |
| esp32, ps1, ps2, wasm | no (no libgphoto2 / USB host stack): error Z5003 |

Tested cameras: **none**. No camera was attached while this plugin was written; everything camera-side goes through
libgphoto2's documented API but has only run against the fake camera below. libgphoto2 itself supports 2500+ models
(`gphoto2 --list-cameras`); live view needs a model with preview support (most Canon EOS, Nikon DSLR/Z, Sony Alpha in
PC remote mode, Fuji X in tether mode).

Platform notes:
- macOS: the system daemon `ptpcamerad` grabs PTP cameras; if `open` fails with "Could not claim the USB device",
  quit Photos/Image Capture and run `killall ptpcamerad` right before starting the app.
- Linux desktops: `gvfs-gphoto2-volume-monitor` may mount the camera first; unmount it or stop gvfs. Without root,
  install libgphoto2's udev rules (Debian: `libgphoto2-6` ships them) so the user can open the USB device.

## Live view pipeline

1. A worker thread owns the `Camera` (libgphoto2 is not thread safe per camera) and runs every blocking call: jobs
   from the main thread, event polling (`gp_camera_wait_for_event`, 100 ms when idle, every 10 frames during live
   view) and the `gp_camera_capture_preview` loop.
2. Each preview JPEG is decoded by TurboJPEG at the smallest DCT scaling factor (1/8 .. 8/8) that still covers the
   view box, then fitted to the box with a separable 8-bit bilinear filter, into the back buffer of a triple buffer.
3. The main thread (a `zrt::Poller`, run every loop iteration) takes the newest finished buffer and hands it to the
   renderer with `raster::dyn_wrap` / `dyn_update`. The frame is already the size it is drawn at, so the rasterizer
   copies rows (`memcpy`) and only the live view rectangle is damaged. The UI thread never waits on USB; frames that
   arrive faster than the display are dropped (newest wins).
4. Promise results and events travel the other way through a mutex-protected queue drained by the same poller.

Measured on macOS (Apple Silicon, `ZINC_FAKE_CAMERA=max zinc run examples/camera/bench`, 1024x683 preview JPEGs,
quality 75, 4:2:0):

| view box | decode path | decode + scale | camera fps | shown fps |
|---|---|---|---|---|
| 1024x683 | DCT 8/8, no resampling | 1.0-1.1 ms | 170-230 (bounded by the fake camera's own JPEG encoding) | 60 (vsync) |
| 736x532 (remote app) | DCT 6/8 (768x513) + bilinear to 736x490 | 2.2-2.3 ms | same | 60 (vsync) |

With the default 30 fps fake camera the app shows 30 fps with the UI at 60 fps. Real cameras deliver 15-30 fps over
USB 2 (the transfer, not the decode, is the limit). On rpi1 the build and the whole pipeline run under QEMU
(arm1176) in the SDK image, but QEMU timings (about 19 ms per frame for the 736x490 fit) say nothing about a real
Pi 1; there, a smaller view box (DCT 1/2 or 1/4) keeps the decode cheap.

## Fake camera

`ZINC_FAKE_CAMERA=1` (or `zinc.json` `"plugins": { "gphoto2": { "fake": true } }`) replaces libgphoto2 by a
generated camera in the same worker: an animated scene JPEG-encoded at 1024x683 at 30 fps (`ZINC_FAKE_CAMERA=max`:
unthrottled), a config tree with ISO, aperture, shutter speed, white balance, focus mode, exposure compensation and
image format (exposure settings and white balance change the picture), captures written as 1920x1280 JPEGs, and
file-added events for `trigger()`. It runs the real decode path, so it is also the benchmark source.

```sh
ZINC_FAKE_CAMERA=1 zinc run examples/camera/remote
ZINC_FAKE_CAMERA=1 ZINC_FRAMES=150 ZINC_SHOT=/tmp/remote.bmp zinc run examples/camera/remote
zinc run examples/camera/cli --target sim
```

Captures go to `captures/` under the current directory.

## Verified here

- macOS: `examples/camera/remote`, `cli` and `bench` against the fake camera (also as `--debug` ASan/UBSan builds);
  sim: `remote` and `cli` (`cli` prints the same lines as the native build).
- linux (Debian trixie SDK image) and rpi1 (Alpine armhf SDK image, QEMU arm1176): `remote` and `cli` build; `cli`
  runs the real libgphoto2 detection (0 cameras in the container) and, with `ZINC_FAKE_CAMERA=1`, the whole session;
  `remote` runs headless on rpi1 with the fake camera (live view decoded and presented, `ZINC_SHOT` checked).

## Not done / unverified

- Nothing was run against a physical camera (see above): real `capture_preview` timing, Canon/Nikon quirks
  (live view needing `viewfinder=1` or `capturetarget` changes), RAW downloads.
- One open camera at a time; no file browsing on the camera beyond `download(path)`.
- No live view overlays (focus point, histogram) and no manual focus drive helpers; use `set` on the driver's widgets
  (`manualfocusdrive`, `autofocusdrive`...).
