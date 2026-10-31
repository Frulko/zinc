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
// a picker of your own: <Image source={s.thumbnail}>, s.name, s.appName, s.appIcon (or the share dialog below)
const stream = await navigator.mediaDevices.getDisplayMedia({ video: { deviceId: sources[0].id, width: 1280, height: 720, frameRate: 15 } });
await sender.replaceTrack(stream.getVideoTracks()[0]);                       // zinc:webrtc
```

| API | |
|---|---|
| `permissionStatus()` | `'granted'` or `'denied'`, without asking (macOS does not tell "never asked" from "refused"). `denied` too when zinc.json "permissions" lack `screen` |
| `requestPermission()` | the system's question the first time; afterwards the person allows the app in System Settings › Privacy & Security › Screen & System Audio Recording and opens it again. A background run (`ZINC_BACKGROUND=1`, every test) never asks |
| `getSources({ types?, thumbnailSize? })` | `Promise<CaptureSource[]>`: the screens (the main one first), then the windows with a title. `id`, `kind`, `name`, `appName`, `width`, `height` (pixels), `thumbnail` (a runtime image, -1 without; it lives until the call after the next, so a dialog showing it never flashes black while the next listing runs), `appIcon` (a window's application icon, 32 pixels square with alpha, -1 for a screen; the same life). Rejects with where to allow screen recording when it is not allowed: listing never asks |
| `ScreenCapture.open(id, { width?, height?, frameRate?, cursor? })` | a running capture (`''`: the main screen). The frames fit `width` x `height` with the source's aspect (default: the source's size, at most 1920 x 1080), `frameRate` default 30 (at most 60), `cursor` default true. `image`, `frameIndex`, `onFrame(cb)`, `onEnded(cb)` (the window closed), `snapshot()`, `close()` |
| `navigator.mediaDevices.getDisplayMedia({ video })` | (zinc:web, once this module is imported) a stream with one video track: `video: true` for the main screen, or `{ deviceId, width, height, frameRate, cursor: 'never' }`. `NotAllowedError` with the explanation when screen recording is refused, `NotFoundError` for an unknown source. The track ends (`ended` event) when its window closes |

ScreenCaptureKit hands over only the frames that changed, as IOSurface pixel buffers at the asked size; the capture's runtime image points at
the newest one (no copy), and `zinc:webrtc` encodes from it. `close()` (or `track.stop()`) stops the system's recording at once.

## The share dialog (`zinc:screen-capture/picker`)

The dialog a call app opens on "Share screen", written once for every app and laid out as Discord's Go Live: tabs Applications, Entire screen and
(with `devices`) Devices; a two-column grid of large previews with the application's icon and name under each, the chosen one ringed; the previews
refresh every 1.5 s without a blink and the list keeps its scroll; a search field; a preset line (SD 720p 30 fps or HD 1080p 60 fps, its words and
numbers) with an SD/HD switch and a settings button for the resolution (720p, 1080p, Source), the frame rate (15, 30, 60) and the pointer; Share and
Cancel (Escape or a press outside cancels).
It asks for screen recording first when needed (never in a background run), sits on its own modal layer in the kit theme's colours, and works
the same under the Solid and the React models: nothing to mount.

```ts
import { ScreenCapture } from 'zinc:screen-capture';
import { pickScreen } from 'zinc:screen-capture/picker';

const c = await pickScreen({ resolution: '720', frameRate: 30 });   // null when cancelled
if (c !== null) {
  const cap = await ScreenCapture.open(c.sourceId, { width: c.width, height: c.height, frameRate: c.frameRate, cursor: c.cursor });
  // or getDisplayMedia({ video: { deviceId: c.sourceId, width: c.width, height: c.height, frameRate: c.frameRate, cursor: c.cursor ? 'always' : 'never' } })
}
```

| API | |
|---|---|
| `pickScreen(options?)` | `Promise<ShareChoice \| null>`: `{ kind, sourceId, width, height, frameRate, cursor, resolution }` (the box to capture in: 1280 x 720, 1920 x 1080 or the source's size; `resolution` is `'720'`, `'1080'` or `'source'`, to keep for next time). Rejects with the reason when nothing can be listed (screen recording refused). A second call cancels the first dialog |
| options | `title` ('Share your screen'), `shareLabel` ('Share'), `types`, `resolution` and `frameRate` shown first (720p, 30), `cursor` (true), `cursorOption` (offer the pointer's switch, true), `allowed(resolution, frameRate)` with `lockedNote`: a quality the account may not send is dimmed, labelled, and HD shows a banner "Stream in high resolution with <lockedNote>" (Discord's Go Live above 720p 30 fps passes 'Nitro'), `devices` (`() => Promise<{ id, name }[]>`, the cameras: adds the Devices tab, Share then answers `kind: 'device'`) |
| `pickerOpen()`, `confirmPicker(id?)`, `cancelPicker()` | the dialog is open; press Share (with `id` selected first) or Cancel: keyboard shortcuts and scripted sessions |

Used by `examples/discord` (Go Live) and `examples/webrtc-call` (Share screen).

Tests: `ZINC_FAKE_SCREEN=1`, and every deterministic run, list only "Zinc Fake Screen" (1280 x 800) and "Zinc Fake Window" (800 x 600), a
moving pattern (the window's application, "Zinc", has a small blurple icon); `ZINC_FAKE_WINDOWS=n` lists n windows ("Zinc Fake Window 2"...), a list long enough to scroll: no test captures the screen of the person at the machine (`tests/t1/screen_capture.sh`, `tests/t1/screen_picker.sh`).
