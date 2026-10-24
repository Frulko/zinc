---
id: ZN-651
title: 'zinc:audio on Linux: build the plugin and play through ALSA or PulseAudio'
status: Backlog
assignee: []
created_date: '2026-10-10 17:57'
labels:
  - audio
  - size-S
milestone: m-22
dependencies: []
ordinal: 130000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-390 built and proved zinc:audio on macOS (Core Audio) and headless; Linux is in the plugin manifest only. miniaudio carries the backends. Part of the cross-platform pass; may fold into ZN-555.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/t1/audio.sh passes in the Linux container
- [ ] #2 a tone plays on a real or dummy output with backend() naming it, and the program exits cleanly
- [ ] #3 the linux row of docs/plugins/audio.md says what was verified
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: merged into ZN-555. The task says itself it may fold into ZN-555 (Pi audio backends); same ALSA/PulseAudio work, cross pass. Evidence: tests/t1/audio.sh (macOS only) Verifier: The task itself says it may fold into ZN-555 (Backlog). Carry tests/t1/audio.sh in the Linux container and the PulseAudio/PipeWire desktop case (ZN-555 is worded for the Pi) plus the linux row of docs/plugins/audio.md.
<!-- SECTION:NOTES:END -->
