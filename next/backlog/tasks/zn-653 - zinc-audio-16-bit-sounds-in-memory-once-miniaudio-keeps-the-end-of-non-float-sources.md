---
id: ZN-653
title: >-
  zinc:audio: 16-bit sounds in memory once miniaudio keeps the end of non-float
  sources
status: Backlog
assignee: []
created_date: '2026-10-10 17:57'
labels:
  - audio
  - size-S
milestone: m-22
dependencies: []
priority: low
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-390: miniaudio 0.11.25 (and its master on 2026-10-10) drops the last frames, up to 512, of any non-float sound (a 960-frame 16-bit clip played 512 frames, a 480-frame one nothing), so zinc:audio keeps every sound as float: 21 MiB per minute of 44.1 kHz stereo. Reporting it upstream is the owner's step (the reproduction is in the notes of ZN-390). May fold into ZN-440.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the upstream report exists and is linked
- [ ] #2 a 480-frame 16-bit clip is heard whole (test)
- [ ] #3 the memory of a loaded 16-bit sound halves
<!-- AC:END -->
