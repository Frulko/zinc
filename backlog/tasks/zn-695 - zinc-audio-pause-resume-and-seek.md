---
id: ZN-695
title: 'zinc:audio: pause, resume and seek'
status: Backlog
assignee: []
created_date: '2026-10-10 21:18'
labels:
  - audio
  - size-S
dependencies: []
ordinal: 458410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the museum table (ZN-650.05): a paused presentation restarts its step because zinc:audio (D70) can neither pause a voice nor start it at a position.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a clip paused for 1 s ends 1 s later on the null backend (test on the interpreter and the AOT)
- [ ] #2 seek to 2 s plays from 2 s
- [ ] #3 the museum table resumes a presentation where it stopped (museum_visit updated)
<!-- AC:END -->
