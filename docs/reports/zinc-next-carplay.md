# CarPlay integration — 2026-10-28

Separate `plugins/carplay`, imported as `zinc:carplay`; no CarPlay code in the
engine. Native macOS demo runs. **No real iPhone session has been verified.**

## Implemented and proven locally

- FFmpeg H.264/HEVC images and AAC/Opus/LPCM playback, actual loopback WebSocket
  media/control, two stable touch slots and remembered Day/Night appearance.
- Receiver-requested microphone capture reuses Zinc's miniaudio/macOS permission
  implementation. FFmpeg/libopus or PCM16 uplink matches pinned PlayPort wire
  bytes. Capture, encoders and timers stop on mic stop, session end, disconnect,
  failed send and close. Fake capture requires explicit test opt-in.
- Reconnect starts at 0.5 seconds, doubles to eight seconds, and is cancelled by
  Disconnect or replacement. A receiver policy/token rejection stops retries
  with an access error. Old callbacks cannot change a replacement session.
  Keyboard arrows/Enter/Escape/Backspace/Home/S map to upstream rotary/Siri HID.
- Pinned Kotlin JSON omits default `false` values: absent `sessionActive` on a
  session event and absent `micActive` on a mic event correctly trigger cleanup.
- `examples/carplay/run` generates and plays an eight-frame four-second H.264
  pattern and PCM tone. It says **OFFLINE MEDIA / no iPhone authentication**.
  `--live` requires a receiver URL and never substitutes simulated phone media.

Validation (main engine `/Users/mowmow/Lab/zinc/build/zinc` used read-only;
`ZINC_ROOT` selects this checkout's native modules):

- `tests/run --only carplay`: real FFmpeg decoder fixtures, malformed input,
  cleanup, two-contact reports, day/night, keyboard payloads, reconnect and its
  cancellation, invalid URLs, session stop, receiver-requested PCM/Opus capture
  and omitted-false microphone stop. Default engine and explicit interpreter.
- `tests/run --only carplay_microphone`: exact PCM; mono/stereo Opus round trips
  at 8/12/16/24/48 kHz; packet assembly; fake capture over WebSocket; repeated
  start/stop, permission/fake fallback refusal and transport-error cleanup.
- `tests/run --only carplay_demo`: checker, headless UI capture, nine decoded
  frames across the complete local loop, PCM envelopes, cleanup, missing live
  URL diagnostic. Background native window also ran and exited successfully.
- Screenshot inspected: `build/carplay/verified-native.png` (Retina native window)
  and `/tmp/zinc-carplay-offline.png` (headless logical-size capture).

## Backend and identity

Separate GPL-3.0 PlayPort revision
`9a0882dd0ffe48e467b59d58b12d81391df55ade`, from DiPlay/xcertplay. The preserved
prototype had 96 passing protocol/server tests and a compiled Bluetooth helper.
See `plugins/carplay/backend/UPSTREAM.md` for provenance and build details.

The documented DiPlay v0.2.7 preview APK supplies an experimental runtime
identity recovered from Carlinkit firmware. Its provenance and extraction path
are linked in the plugin README. For this session the APK and extracted files
are outside Git in `~/.local/share/zinc/carplay-experiment`, with owner-only
permissions. No key contents were printed or committed. OpenSSL challenge
sign/verify passed. The actual pinned receiver loaded the identity and accepted
a token-protected loopback WebSocket upgrade/hello plus a public read-only
status API request;
`sessionActive` was false. Own receiver process group and temporary state were
cleaned up. Loopback JmDNS had no multicast route, so that smoke does not prove
advertisement, discovery or pairing.

A certificate/key consistency check is not iPhone acceptance. Shared experimental
credentials may cease to be accepted. A self-signed certificate is not a usable
replacement. No Bluetooth scan/pairing or wireless bootstrap was started.

## Remaining acceptance

ZN-849's local demo/lifecycle criteria pass. ZN-848 remains Review for real
microphone/OS prompt and Siri/call acceptance. ZN-847 owns wired integration and
its independent tests; physical USB acceptance remains unverified.

The plugin README contains the exact live checklist: transport setup and
external identity, phone pairing, native live viewer, video/audio/touch/night,
Siri/calls, disconnect/reconnect and resource cleanup. Record actual model/iOS
and results before claiming a complete receiver. No latency, refresh-rate,
hardware decode, zero-copy, echo cancellation or live voice-quality claim.
Pi/Linux, Android Auto, GPS injection and cluster display remain later work;
no cross build was run.
