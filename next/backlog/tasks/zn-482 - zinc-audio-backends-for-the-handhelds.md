---
id: ZN-482
title: 'zinc:audio backends for the handhelds'
status: Backlog
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
  - ZN-462
ordinal: 300290
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
miniaudio custom backends: PSP sceAudio (44.1 kHz, a dedicated thread), Vita sceAudioOut (48 kHz), 3DS NDSP (needs the user's sdmc:/3ds/dspfirm.cdc; print a clear notice when it is missing), iOS through miniaudio's Core Audio backend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 templates/game-2d plays its coin sound on each target (emulator or device, noted)
- [ ] #2 missing DSP firmware on 3DS gives a single clear message and silent playback, no crash
<!-- AC:END -->
