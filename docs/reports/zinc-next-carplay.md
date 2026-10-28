# CarPlay plugin checkpoint — 2026-10-28

Owner scope: separate Zinc plugin, USB and wireless, software authentication
(no physical MFi chip), native Mac demo first; Pi and Android Auto later.
**The full scope remains unfinished.**

Implemented plugins/carplay (zinc:carplay): FFmpeg H.264/HEVC video as runtime
images, AAC/Opus/LPCM audio via zinc:audio, WebSocket media reception, normalized
touch return, Home/Siri commands, connection state and cleanup. Native demo in
examples/carplay. No engine files changed by this work.

Separate GPL backend: PlayPort revision
9a0882dd0ffe48e467b59d58b12d81391df55ade, fetched/built in build/carplay/playport
by plugins/carplay/backend/build. Protocol and server tests: 96, zero failures.
Swift RFCOMM helper compiled; server help/bridge usage executed. Backend run
requires external offline-mfi/certificate.p7b and identity.pk8. No credentials
are supplied or tracked. Backend provenance is in backend/UPSTREAM.md.

Mac verification:
- tests/run --only carplay: real FFmpeg H.264/HEVC, AAC/Opus fixtures; PCM and
  malformed envelopes; resource cleanup; actual loopback WebSocket video and
  touch return. Default engine and interpreter.
- tests/run --only carplay_demo: checker and disconnected headless demo.
- /tmp/zinc-carplay-demo.png inspected, 1100x700.
- backend/build completed, including upstream tests and Bluetooth helper.
- No pairing, scan or receiver service started. Gradle daemon stopped.

Still required:
- USB: port DiPlay's Android USB host/NCM/USBMUX adapter to native Mac APIs.
  PlayPort explicitly supports wireless only. No pretend --usb option added.
- Microphone capture/encoding uplink for calls/Siri. Current command triggers
  Siri, but the plugin reports missing uplink when the backend requests capture.
- Reconnect, keyboard/rotary, GPS, cluster display.
- Real iPhone identity acceptance, wireless pairing and live media/input checks.
- Linux/Pi transport and hardware verification in the cross-platform pass.

Current video decoder uses software decoding and pixel conversion, with no
hardware-acceleration, zero-copy or latency/FPS claim. Accepted packet count is
not measured screen refresh rate. The plugin is an integration prototype.

Next live command: supply an external identity to backend/run, pair the iPhone
using the fetched RFCOMM helper, start --wireless, then set ZINC_CARPLAY_URL to
the authenticated loopback WebSocket URL and run the demo (plugin README).
Keep the work open until USB/microphone and live acceptance are complete.

## Two-finger input and day/night

Added touches(contacts) with two stable slots and release reports, integrated
Zinc touchCount/touchId/touchX/touchY into view(), retained mouse fallback.
setNightMode stores and sends the mode and reapplies it on connection/session
start. Demo has a Day/Night button. Loopback tests verify exact two-contact
coordinates, ordering, finger release, malformed/duplicate contact rejection,
remembered mode before connection and day/night commands at the backend.
Physical touchscreen gestures and iPhone appearance still need device tests.
