---
id: ZN-900
title: 'zinc:webrtc: adaptive audio jitter buffer with time stretching'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 22:58'
updated_date: '2026-10-31 00:34'
labels:
  - media
  - size-M
milestone: m-28
dependencies:
  - ZN-899
ordinal: 594460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the fixed 60 ms audio buffer: target = 2 x p95 inter-arrival jitter, clamped 40 to 300 ms; shrink and grow by time-scaling speech with Sonic (Apache-2.0, vendored under plugins/webrtc/vendor with PIN) instead of dropping or inserting silence; jitterBufferDelay and jitterBufferTargetDelay in getStats.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 With 30 ms jitter the buffer settles near 60-80 ms; with none it returns to 40 ms within 10 s
- [x] #2 No click or gap when it resizes (no zero runs in the decoded output, test)
- [x] #3 Mouth-to-ear <= 250 ms at 100 ms RTT and 30 ms jitter, measured with the loopback
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: plugins/webrtc/native/jitter.cpp, a NetEQ-style playout buffer per received audio track, replacing the fixed 60 ms buffer. Packets are kept by RTP timestamp and decoded on their turn by the wall clock. Target = 2 x the p95 relative transit of the last 5 s, clamped 40-300 ms, raised to the longest loss run of the window + 20 ms (run capped at 120 ms) so FEC/DRED of the next packet arrives in time. The delay is moved by Sonic (vendor/sonic, commit b93885d, Apache-2.0, PIN): 1.15x above target + 20 ms, 0.9x below target - 15 ms, with hysteresis; never silence or cuts. A loss is filled from the next packet's FEC, then DRED, then deep PLC (moved here from recoverAudio); a timestamp gap with consecutive seq is DTX comfort noise, not concealment. getStats inbound-rtp: jitterBufferDelay, jitterBufferTargetDelay, jitterBufferEmittedCount, insertedSamplesForDeceleration, removedSamplesForAcceleration, totalMouthToEarDelay/mouthToEarCount (sender capture time by SSRC+RTP ts, same process), and jitterBufferTarget (ms). Harness: calm=S stops the jitter after S seconds. tests/t1/webrtc_impair.sh: jitter and calm profiles.
Measured (M1 Pro, fake mic, 20 s, before: no playout buffer, no target/mouth-to-ear stats): clean target 40, delay 52, mouth-to-ear 73 ms; jitter 30 ms + 100 ms RTT: target 60, concealed 0, gap 0, mouth-to-ear 149 ms (AC#1, #2, #3); calm (jitter stops at 6 s): target 40 at the end (AC#1); burst 20%/3: target 140, concealed 8.0%, FEC 4.6%, DRED 11.5%, mouth-to-ear 204; thin (20k link, 10% loss): target 84, concealed 10.2%, mouth-to-ear 264 (over 250 there: the 60 ms packets and the 87 ms queue of the 20 kbit/s link).
Engine gap found and fixed: QuickJS ran timers on a virtual clock that jumped to the next timer whenever no native call was pending, even in a real run, so the fake microphone's 20 ms setInterval fired ~160x too fast in webrtc_media and flooded the jitter buffer. src/qjs/qjs.cpp timerLoop now waits on the wall clock unless ZINC_DETERMINISTIC/RECORD/REPLAY, as runtime/zrt.cpp does; Date.now is an integer. Test tests/t0/timers_wall_clock.sh (interp, QuickJS, AOT, and a deterministic run still jumps). webrtc_media, webrtc_quality, webrtc_call, webrtc_impair, timer_yield pass.
<!-- SECTION:NOTES:END -->
