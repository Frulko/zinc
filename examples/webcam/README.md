# Webcam

A small camera app on [`zinc:camera`](../../docs/plugins/camera.md), written in the React model (`zinc:ui/react`, `className` and
capitalised components, light and dark from the system): a live preview, a camera picker, a shutter that saves PNG photos, a strip of the
last shots with a viewer, adjustments, the capture format, and the screens for the camera permission.

![The preview in fill mode with three photos in the strip](screenshots/main.png)

| | |
|---|---|
| ![Dark scheme, mirrored, brightness raised](screenshots/dark.png) | ![The photo viewer](screenshots/viewer.png) |
| ![The "Allow the camera" screen](screenshots/allow.png) | ![Camera access is off](screenshots/denied.png) |

## Run it

```sh
cd next
build/zinc run ../examples/webcam                         # your webcam (macOS: AVFoundation; Linux and the Pi: V4L2)
ZINC_FAKE_CAMERA=1 build/zinc run ../examples/webcam      # the simulated "Zinc Fake Camera" instead
build/zinc run ../examples/webcam/src/web.tsx             # the same camera through navigator.mediaDevices.getUserMedia
```

**The first run on a Mac** shows "Allow the camera". Press **Allow camera**: macOS asks once whether the app that started Zinc (Terminal,
iTerm, or your editor's terminal) may use the camera. Say OK and the preview starts. The answer is kept in **System Settings > Privacy &
Security > Camera**; if you said no, the app shows that path and a **Retry** button (macOS may ask you to quit and reopen the terminal
first). An exported app (`zinc export --target macos`) asks in its own name: `"permissions": ["camera"]` in `zinc.json` puts the usage
string and the entitlement into the `.app`.

On Linux and the Raspberry Pi there is no question; your user needs the `video` group (`sudo usermod -aG video $USER`). Without any
camera, or on another platform, the app opens the fake camera and says "this is a simulated camera".

## What it does

| | |
|---|---|
| Preview | the camera's frames fill the window, **Fit** (all of it, bars around) or **Fill** (cropped to the window) |
| HUD | size, measured frames per second, frame index and camera name, over the preview |
| Camera | a list to pick from when there are several (front, back, external) |
| Shutter | a short white flash; the frame on screen, adjustments included, is saved as `photo-YYYY-MM-DD-HHMMSS.png` |
| Photos | the last shots in a strip; a click opens the viewer: previous, next, **Delete**, **Close** |
| Adjust | mirror, brightness (-1..1) and contrast (0..2) in steps of 0.1, **Reset** (the plugin's `setOption`) |
| Format | 320×240, 640×480 or 1280×720, at 15 or 30 fps (the camera is opened again) |

Keys: **Space** takes a photo, **M** mirrors, **C** switches to the next camera, **F** fits or fills, **← →** browse the viewer,
**Esc** closes the viewer, then the app.

The photos go to `webcam/Photos/` next to the app's storage: `~/.zinc/webcam/Photos` (or under `ZINC_HOME`, or beside the
`ZINC_STORAGE` file when that is set). Reopening the app shows the last twelve.

## Files

| File | Role |
|---|---|
| `src/main.tsx` | the keyboard shortcuts and `render` |
| `src/App.tsx` | the screens: permission cards, the preview canvas and the HUD, the side panel, the viewer |
| `src/session.ts` | everything that talks to the camera and the disk: permission, camera list, open/close, options, fps, photos |
| `src/web.tsx` | the getUserMedia page: `import 'zinc:camera'` then `navigator.mediaDevices.getUserMedia({ video: true })` |

## Tests and screenshots

`next/tests/t1/webcam_demo.sh` drives the app headless on the fake camera (`ZINC_FAKE_CAMERA=1 ZINC_DETERMINISTIC=1`) with scripted
input and checks a frame hash per state and the log of each session (`WEBCAM_LOG=1`). A test never asks the system for the camera:
the permission screens are shown with `WEBCAM_DEMO_PERMISSION=undetermined|denied|granted`, which only replaces the first reading of
the status (tests and screenshots; pressing **Allow camera** or **Retry** still asks the plugin, which grants the fake camera).
The screenshots were taken the same way, at 1040×680 (`ZINC_SHOT=…png`, `ZINC_SCHEME=dark` for the dark one).

`getUserMedia` does not ask for the camera the way a browser would: on a Mac where access was never given, `src/web.tsx` fails with
`NotAllowedError` until the main app's **Allow camera** has asked once.
