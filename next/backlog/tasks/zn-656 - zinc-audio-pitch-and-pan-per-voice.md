---
id: ZN-656
title: 'zinc:audio: pitch and pan per voice'
status: Backlog
assignee: []
created_date: '2026-10-10 18:17'
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
- [ ] #1 a tone played at rate 2 has twice the zero crossings in mix() (test on the interpreter and the AOT)
- [ ] #2 pan fully left leaves the right channel silent
- [ ] #3 docs/plugins/audio.md documents both
<!-- AC:END -->
