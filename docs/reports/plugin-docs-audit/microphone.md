# zinc:microphone documentation audit

## What it is
Capture sound from a microphone: list inputs, open at a rate and channel count, get blocks of samples every ~20 ms and a level for a VU meter. A fake microphone keeps tests deterministic.

## Targets and status
plugin.json: macos, linux, windows, rpi1, ios (miniaudio), web (getUserMedia). Doc: macos built, no real microphone opened in tests; linux/rpi1 "written, not proven"; ios written; windows/android/wasm "not yet".

## What the docs have
- [x] overview, [x] example, [x] API table (complete vs exports: permission, devices, open, onData, level, frameIndex, isOpen, close), [x] backends, [x] permissions, [x] fake microphone, [x] tests named (`microphone`, `microphone_sim`; also `hardware_microphone.sh`)
- [x] used by examples/webrtc-call, webrtc-chat
- [ ] a runnable example dedicated to it (no `examples/microphone`; no level-meter/recorder app)
- [ ] screenshot or GIF; [ ] tutorial; [ ] troubleshooting; [ ] recording to a file recipe

## What is missing (priority)
1. A small example app `examples/microphone`: device picker, live level meter, waveform, "record 5 s" writing a WAV; with screenshot (`ZINC_SHOT=... zinc run examples/microphone`).
2. Tutorial "A level meter in 20 lines" then "record to a WAV file and play it back with zinc:audio" (needs a WAV writer helper: document or add to the plugin).
3. Troubleshooting: macOS denied (Settings > Privacy > Microphone, terminal app), Linux `audio` group, PulseAudio vs ALSA, `requestPermission` returns at once under `ZINC_BACKGROUND=1`.
4. Real-device proof for Linux/Pi and iOS (hardware): one captured-level line each.
5. Document `sampleRate`/`channels` limits and what happens on a device that cannot do 48000 (converted).
6. Explain the iOS audio session interplay with `zinc:audio` (already one line) in a "Calls and walkie-talkie" recipe with webrtc.
7. Mention the web target (plugin.json `web`).

## Wrong or stale
- "Android gets `android.permission.RECORD_AUDIO`" (Permissions) while the backends table says android is not supported and plugin.json has no android target.
- "Sending audio to a peer (WebRTC audio tracks) is not there yet": stale, docs/plugins/webrtc.md sends `zinc:microphone` tracks and examples/webrtc-call does it.
- Doc says macOS/Linux/ios only; plugin.json also lists windows with miniaudio (doc says "not yet").
- Example uses `gfx` unimported.

## Suggested pages
- Microphone: overview and quick start
- Microphone: tutorial, a level meter
- Microphone: tutorial, record and play back
- Microphone: API reference (generated)
- Microphone: permissions per platform
- Microphone: the fake microphone and testing
- Microphone: platform backends and troubleshooting
- Microphone: navigator.mediaDevices and WebRTC
