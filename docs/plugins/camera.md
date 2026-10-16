# camera plugin (`zinc:camera`)

Webcams, phone cameras and built-in cameras: list them, open one at a size and a rate, draw its frames, take stills, RGBA snapshots and PNG
photos. The frames land in a
runtime image of `zinc:gfx`, as `zinc:video` and `zinc:gphoto2` do, so a program draws the camera like any image. Sources:
`plugins/camera/`. For DSLRs over USB (settings, capture, files) see [gphoto2](gphoto2.md). A complete app on it: [`examples/webcam`](../../examples/webcam/README.md)
(preview, camera picker, photos saved as PNG, adjustments, formats, the permission screens).

```ts
import { devices, requestPermission, Camera } from 'zinc:camera';

if (await requestPermission() !== 'granted') throw new Error('no camera access');
const list = await devices();                                    // CameraDevice[] { id, name, position }
const cam = await Camera.open(list[0].id, { width: 1280, height: 720, fps: 30 });
cam.onFrame((index) => { /* a new frame is in cam.image */ });
gfx.drawImage(cam.image, 0, 0, cam.width, cam.height, 255, 0);  // or <Image source={cam.image} />
cam.setOption('mirror', 1);                                      // a selfie view
const rgba = cam.snapshot();                                     // width * height * 4 bytes
cam.close();
```

| API | |
|---|---|
| `requestPermission(): Promise<'granted' \| 'denied' \| 'undetermined'>` | macOS asks the person once per app and resolves with the answer (`undetermined` after a minute without one); elsewhere `granted`. `denied` too when zinc.json refuses `camera` (below) |
| `permissionStatus()` | the same status, without asking |
| `devices(): Promise<CameraDevice[]>` | `{ id, name, position }`, position `front`, `back`, `external` or `unknown`; the fake camera when the machine has none; `[]` with `ZINC_FAKE_CAMERA=0` and no camera. Rejects when zinc.json refuses `camera` |
| `Camera.open(id, { width, height, fps }?)` | `''` opens the first camera; defaults 640x480 at 30 fps. Resolves once the camera runs (macOS starts it off the program's thread: the window keeps drawing). Rejects with the reason: no such camera, access not asked or denied, in use |
| `width`, `height`, `fps`, `id` | what the camera delivers. On macOS the frames are scaled to the asked size (the nearest larger format, cropped to fill); on Linux the driver picks the nearest size it has |
| `image` | the runtime image with the newest frame (-1 once closed) |
| `onFrame(cb)` / `frameIndex` | each new frame, with its index (0, 1, 2...), once the image shows it |
| `setOption(name, value)` | `mirror` (0 or 1), `brightness` (-1..1, 0), `contrast` (0..2, 1), in software on the image and the snapshots |
| `snapshot()` | the newest frame as RGBA bytes (`u8[]`: Zinc has no typed arrays; a real `Uint8Array` on the QuickJS engine) |
| `still()` | a copy of the frame on screen as a new runtime image (about a millisecond): a photo's thumbnail without a PNG round trip. Free it with `gfx.destroyImage` |
| `encodePng(): Promise<u8[]>` | the frame on screen as a PNG, encoded on a thread of its own (100 ms or more for a 1280x720 picture from a real camera): `cam.encodePng().then((png) => fs.writeBytes(path, png))`; `[]` on the sim stand-in |
| `toPng()` | the same bytes at once, on the program's thread (it waits for the encoder) |
| `close()` | stops the camera and destroys its image |

## Backends

| target | how | notes |
|---|---|---|
| macos | AVFoundation (`native/camera.macos.mm`): an `AVCaptureSession` per camera, `AVCaptureVideoDataOutput` in 32BGRA scaled to the asked size; sessions are built, started and stopped on a serial queue, never on the program's thread | built-in, USB (UVC) and virtual cameras (OBS); an iPhone (Continuity Camera) under its own device type when the Info.plist has `NSCameraUseContinuityCameraDeviceType` (exported and `zinc run` bundles with an `app.id` write it), else through the external type with AVFoundation's deprecation warning |
| ios | the same file (`camera.ios.mm` includes it): front and back wide-angle cameras (and USB cameras on iPadOS 17), frames turned upright for a portrait app, the front camera mirrored | untested: the iOS export is not there yet |
| android | camera2 of the NDK (`native/camera.android.cpp`): `ACameraManager`, an `AImageReader` in YUV_420_888 converted to the image's pixels, turned upright by the sensor's orientation, front cameras mirrored; the permission is asked through SDL (`SDL_RequestAndroidPermission`) | front, back and external (USB) cameras; links camera2ndk, mediandk; untested on a device |
| linux, rpi1 | V4L2: `/dev/video*` capture nodes, mmap streaming; YUYV when the camera gives it at the asked size and rate (`VIDIOC_ENUM_FMT`, `VIDIOC_ENUM_FRAMEINTERVALS`), else MJPEG decoded with stb_image (5 to 15 ms a 720p frame on a desktop, several times that on a Pi) | the user needs the `video` group; the Pi's CSI camera modules behind libcamera only have no V4L2 capture node: `libcamerify zinc run ...` shows them through libcamera's V4L2 layer |
| sim, `ZINC_NATIVE=sim` | the fake camera alone (`native/camera.sim.ts`): same snapshots, a black image | |
| windows, wasm | not yet (error Z5005: the profile has `camera` false) | see "Not done" |

Frames are captured on the backend's thread (AVFoundation's dispatch queue, a V4L2 worker) into one buffer under a mutex; the program's
thread takes the newest every half frame period (`index.ts` polls `frame()` on a timer), applies the options and marks the image changed.
A slow program drops frames, it never queues them; with no option set the image shows the taken frame itself (no second copy).
On macOS `open` returns at once and the camera starts on the control queue (0.3 to 1.5 s for a USB webcam); `close` parks the session for
300 ms before stopping it, so opening the same camera again at another size or rate takes the running session back and changes its format
in place, without a stop and a start. A program draws a lazy canvas and calls `ui.repaint()` in `onFrame` to draw at the camera's rate
and sleep in between (`examples/webcam`).

