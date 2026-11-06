---
id: ZN-1000
title: 'Covered windows: no stall, no redraw while unseen'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-06 09:35'
labels:
  - size-M
  - perf
  - desktop
dependencies: []
ordinal: 759080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md (compositor line): a window covered mid-run can stall about 1 s (nextDrawable times out at 1001.9 ms and holds the script), and a covered window with an animation redraws at about 100 fps. Measure first (tools/resmon, frame timing), then fix in the macOS host.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Covering a running window never blocks the script for more than a frame: no nextDrawable wait of ~1 s; measured before and after
- [ ] #2 A fully covered or minimized window with an animation stops drawing (or drops to a low idle rate) and resumes at once when shown again; CPU measured before and after
- [ ] #3 Regression test (T1, background window) that fails on the old behaviour
<!-- AC:END -->
