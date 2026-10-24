---
id: ZN-697
title: 'zinc:audio: fade a voice to silence over a time'
status: Backlog
assignee: []
created_date: '2026-10-10 21:28'
labels:
  - audio
  - size-S
dependencies: []
ordinal: 12500
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Only AC2 (fade) and its doc line remain. Already there: docs/plugins/audio.md:52-53.

(Follow-up of the pinball's sound and look, D80.) Volume and pan move every voice of a Sound today, so two overlapping plays of one sound cannot have their own level, and a fade is done by hand each frame.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 two overlapping plays of one sound at two volumes mix to both (test on the null backend)
- [ ] #2 a voice fades to silence over a given time and stops
- [ ] #3 docs/plugins/audio.md documents them
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. Per-voice volume and pan exist (sound.voice(), voice.set(volume, rate, pan)); a fade over time does not. Evidence: docs/plugins/audio.md:52-53
<!-- SECTION:NOTES:END -->
