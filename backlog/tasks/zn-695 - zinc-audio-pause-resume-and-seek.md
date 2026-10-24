---
id: ZN-695
title: 'zinc:audio: pause and resume a voice'
status: Backlog
assignee: []
created_date: '2026-10-10 21:18'
labels:
  - audio
  - size-S
dependencies: []
ordinal: 14300
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Seek is done (offset); keep pause/resume and the museum_visit update. Already there: plugins/audio/index.ts:42; docs/plugins/audio.md:52.

Found by the museum table (ZN-650.05): a paused presentation restarts its step because zinc:audio (D70) can neither pause a voice nor start it at a position.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a clip paused for 1 s ends 1 s later on the null backend (test on the interpreter and the AOT)
- [ ] #2 seek to 2 s plays from 2 s
- [ ] #3 the museum table resumes a presentation where it stopped (museum_visit updated)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. Start at a position exists (sound.voice(..., offset)); pause and resume do not (no pause in plugins/audio). Evidence: plugins/audio/index.ts:42; docs/plugins/audio.md:52
<!-- SECTION:NOTES:END -->
