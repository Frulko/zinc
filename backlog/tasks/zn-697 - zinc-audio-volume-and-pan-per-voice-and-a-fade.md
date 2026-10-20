---
id: ZN-697
title: 'zinc:audio: volume and pan per voice, and a fade'
status: Backlog
assignee: []
created_date: '2026-10-10 21:28'
labels:
  - audio
  - size-S
dependencies: []
ordinal: 461410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of the pinball's sound and look, D80.) Volume and pan move every voice of a Sound today, so two overlapping plays of one sound cannot have their own level, and a fade is done by hand each frame.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 two overlapping plays of one sound at two volumes mix to both (test on the null backend)
- [ ] #2 a voice fades to silence over a given time and stops
- [ ] #3 docs/plugins/audio.md documents them
<!-- AC:END -->
