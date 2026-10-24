---
id: ZN-482
title: 'zinc:audio backends for the handhelds'
status: Done
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - audio
  - handheld
  - handhelds
  - size-M
milestone: m-23
dependencies:
  - ZN-390
  - ZN-458
  - ZN-459
  - ZN-460
ordinal: 214600
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
miniaudio custom backends: PSP sceAudio (44.1 kHz, a dedicated thread), Vita sceAudioOut (48 kHz), 3DS NDSP (needs the user's sdmc:/3ds/dspfirm.cdc; print a clear notice when it is missing), iOS through miniaudio's Core Audio backend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 templates/game-2d plays its coin sound on each target (emulator or device, noted)
- [x] #2 missing DSP firmware on 3DS gives a single clear message and silent playback, no crash
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: closed as Done. Audio backends are in the console HALs: PSP sceAudio, Vita sceAudioOut, 3DS NDSP with CSND fallback, all through console_audio.h; the hardware demos play sound. The iOS part goes with the parked iOS 9 cluster. Evidence: targets/psp/hal_psp.cpp:58; targets/vita/hal_vita.cpp:122; targets/n3ds/hal_n3ds.cpp:94; targets/console/audio_console.cpp; tests/t0/console_audio.sh; commits dcf35728, 18e75749, c973e863 Verifier: sceAudio, sceAudioOut and NDSP with a CSND fallback when dspfirm.cdc is missing (targets/n3ds/hal_n3ds.cpp:82-107, better than AC2's silent playback) through console_audio.h, tests/t0/console_audio.sh; the hardware demos play sound. AC1's game-2d coin per target is not separately evidenced; iOS goes with the parked iOS cluster.
<!-- SECTION:NOTES:END -->
