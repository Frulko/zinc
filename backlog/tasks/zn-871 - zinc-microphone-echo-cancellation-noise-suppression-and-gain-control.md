---
id: ZN-871
title: 'zinc:microphone: echo cancellation, noise suppression and gain control'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 14:54'
updated_date: '2026-10-31 08:28'
labels:
  - media
  - size-M
milestone: m-28
dependencies: []
ordinal: 175
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Calls without headphones need acoustic echo cancellation; zinc:webrtc lists it as missing. Vendor a proven processor (webrtc-audio-processing AEC3/NS/AGC, BSD-3) and apply it with the speaker output as the reference; an option on the microphone stream, used by zinc:webrtc and the Discord voice plugin.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An option enables AEC, NS and AGC on a microphone stream
- [x] #2 A test with a recorded far-end and a mixed near-end shows the echo attenuated by at least 20 dB (ERLE)
- [x] #3 examples/webrtc-call uses it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: SpeexDSP 1.2.1 vendored in plugins/microphone/vendor/speexdsp (BSD-3-Clause, PIN with hashes, third_party/README.md), wrapped by plugins/microphone/native/voice.cpp: MDF echo canceller (250 ms filter, 10 ms frames) then the preprocessor (residual echo suppressor, denoiser, AGC at level 24000; with echo cancellation alone the denoiser runs with a 0 dB noise floor, since Speex applies the residual echo suppression through its gains). Microphone.open options and setProcessing({ echoCancellation, noiseSuppression, autoGainControl, reference, referenceRate }); reference is a pull function called before each block; zinc:audio's new played() is what the output device pulled (mono 48 kHz, a ring filled in the device callback), so the far end is paired with the microphone by sample count at the device clock. Web: the browser's processing via getUserMedia constraints / applyConstraints. examples/webrtc-call turns all three on with reference: played.
Decision (to record, RULES 4): SpeexDSP 56 vs webrtc-audio-processing (AEC3/NS/AGC2) 52: fit 3/5, perf 3/4, size 5/2 (+84 KB vs ~1-2 MB with abseil), maintainability 4/3, licence 5/5, portability 5/3 (C89, Pi and ESP32 class vs C++17 + abseil), effort 5/2. Revisit if a real laptop call shows residual echo or clipped double talk: AEC3's delay estimator and AGC2 are the upgrade, behind voice.h.
Measured: tests/t0/voice_aec.sh (recorded voice, simulated room 40 ms + 150 ms reflections, 48 kHz): ERLE 25.8 dB over 6-9 s with all three (24.1 dB echo cancellation alone; 14 dB for the MDF filter without the residual suppressor), near voice talking over it comes out 2.2 dB down, AGC raises a -52 dBFS voice by 22.8 dB; tests/t1/microphone_voice.sh: through the plugin on the fake microphone, 16.8 dB with a reference, 0.0 dB without. Plugin +84 KB (1054864 -> 1140608 bytes, macOS arm64). Not proven: a real call through laptop speakers and microphone (no sound played while the owner works); the speaker-to-microphone delay of real devices must stay under 250 ms (Bluetooth may not).
<!-- SECTION:NOTES:END -->