## Permissions

| platform | what the person sees | what Zinc writes or checks |
|---|---|---|
| macOS | a system question the first time `requestPermission()` runs; the answer in System Settings > Privacy & Security > Camera (under `zinc run`: for the terminal app) | `zinc export --target macos`: `NSCameraUsageDescription`, `NSCameraUseContinuityCameraDeviceType` in the Info.plist, the entitlement `com.apple.security.device.camera` |
| iOS | the system question, with the text of `"permissionStrings": {"camera": "..."}` (default "<App> uses the camera.") | `NSCameraUsageDescription` in the Info.plist (`iosInfoPlist`, `next/src/frontend/project.cpp`); without it the backend reports `denied` instead of asking (iOS would end the app) |
| Android | the system dialog when `requestPermission()` runs (through SDL's `SDL_RequestAndroidPermission`); later in Settings > Apps > the app > Permissions > Camera | `zinc export --target android`: `<uses-permission android:name="android.permission.CAMERA" />` and `<uses-feature android:name="android.hardware.camera" android:required="false" />` (the store keeps the app for devices without a camera) |
| Linux, Raspberry Pi | nothing to answer: `/dev/video*` belongs to the `video` group. `permissionStatus()` is `denied` when there are cameras and the user may open none | the error names the fix: `sudo usermod -aG video $USER`, then log out and in again |

- **zinc.json**: `"permissions": ["camera"]`. Without it, in a project that declares permissions, `devices()` and `open()` warn while
  developing and fail in an exported app (`EACCES: camera needs the permission "camera" in zinc.json "permissions"`; `zinc explain Z5006`).
- **macOS privacy**: the system asks the person the first time an app asks (`requestPermission()`); the answer is kept in System Settings >
  Privacy & Security > Camera. `open` never starts a session without access: it fails with "call requestPermission() first", so a program
  never stops on a question it did not ask. Under `zinc run` the system asks for the terminal app that started it.
- **Exported apps**: with `camera` in the permissions, `zinc export --target macos` writes `NSCameraUsageDescription` (the text of
  `"permissionStrings": {"camera": "..."}`, else "<App> uses the camera.") into the `.app`'s Info.plist (without it macOS kills an app that
  asks) and the hardened-runtime entitlement `com.apple.security.device.camera` (`next/src/main.cpp` `bundleSpecOf`, checked by
  `next/tests/t1/permissions_export.sh`). The Android manifest lines and the iOS Info.plist come from the same list
  (`next/tests/unit/project_test.cpp`, `next/tests/t0/export_android.sh`).
