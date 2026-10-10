---
id: ZN-656
title: 'zinc:audio: pitch and pan per voice'
status: Done
assignee: []
created_date: '2026-10-10 18:17'
updated_date: '2026-10-10 18:52'
labels:
  - audio
  - size-S
milestone: m-27
dependencies: []
ordinal: 409410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Owner's answers, 2026-10-10, for the showcase demos of M27.) The pinball varies the pitch of its sounds and places them left and right; zinc:audio as shipped (ZN-390, D70) has neither. A playback rate and a stereo position per voice, in the mixer and on the null backend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a tone played at rate 2 has twice the zero crossings in mix() (test on the interpreter and the AOT)
- [x] #2 pan fully left leaves the right channel silent
- [x] #3 docs/plugins/audio.md documents both
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10. Sound.rate (1/64..64, NaN -> 1) and Sound.pan (-1..1, NaN -> 0) in plugins/audio/index.ts; native play(sound, volume, loop, rate, pan), setRate, setPan (audio.spec.ts, audio.host.cpp, audio.sim.ts no-ops). A voice gets miniaudio's resampler (no MA_SOUND_FLAG_NO_PITCH) only when started at a rate other than 1: miniaudio resamples even at a ratio of 1, and every existing line of tests/golden/audio/audio.out stayed byte for byte; so a voice started at 1 keeps 1, one started at another rate follows setRate (documented). Pan through ma_sound_set_pan (balance mode).
Tests: tests/golden/audio/audio.ts prints 'rate: 43 crossings at 1, 87 at 2' (2400 frames of a 440 Hz tone) and 'pan -1: left 0.5 right 0; pan 1: left 0 right 0.5; pan 0: left 0.5 right 0.5'; tests/t1/audio.sh (interpreter, AOT program, sim and deterministic runs) PASS; plugin_manifest PASS. docs/plugins/audio.md: the two rows and an example.
usage: n/a
<!-- SECTION:NOTES:END -->
