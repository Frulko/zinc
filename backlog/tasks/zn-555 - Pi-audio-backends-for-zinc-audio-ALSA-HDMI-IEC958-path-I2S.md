---
id: ZN-555
title: 'zinc:audio on the Pi: ALSA, HDMI and the static build'
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
ordinal: 51400
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Build and run the audio plugin on Linux, play game-2d sounds on HDMI and jack on the Pi 3B+, snd-aloop test, decide tinyalsa or no audio for static builds, document I2S overlays.

Make the miniaudio backend of ZN-390 work on every Pi: ALSA through alsa-lib devices (sysdefault or hdmi for vc4hdmi, which accepts only IEC958_SUBFRAME_LE on hw:), PipeWire or Pulse on desktop images, I2S DAC overlays. Decide the static armhf story: a tinyalsa custom backend or no audio. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 snd-aloop round-trip test passes in Linux CI
- [ ] #2 HDMI and the 3.5 mm jack play the game-2d sounds on the Pi 3B+
- [ ] #3 the I2S DAC setup is documented with its overlay
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. zinc:audio uses miniaudio, which picks ALSA/Pulse at run time (docs/plugins/audio.md:17, "not built or run yet" on Linux). First step is to prove it on the Pi 3B+ (HDMI, jack), then the static armhf story. Carries ZN-533. Evidence: docs/plugins/audio.md:17; plugins/audio/native/audio.host.cpp
Review 2026-10-25: merged ZN-533 here (PocketCHIP audio through zinc:audio). Carry over: PocketCHIP audio: the same ALSA / tinyalsa static-flavour question as ZN-555; carry the speaker/headphone routing. ZN-555 already asks to decide the static armhf audio story (tinyalsa custom backend or none) for miniaudio. Carry the PocketCHIP speaker/headphone routing on sun4i-codec and 'static flavour has no libasound' as a criterion.
Review 2026-10-25: merged ZN-651 here (zinc:audio on Linux: build the plugin and play through ALSA or PulseAudio). Carry over: The task says itself it may fold into ZN-555 (Pi audio backends); same ALSA/PulseAudio work, cross pass. The task itself says it may fold into ZN-555 (Backlog). Carry tests/t1/audio.sh in the Linux container and the PulseAudio/PipeWire desktop case (ZN-555 is worded for the Pi) plus the linux row of docs/plugins/audio.md.
<!-- SECTION:NOTES:END -->