- **`requires`**: the plugin needs the `camera` capability (`targets/capabilities.json`): true on macos, android, ios and sim, optional on
  linux and rpi1, false elsewhere, so `zinc build --target esp32` of a program that imports it is refused with Z5005.

## The fake camera

"Zinc Fake Camera" (`id` `zinc:fake-camera`, position `unknown`) is a generated test pattern at the asked size: a row of 16 cells with the
frame index in binary on top, eight colour bars, a grey ramp and an orange square moving 4 pixels a frame. Its pixels are a function of the
frame index only, and it makes one frame per poll, so a run gives the same frames on every machine and engine (the interpreter, AOT,
QuickJS and the sim stand-in print the same snapshot hashes).

It is the only camera with `ZINC_FAKE_CAMERA=1` (or zinc.json `"plugins": { "camera": { "fake": true } }`) and in a deterministic run
(`ZINC_DETERMINISTIC`, unless `ZINC_FAKE_CAMERA=0`), and the camera `devices()` gives on a machine without one. `ZINC_FAKE_CAMERA=0` lists the
real cameras only. `ZINC_FAKE_CAMERA=N` (2 to 8) lists N fake cameras (front, back, external...; the second with a long name), for
the camera pickers of programs and their tests.

```sh
ZINC_FAKE_CAMERA=1 zinc run my-app        # the pattern instead of the webcam
```

## navigator.mediaDevices

`zinc:web` holds the Web's camera API as a thin facade over this plugin, once the program imports it (`import 'zinc:camera';`: the
standard library cannot import a plugin, every program would build it):

```ts
import 'zinc:camera';
const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
const track = stream.getVideoTracks()[0];
gfx.drawImage(track.image, 0, 0, 640, 480, 255, 0);   // track.camera is the Camera
track.stop();
```

`getUserMedia({ video: true | { width, height, frameRate, facingMode, deviceId } })` resolves with a `MediaStream` of one video track
(`kind`, `label`, `getSettings()`, `stop()`, `readyState`, plus `image` and `camera`); `enumerateDevices()` lists the cameras as
`videoinput`. Left out: constraint objects (`{ ideal, exact, min, max }`: numbers only), audio unless the program
also imports [`zinc:microphone`](microphone.md) (then `{ video, audio }` gives both tracks), `<video>` elements, `applyConstraints`, track events and `devicechange`.
Without the import, `getUserMedia` is `NotFoundError` with the line to add.

## Verified here

- macOS (the development Mac): the plugin builds and lists the real cameras (a Logitech C920, the FaceTime HD camera, OBS Virtual
  Camera). The camera access of the terminal was undetermined and the tests never ask (a question would wait on a dialog), so **no
  frame of a real camera was captured**: the AVFoundation capture path is written to Apple's documented API and unproven.
- The fake camera on the interpreter, AOT, QuickJS and the sim stand-in: `next/tests/t1/webcam.sh`, `next/tests/t0/webcam_sim.sh`.
- The demo `examples/webcam` on the fake camera, scripted (photos, viewer, adjustments, formats, permission screens): `next/tests/t1/webcam_demo.sh`.
- Linux and the Pi: the V4L2 backend is not built or run yet (the cross-platform pass, `next/backlog/later.md`).
- Android and iOS: the backends and the manifests are written; the manifests' text is unit-tested on the Mac, the backends are not built
  or run yet (the cross-platform pass).

## Not done

- Windows (Media Foundation) and the web target (the browser's `getUserMedia`) have no backend yet; the profiles say `camera` false until
  they do. iOS follows a portrait screen only (no rotation with the device yet).
- No microphone (a later plugin), no recording to a file, no camera controls (focus, exposure, zoom), no hot-plug event: call `devices()`
  again. QR and barcode decoding on the frames is a later plugin over `snapshot()`; face tracking is out of scope.
