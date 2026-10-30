# screen-capture plugin (`zinc:screen-capture`)

The screens and windows of the machine as video: list them with thumbnails (Electron's `desktopCapturer.getSources`), capture one at a size
and rate, or get a `MediaStreamTrack` from `navigator.mediaDevices.getDisplayMedia` that `zinc:webrtc` sends like a camera's (screen sharing in
a call). ScreenCaptureKit on macOS (12.3; thumbnails need macOS 14); other desktops come with the cross-platform pass. In the browser,
`getDisplayMedia` is the browser's own, with its picker. Sources: `plugins/screen-capture/`; the demo is
[examples/webrtc-call](../../examples/webrtc-call) (the share button).

```ts
import { getSources, requestPermission } from 'zinc:screen-capture';
import { navigator } from 'zinc:web';

await requestPermission();                                                   // macOS asks once; then System Settings
const sources = await getSources({ types: ['screen', 'window'], thumbnailSize: { width: 240, height: 150 } });
// a picker of your own: <Image source={s.thumbnail}>, s.name, s.appName
const stream = await navigator.mediaDevices.getDisplayMedia({ video: { deviceId: sources[0].id, width: 1280, height: 720, frameRate: 15 } });
await sender.replaceTrack(stream.getVideoTracks()[0]);                       // zinc:webrtc
```

| API | |
|---|---|
| `permissionStatus()` | `'granted'` or `'denied'`, without asking (macOS does not tell "never asked" from "refused"). `denied` too when zinc.json "permissions" lack `screen` |
| `requestPermission()` | the system's question the first time; afterwards the person allows the app in System Settings › Privacy & Security › Screen & System Audio Recording and opens it again. A background run (`ZINC_BACKGROUND=1`, every test) never asks |
| `getSources({ types?, thumbnailSize? })` | `Promise<CaptureSource[]>`: the screens (the main one first), then the windows with a title. `id`, `kind`, `name`, `appName`, `width`, `height` (pixels), `thumbnail` (a runtime image, -1 without; it lives until the next call). Rejects with where to allow screen recording when it is not allowed: listing never asks |
| `ScreenCapture.open(id, { width?, height?, frameRate?, cursor? })` | a running capture (`''`: the main screen). The frames fit `width` x `height` with the source's aspect (default: the source's size, at most 1920 x 1080), `frameRate` default 30 (at most 60), `cursor` default true. `image`, `frameIndex`, `onFrame(cb)`, `onEnded(cb)` (the window closed), `snapshot()`, `close()` |
| `navigator.mediaDevices.getDisplayMedia({ video })` | (zinc:web, once this module is imported) a stream with one video track: `video: true` for the main screen, or `{ deviceId, width, height, frameRate, cursor: 'never' }`. `NotAllowedError` with the explanation when screen recording is refused, `NotFoundError` for an unknown source. The track ends (`ended` event) when its window closes |

ScreenCaptureKit hands over only the frames that changed, as IOSurface pixel buffers at the asked size; the capture's runtime image points at
the newest one (no copy), and `zinc:webrtc` encodes from it. `close()` (or `track.stop()`) stops the system's recording at once.

Tests: `ZINC_FAKE_SCREEN=1`, and every deterministic run, list only "Zinc Fake Screen" (1280 x 800) and "Zinc Fake Window" (800 x 600), a
moving pattern: no test captures the screen of the person at the machine (`tests/t1/screen_capture.sh`).
