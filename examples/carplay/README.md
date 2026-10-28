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
plugins and opens the window in the background.

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
CarPlay. Real pairing and iPhone media acceptance still require a live test.

`src/main.tsx` mounts the UI; `src/services/offline.ts` feeds generated local
media. `tests/run --only carplay_demo` checks and captures the native demo and
asserts decoding, playback envelopes and cleanup across the complete local loop.
