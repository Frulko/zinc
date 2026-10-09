---
id: ZN-555
title: 'Pi audio backends for zinc:audio: ALSA, HDMI IEC958 path, I2S'
status: Backlog
assignee: []
created_date: '2026-10-09 07:46'
labels:
  - rpi
  - sdk
  - size-M
milestone: m-25
dependencies:
  - ZN-390
ordinal: 340210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make the miniaudio backend of ZN-390 work on every Pi: ALSA through alsa-lib devices (sysdefault or hdmi for vc4hdmi, which accepts only IEC958_SUBFRAME_LE on hw:), PipeWire or Pulse on desktop images, I2S DAC overlays. Decide the static armhf story: a tinyalsa custom backend or no audio. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 snd-aloop round-trip test passes in Linux CI
- [ ] #2 HDMI and the 3.5 mm jack play the game-2d sounds on the Pi 3B+
- [ ] #3 the I2S DAC setup is documented with its overlay
<!-- AC:END -->
