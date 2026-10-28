---
id: ZN-848
title: 'CarPlay: Microphone uplink for Siri and calls'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-28 21:07'
updated_date: '2026-10-28 22:27'
labels:
  - carplay
  - size-M
dependencies: []
ordinal: 557460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: complete the native CarPlay demo on Mac. Existing media decoder and PlayPort transport are in plugins/carplay.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The separate plugin captures and encodes microphone audio requested by the receiver, with permission handling and cleanup
- [x] #2 PCM and Opus uplink and lifecycle are proven by targeted automated tests
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Native `micOpen(codec, rate, channels, samplesPerPacket, bitrate)`, `micEncode(handle, samples)`, and `micClose(handle)` encode one complete packet. Codec 0 is LPCM; codec 1 is Opus. `micEncode` returns the complete PlayPort WebSocket message: 0x10 plus signed PCM16 little-endian, or 0x11 plus a raw Opus packet. This matches the pinned browser-to-WebSocket interface, not the separate wired packetizer's endian conversion. No GPL implementation is linked or copied into Zinc.
- `plugins/carplay/microphone.ts` owns capture/permission polling, exact packet assembly, and teardown. It uses the existing `plugins/microphone/native/microphone.spec.ts` implementation unchanged (miniaudio capture/resampling, macOS permission checks and Zinc app permission enforcement). It adds no second capture backend. Background permission prompts stay suppressed. An implicit fake-device fallback is refused unless `ZINC_FAKE_MICROPHONE=1` explicitly enables the test device.
- Session integration belongs to the coordinator: construct `MicrophoneUplink(sendBytes, onError)` once, call `start(codec, rate, channels, samplesPerPacket, bitrate)` only on `micActive === true`, and `stop()` on any other mic message, session end, socket failure/close, and explicit close. Pinned Kotlin serialization omits false `micActive` and `sessionActive` fields; absence must stop capture too. Add the demo's microphone permission. The coordinator accepted this API and ownership of the native Spec was transferred to this worker.
- Validation: `ZINC=/Users/mowmow/Lab/zinc/build/zinc tests/run --only carplay_microphone` passes. The test sets `ZINC_ROOT` to this checkout, uses an explicit fake microphone, and opens only an ephemeral loopback WebSocket. It checks exact PCM bytes, clipping, invalid config/count/NaN, bounded handle reuse, real FFmpeg libopus encoding and decoding at 8/12/16/24/48 kHz mono/stereo, split/assembled capture blocks, repeated restart/stop, no packets after stop, transport exceptions, enforced permission denial, and implicit fake refusal cleanup.
- Regression: `ZINC_ROOT="$PWD" ZINC=/Users/mowmow/Lab/zinc/build/zinc tests/run --only carplay` passes. The new native encoder header compiles under C++17 with `-Wall -Wextra -Werror`. No engine build or engine source change was needed; the main binary was read-only and built only this checkout's plugin in its native cache.
- AC1 remains open for coordinator Session integration/verification and physical Siri/call acceptance. No real identity or iPhone was supplied, no microphone was physically opened, and no pending macOS permission prompt was exercised (there is no existing test hook). Stop-before-capture-tick and denied permission cleanup are tested. The existing capture path has no added echo cancellation; live call quality and calibration remain unmeasured.
- Cross-platform pass for coordinator: verify native microphone permission/capture and PCM/Opus uplink on Linux/Pi after Mac acceptance; no cross build or cross-target test was run here.

Coordinator integration: Session now handles the receiver mic request fields, forwards full PCM/Opus envelopes, and stops capture on explicit/omitted-false mic stop, session end, disconnect and close. Integrated `carplay` test passes this flow on default and interpreter with an explicitly fake microphone. AC1 implementation and automated lifecycle proof complete; status remains Review pending real Siri/call voice and OS permission prompt verification.

After successful physical USB H264 projection, owner confirms Spotify audio stays on the iPhone; supplied RTSP log only opens stream 110, no audio stream. Audit found pinned receiver CarPlayServer still advertised microphone=false despite integrated capture/uplink. Overlay now sets microphone=true and logs changes to CarPlay resources metadata only, to diagnose ownership without logging payloads. New server test instantiates the receiver without capture and verifies advertised default input/output and AAC media output formats. Full backend build/tests and fresh/repeated overlay check pass. This fixes capability wiring, not yet proof that it resolves the phone playback route. Await live route-picker/resource/SETUP evidence.
<!-- SECTION:NOTES:END -->
