# Native CarPlay viewer

Run the local media demo on macOS with one command:

```sh
examples/carplay/run
```

It generates an eight-frame, four-second H.264 test pattern with FFmpeg and a
short 440 Hz PCM tone, then plays them in a native Zinc Canvas through the real
CarPlay media decoder. The screen says **OFFLINE MEDIA / no iPhone
authentication**. No receiver, identity, Bluetooth, iPhone or browser is needed.
Generated media stays in `build/carplay/demo-media`. Requires FFmpeg and a built
`build/zinc`; use `ZINC=/absolute/path/to/zinc examples/carplay/run` to reuse an
existing engine without rebuilding it. The launcher selects this checkout's
plugins and opens the window in the background by default. Set
`ZINC_BACKGROUND=0` for a manual foreground run that can request microphone
permission when Siri first opens capture.

For an actual receiver, follow [the plugin setup](../../plugins/carplay/README.md),
then run:

```sh
ZINC_CARPLAY_URL='ws://127.0.0.1:8080/ws?token=YOUR_LOCAL_TOKEN' examples/carplay/run --live
```

Live mode never substitutes offline media. Connect/Disconnect, Home, Siri,
Day/Night and two-contact touch use the receiver. Arrow keys move its rotary
focus; Enter selects, Escape/Backspace go back, Home opens Home, and S requests
Siri. A dropped receiver retries after 0.5 seconds, doubling to eight seconds;
Disconnect cancels retries. Audio and video resources are released on disconnect.
A backend WebSocket connection is **waiting for iPhone**, not authenticated
CarPlay. USB pairing, H.264 projection and automatic stereo 48 kHz audio
playback on the Mac are verified on one iPhone running iOS 27.0.1. Live Siri,
calls, physical multitouch and day/night appearance still need acceptance.

`src/main.tsx` mounts the UI; `src/services/offline.ts` feeds generated local
media. `tests/run --only carplay_demo` checks and captures the native demo and
asserts decoding, playback envelopes and cleanup across the complete local loop.

## Debug laboratory

Click **Debug**, or set `ZINC_CARPLAY_DEBUG=1`. Use the newly built engine for raw
trackpad support; the launcher enables `ZINC_TRACKPAD_TOUCHES=1` by default.
Set it to `0` to retain normal pointer/scroll input. Trackpad normalized positions
map to the window; contacts within the projected video are sent in two stable
slots. The Mac built-in trackpad and Bluetooth Magic Trackpad use the same SDL
indirect-touch path. Physical gestures still need acceptance on each device.
The separately labelled two-contact mouse simulator mirrors the pointer around
the video centre; it does not claim two real fingers. Click the projected video to route keyboard navigation to CarPlay; Tab keeps
the debug controls keyboard-accessible, and focused controls retain their keys.

External GPS debug is **simulated**. Edit latitude/longitude/speed (km/h), apply a
preset, or pick a GPX file with **Load GPX**. The panel shows whether the iPhone
has subscribed. The authenticated backend emits NMEA only while the source is
enabled and a location subscription is active. Stop GPS disables injection.

GPX files are limited to 1 MiB / 10,000 points; DTDs and external XML access are
rejected. Track timestamps define the timeline; without timestamps each point
is one second apart. Interpolation supports seeking and Play/Pause; injected
observations use current UTC. A short sample is `routes/paris.gpx`.

For an actual secondary screen, add `ZINC_CARPLAY_CLUSTER=1` to the backend
environment **before starting it**. This opts into a 960×360 cluster display.
Start navigation and click **Request cluster map**. Its stream111 decoder is
independent of the main stream110 decoder. A blank preview means no cluster
video has arrived; it is not filled with a mock map.

The HUD shows decoded iAP2 road/instruction/distance and Now Playing metadata;
its bounded log contains message IDs and byte counts, not raw payloads. Missing
updates remain missing, and ended sessions are marked stale. Navigation apps
may differ in the guidance/cluster data they provide.

USB trust is persisted per explicitly selected phone under the backend state
directory, in owner-only files. The first run with this version may need one
last Trust approval. Later starts first try saved trust, with bounded waiting
when the phone is locked. Lockdown/USB Restricted Mode may still require an
unlock; the plugin does not bypass the iPhone's lock policy. Saved trust is
retained on locked, transient, TLS and transport failures.

For wireless launch options on Mac and Pi, see
[the wireless backend guide](../../plugins/carplay/backend/linux/README.md).
